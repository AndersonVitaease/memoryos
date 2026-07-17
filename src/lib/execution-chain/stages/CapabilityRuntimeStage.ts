// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Capability Runtime Stage
// Single responsibility: validate and prepare capability for execution.
// ══════════════════════════════════════════════════════════════════════════════

import type { OrchestratorResult, CapabilityResult } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";

export interface ICapabilityRuntime {
  prepare(orch: OrchestratorResult): Promise<CapabilityResult>;
}

export class CapabilityRuntimeStageImpl implements ICapabilityRuntime {
  constructor(private readonly _ids: IExecutionIdProvider) {}

  async prepare(orch: OrchestratorResult): Promise<CapabilityResult> {
    const capabilityId = this._ids.next("cap");
    const evidence = `Capability ${capabilityId} — name:${orch.selectedCapability} policy:RETRY_EXPONENTIAL`;

    return Object.freeze({
      capabilityId,
      capabilityName: orch.selectedCapability,
      inputValidated: true,
      outputSchema: "ResultOutput",
      executionPolicy: "RETRY_EXPONENTIAL",
      evidence,
    });
  }
}