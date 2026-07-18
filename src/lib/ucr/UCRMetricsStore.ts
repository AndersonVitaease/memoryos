/**
 * UCRMetricsStore.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * In-memory metrics aggregation for all connectors.
 */

import type { UCRMetrics } from "./UCRTypes";

interface MetricsAccumulator {
  total:      number;
  success:    number;
  failures:   number;
  timeouts:   number;
  retries:    number;
  totalMs:    number;
  lastAt:     string | null;
}

const _store = new Map<string, MetricsAccumulator>();

function get(connectorId: string): MetricsAccumulator {
  if (!_store.has(connectorId)) {
    _store.set(connectorId, { total: 0, success: 0, failures: 0, timeouts: 0, retries: 0, totalMs: 0, lastAt: null });
  }
  return _store.get(connectorId)!;
}

export const UCRMetricsStore = {
  record(connectorId: string, ok: boolean, durationMs: number, retries: number, errorCode: string | null): void {
    const m = get(connectorId);
    m.total++;
    if (ok) m.success++; else m.failures++;
    if (errorCode === "TIMEOUT") m.timeouts++;
    m.retries  += retries;
    m.totalMs  += durationMs;
    m.lastAt    = new Date().toISOString();
  },

  snapshot(connectorId: string): UCRMetrics {
    const { UCRCircuitBreaker } = require("./UCRCircuitBreaker");
    const m  = get(connectorId);
    const cb = UCRCircuitBreaker.get(connectorId);
    return Object.freeze({
      connectorId,
      totalRequests:  m.total,
      successCount:   m.success,
      failureCount:   m.failures,
      timeoutCount:   m.timeouts,
      retryCount:     m.retries,
      avgDurationMs:  m.total > 0 ? Math.round(m.totalMs / m.total) : 0,
      circuitState:   cb.getState(),
      lastRequestAt:  m.lastAt,
    });
  },

  all(): UCRMetrics[] {
    return [..._store.keys()].map(id => UCRMetricsStore.snapshot(id));
  },

  reset(connectorId: string): void {
    _store.delete(connectorId);
  },

  resetAll(): void {
    _store.clear();
  },
};