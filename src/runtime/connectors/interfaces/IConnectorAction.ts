/**
 * IConnectorAction.ts
 * Connector Runtime Foundation — EF-31
 * Engineering First · Sprint EF-31
 * Date: 2026-07-12 · Version: 1.0.0 · Status: Official
 */

export interface IConnectorAction {
  readonly id: string;
  readonly connectorId: string;
  readonly actionId: string;
  readonly correlationId: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<ActionMetadata>;
}

export interface ActionMetadata {
  readonly userId?: string;
  readonly projectId?: string;
  readonly sessionId?: string;
  readonly goalId?: string;
  readonly planId?: string;
  readonly stepId?: string;
  readonly capabilityId?: string;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly createdAt: string;
}

export interface IConnectorActionResult {
  readonly actionId: string;
  readonly connectorId: string;
  readonly executionId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly status: ActionResultStatus;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: ActionError;
  readonly latencyMs: number;
  readonly attemptNumber: number;
  readonly completedAt: string;
  readonly retryable: boolean;
  readonly pagination?: PaginationInfo;
}

export type ActionResultStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'DENIED' | 'CANCELLED' | 'RATE_LIMITED';

export interface ActionError {
  readonly code: string;
  readonly message: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface PaginationInfo {
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly nextOffset?: number;
  readonly pageToken?: string;
  readonly totalCount?: number;
}