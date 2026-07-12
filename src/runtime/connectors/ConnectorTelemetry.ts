/**
 * ConnectorTelemetry.ts
 * Structured telemetry, latency histograms, success rate tracking.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorResult } from './interfaces/IConnectorResult';
import type { IConnectorTelemetry } from './interfaces/IConnectorHealth';

interface LatencySamples {
  samples: number[];
}

interface ConnectorCounters {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  rateLimitCount: number;
  totalRetries: number;
  totalLatencyMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

export class ConnectorTelemetry {
  private readonly counters = new Map<string, ConnectorCounters>();
  private readonly latency = new Map<string, LatencySamples>();
  private globalRecordCount = 0;

  private getCounters(connectorId: string): ConnectorCounters {
    if (!this.counters.has(connectorId)) {
      this.counters.set(connectorId, {
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        rateLimitCount: 0,
        totalRetries: 0,
        totalLatencyMs: 0,
      });
    }
    return this.counters.get(connectorId)!;
  }

  private getLatency(connectorId: string): LatencySamples {
    if (!this.latency.has(connectorId)) {
      this.latency.set(connectorId, { samples: [] });
    }
    return this.latency.get(connectorId)!;
  }

  record(connectorId: string, result: IConnectorResult): void {
    this.globalRecordCount++;
    const c = this.getCounters(connectorId);
    const l = this.getLatency(connectorId);

    c.totalRequests++;
    c.totalLatencyMs += result.latencyMs;
    c.totalRetries += result.telemetry.retryCount;

    if (result.status === 'SUCCESS') c.successCount++;
    else if (result.status === 'TIMEOUT') c.timeoutCount++;
    else if (result.status === 'RATE_LIMITED') c.rateLimitCount++;
    else c.failureCount++;

    l.samples.push(result.latencyMs);
    // Keep last 1000 samples per connector
    if (l.samples.length > 1000) l.samples.shift();
  }

  get(connectorId: string): IConnectorTelemetry {
    const c = this.getCounters(connectorId);
    const l = this.getLatency(connectorId);
    const sorted = [...l.samples].sort((a, b) => a - b);
    const total = c.totalRequests;

    return {
      connectorId,
      totalRequests: c.totalRequests,
      successCount: c.successCount,
      failureCount: c.failureCount,
      timeoutCount: c.timeoutCount,
      rateLimitCount: c.rateLimitCount,
      totalRetries: c.totalRetries,
      avgLatencyMs: total > 0 ? Math.round(c.totalLatencyMs / total) : 0,
      p50LatencyMs: percentile(sorted, 50),
      p95LatencyMs: percentile(sorted, 95),
      p99LatencyMs: percentile(sorted, 99),
      successRate: total > 0 ? c.successCount / total : 1,
      circuitBreakerState: 'CLOSED',  // updated by RetryManager
      recordedAt: new Date().toISOString(),
    };
  }

  getAll(): IConnectorTelemetry[] {
    return [...this.counters.keys()].map(id => this.get(id));
  }

  statistics() {
    const all = this.getAll();
    return {
      trackedConnectors: this.counters.size,
      globalRecordCount: this.globalRecordCount,
      globalSuccessRate: all.length > 0
        ? all.reduce((acc, t) => acc + t.successRate, 0) / all.length
        : 1,
    };
  }

  health() {
    const degraded = [...this.counters.entries()]
      .filter(([, c]) => c.totalRequests > 10 && c.successCount / c.totalRequests < 0.5)
      .length;

    return {
      status: (degraded > 0 ? 'DEGRADED' : 'HEALTHY') as 'HEALTHY' | 'DEGRADED',
      details: `${this.counters.size} connectors tracked, ${degraded} degraded`,
      checks: { trackingActive: true, noCriticalDegradation: degraded === 0 },
      checkedAt: new Date().toISOString(),
    };
  }
}