/**
 * ConnectorHealthManager.ts
 * Manages health checks for all registered connectors.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorHealth, HealthStatus, ConnectorDiagnostics } from './interfaces/IConnectorHealth';
import type { IConnector } from './interfaces/IConnector';
import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectorTelemetry } from './ConnectorTelemetry';
import { ConnectorRetryManager } from './ConnectorRetryManager';
import { ConnectorAuthManager } from './ConnectorAuthManager';

interface HealthRecord {
  connectorId: string;
  lastHealth: IConnectorHealth;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export class ConnectorHealthManager {
  private readonly records = new Map<string, HealthRecord>();
  private checkCount = 0;

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly telemetry: ConnectorTelemetry,
    private readonly retryManager: ConnectorRetryManager,
    private readonly authManager: ConnectorAuthManager,
  ) {}

  async check(connectorId: string): Promise<IConnectorHealth> {
    this.checkCount++;
    const instance = this.registry.getInstance(connectorId);

    if (!instance) {
      const result: IConnectorHealth = {
        connectorId,
        status: 'UNKNOWN',
        details: 'Connector instance not found in registry',
        checks: { registered: false },
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
      };
      return result;
    }

    const start = Date.now();
    try {
      const health = await instance.health();
      const latencyMs = Date.now() - start;

      const record = this.getOrCreateRecord(connectorId);
      if (health.status === 'HEALTHY') {
        record.consecutiveSuccesses++;
        record.consecutiveFailures = 0;
      } else {
        record.consecutiveFailures++;
        record.consecutiveSuccesses = 0;
      }
      record.lastHealth = { ...health, latencyMs };

      return record.lastHealth;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const result: IConnectorHealth = {
        connectorId,
        status: 'UNHEALTHY',
        details: `Health check threw: ${errorMessage}`,
        checks: { exception: false },
        latencyMs,
        checkedAt: new Date().toISOString(),
      };

      const record = this.getOrCreateRecord(connectorId);
      record.consecutiveFailures++;
      record.consecutiveSuccesses = 0;
      record.lastHealth = result;

      return result;
    }
  }

  async checkAll(): Promise<Record<string, IConnectorHealth>> {
    const entries = this.registry.listAll();
    const results: Record<string, IConnectorHealth> = {};
    await Promise.all(
      entries.map(async entry => {
        results[entry.connectorId] = await this.check(entry.connectorId);
      }),
    );
    return results;
  }

  getLastHealth(connectorId: string): IConnectorHealth | null {
    return this.records.get(connectorId)?.lastHealth ?? null;
  }

  async diagnostics(connectorId: string, userId?: string): Promise<ConnectorDiagnostics> {
    const manifest = this.registry.getManifest(connectorId);
    const telem = this.telemetry.get(connectorId);
    const circuitState = this.retryManager.getCircuitState(connectorId);

    const hasCredentials = userId ? this.authManager.hasCredentials(connectorId, userId) : false;

    return {
      connectorId,
      manifest: manifest
        ? {
            valid: true,
            schemaVersion: manifest.schemaVersion,
            authType: manifest.auth.type,
            actionCount: manifest.supportedActions.length,
            webhookCount: manifest.webhooks.length,
          }
        : { valid: false, schemaVersion: 0, authType: 'none', actionCount: 0, webhookCount: 0 },
      auth: {
        hasCredentials,
        tokenExpired: false,  // Would check auth manager in production
        scopesGranted: [],
      },
      rateLimit: {
        active: false,
        remaining: undefined,
        resetAt: undefined,
      },
      circuitBreaker: {
        state: circuitState,
        failureCount: 0,
        lastFailureAt: undefined,
      },
      recentErrors: telem.failureCount > 0
        ? [{ code: 'RECENT_FAILURES', count: telem.failureCount, lastOccurredAt: telem.recordedAt }]
        : [],
      diagnosticAt: new Date().toISOString(),
    };
  }

  overallStatus(): HealthStatus {
    const all = [...this.records.values()];
    if (all.every(r => r.lastHealth.status === 'HEALTHY')) return 'HEALTHY';
    if (all.some(r => r.lastHealth.status === 'UNHEALTHY')) return 'UNHEALTHY';
    return 'DEGRADED';
  }

  private getOrCreateRecord(connectorId: string): HealthRecord {
    if (!this.records.has(connectorId)) {
      this.records.set(connectorId, {
        connectorId,
        lastHealth: {
          connectorId,
          status: 'UNKNOWN',
          details: 'Not yet checked',
          checks: {},
          latencyMs: 0,
          checkedAt: new Date().toISOString(),
        },
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      });
    }
    return this.records.get(connectorId)!;
  }

  statistics() {
    const healthy = [...this.records.values()].filter(r => r.lastHealth.status === 'HEALTHY').length;
    return {
      checkCount: this.checkCount,
      trackedConnectors: this.records.size,
      healthyCount: healthy,
      unhealthyCount: this.records.size - healthy,
    };
  }

  health() {
    return {
      status: this.overallStatus(),
      details: `${this.records.size} connectors monitored`,
      checks: { monitoringActive: true },
      checkedAt: new Date().toISOString(),
    };
  }
}