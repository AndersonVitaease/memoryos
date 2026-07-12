/**
 * interfaces/index.ts — Public contracts for Connector Runtime
 * EF-31 · 2026-07-12
 */
export type { IConnector, ConnectorStatus, ConnectorValidationResult, ValidationError, ValidationWarning, PingResult } from './IConnector';
export type { IConnectorManifest, ConnectorAuthType, ConnectorCategory, ConnectorAuthConfig, OAuth2Config, ApiKeyConfig, BasicAuthConfig, BearerConfig, ConnectorScope, ConnectorPermission, RateLimitSpec, ConnectorRetryPolicy, CircuitBreakerSpec, ConnectorActionSpec, ConnectorWebhookSpec, ConnectorHealthCheckSpec, ConnectorFailureMode, ConnectorTelemetrySpec, ConnectorRollbackPolicy } from './IConnectorManifest';
export type { IConnectorAction, ActionMetadata, IConnectorActionResult, ActionResultStatus, ActionError, PaginationInfo } from './IConnectorAction';
export type { IConnectorContext, ConnectorCredentials } from './IConnectorContext';
export type { IConnectorSession, SessionStatus, SessionRenewalResult } from './IConnectorSession';
export type { IConnectorResult, ConnectorResultStatus, ResultTelemetry, IConnectorError, ErrorCategory } from './IConnectorResult';
export type { IConnectorHealth, HealthStatus, IConnectorTelemetry, IConnectorCapability, ConnectorMetrics, ConnectorDiagnostics } from './IConnectorHealth';