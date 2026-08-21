/**
 * ConversationPlanningEngine.ts — Engineering Sprint E-02.2A
 * Goal → ExecutionPlan (normalized)
 *
 * SRP: Unica responsabilidade — receber um ConversationGoal e produzir
 *      um ExecutionPlan imutavel composto exclusivamente de Capabilities.
 *
 * O Planner conhece APENAS:
 *   - ConversationGoal  (contrato de entrada)
 *   - GoalCapabilityRegistry (mapeamento Goal → Capabilities)
 *   - ExecutionPlan     (contrato de saida)
 *
 * O Planner NAO conhece:
 *   - Runtime
 *   - validate_session / summarize / noop
 *   - OAuth / autenticacao
 *   - Retry / timeout
 *   - Connectors concretos (Gmail, Calendar, Drive)
 *   - LLM
 *   - Rede
 *
 * Toda a logica operacional (auth, retry, timeout, summarize, auditoria)
 * e responsabilidade exclusiva do Runtime (Sprint E-02.3).
 *
 * Observabilidade interna (in-process, sem telemetria externa):
 *   planning_started / planning_completed / planning_failed
 */

import type { ConversationGoal }    from "@/lib/goals/GoalTypes";
import type { GoalType }            from "@/lib/goals/GoalTypes";
import { GoalCapabilityRegistry }   from "./GoalCapabilityRegistry";
import { RuntimeDebug }             from "@/lib/debug/RuntimeDebug";
import {
  makePlanId,
  makeStepId,
} from "./ExecutionPlanTypes";
import type {
  ExecutionPlan,
  ExecutionStep,
  ExecutionMode,
  PlanningResult,
  PlanningEvent,
  PlanStatus,
} from "./ExecutionPlanTypes";
import type { PlanningContext } from "./PlanningContextTypes";
import { comparePlanningContext } from "./PlanningContextEquivalence";
import { planningContextAuditStore } from "./PlanningContextAuditStore";
import { resolvePlanningDualRead } from "./PlanningDualReadResolver";
import { isCanonicalResourceReadEnabled } from "@/lib/resource-intent-canonicalization";

// ── Event listener type ───────────────────────────────────────────────────────

type PlanningEventListener = (event: PlanningEvent) => void;

// ── ConversationPlanningEngine ────────────────────────────────────────────────

export class ConversationPlanningEngine {
  private _listeners: PlanningEventListener[] = [];
  private _totalPlanned = 0;
  private _totalFailed  = 0;
  private _lastPlans:  ExecutionPlan[] = [];

  /**
   * Transforms a ConversationGoal into a structured, immutable ExecutionPlan.
   *
   * Each step in the plan represents a connector capability.
   * No infrastructure steps (validate_session, summarize, noop) are included —
   * those are injected by the Runtime during execution.
   *
   * Guarantees:
   * - Never throws
   * - Never makes network calls
   * - Never invokes connectors or runtime
   * - Deterministic for the same goal and registry state
   */
  /**
   * Sprint 3: optional PlanningContext intake for CRR architecture validation.
   * Planning decisions remain based exclusively on the legacy goal contract.
   */
  plan(
    goal: ConversationGoal,
    options?: { mode?: ExecutionMode; context?: PlanningContext | null },
  ): PlanningResult {
    const _mode: ExecutionMode = options?.mode ?? "live";
    const t0     = Date.now();
    const planId = makePlanId();
    const dualReadEnabled = isCanonicalResourceReadEnabled();
    const dualRead = resolvePlanningDualRead(goal, options?.context ?? null, dualReadEnabled);
    const planningGoalType = dualRead.goalType;
    const planningParameters = dualRead.parameters;

    this._emit({ type: "planning_started", goalId: goal.id, planId, planningTime: 0, stepCount: 0, timestamp: Date.now() });

    // Sprint 3: passive validation/audit only — never influences planning path.
    if (options?.context) {
      try {
        const comparison = comparePlanningContext(options.context);
        planningContextAuditStore.record(Object.freeze({
          timestamp: new Date().toISOString(),
          goalType: goal.type,
          goalId: goal.id,
          featureFlagEnabled: options.context.metadata.featureFlagEnabled,
          goal,
          canonicalResourceRequest: options.context.canonicalResourceRequest,
          comparison,
          dualRead,
        }));
      } catch {
        // Non-blocking: context validation must never break planning.
      }
    }

    try {
      if (!goal.valid) {
        return this._fail(planId, goal, "Goal is invalid", t0);
      }

      const descriptors = GoalCapabilityRegistry.resolve(planningGoalType as GoalType);

      // Unknown goalType (not registered) — treat as empty
      if (descriptors === null || descriptors.length === 0) {
        const plan = this._makePlan(planId, goal, [], "empty", t0, _mode);
        this._track(plan);
        this._totalPlanned++;
        this._emit({ type: "planning_completed", goalId: goal.id, planId, planningTime: Date.now() - t0, stepCount: 0, timestamp: Date.now() });
        return { plan, success: true, error: null, durationMs: Date.now() - t0 };
      }

      // DAG V1: deterministic step ids + descriptor-id→step-id map for dependsOn.
      const stepIds: string[] = [];
      const descIdToStepId = new Map<string, string>();
      descriptors.forEach((desc, i) => {
        const sid = `step-${String(i + 1).padStart(2, "0")}`;
        stepIds.push(sid);
        if (desc.id) {
          if (descIdToStepId.has(desc.id)) {
            throw new Error(`Duplicate CapabilityDescriptor id '${desc.id}' for goalType ${planningGoalType}`);
          }
          descIdToStepId.set(desc.id, sid);
        }
      });

      const builtSteps: ExecutionStep[] = descriptors.map((desc, i) => {
        const stepId = stepIds[i];
        // Remap descriptor-id dependsOn → step-id dependsOn. Unknown ref → fail.
        const resolvedDeps: string[] = [];
        for (const depRef of desc.dependsOn ?? []) {
          const target = descIdToStepId.get(depRef);
          if (!target) {
            throw new Error(`dependsOn '${depRef}' references unknown descriptor for goalType ${planningGoalType}`);
          }
          resolvedDeps.push(target);
        }
        const mergedParams = { ...desc.params, ...planningParameters };
        // Observabilidade: emite evento no RuntimeDebug para conectores Drive.
        // _debugExecutionId is injected by ConversationPipeline from the Runtime's executionId.
        // goal.id is a goal identifier, NOT an executionId — never used as one.
        if (desc.capability === "drive.downloadFile" || desc.connector === "google-drive") {
          const execId = typeof (planningParameters as Record<string, unknown>)?._debugExecutionId === "string"
            ? (planningParameters as Record<string, unknown>)._debugExecutionId as string
            : ""; // intentionally empty — correlation loss will be warned by RuntimeDebug
          RuntimeDebug.emit({
            executionId: execId,
            connector:   "google-drive",
            source:      "Planner",
            event:       "drive step parameters",
            payload: {
              goalType:          planningGoalType,
              connector:         desc.connector,
              capability:        desc.capability,
              descParams:        desc.params,
              goalParameters:    planningParameters,
              mergedParams,
              "fileName in merged":  mergedParams.fileName  ?? null,
              "fileId in merged":    mergedParams.fileId    ?? null,
              "query in merged":     mergedParams.query     ?? null,
            },
          });
        }
        // Propaga dependências explícitas do descriptor. Default [] = independente
        // (comprovado: mappings atuais são single-descriptor e os parâmetros vêm
        // do goal, nunca do output de outro step → sem dependência implícita).
        // O ExecutionOrchestrator usa dependsOn para agendar waves paralelas;
        // [] torna o step elegível para a mesma wave que outros independentes.
        return Object.freeze({
          id:         stepId,
          connector:  desc.connector,
          capability: desc.capability,
          parameters: Object.freeze(mergedParams),
          dependsOn:  Object.freeze(resolvedDeps),
        });
      });

      // DAG V1: cycle detection — fail fast before the Orchestrator deadlocks.
      this._assertAcyclic(builtSteps);

      // Generic multi-file read expansion: a single mcp.callTool step targeting
      // engineering.file.read whose rawText references multiple file paths
      // expands into one INDEPENDENT step per path (dependsOn: [] => same
      // ExecutionOrchestrator wave => parallel). Each step carries explicit
      // arguments={path} so MCPConnector reads the actual file with zero LLM
      // inference and zero name-based guessing. Reuses existing plan/runtime
      // infra — no new engine/router/scheduler. Restricted to
      // engineering.file.read (read-only; never write tools / GitHub).
      const steps = this._expandMultiFileRead(builtSteps, planningParameters);

      const plan = this._makePlan(planId, goal, steps, "planned", t0, _mode);
      this._track(plan);
      this._totalPlanned++;
      this._emit({ type: "planning_completed", goalId: goal.id, planId, planningTime: Date.now() - t0, stepCount: steps.length, timestamp: Date.now() });
      return { plan, success: true, error: null, durationMs: Date.now() - t0 };

    } catch (err) {
      return this._fail(planId, goal, err instanceof Error ? err.message : "Unknown error", t0);
    }
  }

  // ── Observability ──────────────────────────────────────────────────────────

  onEvent(listener: PlanningEventListener): () => void {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter((l) => l !== listener); };
  }

  getMetrics() {
    return {
      totalPlanned: this._totalPlanned,
      totalFailed:  this._totalFailed,
      registrySize: GoalCapabilityRegistry.size,
      lastPlans:    [...this._lastPlans].reverse().slice(0, 20),
      contextValidation: planningContextAuditStore.getMetrics(),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // ── Multi-file engineering read expansion (generic) ─────────────────────────
  // Reuses existing ExecutionPlan + ExecutionOrchestrator parallel waves.
  // No new engine/router/scheduler. Restricted to engineering.file.read.

  private _extractFilePaths(rawText: string): string[] {
    if (!rawText) return [];
    // Path with a directory separator + extension (any ext 1-6 alnum chars).
    const DIR_RE = /(?:[A-Za-z0-9_@.\-]+\/)+[A-Za-z0-9_@\-]+\.[A-Za-z0-9]{1,6}/g;
    // Bare filename with a known code/config extension.
    const BARE_RE = /\b[A-Za-z0-9_@\-]+\.(?:json|jsonc|ts|tsx|js|jsx|mjs|cjs|md|py|toml|yml|yaml|sh|css|html|txt|env|lock)\b/g;
    // Collect matches with positions to preserve document order and dedupe.
    const candidates: { path: string; index: number }[] = [];
    let m: RegExpExecArray | null;
    DIR_RE.lastIndex = 0;
    while ((m = DIR_RE.exec(rawText)) !== null) candidates.push({ path: m[0], index: m.index });
    // Skip a bare filename that is the terminal of an already-captured dir path
    // (e.g. "GoalRegistry.ts" inside "src/lib/goals/GoalRegistry.ts") to avoid
    // duplicate reads of the same file.
    const dirTerminals = new Set(candidates.map((c) => c.path.slice(c.path.lastIndexOf("/") + 1)));
    BARE_RE.lastIndex = 0;
    while ((m = BARE_RE.exec(rawText)) !== null) {
      if (dirTerminals.has(m[0])) continue;
      candidates.push({ path: m[0], index: m.index });
    }
    candidates.sort((a, b) => a.index - b.index);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of candidates) {
      if (!seen.has(c.path)) { seen.add(c.path); out.push(c.path); }
    }
    return out;
  }

  private _expandMultiFileRead(
    builtSteps: ExecutionStep[],
    planningParameters: Record<string, unknown>,
  ): ExecutionStep[] {
    // Only expand a single mcp.callTool / engineering.file.read step.
    if (builtSteps.length !== 1) return builtSteps;
    const only = builtSteps[0];
    if (only.connector !== "mcp" || only.capability !== "mcp.callTool") return builtSteps;

    const pp = planningParameters;
    const op = only.parameters as Record<string, unknown>;
    const toolName = typeof pp.toolName === "string" ? pp.toolName : (typeof op.toolName === "string" ? op.toolName : "");
    if (toolName !== "engineering.file.read") return builtSteps;

    const rawText = typeof pp.rawText === "string" ? pp.rawText : (typeof op.rawText === "string" ? op.rawText : "");
    if (!rawText) return builtSteps;

    const paths = this._extractFilePaths(rawText);
    // Zero paths: preserve existing flow (no path detected → LLM resolution).
    if (paths.length === 0) return builtSteps;
    // Single path: inject explicit arguments.path verbatim so MCPConnector uses
    // CASO A (explicit args, zero InvokeLLM) — the same deterministic mechanism
    // as multi-file reads. Deep paths are no longer reconstructed by the LLM,
    // eliminating PATH_NOT_FOUND from InvokeLLM mangling long/nested paths.
    if (paths.length === 1) {
      const step = builtSteps[0];
      const stepParams = step.parameters as Record<string, unknown>;
      const mergedParams = Object.freeze({ ...stepParams, arguments: Object.freeze({ path: paths[0] }) });
      return [Object.freeze({ ...step, parameters: mergedParams })];
    }

    const serverName = typeof pp.serverName === "string" ? pp.serverName : (typeof op.serverName === "string" ? op.serverName : "eng-mcp");
    const baseParams: Record<string, unknown> = { toolName, serverName, rawText };
    if (typeof op.bearerToken === "string") baseParams.bearerToken = op.bearerToken;

    return paths.map((p, i) => Object.freeze({
      id:         makeStepId(i + 1),
      connector:  "mcp",
      capability: "mcp.callTool",
      parameters: Object.freeze({ ...baseParams, arguments: Object.freeze({ path: p }) }),
      dependsOn:  Object.freeze([] as string[]),
    }));
  }

  /**
   * DAG V1: validates that step dependsOn edges form an acyclic graph.
   * Throws on cycle (planning failure) so the Orchestrator never deadlocks
   * waiting for impossible steps. DFS with WHITE/GRAY/BLACK coloring.
   */
  private _assertAcyclic(steps: readonly ExecutionStep[]): void {
    const byId = new Map(steps.map((s) => [s.id, s]));
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>(steps.map((s) => [s.id, WHITE]));

    const visit = (id: string, path: readonly string[]): void => {
      const c = color.get(id) ?? WHITE;
      if (c === BLACK) return;
      if (c === GRAY) {
        throw new Error(`Cycle detected in ExecutionPlan dependencies: ${[...path, id].join(" -> ")}`);
      }
      color.set(id, GRAY);
      const step = byId.get(id);
      if (step && step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (byId.has(dep)) visit(dep, [...path, id]);
        }
      }
      color.set(id, BLACK);
    };

    for (const s of steps) visit(s.id, []);
  }

  private _makePlan(
    planId: string, goal: ConversationGoal,
    steps: ExecutionStep[], status: PlanStatus, t0: number,
    mode: ExecutionMode = "live",
  ): ExecutionPlan {
    return Object.freeze({
      id:         planId,
      goalId:     goal.id,
      goalType:   goal.type,
      status,
      steps:      Object.freeze([...steps]),
      createdAt:  Date.now(),
      durationMs: Date.now() - t0,
      mode,
    });
  }

  private _fail(planId: string, goal: ConversationGoal, error: string, t0: number): PlanningResult {
    const plan = this._makePlan(planId, goal, [], "invalid_goal", t0, "live");
    this._totalFailed++;
    this._emit({ type: "planning_failed", goalId: goal.id, planId, planningTime: Date.now() - t0, stepCount: 0, timestamp: Date.now() });
    return { plan, success: false, error, durationMs: Date.now() - t0 };
  }

  private _track(plan: ExecutionPlan): void {
    this._lastPlans.push(plan);
    if (this._lastPlans.length > 50) this._lastPlans.splice(0, this._lastPlans.length - 50);
  }

  private _emit(event: PlanningEvent): void {
    for (const l of this._listeners) {
      try { l(event); } catch { /* listener errors must not crash planning */ }
    }
  }
}

// ── App-wide singleton ────────────────────────────────────────────────────────

const _KEY = "__CONV_PLANNING_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ConversationPlanningEngine();
}

export const conversationPlanningEngine: ConversationPlanningEngine = (
  globalThis as unknown as Record<string, ConversationPlanningEngine>
)[_KEY];