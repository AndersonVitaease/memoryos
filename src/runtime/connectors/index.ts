/**
 * index.ts — Public API of the Connector Runtime
 * EF-31 · 2026-07-12 · Version: 1.0.0
 *
 * Usage (from Capability Runtime):
 *   import { ConnectorRuntime } from '@/runtime/connectors';
 *   const runtime = new ConnectorRuntime({ enableCircuitBreaker: true });
 *   await runtime.registerConnector(manifest, connectorInstance);
 *   const result = await runtime.execute(action, context);
 */

// Main runtime facade
export { ConnectorRuntime } from './ConnectorRuntime';
export type { ConnectorRuntimeConfig, RuntimeHealthReport } from './ConnectorRuntime';

// All public interfaces
export type {
  IConnector,
  ConnectorStatus,
  ConnectorValidationResult,
  PingResult,
} from './interfaces/IConnector';

export type {
  IConnectorManifest,
  ConnectorAuthType,
  ConnectorCategory,
  ConnectorAuthConfig,
  OAuth2Config,
  ApiKeyConfig,
  ConnectorScope,
  ConnectorPermission,
  RateLimitSpec,
  ConnectorRetryPolicy,
  CircuitBreakerSpec,
  ConnectorActionSpec,
  ConnectorWebhookSpec,
  ConnectorHealthCheckSpec,
  ConnectorFailureMode,
  ConnectorTelemetrySpec,
  ConnectorRollbackPolicy,
} from './interfaces/IConnectorManifest';

export type {
  IConnectorAction,
  ActionMetadata,
  IConnectorActionResult,
  ActionResultStatus,
  ActionError,
  PaginationInfo,
} from './interfaces/IConnectorAction';

export type {
  IConnectorContext,
  ConnectorCredentials,
} from './interfaces/IConnectorContext';

export type {
  IConnectorSession,
  SessionStatus,
  SessionRenewalResult,
} from './interfaces/IConnectorSession';

export type {
  IConnectorResult,
  ConnectorResultStatus,
  IConnectorError,
  ErrorCategory,
} from './interfaces/IConnectorResult';

export type {
  IConnectorHealth,
  HealthStatus,
  IConnectorTelemetry,
  IConnectorCapability,
  ConnectorMetrics,
  ConnectorDiagnostics,
} from './interfaces/IConnectorHealth';

// Sub-managers (for advanced use / testing)
export { ConnectorRegistry } from './ConnectorRegistry';
export { ConnectorManifestLoader } from './ConnectorManifestLoader';
export { ConnectorAuthManager } from './ConnectorAuthManager';
export { ConnectorSessionManager } from './ConnectorSessionManager';
export { ConnectorRateLimiter } from './ConnectorRateLimiter';
export { ConnectorRetryManager } from './ConnectorRetryManager';
export { ConnectorPermissionManager } from './ConnectorPermissionManager';
export { ConnectorAudit } from './ConnectorAudit';
export { ConnectorTelemetry } from './ConnectorTelemetry';
export { ConnectorHealthManager } from './ConnectorHealthManager';
export { ConnectorWebhookManager } from './ConnectorWebhookManager';
export { ConnectorLifecycleManager } from './ConnectorLifecycleManager';
export { ConnectorExecutor } from './ConnectorExecutor';
export { ConnectorManager } from './ConnectorManager';

// Webhook types
export type { IncomingWebhook, WebhookHandler, WebhookValidationResult } from './ConnectorWebhookManager';

// Audit types
export type { AuditRecord, AuditQuery } from './ConnectorAudit';

// Retry types
export type { DeadLetterEntry, RetryDecision, CircuitState } from './ConnectorRetryManager';

// Registry types
export type { ConnectorRegistryEntry, RegistryStatistics } from './ConnectorRegistry';

// Manager types
export type { ConnectorCallOptions, ConnectorCallResult } from './ConnectorManager';

// Lifecycle types
export type { LifecycleStage, LifecycleEvent } from './ConnectorLifecycleManager';