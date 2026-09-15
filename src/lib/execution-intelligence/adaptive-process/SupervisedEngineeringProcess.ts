/**
 * SupervisedEngineeringProcess.ts — Adaptive Mission Decomposition V1
 *
 * READ MODE (V1): Evidence-based engineering investigation loop.
 *   MISSION → DISCOVERY (code.search) → EVIDENCE → REFLECT
 *   (observations + hypothesis + gaps + nextActions) → TARGETED NEXT WAVE
 *   → MORE EVIDENCE → ... → CONCLUSION (CONFIRMED / INFERRED / UNRESOLVED)
 *
 * Each wave is justified by the results of the previous wave. The LLM
 * interprets evidence, formulates hypotheses, identifies gaps, and proposes
 * targeted next actions — never reads files indiscriminately.
 *
 * Constraints (read mode):
 *   - Max 8 new file.read per adaptive wave (cognitive expansion limit,
 *     NOT concurrency — ResourcePolicyResolver controls physical concurrency).
 *   - Independent actions run in the same wave (dependsOn=[]) → parallel.
 *   - code.references only with a valid symbol from evidence.
 *   - git.* only when the mission requires change/repository context.
 *   - No writes. No direct connector calls. ExecutionOrchestrator executes waves.
 *
 * WRITE MODE: OpenHands executes; MemoryOS verifies completion.
 * (Currently not activated — run() returns failed for write mode.)
 */
import { base44 } from "@/api/base44Client";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type { AdaptiveProcess, AdaptiveProcessContext, AdaptiveRunState, CompletionContract, CompletionRequirement, InitialMissionPlan, Reflection, ResearchStep } from "./AdaptiveProcess";
import { DynamicWaveRunner } from "./DynamicWaveRunner";
import { detectWriteMode } from "./OpenHandsChangeSet";
import { runSupervisedWriteFlow } from "./SupervisedWriteFlow";
import { openRouterLLMProvider } from "@/lib/ai-provider-registry/OpenRouterLLMProvider";

const READ_MAX_ITERATIONS = 5;
const MAX_READS_PER_WAVE = 8;
const MAX_DISCOVERY_QUERIES = 4;
const SUFFICIENCY_THRESHOLD = 0.75;
const MAX_REQUIREMENTS = 25;
const MAX_TARGETED_VERIFICATIONS_PER_GAP = 2;

const ADVISOR_MODEL = "deepseek/deepseek-v3.2";
const SUPERVISOR_MODEL = "deepseek/deepseek-v3.2";

// ── Adaptive Evidence Budget V1 ──────────────────────────────────────────────
// Per-tool char budgets for evidence compaction in _reflectReadMode.
// Replaces the blind slice(0, 2000) that discarded decisive file content.
const MAX_FILE_EVIDENCE_CHARS = 12000;
const MAX_SEARCH_EVIDENCE_CHARS = 5000;
const MAX_DEFAULT_EVIDENCE_CHARS = 4000;
const MAX_TOTAL_EVIDENCE_CHARS = 30000;

// ── Evidence-based reflection extensions (read mode) ────────────────────────

interface EngineeringObservation {
  readonly step: string;
  readonly finding: string;
}

interface EngineeringNextAction {
  readonly type: "file.read" | "code.references" | "code.search" | "git.log" | "git.diff" | "git.status" | "repo.structure";
  readonly params: Record<string, unknown>;
  readonly rationale: string;
}

interface EngineeringReflection extends Reflection {
  readonly observations: readonly EngineeringObservation[];
  readonly nextActions: readonly EngineeringNextAction[];
  readonly hypothesis?: string;
}

// ── Process ──────────────────────────────────────────────────────────────────

class SupervisedEngineeringProcess implements AdaptiveProcess {
  readonly id = "supervisedEngineering";
  readonly description = "Supervised Engineering — evidence-based read-only investigation (V1) + OpenHands write verification";

  // Per-run accumulated file.read paths (keyed by parentExecutionId).
  // In-memory only — cleared when run() completes. Not persistent, not global.
  private readonly _runReadPaths = new Map<string, Set<string>>();
  // Targeted Verification Safety Net V1 — tracks executed code.search queries
  // and code.references symbols across ALL waves in a run, enabling deterministic
  // dedup when the safety net injects a verification action.
  private readonly _runSearchQueries = new Map<string, Set<string>>();
  private readonly _runReferences = new Map<string, Set<string>>();

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAN — first wave (discovery)
  // ══════════════════════════════════════════════════════════════════════════

  /** Capture InitialMissionPlan from existing plan() data — ADV-01 Minimal Advisor. */
  private _captureInitialMissionPlan(
    ctx: AdaptiveProcessContext,
    mode: "read" | "write",
    steps: readonly ResearchStep[],
  ): InitialMissionPlan {
    const selectedCapabilities = steps.map((step) => step.call.capability);

    let discoveryQueries: string[] | undefined;
    if (mode === "read") {
      const searchSteps = steps.filter(
        (step) =>
          step.call.capability === "mcp.callTool" &&
          step.call.params?.toolName === "engineering.code.search",
      );

      discoveryQueries = searchSteps
        .map((ste…