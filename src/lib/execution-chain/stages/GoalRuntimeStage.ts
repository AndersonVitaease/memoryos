// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Goal Runtime Stage
// Single responsibility: derive structured goal from intent.
// ══════════════════════════════════════════════════════════════════════════════

import type { UserInput, IntentResult, GoalResult } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";

export interface IGoalRuntime {
  derive(intent: IntentResult, input: UserInput): Promise<GoalResult>;
}

export class GoalRuntimeStage implements IGoalRuntime {
  constructor(private readonly _ids: IExecutionIdProvider) {}

  async derive(intent: IntentResult, input: UserInput): Promise<GoalResult> {
    const goalId = this._ids.next("goal");
    const subGoals: string[] = [];
    if (intent.requiresConnector) subGoals.push("authenticate_connector", "fetch_resource");
    if (intent.requiresPlanning)  subGoals.push("decompose_plan", "validate_steps");
    if (subGoals.length === 0)    subGoals.push("recall_memory");

    const description = `Achieve: ${input.text.slice(0, 80)}`;
    const evidence = `Goal ${goalId} derived — type:${intent.intentType} subGoals:${subGoals.join(",")} priority:${intent.confidence > 0.85 ? 1 : 2}`;

    return Object.freeze({
      goalId,
      goalType: intent.intentType,
      description,
      subGoals: Object.freeze(subGoals) as unknown as string[],
      priority: intent.confidence > 0.85 ? 1 : 2,
      constraints: Object.freeze(["max_latency_10s", "user_scope_only"]) as unknown as string[],
      evidence,
    });
  }
}