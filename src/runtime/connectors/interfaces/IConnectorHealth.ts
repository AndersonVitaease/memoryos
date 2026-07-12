/**
 * IConnectorHealth.ts
 * Connector Runtime Foundation — EF-31
 * Engineering First · Sprint EF-31
 * Date: 2026-07-12 · Version: 1.0.0 · Status: Official
 */

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';

export interface IConnectorHealth {
  readonly connectorId: string;
  readonly status: HealthStatus;
  readonly details: string;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly latencyMs: number;
  readonly checkedAt: string;
  readonly uptime?: number;   // seconds
}

export interface IConnectorTelemetry {
  readonly connectorId: string;
  readonly totalRequests: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly timeoutCount: number;
  readonly rateLimitCount: number;
  readonly totalRetries: number;
  readonly avgLatencyMs: number;
  readonly p50LatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly successRate: number;     // 0.0-1.0
  readonly circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  readonly lastSuccessAt?: string;
  readonly lastFailureAt?: string;
  readonly recordedAt: string;
}

export interface IConnectorCapability {
  readonly connectorId: string;
  readonly actionId: string;
  readonly available: boolean;
  readonly requiredScopes: ReadonlyArray<string>;
  readonly idempotent: boolean;
  readonly estimatedLatencyMs: number;
  readonly rateLimitId?: string;
}

export interface ConnectorMetrics {
  readonly connectorId: string;
  readonly createTotal: number;
  readonly executeTotal: number;
  readonly successTotal: number;
  readonly failureTotal: number;
  readonly timeoutTotal: number;
  readonly retryTotal: number;
  readonly avgLatencyMs: number;
  readonly activeSessionCount: number;
  readonly recordedAt: string;
}

export interface ConnectorDiagnostics {
  readonly connectorId: string;
  readonly manifest: {
    readonly valid: boolean;
    readonly schemaVersion: number;
    readonly authType: string;
    readonly actionCount: number;
    readonly webhookCount: number;
  };
  readonly auth: {
    readonly hasCredentials: boolean;
    readonly tokenExpired: boolean;
    readonly scopesGranted: ReadonlyArray<string>;
  };
  readonly rateLimit: {
    readonly active: boolean;
    readonly remaining?: number;
    readonly resetAt?: string;
  };
  readonly circuitBreaker: {
    readonly state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    readonly failureCount: number;
    readonly lastFailureAt?: string;
  };
  readonly recentErrors: ReadonlyArray<{
    readonly code: string;
    readonly count: number;
    readonly lastOccurredAt: string;
  }>;
  readonly diagnosticAt: string;
}