// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Kernel Stage
// Single responsibility: apply security context and resource limits.
// ══════════════════════════════════════════════════════════════════════════════

import type { UserInput, PlanResult, KernelResult } from "../ExecutionChainTypes";
import type { IExecutionIdProvider } from "../../runtime-infra/RuntimeExecutionIdProvider";

export interface IKernel {
  apply(plan: PlanResult, input: UserInput): Promise<KernelResult>;
}

export class KernelStage implements IKernel {
  constructor(private readonly _ids: IExecutionIdProvider) {}

  async apply(plan: PlanResult, input: UserInput): Promise<KernelResult> {
    const sessionToken = this._ids.next("tok");
    const routingDecision = plan.steps[0]?.connectorId ?? "memory";
    const evidence = `Kernel session:${sessionToken} routing:${routingDecision} user:${input.userId}`;

    return Object.freeze({
      sessionToken,
      resourceLimits: Object.freeze({ maxTimeMs: 10000, maxRetries: 3 }),
      securityContext: Object.freeze({ userId: input.userId, scopes: ["read", "write"] as string[] }),
      routingDecision,
      evidence,
    });
  }
}