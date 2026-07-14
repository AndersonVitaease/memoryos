/**
 * ConnectorMetrics.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Collects and aggregates metrics per connector.
 * Subscribes to ConnectorEventBus — no direct coupling to runtime.
 * SRP: metrics collection and aggregation — nothing else.
 */

import type { ConnectorMetrics as IConnectorMetrics } from './UCRTypes';
import { ConnectorEventBus } from './ConnectorEventBus';
import { ConnectionRegistry } from './ConnectionRegistry';
import { ConnectorSessionManager } from './ConnectorSessionManager';

const METRICS_KEY = '__UCR_METRICS_STORE__';

interface PerConnectorMetrics {
  totalRequests:   number;
  successRequests: number;
  failedRequests:  number;
  latencies:       number[];
  cacheHits:       number;
  cacheMisses:     number;
  startedAt:       string;
}

function getStore(): Map<string, PerConnectorMetrics> {
  if (!(globalThis as any)[METRICS_KEY]) (globalThis as any)[METRICS_KEY] = new Map();
  return (globalThis as any)[METRICS_KEY];
}

function getOrCreate(connectorId: string): PerConnectorMetrics {
  const store = getStore();
  if (!store.has(connectorId)) {
    store.set(connectorId, {
      totalRequests: 0, successRequests: 0, failedRequests: 0,
      latencies: [], cacheHits: 0, cacheMisses: 0, startedAt: new Date().toISOString(),
    });
  }
  return store.get(connectorId)!;
}

// Subscribe once — guard against HMR.
const INIT_KEY = '__UCR_METRICS_INIT__';
if (!(globalThis as any)[INIT_KEY]) {
  (globalThis as any)[INIT_KEY] = true;
  ConnectorEventBus.subscribe('REQUEST_STARTED',   (e) => { getOrCreate(e.connectorId).totalRequests++; });
  ConnectorEventBus.subscribe('REQUEST_COMPLETED', (e) => {
    const m = getOrCreate(e.connectorId);
    m.successRequests++;
    if (typeof e.payload.durationMs === 'number') {
      m.latencies.push(e.payload.durationMs as number);
      if (m.latencies.length > 1000) m.latencies.shift();
    }
  });
  ConnectorEventBus.subscribe('REQUEST_FAILED', (e) => { getOrCreate(e.connectorId).failedRequests++; });
}

export class ConnectorMetrics {
  static recordCacheHit(connectorId: string): void  { getOrCreate(connectorId).cacheHits++; }
  static recordCacheMiss(connectorId: string): void { getOrCreate(connectorId).cacheMisses++; }

  static collect(connectorId: string): IConnectorMetrics {
    const m    = getOrCreate(connectorId);
    const now  = Date.now();
    const from = new Date(m.startedAt).getTime();
    const mins = Math.max(1, (now - from) / 60_000);
    const avg  = m.latencies.length ? Math.round(m.latencies.reduce((a, b) => a + b, 0) / m.latencies.length) : 0;

    return {
      connectorId,
      totalRequests:     m.totalRequests,
      successRequests:   m.successRequests,
      failedRequests:    m.failedRequests,
      avgLatencyMs:      avg,
      throughput:        Math.round(m.successRequests / mins * 10) / 10,
      activeConnections: ConnectionRegistry.listByConnector(connectorId).filter((c) => c.state === 'ACTIVE').length,
      activeSessions:    ConnectorSessionManager.stats().active,
      cacheHits:         m.cacheHits,
      cacheMisses:       m.cacheMisses,
    };
  }

  static collectAll(): IConnectorMetrics[] {
    return Array.from(getStore().keys()).map((id) => this.collect(id));
  }

  static reset(connectorId: string): void {
    const m = getOrCreate(connectorId);
    m.totalRequests = m.successRequests = m.failedRequests = m.cacheHits = m.cacheMisses = 0;
    m.latencies = [];
    m.startedAt = new Date().toISOString();
  }

  static health(): { status: 'ok'; trackedConnectors: number } {
    return { status: 'ok', trackedConnectors: getStore().size };
  }
}