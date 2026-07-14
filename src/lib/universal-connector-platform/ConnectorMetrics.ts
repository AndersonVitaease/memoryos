/**
 * ConnectorMetrics.ts — Sprint 6.3.0
 * Records calls, errors, avg latency, availability per connector.
 */

import type { ConnectorMetricsSnapshot } from "./UCPTypes";

interface MetricsState {
  totalCalls: number;
  totalErrors: number;
  totalLatencyMs: number;
  uptimeTicks: number;
  totalTicks: number;
  lastUpdatedAt: number;
}

export class ConnectorMetrics {
  private _store = new Map<string, MetricsState>();

  private _ensure(connectorId: string): MetricsState {
    if (!this._store.has(connectorId)) {
      this._store.set(connectorId, {
        totalCalls: 0, totalErrors: 0, totalLatencyMs: 0,
        uptimeTicks: 0, totalTicks: 0, lastUpdatedAt: Date.now(),
      });
    }
    return this._store.get(connectorId)!;
  }

  recordCall(connectorId: string, latencyMs: number, success: boolean): void {
    const s = this._ensure(connectorId);
    s.totalCalls++;
    s.totalLatencyMs += latencyMs;
    if (!success) s.totalErrors++;
    s.totalTicks++;
    if (success) s.uptimeTicks++;
    s.lastUpdatedAt = Date.now();
  }

  snapshot(connectorId: string): ConnectorMetricsSnapshot {
    const s = this._ensure(connectorId);
    return {
      totalCalls:    s.totalCalls,
      totalErrors:   s.totalErrors,
      avgLatencyMs:  s.totalCalls > 0 ? Math.round(s.totalLatencyMs / s.totalCalls) : 0,
      availability:  s.totalTicks > 0 ? Math.round((s.uptimeTicks / s.totalTicks) * 100) : 100,
      lastUpdatedAt: s.lastUpdatedAt,
    };
  }

  allSnapshots(): Map<string, ConnectorMetricsSnapshot> {
    const out = new Map<string, ConnectorMetricsSnapshot>();
    for (const [id] of this._store) out.set(id, this.snapshot(id));
    return out;
  }

  totalCallsAllConnectors(): number {
    let total = 0;
    for (const [, s] of this._store) total += s.totalCalls;
    return total;
  }

  reset(connectorId: string): void { this._store.delete(connectorId); }
}