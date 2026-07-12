/**
 * MockConnector.ts
 * Fully self-contained mock connector for EF-31A validation.
 * No external APIs. No real secrets. Deterministic behavior.
 * EF-31A · 2026-07-12
 */

import type { IConnector, ConnectorStatus, ConnectorValidationResult, PingResult } from '../interfaces/IConnector';
import type { IConnectorManifest } from '../interfaces/IConnectorManifest';
import type { IConnectorAction } from '../interfaces/IConnectorAction';
import type { IConnectorContext } from '../interfaces/IConnectorContext';
import type { IConnectorSession } from '../interfaces/IConnectorSession';
import type { IConnectorResult } from '../interfaces/IConnectorResult';
import type { IConnectorHealth } from '../interfaces/IConnectorHealth';

export type MockBehavior = 'success' | 'fail' | 'throw' | 'slow' | 'timeout';

export interface MockConnectorOptions {
  readonly behavior?: MockBehavior;
  readonly latencyMs?: number;
  readonly failAfterNExecutions?: number;  // fail after N successes — for circuit breaker tests
}

export const MOCK_MANIFEST: IConnectorManifest = Object.freeze({
  id: 'mock-connector-v1',
  version: '1.0.0',
  schemaVersion: 1,
  name: 'Mock Connector',
  description: 'Deterministic mock connector for EF-31A runtime validation. Zero external dependencies.',
  owner: 'ef-31a',
  category: 'utility',
  tags: ['mock', 'test', 'ef-31a'],
  auth: {
    type: 'apikey',
    apikey: { headerName: 'X-Mock-Key', rotationPolicy: 'manual', secretName: 'MOCK_API_KEY' },
  },
  scopes: [
    { id: 'read',  name: 'Read',  description: 'Read mock data',  required: true,  sensitiveData: false, capabilities: ['mock'] },
    { id: 'write', name: 'Write', description: 'Write mock data', required: false, sensitiveData: false, capabilities: ['mock'] },
    { id: 'admin', name: 'Admin', description: 'Admin operations', required: false, sensitiveData: true, capabilities: ['mock'] },
  ],
  permissions: [
    { action: 'list_items',   scope: 'read',  description: 'List mock items',   sensitive: false },
    { action: 'create_item',  scope: 'write', description: 'Create mock item',  sensitive: false },
    { action: 'delete_items', scope: 'admin', description: 'Delete all items',  sensitive: true  },
  ],
  rateLimits: [
    { id: 'global',  description: 'Global rate limit',  limit: 100,  windowSeconds: 60, scope: 'global',      strategy: 'token_bucket',  onExceeded: 'reject' },
    { id: 'per_user',description: 'Per-user rate limit', limit: 20,  windowSeconds: 60, scope: 'per_user',    strategy: 'fixed_window',  onExceeded: 'retry_after', retryAfterSeconds: 5 },
    { id: 'strict',  description: 'Strict limit for tests', limit: 1, windowSeconds: 60, scope: 'global',    strategy: 'fixed_window',  onExceeded: 'retry_after', retryAfterSeconds: 10 },
  ],
  timeoutMs: 5000,
  retryPolicy: {
    maxAttempts: 3,
    strategy: 'exponential',
    delayMs: 10,
    maxDelayMs: 200,
    jitter: false,
    retryOnStatusCodes: [500, 502, 503],
    dontRetryOnStatusCodes: [400, 401, 403, 404],
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    successThreshold: 2,
    timeoutSeconds: 1,
    monitoringWindowSeconds: 30,
  },
  supportedActions: [
    { id: 'list_items',   name: 'List Items',   description: 'Returns mock list', method: 'GET',    endpoint: '/mock/items',  requiredScopes: ['read'],  idempotent: true,  sideEffects: [], paginated: true },
    { id: 'create_item',  name: 'Create Item',  description: 'Creates mock item', method: 'POST',   endpoint: '/mock/items',  requiredScopes: ['write'], idempotent: false, sideEffects: ['database_write'], paginated: false },
    { id: 'delete_items', name: 'Delete Items', description: 'Deletes all items', method: 'DELETE', endpoint: '/mock/items',  requiredScopes: ['admin'], idempotent: true,  sideEffects: ['database_write', 'irreversible'], paginated: false },
    { id: 'get_status',   name: 'Get Status',   description: 'Returns mock status', method: 'GET',  endpoint: '/mock/status', requiredScopes: ['read'],  idempotent: true,  sideEffects: [], paginated: false },
  ],
  webhooks: [
    {
      id: 'item_created',
      eventType: 'mock.item.created',
      description: 'Fired when a mock item is created',
      signatureVerification: { enabled: true, algorithm: 'hmac-sha256', headerName: 'X-Mock-Signature', secretName: 'MOCK_WEBHOOK_SECRET' },
      idempotencyKey: 'itemId',
      deliveryGuarantee: 'at_least_once',
    },
    {
      id: 'item_deleted',
      eventType: 'mock.item.deleted',
      description: 'Fired when items are deleted',
      signatureVerification: { enabled: false, algorithm: 'none', headerName: '', secretName: '' },
      deliveryGuarantee: 'at_most_once',
    },
  ],
  healthCheck: { endpoint: '/mock/health', method: 'GET', expectedStatusCode: 200, timeoutMs: 50, intervalSeconds: 30, failureThreshold: 3, successThreshold: 2 },
  failureModes: [
    { code: 'MOCK_NOT_FOUND',    statusCode: 404, description: 'Mock resource not found', probability: 'low',    impact: 'low',    recovery: 'manual',    recoveryDescription: 'Provide valid id', resultStatus: 'FAILED' },
    { code: 'MOCK_SERVER_ERROR', statusCode: 500, description: 'Mock server error',        probability: 'low',    impact: 'high',   recovery: 'automatic', recoveryDescription: 'Retry',           resultStatus: 'FAILED' },
    { code: 'MOCK_TIMEOUT',      statusCode: 408, description: 'Mock timeout',             probability: 'medium', impact: 'medium', recovery: 'automatic', recoveryDescription: 'Retry',           resultStatus: 'TIMEOUT' },
  ],
  telemetry: {
    trackRequestPayload: false,
    trackResponsePayload: false,
    logLevel: 'info',
    emitEvents: ['execution_start', 'execution_end', 'error'],
    customMetrics: [{ name: 'mock_items_count', description: 'Total mock items returned', unit: 'count' }],
    sensitiveFields: [],
  },
  auditLevel: 'full',
  rollbackPolicy: { supported: false, strategy: 'none', description: 'Mock connector does not support rollback' },
});

export class MockConnector implements IConnector {
  readonly id = 'mock-connector-v1';
  readonly version = '1.0.0';
  readonly manifest: IConnectorManifest = MOCK_MANIFEST;
  status: ConnectorStatus = 'UNREGISTERED';

  private executeCount = 0;
  private readonly options: Required<MockConnectorOptions>;

  constructor(options: MockConnectorOptions = {}) {
    this.options = {
      behavior: options.behavior ?? 'success',
      latencyMs: options.latencyMs ?? 0,
      failAfterNExecutions: options.failAfterNExecutions ?? Infinity,
    };
  }

  async initialize(): Promise<void> {
    this.status = 'REGISTERED';
  }

  async authenticate(): Promise<boolean> {
    return true;
  }

  async execute(action: IConnectorAction, _context: IConnectorContext, _session: IConnectorSession): Promise<IConnectorResult> {
    this.executeCount++;

    if (this.options.latencyMs > 0) {
      await new Promise<void>(r => setTimeout(r, this.options.latencyMs));
    }

    const shouldFail = this.executeCount > this.options.failAfterNExecutions;
    const behavior = shouldFail ? 'fail' : this.options.behavior;

    if (behavior === 'throw') throw new Error('MockConnector: simulated throw');

    const now = new Date().toISOString();
    const success = behavior === 'success' || behavior === 'slow';

    return {
      id: `mock_res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      connectorId: action.connectorId,
      actionId: action.actionId,
      executionId: action.executionId,
      correlationId: action.correlationId,
      requestId: action.requestId,
      status: success ? 'SUCCESS' : 'FAILED',
      output: success ? { items: [{ id: 'mock-001', value: 'mock-data' }], count: 1, action: action.actionId } : undefined,
      error: !success ? {
        code: 'MOCK_SERVER_ERROR',
        message: 'MockConnector: simulated failure',
        statusCode: 500,
        retryable: true,
        category: 'SERVER_ERROR' as const,
        occurredAt: now,
      } : undefined,
      latencyMs: this.options.latencyMs,
      attemptNumber: 1,
      completedAt: now,
      retryable: !success,
      telemetry: { requestSentAt: now, responseReceivedAt: now, latencyMs: this.options.latencyMs, retryCount: 0 },
    };
  }

  async disconnect(): Promise<void> {
    this.status = 'DISCONNECTED';
  }

  async health(): Promise<IConnectorHealth> {
    return {
      connectorId: this.id,
      status: this.options.behavior === 'fail' ? 'DEGRADED' : 'HEALTHY',
      details: `Mock connector — behavior=${this.options.behavior}, executions=${this.executeCount}`,
      checks: {
        connectivity: true,
        authentication: true,
        latency: this.options.latencyMs < 1000,
        dependencies: true,
        availability: this.options.behavior !== 'fail',
        circuitBreaker: true,
        overall: this.options.behavior !== 'fail',
      },
      latencyMs: this.options.latencyMs,
      checkedAt: new Date().toISOString(),
    };
  }

  async validate(): Promise<ConnectorValidationResult> {
    return {
      valid: true,
      connectorId: this.id,
      errors: [],
      warnings: [],
      checkedAt: new Date().toISOString(),
    };
  }

  async ping(): Promise<PingResult> {
    return {
      connectorId: this.id,
      reachable: this.options.behavior !== 'fail',
      latencyMs: this.options.latencyMs,
      statusCode: this.options.behavior !== 'fail' ? 200 : 503,
      checkedAt: new Date().toISOString(),
    };
  }

  getExecuteCount(): number { return this.executeCount; }
}