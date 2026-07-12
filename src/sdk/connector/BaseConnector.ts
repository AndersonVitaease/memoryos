/**
 * BaseConnector.ts
 * MemoryOS Connector SDK — Official Abstract Base Class
 * All official connectors MUST extend this class.
 *
 * Lifecycle:
 *   initialize() → connect() → authenticate() → execute() → disconnect() → shutdown()
 *
 * EF-31C · 2026-07-12 · Version: 1.0.0 · Status: FROZEN
 *
 * Constitution:
 *   - CN-01: No direct access to Runtime internals
 *   - S-01:  Credentials handled via ref only
 *   - O-01:  Every connector exposes health(), metrics(), statistics()
 */

import type { IConnector, ConnectorStatus, ConnectorValidationResult, PingResult } from '@/runtime/connectors/interfaces/IConnector';
import type { IConnectorManifest } from '@/runtime/connectors/interfaces/IConnectorManifest';
import type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
import type { IConnectorContext } from '@/runtime/connectors/interfaces/IConnectorContext';
import type { IConnectorSession } from '@/runtime/connectors/interfaces/IConnectorSession';
import type { IConnectorResult } from '@/runtime/connectors/interfaces/IConnectorResult';
import type { IConnectorHealth } from '@/runtime/connectors/interfaces/IConnectorHealth';

export interface ConnectorMetricsSnapshot {
  readonly connectorId: string;
  readonly executeCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly avgLatencyMs: number;
  readonly recordedAt: string;
}

/**
 * Abstract base for all MemoryOS connectors.
 * Provides standard lifecycle, metrics collection, and health reporting.
 * Subclasses implement only their domain-specific logic.
 */
export abstract class BaseConnector implements IConnector {
  readonly id: string;
  readonly version: string;
  readonly manifest: IConnectorManifest;
  status: ConnectorStatus = 'UNREGISTERED';

  protected executeCount = 0;
  protected successCount = 0;
  protected failureCount = 0;
  protected totalLatencyMs = 0;
  protected initializedAt?: string;
  protected connectedAt?: string;

  constructor(manifest: IConnectorManifest) {
    this.id = manifest.id;
    this.version = manifest.version;
    this.manifest = manifest;
  }

  // ── Lifecycle hooks — subclasses override ─────────────────────

  /** Called once when the Runtime loads the connector. Setup internal state here. */
  protected async onInitialize(): Promise<void> { /* no-op default */ }

  /** Called to establish connection to the external service. */
  protected async onConnect(): Promise<void> { /* no-op default */ }

  /** Called to authenticate user against the external service. */
  protected async onAuthenticate(_context: IConnectorContext): Promise<boolean> {
    return true; // Default: assume authenticated (no external call)
  }

  /** Called on each action execution. Subclasses MUST implement. */
  protected abstract onExecute(
    action: IConnectorAction,
    context: IConnectorContext,
    session: IConnectorSession,
  ): Promise<IConnectorResult>;

  /** Called on graceful disconnect. */
  protected async onDisconnect(_session: IConnectorSession): Promise<void> { /* no-op default */ }

  /** Called on full connector shutdown. */
  protected async onShutdown(): Promise<void> { /* no-op default */ }

  /** Called for the health check response. */
  protected async onHealthCheck(): Promise<IConnectorHealth> {
    return {
      connectorId: this.id,
      status: 'HEALTHY',
      details: `${this.manifest.name} v${this.version} — ready`,
      checks: { initialized: !!this.initializedAt, connected: !!this.connectedAt },
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── IConnector interface — orchestrates lifecycle with metrics ─

  async initialize(): Promise<void> {
    this.status = 'INITIALIZING';
    await this.onInitialize();
    this.initializedAt = new Date().toISOString();
  }

  async connect(): Promise<void> {
    await this.onConnect();
    this.connectedAt = new Date().toISOString();
    this.status = 'CONNECTED';
  }

  async authenticate(context: IConnectorContext): Promise<boolean> {
    return this.onAuthenticate(context);
  }

  async execute(
    action: IConnectorAction,
    context: IConnectorContext,
    session: IConnectorSession,
  ): Promise<IConnectorResult> {
    const start = Date.now();
    this.executeCount++;
    try {
      const result = await this.onExecute(action, context, session);
      const latency = Date.now() - start;
      this.totalLatencyMs += latency;
      if (result.status === 'SUCCESS') this.successCount++;
      else this.failureCount++;
      return result;
    } catch (err) {
      this.failureCount++;
      throw err;
    }
  }

  async disconnect(session: IConnectorSession): Promise<void> {
    await this.onDisconnect(session);
    this.status = 'DISCONNECTED';
  }

  async shutdown(): Promise<void> {
    await this.onShutdown();
    this.status = 'DISCONNECTED';
  }

  async health(): Promise<IConnectorHealth> {
    return this.onHealthCheck();
  }

  async validate(): Promise<ConnectorValidationResult> {
    const errors: Array<{ field: string; code: string; message: string }> = [];
    if (!this.manifest.id) errors.push({ field: 'id', code: 'MISSING_ID', message: 'Connector id required' });
    if (!this.manifest.version) errors.push({ field: 'version', code: 'MISSING_VERSION', message: 'Version required' });
    if (!this.manifest.auth?.type) errors.push({ field: 'auth.type', code: 'MISSING_AUTH', message: 'Auth type required' });
    return {
      valid: errors.length === 0,
      connectorId: this.id,
      errors,
      warnings: [],
      checkedAt: new Date().toISOString(),
    };
  }

  async ping(): Promise<PingResult> {
    const start = Date.now();
    return {
      connectorId: this.id,
      reachable: this.status === 'CONNECTED',
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  }

  metrics(): ConnectorMetricsSnapshot {
    return {
      connectorId: this.id,
      executeCount: this.executeCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      avgLatencyMs: this.executeCount > 0 ? Math.round(this.totalLatencyMs / this.executeCount) : 0,
      recordedAt: new Date().toISOString(),
    };
  }

  statistics() {
    return {
      id: this.id,
      version: this.version,
      status: this.status,
      initializedAt: this.initializedAt,
      connectedAt: this.connectedAt,
      executeCount: this.executeCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: this.executeCount > 0 ? this.successCount / this.executeCount : 1,
      avgLatencyMs: this.executeCount > 0 ? Math.round(this.totalLatencyMs / this.executeCount) : 0,
    };
  }
}