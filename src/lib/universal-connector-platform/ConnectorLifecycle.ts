/**
 * ConnectorLifecycle.ts — Sprint 6.3.0
 * Manages lifecycle state transitions for connectors.
 * Valid transitions are enforced — invalid ones throw.
 */

import type { ConnectorLifecycleState } from "./UCPTypes";

// Allowed transitions: from → to[]
const TRANSITIONS: Record<ConnectorLifecycleState, ConnectorLifecycleState[]> = {
  REGISTERED:   ["CONFIGURED", "DISCONNECTED"],
  CONFIGURED:   ["READY", "FAILED", "DISCONNECTED"],
  READY:        ["DEGRADED", "FAILED", "DISCONNECTED"],
  DEGRADED:     ["READY", "FAILED", "DISCONNECTED"],
  FAILED:       ["REGISTERED", "DISCONNECTED"],
  DISCONNECTED: ["REGISTERED"],
};

export class ConnectorLifecycle {
  private _states = new Map<string, ConnectorLifecycleState>();

  init(connectorId: string): void {
    this._states.set(connectorId, "REGISTERED");
  }

  get(connectorId: string): ConnectorLifecycleState {
    return this._states.get(connectorId) ?? "DISCONNECTED";
  }

  transition(connectorId: string, to: ConnectorLifecycleState): void {
    const from = this.get(connectorId);
    const allowed = TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid lifecycle transition: ${from} → ${to} for connector ${connectorId}`);
    }
    this._states.set(connectorId, to);
  }

  canTransition(connectorId: string, to: ConnectorLifecycleState): boolean {
    const from = this.get(connectorId);
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  allStates(): Map<string, ConnectorLifecycleState> {
    return new Map(this._states);
  }

  remove(connectorId: string): void {
    this._states.delete(connectorId);
  }
}