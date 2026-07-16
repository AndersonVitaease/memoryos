/**
 * CapabilityStateMachine.ts — Engineering Sprint 7.0.2
 * Deterministic state transitions for capability lifecycle.
 * Pure functions — no side effects, no persistence.
 */

import type { CapabilityState } from "./CapabilityLifecycleTypes";

// ── Allowed forward transitions ───────────────────────────────────────────────

const TRANSITIONS: Partial<Record<CapabilityState, CapabilityState[]>> = {
  draft:        ["experimental", "disabled"],
  experimental: ["internal", "disabled"],
  internal:     ["beta", "disabled"],
  beta:         ["certified", "deprecated", "disabled"],
  certified:    ["production", "deprecated", "disabled"],
  production:   ["enterprise", "deprecated", "disabled"],
  enterprise:   ["deprecated", "disabled"],
  deprecated:   ["disabled"],
  disabled:     [],  // terminal — no forward transitions
};

export interface StateTransitionResult {
  ok:       boolean;
  newState: CapabilityState;
  reason:   string;
}

export class CapabilityStateMachine {
  transition(current: CapabilityState, next: CapabilityState): StateTransitionResult {
    const allowed = TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      return {
        ok:       false,
        newState: current,
        reason:   `Transition "${current}" → "${next}" not allowed. Valid: [${allowed.join(", ")}]`,
      };
    }
    return { ok: true, newState: next, reason: `${current} → ${next}` };
  }

  validNextStates(current: CapabilityState): CapabilityState[] {
    return [...(TRANSITIONS[current] ?? [])];
  }

  isTerminal(state: CapabilityState): boolean {
    return state === "disabled";
  }

  isExecutable(state: CapabilityState): boolean {
    return !["draft", "disabled"].includes(state);
  }

  requiresCertification(state: CapabilityState): boolean {
    return ["production", "enterprise"].includes(state);
  }
}

const _KEY = "__CAP_STATE_MACHINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilityStateMachine();
}
export const capStateMachine: CapabilityStateMachine = (
  globalThis as unknown as Record<string, CapabilityStateMachine>
)[_KEY];