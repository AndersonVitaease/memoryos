/**
 * ConnectorManager.ts
 * Orchestrates the full connector flow: lifecycle → auth → session → execution.
 * Primary interface for Capability Runtime to use connectors.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorManifest } from './interfaces/IConnectorManifest';
import type { IConnector } from './interfaces/IConnector';
import type { IConnectorAction } from './interfaces/IConnectorAction';
import type { IConnectorContext } from './interfaces/IConnectorContext';
import type { IConnectorResult } from './interfaces/IConnectorResult';
import { ConnectorLifecycleManager } from './ConnectorLifecycleManager';
import { ConnectorAuthManager } from './ConnectorAuthManager';
import { ConnectorSessionManager } from './ConnectorSessionManager';
import { ConnectorExecutor } from './ConnectorExecutor';
import { ConnectorRegistry } from './ConnectorRegistry';

export interface ConnectorCallOptions {
  readonly sessionTtlSeconds?: number;
  readonly reuseSession?: string;   // pass existing sessionId to reuse
}

export interface ConnectorCallResult {
  readonly result: IConnectorResult;
  readonly sessionId: string;
}

export class ConnectorManager {
  private callCount = 0;

  constructor(
    private readonly lifecycle: ConnectorLifecycleManager,
    private readonly auth: ConnectorAuthManager,
    private readonly sessions: ConnectorSessionManager,
    private readonly executor: ConnectorExecutor,
    private readonly registry: ConnectorRegistry,
  ) {}

  /** Register and fully initialize a connector */
  async register(manifest: IConnectorManifest, instance: IConnector): Promise<void> {
    await this.lifecycle.register(manifest, instance);
    await this.lifecycle.initialize(manifest.id);
    await this.lifecycle.connect(manifest.id);
  }

  /** Execute a connector action. Creates/reuses session automatically. */
  async call(
    action: IConnectorAction,
    context: IConnectorContext,
    options: ConnectorCallOptions = {},
  ): Promise<ConnectorCallResult> {
    this.callCount++;

    const manifest = this.registry.getManifest(action.connectorId);
    if (!manifest) throw new Error(`ConnectorManager: Connector '${action.connectorId}' not found`);

    // Authenticate
    const authResult = this.auth.authenticate(context, manifest);
    if (!authResult.success) {
      // Attempt token refresh if expired
      if (authResult.reason === 'TOKEN_EXPIRED_NO_REFRESH' || authResult.reason === 'NO_CREDENTIALS_FOUND') {
        throw new Error(`ConnectorManager: Authentication failed for '${action.connectorId}': ${authResult.reason}`);
      }
      const refreshed = this.auth.refreshToken(action.connectorId, context.userId);
      if (!refreshed.success) {
        throw new Error(`ConnectorManager: Auth and refresh both failed for '${action.connectorId}'`);
      }
    }

    // Get or create session
    let session = options.reuseSession
      ? this.sessions.get(options.reuseSession)
      : null;

    if (!session || !this.sessions.isActive(session.id)) {
      session = this.sessions.create(action.connectorId, context, options.sessionTtlSeconds);
    }

    // Execute
    const result = await this.executor.execute(action, context, session);

    return { result, sessionId: session.id };
  }

  /** Close a specific session */
  closeSession(sessionId: string): void {
    this.sessions.close(sessionId);
  }

  /** Gracefully shutdown a connector */
  async shutdown(connectorId: string): Promise<void> {
    await this.lifecycle.shutdown(connectorId);
  }

  statistics() {
    return {
      callCount: this.callCount,
      registryStats: this.registry.statistics(),
      sessionStats: this.sessions.statistics(),
      authStats: this.auth.statistics(),
      executorStats: this.executor.statistics(),
    };
  }

  health() {
    const subHealth = [
      this.registry.health(),
      this.sessions.health(),
      this.auth.health(),
      this.executor.health(),
    ];

    const degraded = subHealth.filter(h => h.status !== 'HEALTHY').length;
    return {
      status: (degraded > 0 ? 'DEGRADED' : 'HEALTHY') as 'HEALTHY' | 'DEGRADED',
      details: `${degraded} subsystems degraded`,
      checks: {
        registryHealthy: this.registry.health().status === 'HEALTHY',
        sessionsHealthy: this.sessions.health().status === 'HEALTHY',
        authHealthy: this.auth.health().status === 'HEALTHY',
      },
      checkedAt: new Date().toISOString(),
    };
  }
}