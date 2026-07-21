/**
 * CognitiveOrchestrator.ts — Sprint EF-43 · Cognitive Orchestrator v1.0
 *
 * SRP: coordenar IntentAnalyzer → TaskDecomposer → TaskDependencyResolver
 *      e produzir um CognitivePlan pronto para hand-off ao PlannerEngine.
 *
 * NÃO executa conectores.
 * NÃO chama APIs externas.
 * NÃO modifica o PlannerEngine, ConnectorRouter ou ConnectorRuntime.
 *
 * Integração com arquitetura existente:
 *   Input:  Goal (GoalEngine output, status = "Validated")
 *   Output: OrchestrationResult → caller invoca PlannerEngine.createPlan(goalId)
 *
 * HMR-safe singleton via globalThis.
 */

import type { Goal }                   from "@/lib/goal-engine/GoalTypes";
import { analyzeOperationalIntent }    from "./IntentAnalyzer";
import { decompose }                   from "./TaskDecomposer";
import { resolveDependencies }         from "./TaskDependencyResolver";
import type { CognitivePlan, OrchestrationResult } from "./COTypes";
import { makeCOId }                    from "./COTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExpectedOutput(goal: Goal, intent: import("./COTypes").OperationalIntent): string {
  const base = goal.acceptanceCriteria[0] ?? goal.primaryObjective;
  const intentLabel: Record<string, string> = {
    compare:              "Relatório comparativo entre as fontes solicitadas",
    analyze:              "Análise detalhada com conclusões e recomendações",
    transform:            "Conteúdo transformado conforme solicitado",
    write_or_create:      "Conteúdo criado e validado",
    search_and_retrieve:  "Informação recuperada e estruturada",
    read_single_source:   "Conteúdo lido e apresentado",
    read_multiple_sources:"Conteúdos consolidados",
    compound:             "Resultado composto para objetivo complexo",
    unknown:              base,
  };
  return intentLabel[intent] ?? base;
}

function buildSummary(plan: CognitivePlan): string {
  const taskCount   = plan.tasks.length;
  const parallelCnt = plan.tasks.filter(t => t.canParallelize).length;
  return [
    `Goal '${plan.goalId}' decomposto em ${taskCount} task(s) · intent: ${plan.intent}`,
    `Estratégia: ${plan.strategy}`,
    parallelCnt > 0 ? `${parallelCnt} task(s) paralelizáveis` : null,
    `Pronto para Planner: ${plan.canHandOff}`,
  ].filter(Boolean).join(" · ");
}

// ── Orchestrator implementation ───────────────────────────────────────────────

class CognitiveOrchestratorImpl {

  orchestrate(goal: Goal): OrchestrationResult {
    const t0 = Date.now();

    // 1. Extract operational intent from Goal (already analyzed by GoalEngine)
    const intent = analyzeOperationalIntent(goal);

    // 2. Decompose into CognitiveTasks
    const tasks = decompose(goal, intent);

    // 3. Resolve dependencies + topological order
    const resolution = resolveDependencies(tasks);

    // 4. Build immutable CognitivePlan
    const plan: CognitivePlan = Object.freeze({
      id:              makeCOId("cplan"),
      goalId:          goal.id,
      intent,
      complexity:      goal.estimatedComplexity,
      tasks,
      orderedTaskIds:  resolution.orderedIds,
      strategy:        resolution.strategy,
      expectedOutput:  buildExpectedOutput(goal, intent),
      confidenceScore: goal.confidenceScore,
      canHandOff:      !resolution.hasCircular && tasks.length > 0,
      createdAt:       new Date().toISOString(),
      durationMs:      Date.now() - t0,
    });

    const warnings = [
      ...resolution.warnings,
      ...(goal.confidenceScore < 0.6 ? ["Low confidence score — consider adding more context"] : []),
    ];

    const result: OrchestrationResult = Object.freeze({
      plan,
      plannerReady:  plan.canHandOff,
      handOffGoalId: goal.id,
      summary:       buildSummary(plan),
      warnings:      Object.freeze(warnings),
      durationMs:    Date.now() - t0,
    });

    return result;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF43_CO__?: CognitiveOrchestratorImpl };
if (!G.__EF43_CO__) G.__EF43_CO__ = new CognitiveOrchestratorImpl();
export const CognitiveOrchestrator: CognitiveOrchestratorImpl = G.__EF43_CO__;