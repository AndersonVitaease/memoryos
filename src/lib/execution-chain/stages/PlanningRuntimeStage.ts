// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Planning Runtime Stage
// Single responsibility: decompose goal into executable plan steps.
// ══════════════════════════════════════════════════════════════════════════════

import type { IntentResult, GoalResult, PlanResult, PlanStep } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";
import type { IConnectorRegistry } from "../ConnectorRegistry";

export interface IPlanningRuntime {
  plan(goal: GoalResult, intent: IntentResult): Promise<PlanResult>;
}

export class PlanningRuntimeStage implements IPlanningRuntime {
  constructor(
    private readonly _ids: IExecutionIdProvider,
    private readonly _registry: IConnectorRegistry,
  ) {}

  async plan(goal: GoalResult, intent: IntentResult): Promise<PlanResult> {
    const planId = this._ids.next("plan");
    const connectorId = this._registry.resolve(intent);

    const steps: PlanStep[] = goal.subGoals.map((sg, i) => Object.freeze({
      stepId: this._ids.next("step"),
      action: sg,
      capabilityId: intent.requiresConnector ? "connector.search" : "memory.retrieve",
      connectorId,
      params: Object.freeze({ goalId: goal.goalId, subGoal: sg }) as Record<string, unknown>,
      dependsOn: i > 0 ? [goal.subGoals[i - 1]] : [] as string[],
    }));

    const evidence = `Plan ${planId} — ${steps.length} steps via connector:${connectorId}`;

    return Object.freeze({
      planId,
      steps: Object.freeze(steps) as unknown as PlanStep[],
      estimatedDurationMs: steps.length * 800,
      confidence: 0.88,
      evidence,
    });
  }
}