/**
 * StrategySelectionEngine.ts — Sprint EF-46 · Strategy Selection Engine
 *
 * SRP: coordenar StrategyCatalog + StrategyScorer e produzir um SelectionResult.
 *
 * NÃO executa tarefas.
 * NÃO chama conectores.
 * NÃO modifica GoalEngine, PlannerEngine, DynamicPlanningEngine.
 *
 * Posição no fluxo EF-46:
 *   Goal → StrategySelectionEngine → CognitiveOrchestrator → DynamicPlanningEngine → Planner
 *
 * HMR-safe singleton via globalThis.
 */

import type { Goal }                                  from "@/lib/goal-engine/GoalTypes";
import type { CognitivePlan, OperationalIntent }      from "@/lib/cognitive-orchestrator/COTypes";
import { analyzeOperationalIntent }                   from "@/lib/cognitive-orchestrator/IntentAnalyzer";
import { getCandidates }                              from "./StrategyCatalog";
import { scoreCandidate }                             from "./StrategyScorer";
import type {
  SelectionResult, StrategyEvaluation, ScoringWeights,
} from "./StrategyEvaluation";
import { DEFAULT_WEIGHTS, makeSelectionId }           from "./StrategyEvaluation";

// ── Engine ────────────────────────────────────────────────────────────────────

class StrategySelectionEngineImpl {

  /**
   * Evaluate all candidate strategies for a Goal and pick the best one.
   *
   * @param goal    - Validated Goal from GoalEngine
   * @param plan    - CognitivePlan from CognitiveOrchestrator (optional — used for intent cross-check)
   * @param weights - Scoring weights (defaults to DEFAULT_WEIGHTS)
   */
  select(
    goal:    Goal,
    plan:    CognitivePlan | null = null,
    weights: ScoringWeights = DEFAULT_WEIGHTS,
  ): SelectionResult {
    const t0 = Date.now();

    // Derive intent: prefer plan intent (already computed by Orchestrator), else re-analyse
    const intent: OperationalIntent = plan?.intent ?? analyzeOperationalIntent(goal);

    // Get candidates from catalog
    const candidates = getCandidates(intent, goal);

    // Score all candidates
    const scored: StrategyEvaluation[] = candidates.map(c => ({
      ...scoreCandidate(c, weights),
      recommended: false,
    }));

    // Sort descending by totalScore
    scored.sort((a, b) => b.totalScore - a.totalScore);

    // Mark winner
    if (scored.length > 0) {
      (scored[0] as any).recommended = true;
    }

    const winner      = scored[0];
    const alternatives = scored.slice(1);

    const rationale = winner
      ? `Estratégia "${winner.label}" selecionada: ${winner.rationale}. ` +
        `Score: ${winner.totalScore.toFixed(3)} (confiabilidade: ${winner.estimatedReliability}%, ` +
        `latência: ~${winner.estimatedLatencyMs}ms, custo: ${winner.estimatedCost}/10).`
      : "Nenhuma estratégia disponível.";

    const result: SelectionResult = Object.freeze({
      id:           makeSelectionId(),
      goalId:       goal.id,
      intent,
      candidates:   Object.freeze(scored),
      winner,
      alternatives: Object.freeze(alternatives),
      weights,
      rationale,
      durationMs:   Date.now() - t0,
      createdAt:    new Date().toISOString(),
    });

    return result;
  }

  /**
   * Re-select with different weights — useful for replanning scenarios from DynamicPlanningEngine.
   */
  reselect(
    goal:       Goal,
    plan:       CognitivePlan | null,
    newWeights: ScoringWeights,
  ): SelectionResult {
    return this.select(goal, plan, newWeights);
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF46_SSE__?: StrategySelectionEngineImpl };
if (!G.__EF46_SSE__) G.__EF46_SSE__ = new StrategySelectionEngineImpl();
export const StrategySelectionEngine: StrategySelectionEngineImpl = G.__EF46_SSE__;