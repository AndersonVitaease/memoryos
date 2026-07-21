/**
 * StrategyGenerationEngine.ts — Sprint EF-47/EF-49 · Strategy Generation Engine
 *
 * SRP: gerar dinamicamente um conjunto de GeneratedStrategies a partir de
 *      um Goal, usando todos os GENERATION_RULES disponíveis.
 *
 * EF-49 integration: aceita BoundCapabilityGraph opcional.
 *   Quando fornecido, extrai providers já resolvidos em vez de re-detectar conectores.
 *   Isso fecha a cadeia: CRE → CBE → SGE (pipeline oficial certificada).
 *
 * Posição no fluxo EF-49:
 *   Goal → CRE → CBE → StrategyGenerationEngine → SSE → CognitiveOrchestrator → DPE → Planner
 *
 * HMR-safe singleton via globalThis.
 */

import type { Goal }                        from "@/lib/goal-engine/GoalTypes";
import type { OperationalIntent }           from "@/lib/cognitive-orchestrator/COTypes";
import { analyzeOperationalIntent }         from "@/lib/cognitive-orchestrator/IntentAnalyzer";
import { GENERATION_RULES, primaryConnectorsForIntent } from "./GenerationRules";
import { computeGenerationMetrics }         from "./GenerationMetrics";
import { toStrategyCandidate, makeGeneratedStrategyId } from "./GeneratedStrategy";
import type { GeneratedStrategy, GenerationProfile } from "./GeneratedStrategy";
import type { GenerationSummary }           from "./GenerationMetrics";
import type { StrategyCandidate }           from "@/lib/strategy-selection/StrategyEvaluation";
import type { BoundCapabilityGraph }        from "@/lib/capability-binding/BoundCapabilityGraph";

// ── Generation result ─────────────────────────────────────────────────────────

export interface GenerationResult {
  readonly goalId:          string;
  readonly intent:          OperationalIntent;
  readonly strategies:      readonly GeneratedStrategy[];
  readonly candidates:      readonly StrategyCandidate[];   // ready for StrategySelectionEngine
  readonly metrics:         GenerationSummary;
  readonly durationMs:      number;
  readonly createdAt:       string;
  readonly boundGraphId:    string | null;   // EF-49: id of BoundCapabilityGraph used, or null
  readonly providerSource:  "bound" | "heuristic"; // EF-49: how connectors were resolved
}

// ── Engine ────────────────────────────────────────────────────────────────────

// All profiles to generate by default
const ALL_PROFILES: GenerationProfile[] = [
  "fast", "deep", "conservative", "resilient", "economic", "parallel",
];

class StrategyGenerationEngineImpl {

  /**
   * Generate strategies for a Goal.
   *
   * @param goal       - Validated Goal from GoalEngine
   * @param boundGraph - EF-49: BoundCapabilityGraph from CapabilityBindingEngine.
   *                     When provided, connector names are extracted from resolved
   *                     provider bindings instead of the heuristic detector.
   *                     This is the OFFICIAL pipeline path.
   * @param profiles   - Profiles to generate (default: all 6)
   */
  generate(
    goal:       Goal,
    boundGraph: BoundCapabilityGraph | null = null,
    profiles:   GenerationProfile[] = ALL_PROFILES,
  ): GenerationResult {
    const t0     = Date.now();
    const intent = analyzeOperationalIntent(goal);

    // EF-49: prefer providers resolved by CapabilityBindingEngine; fall back to heuristic
    const providerSource: "bound" | "heuristic" = boundGraph ? "bound" : "heuristic";
    const primary: string[] = boundGraph
      ? extractBoundProviders(boundGraph)
      : primaryConnectorsForIntent(intent, goal);

    const strategies: GeneratedStrategy[] = [];

    for (const profile of profiles) {
      const ruleFn = GENERATION_RULES[profile];
      if (!ruleFn) continue;

      const partial = ruleFn(intent, goal, primary);

      const gs: GeneratedStrategy = Object.freeze({
        ...partial,
        strategyId:           makeGeneratedStrategyId(),
        connectorSequence:    Object.freeze(
          partial.executionStages.flatMap(s => s.connectors)
        ),
        requiredCapabilities: Object.freeze(
          [...new Set(partial.executionStages.flatMap(s => s.capabilities))]
        ),
        generatedAt: new Date().toISOString(),
      });

      strategies.push(gs);
    }

    const durationMs = Date.now() - t0;
    const metrics    = computeGenerationMetrics(strategies, durationMs);
    const candidates = strategies.map(toStrategyCandidate);

    return Object.freeze({
      goalId:         goal.id,
      intent,
      strategies:     Object.freeze(strategies),
      candidates:     Object.freeze(candidates),
      metrics,
      durationMs,
      createdAt:      new Date().toISOString(),
      boundGraphId:   boundGraph?.boundGraphId ?? null,
      providerSource,
    });
  }
}

// ── EF-49: extract connector names from BoundCapabilityGraph ──────────────────
// Maps provider implementation prefixes back to connector names used by GenerationRules.
// e.g. "github_connector" → "github", "googledrive_connector" → "googledrive"

const PROVIDER_TO_CONNECTOR: Record<string, string> = {
  github_connector:      "github",
  gitlab_connector:      "github",    // maps to same connector slot
  googledrive_connector: "googledrive",
  onedrive_connector:    "googledrive",
  gmail_connector:       "gmail",
  outlook_connector:     "gmail",
  calendar_connector:    "calendar",
  web_search_connector:  "web_search",
  openai_gpt4:           "llm",
  claude_sonnet:         "llm",
  gemini_pro:            "llm",
  local_llm:             "llm",
  local_runtime:         "local",
  cache_layer:           "cache",
};

function extractBoundProviders(bound: BoundCapabilityGraph): string[] {
  const connectors = bound.bindings
    .filter(b => b.status === "resolved")
    .map(b => PROVIDER_TO_CONNECTOR[b.providerId] ?? b.providerId);
  // Deduplicate, keep only live connectors for strategy building
  const unique = [...new Set(connectors)].filter(c => c !== "local" && c !== "cache");
  return unique.length > 0 ? unique : ["llm"];
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF47_SGE__?: StrategyGenerationEngineImpl };
if (!G.__EF47_SGE__) G.__EF47_SGE__ = new StrategyGenerationEngineImpl();
export const StrategyGenerationEngine: StrategyGenerationEngineImpl = G.__EF47_SGE__;