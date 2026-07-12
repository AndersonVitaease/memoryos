/**
 * ConnectorExecutor.ts
 * Executes connector actions with full retry, rate limiting, permission checks,
 * telemetry and audit. The official execution engine for all external communication.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorAction } from './interfaces/IConnectorAction';
import type { IConnectorContext } from './interfaces/IConnectorContext';
import type { IConnectorSession } from './interfaces/IConnectorSession';
import type { IConnectorResult, IConnectorError, ErrorCategory } from './interfaces/IConnectorResult';
import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectorPermissionManager } from './ConnectorPermissionManager';
import { ConnectorRateLimiter } from './ConnectorRateLimiter';
import { ConnectorRetryManager } from './ConnectorRetryManager';
import { ConnectorAudit } from './ConnectorAudit';
import { ConnectorTelemetry } from './ConnectorTelemetry';
import { ConnectorSessionManager } from './ConnectorSessionManager';

function makeError(code: string, message: string, statusCode?: number, retryable = false, category: ErrorCategory = 'UNKNOWN'): IConnectorError {
  return { code, message, statusCode, retryable, category, occurredAt: new Date().toISOString() };
}

function makeResult(
  action: IConnectorAction,
  status: IConnectorResult['status'],
  output?: Record<string, unknown>,
  error?: IConnectorError,
  latencyMs = 0,
  attemptNumber = 1,
  retryCount = 0,
): IConnectorResult {
  const now = new Date().toISOString();
  return {
    id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    connectorId: action.connectorId,
    actionId: action.actionId,
    executionId: action.executionId,
    correlationId: action.correlationId,
    requestId: action.requestId,
    status,
    output,
    error,
    latencyMs,
    attemptNumber,
    completedAt: now,
    retryable: !!error?.retryable,
    telemetry: {
      requestSentAt: new Date(Date.now() - latencyMs).toISOString(),
      responseReceivedAt: now,
      latencyMs,
      retryCount,
    },
  };
}

export class ConnectorExecutor {
  private executeTotal = 0;
  private successTotal = 0;
  private failureTotal = 0;

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly permissionManager: ConnectorPermissionManager,
    private readonly rateLimiter: ConnectorRateLimiter,
    private readonly retryManager: ConnectorRetryManager,
    private readonly audit: ConnectorAudit,
    private readonly telemetry: ConnectorTelemetry,
    private readonly sessionManager: ConnectorSessionManager,
  ) {}

  async execute(
    action: IConnectorAction,
    context: IConnectorContext,
    session: IConnectorSession,
  ): Promise<IConnectorResult> {
    this.executeTotal++;
    const manifest = this.registry.getManifest(action.connectorId);
    if (!manifest) {
      const err = makeError('CONNECTOR_NOT_FOUND', `Connector '${action.connectorId}' not registered`, undefined, false, 'NOT_FOUND');
      const result = makeResult(action, 'FAILED', undefined, err);
      this.failureTotal++;
      return result;
    }

    const instance = this.registry.getInstance(action.connectorId);
    if (!instance) {
      const err = makeError('CONNECTOR_NO_INSTANCE', `No instance for '${action.connectorId}'`, undefined, false, 'UNKNOWN');
      const result = makeResult(action, 'FAILED', undefined, err);
      this.failureTotal++;
      return result;
    }

    // Validate session
    if (!this.sessionManager.isActive(session.id)) {
      const err = makeError('SESSION_INACTIVE', `Session '${session.id}' is not active`, undefined, false, 'AUTH');
      const result = makeResult(action, 'DENIED', undefined, err);
      this.failureTotal++;
      return result;
    }

    // Permission check (Least Privilege — Constitution S-01)
    const permCheck = this.permissionManager.check(action, context, manifest);
    if (!permCheck.allowed) {
      const err = makeError('PERMISSION_DENIED', permCheck.reason ?? 'Permission denied', 403, false, 'PERMISSION');
      const result = makeResult(action, 'DENIED', undefined, err);
      this.failureTotal++;
      this.audit.record(action, result, context.userId, false);
      this.telemetry.record(action.connectorId, result);
      return result;
    }

    // Rate limit checks for all applicable specs
    const actionSpec = manifest.supportedActions.find(a => a.id === action.actionId);
    const applicableRateLimits = manifest.rateLimits.filter(
      rl => !actionSpec?.rateLimitId || rl.id === actionSpec.rateLimitId,
    );

    for (const rlSpec of applicableRateLimits) {
      const rlResult = this.rateLimiter.check(action.connectorId, rlSpec, context.userId, action.actionId);
      if (!rlResult.allowed) {
        const err = makeError('RATE_LIMITED', `Rate limit '${rlSpec.id}' exceeded`, 429, true, 'RATE_LIMIT');
        if (rlResult.retryAfterMs) (err as { retryAfterMs?: number }).retryAfterMs = rlResult.retryAfterMs;
        const result = makeResult(action, 'RATE_LIMITED', undefined, err);
        this.failureTotal++;
        this.audit.record(action, result, context.userId, false);
        this.telemetry.record(action.connectorId, result);
        return result;
      }
    }

    // Execute with retry loop
    let attemptNumber = 1;
    let lastResult: IConnectorResult | null = null;

    while (attemptNumber <= (manifest.retryPolicy.maxAttempts + 1)) {
      const startMs = Date.now();
      try {
        const connectorResult = await instance.execute(action, context, session);
        const latencyMs = Date.now() - startMs;

        const result = makeResult(
          action,
          connectorResult.status,
          connectorResult.output,
          connectorResult.error,
          latencyMs,
          attemptNumber,
          attemptNumber - 1,
        );

        this.sessionManager.recordActivity(session.id, result.status !== 'SUCCESS');
        this.retryManager.recordSuccess(action.connectorId, manifest.circuitBreaker);

        this.successTotal++;
        this.audit.record(action, result, context.userId, (actionSpec?.sideEffects.length ?? 0) > 0);
        this.telemetry.record(action.connectorId, result);
        return result;

      } catch (err) {
        const latencyMs = Date.now() - startMs;
        const errorMessage = err instanceof Error ? err.message : String(err);

        const connError = makeError(
          'EXECUTION_ERROR',
          errorMessage,
          undefined,
          true,
          'UNKNOWN',
        );

        lastResult = makeResult(action, 'FAILED', undefined, connError, latencyMs, attemptNumber, attemptNumber - 1);

        this.retryManager.recordFailure(action.connectorId, manifest.circuitBreaker);

        const retryDecision = this.retryManager.decide(
          connError,
          attemptNumber,
          manifest.retryPolicy,
          manifest.circuitBreaker,
          action.connectorId,
        );

        if (!retryDecision.shouldRetry) {
          // Add to dead letter queue if max attempts reached
          if (retryDecision.reason === 'MAX_ATTEMPTS_REACHED') {
            this.retryManager.addToDeadLetter({
              connectorId: action.connectorId,
              actionId: action.actionId,
              correlationId: action.correlationId,
              error: connError,
              attemptCount: attemptNumber,
            });
          }
          break;
        }

        attemptNumber++;
        // Wait for retry delay
        await new Promise<void>(resolve => setTimeout(resolve, retryDecision.delayMs));
      }
    }

    // All attempts failed
    this.failureTotal++;
    const finalResult = lastResult ?? makeResult(action, 'FAILED', undefined, makeError('UNKNOWN_FAILURE', 'All attempts failed'));
    this.sessionManager.recordActivity(session.id, true);
    this.audit.record(action, finalResult, context.userId, false);
    this.telemetry.record(action.connectorId, finalResult);
    return finalResult;
  }

  statistics() {
    return {
      executeTotal: this.executeTotal,
      successTotal: this.successTotal,
      failureTotal: this.failureTotal,
      successRate: this.executeTotal > 0 ? this.successTotal / this.executeTotal : 1,
    };
  }

  health() {
    const successRate = this.executeTotal > 0 ? this.successTotal / this.executeTotal : 1;
    return {
      status: (successRate < 0.5 && this.executeTotal > 10 ? 'DEGRADED' : 'HEALTHY') as 'HEALTHY' | 'DEGRADED',
      details: `${this.executeTotal} total executions, ${(successRate * 100).toFixed(1)}% success`,
      checks: { executorOperational: true, acceptableSuccessRate: successRate >= 0.5 },
      checkedAt: new Date().toISOString(),
    };
  }
}