// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeContext
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

import type { IExecutionIdProvider } from "./RuntimeExecutionIdProvider";
import type { IClock } from "./RuntimeClockTypes";

export interface RuntimeContextParams {
  capabilityId?: string;
  goalId?: string;
  sessionId?: string;
  connectorId?: string;
  agentId?: string;
  workflowId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeContext extends RuntimeContextParams {
  readonly executionId: string;
  readonly startedAt: number;
  readonly runtimeLabel: string;
}

export function createRuntimeContext(
  params: RuntimeContextParams,
  idProvider: IExecutionIdProvider,
  clock: IClock,
  runtimeLabel: string,
  prefix = "exec"
): Readonly<RuntimeContext> {
  return Object.freeze({
    executionId: idProvider.next(prefix),
    startedAt: clock.now(),
    runtimeLabel,
    ...params,
    reason: params.reason ?? "runtime-execution",
  });
}