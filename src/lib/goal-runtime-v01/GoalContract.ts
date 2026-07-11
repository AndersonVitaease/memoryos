// Goal Runtime v0.1 — Goal Contract
// Foundation v1.0 · Engineering First · Sprint Goal Runtime v0.1
// Responsabilidade: definir contrato obrigatorio de todo Goal

import type { GoalContext, GoalMetadata, GoalResult } from "./GoalTypes";

export interface IGoal {
  metadata(): GoalMetadata;
  validate(): { valid: boolean; errors: string[] };
  initialize(context: GoalContext): Promise<GoalResult>;
  update(fields: Partial<Pick<GoalMetadata, "title" | "description" | "priority" | "tags">>): Promise<GoalResult>;
  complete(reason?: string): Promise<GoalResult>;
  cancel(reason?: string): Promise<GoalResult>;
}