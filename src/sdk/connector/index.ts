/**
 * MemoryOS Connector SDK — Public API
 * EF-31C · 2026-07-12 · Version: 1.0.0 · Status: FROZEN
 *
 * This is the ONLY surface connectors should import from.
 * No connector should import directly from src/runtime/connectors/*.
 */

// Base abstractions
export { BaseConnector } from './BaseConnector';
export type { ConnectorMetricsSnapshot } from './BaseConnector';

// Builder
export { ConnectorBuilder } from './ConnectorBuilder';

// Reference connector
export { HelloConnector, HELLO_MANIFEST } from './HelloConnector';

// Re-export all public interfaces from the Runtime (read-only)
export type { IConnector, ConnectorStatus, ConnectorValidationResult, PingResult } from '@/runtime/connectors/interfaces/IConnector';
export type { IConnectorManifest, ConnectorCategory, ConnectorAuthConfig, ConnectorScope, ConnectorPermission, RateLimitSpec, ConnectorRetryPolicy, CircuitBreakerSpec, ConnectorActionSpec, ConnectorWebhookSpec } from '@/runtime/connectors/interfaces/IConnectorManifest';
export type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
export type { IConnectorContext, ConnectorCredentials } from '@/runtime/connectors/interfaces/IConnectorContext';
export type { IConnectorSession, SessionStatus } from '@/runtime/connectors/interfaces/IConnectorSession';
export type { IConnectorResult, IConnectorError, ConnectorResultStatus, ErrorCategory } from '@/runtime/connectors/interfaces/IConnectorResult';
export type { IConnectorHealth, ConnectorDiagnostics } from '@/runtime/connectors/interfaces/IConnectorHealth';

// Runtime facade (the ONLY Runtime class connectors may reference)
export { ConnectorRuntime } from '@/runtime/connectors/ConnectorRuntime';
export type { ConnectorRuntimeConfig, RuntimeHealthReport } from '@/runtime/connectors/ConnectorRuntime';