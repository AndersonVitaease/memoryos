/**
 * CapabilityExecutionContext.ts — Sprint C-03.6.3
 * Factory for immutable execution contexts.
 */

import type { CapabilityExecutionContext } from "./CapabilityRuntimeTypes";

let _seq = 0;
function nextId(): string {
  return `exec-${Date.now()}-${(++_seq).toString().padStart(4, "0")}`;
}

export function createContext(params: {
  capabilityId: string;
  goalId:       string;
  sessionId:    string;
  reason?:      string;
}): Readonly<CapabilityExecutionContext> {
  return Object.freeze({
    executionId:  nextId(),
    capabilityId: params.capabilityId,
    goalId:       params.goalId,
    sessionId:    params.sessionId,
    startedAt:    Date.now(),
    reason:       params.reason ?? "Capability selected by CapabilitySelectionEngine",
  });
}

export function resetSequence(): void { _seq = 0; }