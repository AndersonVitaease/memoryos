// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Result Stage
// Single responsibility: normalise connector output into a ResultOutput.
// ══════════════════════════════════════════════════════════════════════════════

import type { IntentResult, ConnectorResult, ResultOutput } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";

export interface IResultStage {
  produce(connector: ConnectorResult, intent: IntentResult): Promise<ResultOutput>;
}

export class ResultStageImpl implements IResultStage {
  constructor(private readonly _ids: IExecutionIdProvider) {}

  async produce(connector: ConnectorResult, intent: IntentResult): Promise<ResultOutput> {
    const outputId = this._ids.next("out");
    const evidence = `Result ${outputId} — source:${connector.connectorName} confidence:${intent.confidence} format:JSON`;

    return Object.freeze({
      outputId,
      data: connector.rawResponse,
      format: "JSON",
      confidence: intent.confidence,
      sources: Object.freeze([connector.connectorName]) as unknown as string[],
      evidence,
    });
  }
}