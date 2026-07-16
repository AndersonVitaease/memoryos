/**
 * ConnectorMetricsStore.ts — Engineering Sprint 8.3
 *
 * SRP: collect and expose runtime metrics per connector.
 * Singleton via globalThis — survives HMR and re-renders.
 * Immutable reads. Append-only writes.
 */

export interface ConnectorMetricSnapshot {
  readonly connectorId:      string;
  readonly totalExecutions:  number;
  readonly successCount:     number;
  readonly failureCount:     number;
  readonly averageLatencyMs: number;
  readonly lastExecutionAt:  number | null;
  readonly lastFailureAt:    number | null;
  readonly lastError:        string | null;
}

interface MutableMetric {
  totalExecutions: number;
  successCount:    number;
  failureCount:    number;
  latencies:       number[];
  lastExecutionAt: number | null;
  lastFailureAt:   number | null;
  lastError:       string | null;
}

class MetricsStore {
  private readonly _map = new Map<string, MutableMetric>();

  private _ensure(id: string): MutableMetric {
    if (!this._map.has(id)) {
      this._map.set(id, {
        totalExecutions: 0,
        successCount:    0,
        failureCount:    0,
        latencies:       [],
        lastExecutionAt: null,
        lastFailureAt:   null,
        lastError:       null,
      });
    }
    return this._map.get(id)!;
  }

  record(connectorId: string, success: boolean, latencyMs: number, error?: string): void {
    const m = this._ensure(connectorId);
    m.totalExecutions++;
    m.lastExecutionAt = Date.now();
    m.latencies.push(latencyMs);
    if (m.latencies.length > 200) m.latencies.shift();
    if (success) {
      m.successCount++;
    } else {
      m.failureCount++;
      m.lastFailureAt = Date.now();
      m.lastError     = error ?? null;
    }
  }

  get(connectorId: string): ConnectorMetricSnapshot {
    const m = this._ensure(connectorId);
    const avg = m.latencies.length > 0
      ? Math.round(m.latencies.reduce((a, b) => a + b, 0) / m.latencies.length)
      : 0;
    return Object.freeze({
      connectorId,
      totalExecutions:  m.totalExecutions,
      successCount:     m.successCount,
      failureCount:     m.failureCount,
      averageLatencyMs: avg,
      lastExecutionAt:  m.lastExecutionAt,
      lastFailureAt:    m.lastFailureAt,
      lastError:        m.lastError,
    });
  }

  all(): ConnectorMetricSnapshot[] {
    return Array.from(this._map.keys()).map((id) => this.get(id));
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__CONNECTOR_METRICS_STORE__";
const g = globalThis as unknown as Record<string, unknown>;
if (!g[_KEY]) g[_KEY] = new MetricsStore();

export const connectorMetrics = g[_KEY] as MetricsStore;