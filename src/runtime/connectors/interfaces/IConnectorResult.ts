/**
 * IConnectorResult.ts
 * Connector Runtime Foundation — EF-31
 * Engineering First · Sprint EF-31
 * Date: 2026-07-12 · Version: 1.0.0 · Status: Official
 */

export type ConnectorResultStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'DENIED' | 'CANCELLED' | 'RATE_LIMITED';

export interface IConnectorResult {
  readonly id: string;
  readonly connectorId: string;
  readonly actionId: string;
  readonly executionId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly status: ConnectorResultStatus;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: IConnectorError;
  readonly latencyMs: number;
  readonly attemptNumber: number;
  readonly completedAt: string;
  readonly retryable: boolean;
  readonly telemetry: ResultTelemetry;
}

export interface ResultTelemetry {
  readonly requestSentAt: string;
  readonly responseReceivedAt: string;
  readonly latencyMs: number;
  readonly retryCount: number;
  readonly rateLimitRemaining?: number;
  readonly rateLimitResetAt?: string;
}

export interface IConnectorError {
  readonly code: string;
  readonly message: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly category: ErrorCategory;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export type ErrorCategory =
  | 'AUTH'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'CLIENT_ERROR'
  | 'UNKNOWN';