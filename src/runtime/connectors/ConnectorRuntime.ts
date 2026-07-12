/**
 * ConnectorRuntime.ts
 * The top-level runtime facade. Single entry point for all connector operations.
 * Capability Runtime → ConnectorRuntime → ConnectorManager → ConnectorExecutor → External API
 *
 * Constitution CN-01: "The Connector Runtime is the only module authorized
 *   to establish connections with external systems."
 *
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorManifest } from './interfaces/IConnectorManifest';
import type { IConnector } from './interfaces/IConnector';
import type { IConnectorAction } from './interfaces/IConnectorAction';
import type { IConnectorContext } from './interfaces/IConnectorContext';
import type { IConnectorResult } from './interfaces/IConnectorResult';
import type { IConnectorHealth, ConnectorDiagnostics, IConnectorTelemetry, ConnectorMetrics } from './interfaces/IConnectorHealth';
import type { ConnectorRegistryEntry } from './ConnectorRegistry';
import type { DeadLetterEntry } from './ConnectorRetryManager';
import type { AuditRecord } from './ConnectorAudit';
import type { IncomingWebhook } from './ConnectorWebhookManager';
import type { WebhookHandler } from './ConnectorWebhookManager';
import type { ConnectorCallOptions } from './ConnectorManager';

import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectorManifestLoader } from './ConnectorManifestLoader';
import { ConnectorAuthManager } from './ConnectorAuthManager';
import { ConnectorSessionManager } from './ConnectorSessionManager';
import { ConnectorRateLimiter } from './ConnectorRateLimiter';
import { ConnectorRetryManager } from './ConnectorRetryManager';
import { ConnectorPermissionManager } from './ConnectorPermissionManager';
import { ConnectorAudit } from './ConnectorAudit';
import { ConnectorTelemetry } from './ConnectorTelemetry';
import { ConnectorHealthManager } from './ConnectorHealthManager';
import { ConnectorWebhookManager } from './ConnectorWebhookManager';
import { ConnectorLifecycleManager } from './ConnectorLifecycleManager';
import { ConnectorExecutor } from './ConnectorExecutor';
import { ConnectorManager } from './ConnectorManager';

export interface ConnectorRuntimeConfig {
  readonly maxConcurrentConnectors?: number;
  readonly defaultSessionTtlSeconds?: number;
  readonly enableCircuitBreaker?: boolean;
}

export interface RuntimeHealthReport {
  readonly status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  readonly details: string;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly subsystems: {
    readonly registry: ReturnType<ConnectorRegistry['health']>;
    readonly sessions: ReturnType<ConnectorSessionManager['health']>;
    readonly auth: ReturnType<ConnectorAuthManager['health']>;
    readonly executor: ReturnType<ConnectorExecutor['health']>;
    readonly retryManager: ReturnType<ConnectorRetryManager['health']>;
    readonly telemetry: ReturnType<ConnectorTelemetry['health']>;
    readonly audit: ReturnType<ConnectorAudit['health']>;
    readonly webhooks: ReturnType<ConnectorWebhookManager['health']>;
    readonly lifecycle: ReturnType<ConnectorLifecycleManager['health']>;
  };
  readonly checkedAt: string;
}

export class ConnectorRuntime {
  readonly version = '1.0.0';

  // Internal subsystems — all private, accessed only through this facade
  private readonly registry: ConnectorRegistry;
  private readonly manifestLoader: ConnectorManifestLoader;
  private readonly auth: ConnectorAuthManager;
  private readonly sessions: ConnectorSessionManager;
  private readonly rateLimiter: ConnectorRateLimiter;
  private readonly retryManager: ConnectorRetryManager;
  private readonly permissions: ConnectorPermissionManager;
  private readonly audit: ConnectorAudit;
  private readonly telemetry: ConnectorTelemetry;
  private readonly healthManager: ConnectorHealthManager;
  private readonly webhooks: ConnectorWebhookManager;
  private readonly lifecycle: ConnectorLifecycleManager;
  private readonly executor: ConnectorExecutor;
  private readonly manager: ConnectorManager;

  private readonly config: Required<ConnectorRuntimeConfig>;
  private startedAt: string;
  private callCount = 0;

  constructor(config: ConnectorRuntimeConfig = {}) {
    this.config = {
      maxConcurrentConnectors: config.maxConcurrentConnectors ?? 50,
      defaultSessionTtlSeconds: config.defaultSessionTtlSeconds ?? 3600,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
    };

    // Wire up all subsystems
    this.registry = new ConnectorRegistry();
    this.manifestLoader = new ConnectorManifestLoader();
    this.auth = new ConnectorAuthManager();
    this.sessions = new ConnectorSessionManager();
    this.rateLimiter = new ConnectorRateLimiter();
    this.retryManager = new ConnectorRetryManager();
    this.permissions = new ConnectorPermissionManager();
    this.audit = new ConnectorAudit();
    this.telemetry = new ConnectorTelemetry();

    this.healthManager = new ConnectorHealthManager(
      this.registry,
      this.telemetry,
      this.retryManager,
      this.auth,
    );

    this.webhooks = new ConnectorWebhookManager();

    this.lifecycle = new ConnectorLifecycleManager(
      this.registry,
      this.auth,
      this.sessions,
    );

    this.executor = new ConnectorExecutor(
      this.registry,
      this.permissions,
      this.rateLimiter,
      this.retryManager,
      this.audit,
      this.telemetry,
      this.sessions,
    );

    this.manager = new ConnectorManager(
      this.lifecycle,
      this.auth,
      this.sessions,
      this.executor,
      this.registry,
    );

    this.startedAt = new Date().toISOString();
  }

  // ─────────────────────────────────────────────────────────────
  // Connector Registration
  // ─────────────────────────────────────────────────────────────

  async registerConnector(manifest: IConnectorManifest, instance: IConnector): Promise<void> {
    await this.manager.register(manifest, instance);
  }

  unregisterConnector(connectorId: string): boolean {
    return this.registry.unregister(connectorId);
  }

  listConnectors(): ConnectorRegistryEntry[] {
    return this.registry.listAll();
  }

  // ─────────────────────────────────────────────────────────────
  // Credential Management (Least Privilege — Constitution S-01)
  // ─────────────────────────────────────────────────────────────

  registerCredentials(
    connectorId: string,
    userId: string,
    type: 'access' | 'refresh' | 'apikey' | 'bearer',
    rawValue: string,
    expiresAt?: string,
  ): string {
    return this.auth.registerCredentials(connectorId, userId, type, rawValue, expiresAt);
  }

  revokeCredentials(connectorId: string, userId: string): number {
    return this.auth.revokeCredentials(connectorId, userId);
  }

  // ─────────────────────────────────────────────────────────────
  // Action Execution — Primary Interface for Capability Runtime
  // ─────────────────────────────────────────────────────────────

  async execute(
    action: IConnectorAction,
    context: IConnectorContext,
    options: ConnectorCallOptions = {},
  ): Promise<IConnectorResult> {
    this.callCount++;
    const { result } = await this.manager.call(action, context, {
      sessionTtlSeconds: this.config.defaultSessionTtlSeconds,
      ...options,
    });
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Webhook Management
  // ─────────────────────────────────────────────────────────────

  registerWebhookHandler(connectorId: string, eventType: string, handler: WebhookHandler): void {
    this.webhooks.register(connectorId, eventType, handler);
  }

  async handleIncomingWebhook(webhook: IncomingWebhook): Promise<void> {
    const manifest = this.registry.getManifest(webhook.connectorId);
    if (!manifest) throw new Error(`ConnectorRuntime: No manifest for connector '${webhook.connectorId}'`);

    const whSpec = manifest.webhooks.find(w => w.id === webhook.webhookId);
    if (!whSpec) throw new Error(`ConnectorRuntime: Webhook '${webhook.webhookId}' not declared in manifest`);

    const validation = this.webhooks.validateSignature(webhook, whSpec, '');  // secret resolved by WebhookManager in production
    if (!validation.valid) {
      throw new Error(`ConnectorRuntime: Invalid webhook signature: ${validation.reason}`);
    }

    if (validation.idempotencyKey && this.webhooks.checkDuplicate(validation.idempotencyKey)) {
      return;  // Duplicate — silently ignore
    }

    await this.webhooks.dispatch(webhook);
  }

  // ─────────────────────────────────────────────────────────────
  // Observability — Constitution O-01
  // ─────────────────────────────────────────────────────────────

  async health(): Promise<RuntimeHealthReport> {
    const subsystems = {
      registry: this.registry.health(),
      sessions: this.sessions.health(),
      auth: this.auth.health(),
      executor: this.executor.health(),
      retryManager: this.retryManager.health(),
      telemetry: this.telemetry.health(),
      audit: this.audit.health(),
      webhooks: this.webhooks.health(),
      lifecycle: this.lifecycle.health(),
    };

    const degraded = Object.values(subsystems).filter(h => h.status !== 'HEALTHY').length;
    const status = degraded === 0 ? 'HEALTHY' : degraded > 3 ? 'UNHEALTHY' : 'DEGRADED';

    return {
      status,
      details: `ConnectorRuntime v${this.version} — ${degraded} subsystems degraded`,
      checks: {
        allSubsystemsHealthy: degraded === 0,
        registryOperational: subsystems.registry.status === 'HEALTHY',
        executorOperational: subsystems.executor.status !== 'UNHEALTHY',
        auditIntact: subsystems.audit.status === 'HEALTHY',
      },
      subsystems,
      checkedAt: new Date().toISOString(),
    };
  }

  async checkConnectorHealth(connectorId: string): Promise<IConnectorHealth> {
    return this.healthManager.check(connectorId);
  }

  async diagnostics(connectorId: string, userId?: string): Promise<ConnectorDiagnostics> {
    return this.healthManager.diagnostics(connectorId, userId);
  }

  getTelemetry(connectorId: string): IConnectorTelemetry {
    return this.telemetry.get(connectorId);
  }

  getAllTelemetry(): IConnectorTelemetry[] {
    return this.telemetry.getAll();
  }

  metrics(): ConnectorMetrics & { runtimeCallCount: number; uptime: string } {
    const stats = this.manager.statistics();
    return {
      connectorId: 'runtime',
      createTotal: stats.registryStats.totalRegistered,
      executeTotal: stats.executorStats.executeTotal,
      successTotal: stats.executorStats.successTotal,
      failureTotal: stats.executorStats.failureTotal,
      timeoutTotal: 0,
      retryTotal: this.retryManager.statistics().retryTotal,
      avgLatencyMs: 0,
      activeSessionCount: stats.sessionStats.byStatus.ACTIVE,
      recordedAt: new Date().toISOString(),
      runtimeCallCount: this.callCount,
      uptime: `${Math.round((Date.now() - new Date(this.startedAt).getTime()) / 1000)}s`,
    };
  }

  statistics() {
    return {
      runtimeVersion: this.version,
      startedAt: this.startedAt,
      callCount: this.callCount,
      registry: this.registry.statistics(),
      sessions: this.sessions.statistics(),
      auth: this.auth.statistics(),
      permissions: this.permissions.statistics(),
      rateLimiter: this.rateLimiter.statistics(),
      retryManager: this.retryManager.statistics(),
      audit: this.audit.statistics(),
      telemetry: this.telemetry.statistics(),
      webhooks: this.webhooks.statistics(),
      lifecycle: this.lifecycle.statistics(),
    };
  }

  getAuditLog(limit = 50): AuditRecord[] {
    return this.audit.recent(limit);
  }

  getDeadLetterQueue(): ReadonlyArray<DeadLetterEntry> {
    return this.retryManager.getDeadLetterQueue();
  }

  // ─────────────────────────────────────────────────────────────
  // Validation & Manifest
  // ─────────────────────────────────────────────────────────────

  validateManifest(manifest: IConnectorManifest) {
    return this.manifestLoader.validate(manifest);
  }

  async ping(connectorId: string) {
    const instance = this.registry.getInstance(connectorId);
    if (!instance) return { connectorId, reachable: false, latencyMs: 0, checkedAt: new Date().toISOString() };
    return instance.ping();
  }

  // ─────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────

  closeSession(sessionId: string): void {
    this.sessions.close(sessionId);
  }

  purgeExpiredSessions(): number {
    return this.sessions.purgeExpired();
  }

  // ─────────────────────────────────────────────────────────────
  // Shutdown
  // ─────────────────────────────────────────────────────────────

  async shutdown(connectorId: string): Promise<void> {
    await this.manager.shutdown(connectorId);
  }

  async shutdownAll(): Promise<void> {
    const connectors = this.registry.listAll();
    await Promise.all(connectors.map(c => this.manager.shutdown(c.connectorId).catch(() => undefined)));
  }
}