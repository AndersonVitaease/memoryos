/**
 * StrategyGenerationEngine.ts — Sprint EF-47 · Strategy Generation Engine
 *
 * SRP: gerar dinamicamente um conjunto de GeneratedStrategies a partir de
 *      um Goal, usando todos os GENERATION_RULES disponíveis.
 *
 * NÃO avalia nem seleciona estratégias — isso é responsabilidade do SSE (EF-46).
 * NÃO executa tarefas.
 * NÃO chama conectores ou APIs.
 * NÃO modifica GoalEngine, PlannerEngine, DynamicPlanningEngine ou SSE.
 *
 * Integração com EF-46:
 *   Output: GeneratedStrategy[] → caller converte com toStrategyCandidate()
 *           e passa ao StrategySelectionEngine.select()
 *
 * Posição no fluxo EF-47:
 *   Goal → StrategyGenerationEngine → StrategySelectionEngine → CognitiveOrchestrator → DPE → Planner
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

// ── Generation result ─────────────────────────────────────────────────────────

export interface GenerationResult {
  readonly goalId:     string;
  readonly intent:     OperationalIntent;
  readonly strategies: readonly GeneratedStrategy[];
  readonly candidates: readonly StrategyCandidate[];   // ready for StrategySelectionEngine
  readonly metrics:    GenerationSummary;
  readonly durationMs: number;
  readonly createdAt:  string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

// All profiles to generate by default
const ALL_PROFILES: GenerationProfile[] = [
  "fast", "deep", "conservative", "resilient", "economic", "parallel",
];

class StrategyGenerationEngineImpl {

  /**
   * Generate strategies for a Goal.
   * @param goal     - Validated Goal from GoalEngine
   * @param profiles - Profiles to generate (default: all 6)
   */
  generate(
    goal:     Goal,
    profiles: GenerationProfile[] = ALL_PROFILES,
  ): GenerationResult {
    const t0      = Date.now();
    const intent  = analyzeOperationalIntent(goal);
    const primary = primaryConnectorsForIntent(intent, goal);

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
      goalId:     goal.id,
      intent,
      strategies: Object.freeze(strategies),
      candidates: Object.freeze(candidates),
      metrics,
      durationMs,
      createdAt:  new Date().toISOString(),
    });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF47_SGE__?: StrategyGenerationEngineImpl };
if (!G.__EF47_SGE__) G.__EF47_SGE__ = new StrategyGenerationEngineImpl();
export const StrategyGenerationEngine: StrategyGenerationEngineImpl = G.__EF47_SGE__;