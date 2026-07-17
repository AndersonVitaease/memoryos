// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Explainability Stage
// Single responsibility: compose explanations from per-stage evidence.
// Evidence is collected from each stage — never reconstructed post-hoc.
// ══════════════════════════════════════════════════════════════════════════════

import type { ChainStageRecord, IntentResult, ResultOutput, ExplainabilityResult } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";

export interface IExplainabilityEngine {
  explain(
    stages: ChainStageRecord[],
    result: ResultOutput,
    intent: IntentResult,
    evidences: string[],
  ): Promise<ExplainabilityResult>;
}

export class ExplainabilityStageImpl implements IExplainabilityEngine {
  constructor(private readonly _ids: IExecutionIdProvider) {}

  async explain(
    stages: ChainStageRecord[],
    result: ResultOutput,
    intent: IntentResult,
    evidences: string[],
  ): Promise<ExplainabilityResult> {
    const traceId = this._ids.next("trace");
    const stagesExecuted = stages.filter(s => s.status === "COMPLETED").map(s => s.stage as string);

    // Decision log built from per-stage evidence collected during execution
    const decisionLog = [
      ...evidences,
      `Stages completed: ${stagesExecuted.length}`,
      `Final confidence: ${Math.round(intent.confidence * 100)}%`,
    ];

    const humanReadableSummary =
      `Query processed via ${intent.intentType} intent through ${stagesExecuted.length} pipeline stages ` +
      `with ${Math.round(result.confidence * 100)}% confidence. ` +
      `Source: ${result.sources.join(", ")}.`;

    return Object.freeze({
      traceId,
      stagesExecuted: Object.freeze(stagesExecuted) as unknown as string[],
      decisionLog: Object.freeze(decisionLog) as unknown as string[],
      humanReadableSummary,
      confidenceScore: result.confidence,
    });
  }
}