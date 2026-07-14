/**
 * ConnectorHealth.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Health monitoring for all registered connectors.
 * Caches health reports and emits HEALTH_CHANGED events on status change.
 * SRP: health polling, caching, and reporting — nothing else.
 */

import type { ConnectorHealthReport } from './UCRTypes';
import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectorEventBus } from './ConnectorEventBus';

const HEALTH_KEY = '__UCR_HEALTH_STORE__';
const CACHE_TTL_MS = 30_000; // 30s cache

interface CachedHealth {
  report:    ConnectorHealthReport;
  cachedAt:  string;
  prevStatus: string;
}

function getStore(): Map<string, CachedHealth> {
  if (!(globalThis as any)[HEALTH_KEY]) (globalThis as any)[HEALTH_KEY] = new Map();
  return (globalThis as any)[HEALTH_KEY];
}

export class ConnectorHealth {
  /**
   * Checks health of a connector. Uses cache if fresh.
   */
  static async check(connectorId: string): Promise<ConnectorHealthReport> {
    const cached = getStore().get(connectorId);
    const now = Date.now();

    if (cached && (now - new Date(cached.cachedAt).getTime()) < CACHE_TTL_MS) {
      return { ...cached.report };
    }

    const connector = ConnectorRegistry.lookup(connectorId);
    const t0 = Date.now();

    let report: ConnectorHealthReport;
    try {
      report = await connector.health();
    } catch (e) {
      report = {
        connectorId, status: 'unavailable',
        latencyMs: Date.now() - t0, availability: 0,
        lastSuccess: cached?.report.lastSuccess ?? null,
        lastFailure: new Date().toISOString(),
        uptimeMs: 0, checkedAt: new Date().toISOString(),
        details: { error: String(e) },
      };
    }

    const prevStatus = cached?.prevStatus ?? null;
    getStore().set(connectorId, { report, cachedAt: new Date().toISOString(), prevStatus: report.status });

    // Emit HEALTH_CHANGED only on status change.
    if (prevStatus && prevStatus !== report.status) {
      ConnectorEventBus.emit({
        eventType:     'HEALTH_CHANGED',
        connectorId,
        connectionId:  '',
        organizationId: '',
        actor:         'system',
        payload:       { from: prevStatus, to: report.status },
        status:        report.status === 'healthy' ? 'SUCCESS' : 'FAILURE',
      });
    }

    return { ...report };
  }

  /** Checks health of all registered connectors in parallel. */
  static async checkAll(): Promise<Record<string, ConnectorHealthReport>> {
    const ids = ConnectorRegistry.list().map((m) => m.id);
    const results = await Promise.all(ids.map(async (id) => ({ id, report: await this.check(id) })));
    const out: Record<string, ConnectorHealthReport> = {};
    for (const { id, report } of results) out[id] = report;
    return out;
  }

  /** Returns the latest cached report without re-fetching. */
  static getCached(connectorId: string): ConnectorHealthReport | null {
    return getStore().get(connectorId)?.report ?? null;
  }

  static health(): { status: 'ok'; tracked: number } {
    return { status: 'ok', tracked: getStore().size };
  }
}