/**
 * ConnectorCertificationStateMachine.ts — Engineering Sprint E-03.3
 * Deterministic state transitions for the certification lifecycle.
 * Read-only: no side-effects, no persistence.
 */

import type { CertificationState, InvalidationTrigger } from "./CCCTypes";

// ── Allowed transitions ────────────────────────────────────────────────────────

const TRANSITIONS: Partial<Record<CertificationState, CertificationState[]>> = {
  draft:                  ["engineering_ready"],
  engineering_ready:      ["testing_ready", "certification_required"],
  testing_ready:          ["certification_required"],
  certification_required: ["certification_running"],
  certification_running:  ["certification_passed", "certification_failed"],
  certification_failed:   ["certification_required", "certification_running"],
  certification_passed:   ["production_ready", "certification_required"],
  production_ready:       ["enterprise_ready", "certification_required"],
  enterprise_ready:       ["certification_required"],
};

// ── Invalidation: any state → certification_required ──────────────────────────

const INVALIDATION_TRIGGERS: ReadonlySet<InvalidationTrigger> = new Set([
  "connector_changed",
  "capability_changed",
  "alias_registry_changed",
  "domain_registry_changed",
  "query_builder_changed",
  "query_executor_changed",
  "config_changed",
  "dependency_changed",
  "manual_reset",
  "cert_expired",
]);

// ── State Machine ─────────────────────────────────────────────────────────────

export interface TransitionResult {
  ok:       boolean;
  newState: CertificationState;
  reason:   string;
}

export class ConnectorCertificationStateMachine {
  /**
   * Attempt a forward transition.
   */
  transition(current: CertificationState, next: CertificationState): TransitionResult {
    const allowed = TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      return {
        ok:       false,
        newState: current,
        reason:   `Transition "${current}" → "${next}" is not allowed. Valid next states: [${allowed.join(", ")}]`,
      };
    }
    return { ok: true, newState: next, reason: `Transitioned ${current} → ${next}` };
  }

  /**
   * Invalidate due to a change trigger — always moves to certification_required,
   * regardless of current state (except draft and running).
   */
  invalidate(current: CertificationState, trigger: InvalidationTrigger): TransitionResult {
    if (!INVALIDATION_TRIGGERS.has(trigger)) {
      return { ok: false, newState: current, reason: `Unknown trigger: ${trigger}` };
    }
    if (current === "draft") {
      return { ok: false, newState: current, reason: "Draft connectors are not invalidated." };
    }
    if (current === "certification_running") {
      return {
        ok:       true,
        newState: "certification_required",
        reason:   `Running certification cancelled due to: ${trigger}`,
      };
    }
    return {
      ok:       true,
      newState: "certification_required",
      reason:   `Invalidated by: ${trigger}`,
    };
  }

  /**
   * Returns valid next states for a given current state.
   */
  validNextStates(current: CertificationState): CertificationState[] {
    return [...(TRANSITIONS[current] ?? [])];
  }

  /**
   * Quality gate: can this connector be promoted to production?
   */
  canPromoteToProduction(current: CertificationState): boolean {
    return current === "certification_passed";
  }

  /**
   * Is this connector blocked from production use?
   */
  isBlocked(current: CertificationState): boolean {
    return (
      current === "certification_failed" ||
      current === "certification_required" ||
      current === "certification_running" ||
      current === "draft"
    );
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__CERT_STATE_MACHINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ConnectorCertificationStateMachine();
}
export const certStateMachine: ConnectorCertificationStateMachine = (
  globalThis as unknown as Record<string, ConnectorCertificationStateMachine>
)[_KEY];