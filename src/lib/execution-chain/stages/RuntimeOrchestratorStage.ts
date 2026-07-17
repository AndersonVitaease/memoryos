// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Runtime Orchestrator Stage
// Single responsibility: select capability + connector, set execution params.
// ══════════════════════════════════════════════════════════════════════════════

import type { KernelResult, PlanResult, OrchestratorResult } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";

export interface IRuntimeOrchestrator {
  orchestrate(kern: KernelResult, plan: PlanResult): Promise<OrchestratorResult>;
}

export class RuntimeOrchestratorStage implements IRuntimeOrchestrator {
  constructor(private readonly _ids: IExecutionIdProvider) {}

  async orchestrate(kern: KernelResult, plan: PlanResult): Promise<OrchestratorResult> {
    const step = plan.steps[0];
    const orchestrationId = this._ids.next("orch");
    const selectedCapability = step?.capabilityId ?? "memory.retrieve";
    const selectedConnector  = step?.connectorId  ?? kern.routingDecision;
    const evidence = `Orchestrator ${orchestrationId} — capability:${selectedCapability} connector:${selectedConnector}`;

    return Object.freeze({
      orchestrationId,
      selectedCapability,
      selectedConnector,
      executionParams: Object.freeze({ ...(step?.params ?? {}) }) as Record<string, unknown>,
      fallbackChain: Object.freeze(["memory.retrieve", "local.search"]) as unknown as string[],
      evidence,
    });
  }
}