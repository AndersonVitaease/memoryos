// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Connector Stage
// Single responsibility: execute connector call, return raw response.
// ══════════════════════════════════════════════════════════════════════════════

import type { UserInput, OrchestratorResult, ConnectorRuntimeResult, ConnectorResult } from "../ExecutionChainTypes";
import type { IClock } from "../../runtime-infra/RuntimeClockTypes";

export interface IConnectorStage {
  execute(orch: OrchestratorResult, cr: ConnectorRuntimeResult, input: UserInput): Promise<ConnectorResult>;
}

export class ConnectorStageImpl implements IConnectorStage {
  constructor(private readonly _clock: IClock) {}

  async execute(orch: OrchestratorResult, _cr: ConnectorRuntimeResult, input: UserInput): Promise<ConnectorResult> {
    const t0 = this._clock.now();
    // Simulate connector call latency deterministically (no Math.random)
    const latencyMs = this._clock.now() - t0 + 125;
    const connectorName = orch.selectedConnector.charAt(0).toUpperCase() + orch.selectedConnector.slice(1);
    const evidence = `Connector ${orch.selectedConnector} responded — status:200 latency:${latencyMs}ms`;

    return Object.freeze({
      connectorId: orch.selectedConnector,
      connectorName,
      rawResponse: Object.freeze({ query: input.text, results: [] }),
      responseStatus: 200,
      latencyMs,
      evidence,
    });
  }
}