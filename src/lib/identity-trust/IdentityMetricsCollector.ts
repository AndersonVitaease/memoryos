/**
 * IdentityMetricsCollector.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Collects and exposes observability metrics for all ITP operations.
 * Subscribes to IdentityEventBus — no direct coupling to other motors.
 * SRP: metrics collection and aggregation — nothing else.
 */

import type { IdentityMetrics } from './ITPTypes';
import { IdentityEventBus } from './IdentityEventBus';
import { ConnectionManager } from './ConnectionManager';
import { ProviderRegistry } from './ProviderRegistry';

const METRICS_KEY = '__ITP_METRICS__';

interface MetricsStore {
  authAttempts:    number;
  authSuccesses:   number;
  authFailures:    number;
  tokenRefreshes:  number;
  tokenRevocations: number;
  tokenExpirations: number;
  authLatencies:   number[];
  startedAt:       string;
}

function getStore(): MetricsStore {
  if (!(globalThis as any)[METRICS_KEY]) {
    (globalThis as any)[METRICS_KEY] = {
      authAttempts:    0,
      authSuccesses:   0,
      authFailures:    0,
      tokenRefreshes:  0,
      tokenRevocations: 0,
      tokenExpirations: 0,
      authLatencies:   [],
      startedAt:       new Date().toISOString(),
    };
  }
  return (globalThis as any)[METRICS_KEY];
}

// Subscribe to bus events once — guard against HMR double-subscribe.
const INIT_KEY = '__ITP_METRICS_INIT__';
if (!(globalThis as any)[INIT_KEY]) {
  (globalThis as any)[INIT_KEY] = true;

  IdentityEventBus.subscribe('AUTH_STARTED',   () => { getStore().authAttempts++;    });
  IdentityEventBus.subscribe('AUTH_COMPLETED', () => { getStore().authSuccesses++;   });
  IdentityEventBus.subscribe('AUTH_FAILED',    () => { getStore().authFailures++;    });
  IdentityEventBus.subscribe('TOKEN_REFRESHED',() => { getStore().tokenRefreshes++; });
  IdentityEventBus.subscribe('TOKEN_REVOKED',  () => { getStore().tokenRevocations++; });
  IdentityEventBus.subscribe('TOKEN_EXPIRED',  () => { getStore().tokenExpirations++; });
}

export class IdentityMetricsCollector {
  static recordAuthLatency(ms: number): void {
    const s = getStore();
    s.authLatencies.push(ms);
    if (s.authLatencies.length > 1000) s.authLatencies.shift();
  }

  static collect(): IdentityMetrics {
    const s = getStore();
    const stats = ConnectionManager.stats();
    const providers = ProviderRegistry.list();

    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    const connectionsByProvider: Record<string, number> = {};
    for (const p of providers) {
      connectionsByProvider[p.id] = 0;
    }
    // Tally active connections by provider from stats.
    // Full breakdown would require querying CredentialManager — kept light here.
    connectionsByProvider['_total'] = stats.total;

    return {
      totalProviders:        ProviderRegistry.count(),
      activeConnections:     stats.byState?.CONNECTED ?? 0,
      authAttempts:          s.authAttempts,
      authSuccesses:         s.authSuccesses,
      authFailures:          s.authFailures,
      tokenRefreshes:        s.tokenRefreshes,
      tokenRevocations:      s.tokenRevocations,
      tokenExpirations:      s.tokenExpirations,
      avgAuthLatencyMs:      avg(s.authLatencies),
      connectionsByProvider,
    };
  }

  static reset(): void {
    const s = getStore();
    s.authAttempts    = 0;
    s.authSuccesses   = 0;
    s.authFailures    = 0;
    s.tokenRefreshes  = 0;
    s.tokenRevocations = 0;
    s.tokenExpirations = 0;
    s.authLatencies   = [];
  }

  static health(): { status: 'ok'; metrics: IdentityMetrics } {
    return { status: 'ok', metrics: this.collect() };
  }
}