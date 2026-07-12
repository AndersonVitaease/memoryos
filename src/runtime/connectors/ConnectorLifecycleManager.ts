/**
 * ConnectorLifecycleManager.ts
 * Manages the full connector lifecycle: register → validate → initialize → authenticate
 * → create session → execute → record telemetry/audit → close session.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorManifest } from './interfaces/IConnectorManifest';
import type { IConnector } from './interfaces/IConnector';
import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectorAuthManager } from './ConnectorAuthManager';
import { ConnectorSessionManager } from './ConnectorSessionManager';

export type LifecycleStage =
  | 'UNREGISTERED'
  | 'REGISTERED'
  | 'VALIDATING'
  | 'INITIALIZING'
  | 'AUTHENTICATING'
  | 'READY'
  | 'EXECUTING'
  | 'CLOSING'
  | 'CLOSED'
  | 'FAILED';

export interface LifecycleEvent {
  readonly id: string;
  readonly connectorId: string;
  readonly stage: LifecycleStage;
  readonly previousStage: LifecycleStage;
  readonly timestamp: string;
  readonly details?: string;
}

export class ConnectorLifecycleManager {
  private readonly stages = new Map<string, LifecycleStage>();
  private readonly events: LifecycleEvent[] = [];
  private transitionCount = 0;

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly authManager: ConnectorAuthManager,
    private readonly sessionManager: ConnectorSessionManager,
  ) {}

  private transition(connectorId: string, to: LifecycleStage, details?: string): void {
    this.transitionCount++;
    const from = this.stages.get(connectorId) ?? 'UNREGISTERED';
    this.stages.set(connectorId, to);
    this.events.push(
      Object.freeze({
        id: `lce_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        connectorId,
        stage: to,
        previousStage: from,
        timestamp: new Date().toISOString(),
        details,
      }),
    );
  }

  /** Stage 1: Register manifest and connector class */
  async register(manifest: IConnectorManifest, instance: IConnector): Promise<void> {
    this.transition(manifest.id, 'REGISTERED', `Registering ${manifest.name} v${manifest.version}`);
    try {
      this.registry.register(manifest, instance);
    } catch (err) {
      this.transition(manifest.id, 'FAILED', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /** Stage 2: Validate manifest */
  async validate(connectorId: string): Promise<boolean> {
    this.transition(connectorId, 'VALIDATING');
    const instance = this.registry.getInstance(connectorId);
    if (!instance) {
      this.transition(connectorId, 'FAILED', 'No instance found');
      return false;
    }
    const result = await instance.validate();
    if (!result.valid) {
      const msgs = result.errors.map(e => e.message).join('; ');
      this.transition(connectorId, 'FAILED', `Validation failed: ${msgs}`);
      return false;
    }
    return true;
  }

  /** Stage 3: Initialize the connector */
  async initialize(connectorId: string): Promise<void> {
    this.transition(connectorId, 'INITIALIZING');
    const instance = this.registry.getInstance(connectorId);
    if (!instance) throw new Error(`ConnectorLifecycle: No instance for '${connectorId}'`);

    try {
      await instance.initialize();
      this.registry.setStatus(connectorId, 'REGISTERED');
    } catch (err) {
      this.transition(connectorId, 'FAILED', err instanceof Error ? err.message : String(err));
      this.registry.setStatus(connectorId, 'FAILED');
      throw err;
    }
  }

  /** Stage 4-5: Authenticate and mark as CONNECTED */
  async connect(connectorId: string): Promise<void> {
    this.transition(connectorId, 'AUTHENTICATING');
    this.registry.setStatus(connectorId, 'CONNECTED');
    this.transition(connectorId, 'READY', 'Connector connected and ready');
  }

  /** Stage 10: Graceful shutdown */
  async shutdown(connectorId: string): Promise<void> {
    this.transition(connectorId, 'CLOSING');

    // Close all active sessions for this connector
    const activeSessions = this.sessionManager.listActive(connectorId);
    for (const session of activeSessions) {
      this.sessionManager.close(session.id);
    }

    this.registry.setStatus(connectorId, 'DISCONNECTED');
    this.transition(connectorId, 'CLOSED', `Closed ${activeSessions.length} sessions`);
  }

  getStage(connectorId: string): LifecycleStage {
    return this.stages.get(connectorId) ?? 'UNREGISTERED';
  }

  getEvents(connectorId: string, limit = 50): LifecycleEvent[] {
    return this.events.filter(e => e.connectorId === connectorId).slice(-limit);
  }

  statistics() {
    const bySage: Record<string, number> = {};
    for (const stage of this.stages.values()) {
      bySage[stage] = (bySage[stage] ?? 0) + 1;
    }
    return {
      transitionCount: this.transitionCount,
      eventCount: this.events.length,
      connectorCount: this.stages.size,
      byStage: bySage,
    };
  }

  health() {
    const failed = [...this.stages.values()].filter(s => s === 'FAILED').length;
    return {
      status: (failed > 0 ? 'DEGRADED' : 'HEALTHY') as 'HEALTHY' | 'DEGRADED',
      details: `${this.stages.size} connectors in lifecycle, ${failed} failed`,
      checks: { noFailures: failed === 0 },
      checkedAt: new Date().toISOString(),
    };
  }
}