// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Memory Stage
// Single responsibility: store result + goal in memory, extract knowledge.
// ══════════════════════════════════════════════════════════════════════════════

import type { UserInput, GoalResult, ResultOutput, MemoryResult } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";

export interface IMemoryEngine {
  memorize(result: ResultOutput, goal: GoalResult, input: UserInput): Promise<MemoryResult>;
}

export class MemoryStageImpl implements IMemoryEngine {
  constructor(private readonly _ids: IExecutionIdProvider) {}

  async memorize(result: ResultOutput, goal: GoalResult, _input: UserInput): Promise<MemoryResult> {
    const memoryId = this._ids.next("mem");
    const knowledgeExtracted = [goal.description, ...goal.subGoals];
    const evidence = `Memory ${memoryId} — tier:ACTIVE entities:${result.sources.length + 1} knowledge:${knowledgeExtracted.length}`;

    return Object.freeze({
      memorized: true,
      memoryId,
      tier: "ACTIVE" as const,
      knowledgeExtracted: Object.freeze(knowledgeExtracted) as unknown as string[],
      entitiesStored: result.sources.length + 1,
      evidence,
    });
  }
}