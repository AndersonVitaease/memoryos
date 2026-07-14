/**
 * ConnectorHealth.ts — Sprint 6.3.0
 * Monitors availability, latency, errors, state per connector.
 */

import type { ConnectorHealthSnapshot, ConnectorHealthState } from "./UCPTypes";

export class ConnectorHealth {
  private _snapshots = new Map<string, ConnectorHealthSnapshot>();

  private _defaultSnapshot(): ConnectorHealthSnapshot {
    return {
      state:        "UNKNOWN",
      availability: 100,
      latencyMs:    0,
      errorRate:    0,
      lastCheckedAt: Date.now(),
      message:      "Not yet checked",
    };
  }

  get(connectorId: string): ConnectorHealthSnapshot {
    return this._snapshots.get(connectorId) ?? this._defaultSnapshot();
  }

  update(
    connectorId: string,
    partial: Partial<Omit<ConnectorHealthSnapshot, "lastCheckedAt">>
  ): ConnectorHealthSnapshot {
    const prev = this.get(connectorId);
    const next: ConnectorHealthSnapshot = {
      ...prev,
      ...partial,
      lastCheckedAt: Date.now(),
    };
    // auto-derive state from errorRate + availability
    if (partial.state === undefined) {
      if (next.errorRate >= 50 || next.availability < 50)       next.state = "UNHEALTHY";
      else if (next.errorRate >= 20 || next.availability < 80)  next.state = "DEGRADED";
      else                                                        next.state = "HEALTHY";
    }
    this._snapshots.set(connectorId, next);
    return next;
  }

  mark(connectorId: string, state: ConnectorHealthState, message: string): ConnectorHealthSnapshot {
    return this.update(connectorId, { state, message });
  }

  allSnapshots(): Map<string, ConnectorHealthSnapshot> {
    return new Map(this._snapshots);
  }

  overallState(): ConnectorHealthState {
    const snapshots = [...this._snapshots.values()];
    if (snapshots.some(s => s.state === "UNHEALTHY")) return "UNHEALTHY";
    if (snapshots.some(s => s.state === "DEGRADED"))  return "DEGRADED";
    if (snapshots.some(s => s.state === "HEALTHY"))   return "HEALTHY";
    return "UNKNOWN";
  }
}