/**
 * ConnectorRetryManager.ts
 * Exponential backoff, circuit breaker, failure classification, DLQ structure.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { ConnectorRetryPolicy, CircuitBreakerSpec } from './interfaces/IConnectorManifest';
import type { IConnectorError, ErrorCategory } from './interfaces/IConnectorResult';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly delayMs: number;
  readonly attemptNumber: number;
  readonly reason: string;
  readonly circuitState: CircuitState;
}

export interface DeadLetterEntry {
  readonly id: string;
  readonly connectorId: string;
  readonly actionId: string;
  readonly correlationId: string;
  readonly error: IConnectorError;
  readonly attemptCount: number;
  readonly enqueuedAt: string;
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt?: string;
  lastStateChangeAt: string;
}

export class ConnectorRetryManager {
  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();
  private readonly deadLetterQueue: DeadLetterEntry[] = [];
  private retryTotal = 0;
  private dlqTotal = 0;
  private circuitOpenTotal = 0;

  private getCircuitBreaker(connectorId: string, spec: CircuitBreakerSpec): CircuitBreakerState {
    if (!this.circuitBreakers.has(connectorId)) {
      this.circuitBreakers.set(connectorId, {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastStateChangeAt: new Date().toISOString(),
      });
    }
    const cb = this.circuitBreakers.get(connectorId)!;

    // Check if OPEN circuit should transition to HALF_OPEN
    if (cb.state === 'OPEN' && spec.enabled) {
      const openSince = new Date(cb.lastStateChangeAt).getTime();
      if (Date.now() - openSince >= spec.timeoutSeconds * 1000) {
        cb.state = 'HALF_OPEN';
        cb.lastStateChangeAt = new Date().toISOString();
      }
    }

    return cb;
  }

  classifyError(error: IConnectorError | { statusCode?: number; code: string }): ErrorCategory {
    const code = 'code' in error ? error.code : '';
    const statusCode = error.statusCode;

    if (code === 'AUTH_EXPIRED' || code === 'UNAUTHORIZED' || statusCode === 401) return 'AUTH';
    if (code === 'FORBIDDEN' || statusCode === 403) return 'PERMISSION';
    if (code === 'RATE_LIMITED' || statusCode === 429) return 'RATE_LIMIT';
    if (code === 'TIMEOUT' || code === 'ETIMEDOUT') return 'TIMEOUT';
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'NETWORK_ERROR') return 'NETWORK';
    if (statusCode === 400 || statusCode === 422 || statusCode === 409) return 'VALIDATION';
    if (statusCode === 404) return 'NOT_FOUND';
    if (statusCode && statusCode >= 500) return 'SERVER_ERROR';
    if (statusCode && statusCode >= 400) return 'CLIENT_ERROR';
    return 'UNKNOWN';
  }

  isRetryable(error: IConnectorError, policy: ConnectorRetryPolicy): boolean {
    if (!error.retryable) return false;
    if (error.statusCode) {
      if (policy.dontRetryOnStatusCodes.includes(error.statusCode)) return false;
      if (policy.retryOnStatusCodes.includes(error.statusCode)) return true;
    }
    const category = this.classifyError(error);
    // Never retry auth/permission/not_found/validation
    if (['AUTH', 'PERMISSION', 'NOT_FOUND', 'VALIDATION', 'CLIENT_ERROR'].includes(category)) return false;
    return true;
  }

  computeDelay(attemptNumber: number, policy: ConnectorRetryPolicy): number {
    let delay: number;
    if (policy.strategy === 'exponential') {
      delay = Math.min(policy.delayMs * Math.pow(2, attemptNumber - 1), policy.maxDelayMs);
    } else if (policy.strategy === 'linear') {
      delay = Math.min(policy.delayMs * attemptNumber, policy.maxDelayMs);
    } else {
      delay = policy.delayMs;
    }

    if (policy.jitter) {
      delay = delay * (0.75 + Math.random() * 0.5);
    }

    return Math.round(delay);
  }

  decide(
    error: IConnectorError,
    attemptNumber: number,
    policy: ConnectorRetryPolicy,
    circuitSpec: CircuitBreakerSpec,
    connectorId: string,
  ): RetryDecision {
    const cb = this.getCircuitBreaker(connectorId, circuitSpec);

    if (circuitSpec.enabled && cb.state === 'OPEN') {
      return {
        shouldRetry: false,
        delayMs: 0,
        attemptNumber,
        reason: 'CIRCUIT_OPEN',
        circuitState: 'OPEN',
      };
    }

    if (attemptNumber >= policy.maxAttempts) {
      return {
        shouldRetry: false,
        delayMs: 0,
        attemptNumber,
        reason: 'MAX_ATTEMPTS_REACHED',
        circuitState: cb.state,
      };
    }

    if (!this.isRetryable(error, policy)) {
      return {
        shouldRetry: false,
        delayMs: 0,
        attemptNumber,
        reason: `NOT_RETRYABLE_${error.code}`,
        circuitState: cb.state,
      };
    }

    // Use retryAfterMs if provided (e.g. from 429 response)
    const delayMs = error.retryAfterMs ?? this.computeDelay(attemptNumber, policy);
    this.retryTotal++;

    return {
      shouldRetry: true,
      delayMs,
      attemptNumber: attemptNumber + 1,
      reason: 'RETRYABLE_ERROR',
      circuitState: cb.state,
    };
  }

  recordSuccess(connectorId: string, circuitSpec: CircuitBreakerSpec): void {
    if (!circuitSpec.enabled) return;
    const cb = this.getCircuitBreaker(connectorId, circuitSpec);
    cb.successCount++;
    if (cb.state === 'HALF_OPEN' && cb.successCount >= circuitSpec.successThreshold) {
      cb.state = 'CLOSED';
      cb.failureCount = 0;
      cb.successCount = 0;
      cb.lastStateChangeAt = new Date().toISOString();
    }
  }

  recordFailure(connectorId: string, circuitSpec: CircuitBreakerSpec): void {
    if (!circuitSpec.enabled) return;
    const cb = this.getCircuitBreaker(connectorId, circuitSpec);
    cb.failureCount++;
    cb.lastFailureAt = new Date().toISOString();

    if (cb.state === 'HALF_OPEN') {
      cb.state = 'OPEN';
      cb.successCount = 0;
      cb.lastStateChangeAt = new Date().toISOString();
      this.circuitOpenTotal++;
    } else if (cb.state === 'CLOSED' && cb.failureCount >= circuitSpec.failureThreshold) {
      cb.state = 'OPEN';
      cb.lastStateChangeAt = new Date().toISOString();
      this.circuitOpenTotal++;
    }
  }

  addToDeadLetter(entry: Omit<DeadLetterEntry, 'id' | 'enqueuedAt'>): void {
    this.dlqTotal++;
    this.deadLetterQueue.push({
      ...entry,
      id: `dlq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      enqueuedAt: new Date().toISOString(),
    });
  }

  getDeadLetterQueue(): ReadonlyArray<DeadLetterEntry> {
    return this.deadLetterQueue;
  }

  getCircuitState(connectorId: string): CircuitState {
    return this.circuitBreakers.get(connectorId)?.state ?? 'CLOSED';
  }

  statistics() {
    const cbStates: Record<string, CircuitState> = {};
    for (const [id, cb] of this.circuitBreakers.entries()) cbStates[id] = cb.state;

    return {
      retryTotal: this.retryTotal,
      dlqSize: this.deadLetterQueue.length,
      dlqTotal: this.dlqTotal,
      circuitOpenTotal: this.circuitOpenTotal,
      circuitBreakerStates: cbStates,
    };
  }

  health() {
    const openCircuits = [...this.circuitBreakers.values()].filter(c => c.state === 'OPEN').length;
    const status = openCircuits > 0 ? 'DEGRADED' : 'HEALTHY';
    return {
      status,
      details: `${openCircuits} open circuits, ${this.deadLetterQueue.length} DLQ items`,
      checks: { circuitBreakersOk: openCircuits === 0, dlqNotOverflowing: this.deadLetterQueue.length < 1000 },
      checkedAt: new Date().toISOString(),
    };
  }
}