/**
 * HelloConnector.ts
 * MemoryOS Connector SDK — Official Reference Connector
 *
 * Purpose: Demonstrates the full connector lifecycle using exclusively
 *          the public Connector SDK (BaseConnector + ConnectorBuilder).
 *          No external APIs, no HTTP calls, no real credentials.
 *
 * This is the canonical example for all future MemoryOS connectors.
 *
 * EF-31C · 2026-07-12 · Version: 1.0.0 · Status: FROZEN
 *
 * SDK-only:  Uses BaseConnector + ConnectorBuilder exclusively.
 *            No direct access to any Runtime subsystem.
 */

import { BaseConnector } from './BaseConnector';
import { ConnectorBuilder } from './ConnectorBuilder';
import type { IConnectorManifest } from '@/runtime/connectors/interfaces/IConnectorManifest';
import type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
import type { IConnectorContext } from '@/runtime/connectors/interfaces/IConnectorContext';
import type { IConnectorSession } from '@/runtime/connectors/interfaces/IConnectorSession';
import type { IConnectorResult } from '@/runtime/connectors/interfaces/IConnectorResult';
import type { IConnectorHealth } from '@/runtime/connectors/interfaces/IConnectorHealth';

// ── Manifest — built via SDK ConnectorBuilder ─────────────────────────────

export const HELLO_MANIFEST: IConnectorManifest = new ConnectorBuilder('hello-connector-v1', '1.0.0', 'Hello Connector')
  .setDescription('SDK reference connector — demonstrates the full MemoryOS connector lifecycle. No external dependencies.')
  .setOwner('MemoryOS SDK Team')
  .setCategory('utility')
  .addTag('reference')
  .addTag('sdk')
  .addTag('example')
  .setAuth({ type: 'apikey', apikey: { headerName: 'X-Hello-Key', rotationPolicy: 'manual', secretName: 'hello_api_key' } })
  .addScope({ id: 'read', name: 'Read', description: 'Read hello items', required: true, sensitiveData: false, capabilities: ['list_items', 'get_item'] })
  .addScope({ id: 'write', name: 'Write', description: 'Create and update items', required: false, sensitiveData: false, capabilities: ['create_item', 'update_item'] })
  .addScope({ id: 'admin', name: 'Admin', description: 'Delete and manage items', required: false, sensitiveData: true, capabilities: ['delete_item'] })
  .addPermission({ action: 'list_items', scope: 'read', description: 'List hello items', sensitive: false })
  .addPermission({ action: 'get_item', scope: 'read', description: 'Get a single hello item', sensitive: false })
  .addPermission({ action: 'create_item', scope: 'write', description: 'Create a new hello item', sensitive: false })
  .addPermission({ action: 'update_item', scope: 'write', description: 'Update an existing hello item', sensitive: false })
  .addPermission({ action: 'delete_item', scope: 'admin', description: 'Permanently delete an item', sensitive: true })
  .addRateLimit({ id: 'global', description: 'Global limit', limit: 100, windowSeconds: 60, scope: 'global', strategy: 'token_bucket', onExceeded: 'retry_after', retryAfterSeconds: 5 })
  .addRateLimit({ id: 'strict', description: 'Strict single-token limit for demo', limit: 1, windowSeconds: 60, scope: 'per_user', strategy: 'fixed_window', onExceeded: 'reject' })
  .addAction({ id: 'list_items', name: 'List Items', description: 'Returns all hello items', method: 'GET', endpoint: '/hello/items', requiredScopes: ['read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'get_item', name: 'Get Item', description: 'Returns a single hello item', method: 'GET', endpoint: '/hello/items/:id', requiredScopes: ['read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'create_item', name: 'Create Item', description: 'Creates a new hello item', method: 'POST', endpoint: '/hello/items', requiredScopes: ['read', 'write'], idempotent: false, sideEffects: ['creates_item'], paginated: false })
  .addAction({ id: 'delete_item', name: 'Delete Item', description: 'Permanently deletes an item', method: 'DELETE', endpoint: '/hello/items/:id', requiredScopes: ['read', 'write', 'admin'], idempotent: true, sideEffects: ['destroys_item'], paginated: false })
  .addWebhook({ id: 'item_created', eventType: 'hello.item.created', description: 'Fired when item is created', signatureVerification: { enabled: true, algorithm: 'hmac-sha256', headerName: 'X-Hello-Signature', secretName: 'hello_webhook_secret' }, deliveryGuarantee: 'at_least_once' })
  .setHealthCheck({ endpoint: '/hello/health', method: 'GET', expectedStatusCode: 200, timeoutMs: 50, intervalSeconds: 30, failureThreshold: 3, successThreshold: 1 })
  .setRetryPolicy({ maxAttempts: 3, strategy: 'exponential', delayMs: 200, maxDelayMs: 5000, jitter: true, retryOnStatusCodes: [429, 500, 502, 503], dontRetryOnStatusCodes: [400, 401, 403, 404, 422] })
  .setCircuitBreaker({ enabled: true, failureThreshold: 5, successThreshold: 2, timeoutSeconds: 60, monitoringWindowSeconds: 120 })
  .setTelemetry({ trackRequestPayload: false, trackResponsePayload: false, logLevel: 'error', emitEvents: ['hello.item.created', 'hello.item.deleted'], customMetrics: ['item_count'], sensitiveFields: ['hello_api_key', 'token', 'secret'] })
  .setAuditLevel('full')
  .build();

// ── In-memory store for the Hello Connector ───────────────────────────────

interface HelloItem {
  id: string;
  name: string;
  createdAt: string;
}

let _items: HelloItem[] = [
  { id: 'hello-001', name: 'Hello World', createdAt: new Date().toISOString() },
  { id: 'hello-002', name: 'Hello MemoryOS', createdAt: new Date().toISOString() },
  { id: 'hello-003', name: 'Hello SDK', createdAt: new Date().toISOString() },
];

// ── HelloConnector — extends BaseConnector (SDK only) ─────────────────────

export class HelloConnector extends BaseConnector {
  private authenticated = false;

  constructor() { super(HELLO_MANIFEST); }

  // ── SDK lifecycle hooks ───────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    // Validate internal state, prepare stores — no external calls
    this.authenticated = false;
  }

  protected async onConnect(): Promise<void> {
    // Simulate connection setup (no real HTTP)
  }

  protected async onAuthenticate(_context: IConnectorContext): Promise<boolean> {
    // Simulate credential validation via ref (no raw values ever accessed)
    this.authenticated = !!_context.credentials?.apiKeyRef;
    return this.authenticated;
  }

  protected async onExecute(
    action: IConnectorAction,
    _context: IConnectorContext,
    _session: IConnectorSession,
  ): Promise<IConnectorResult> {
    const start = Date.now();
    const now = new Date().toISOString();

    const base = {
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      connectorId: this.id,
      executionId: action.executionId,
      correlationId: action.correlationId,
      requestId: action.requestId,
      latencyMs: 0,
      attemptNumber: action.metadata.attemptNumber,
      completedAt: now,
      retryable: false,
      telemetry: { requestSentAt: now, responseReceivedAt: now, latencyMs: 0, retryCount: 0 },
    };

    let output: Record<string, unknown>;

    switch (action.actionId) {
      case 'list_items':
        output = { items: [..._items], count: _items.length };
        break;

      case 'get_item': {
        const id = String(action.input['id'] ?? '');
        const item = _items.find(i => i.id === id);
        if (!item) {
          return {
            ...base, actionId: action.actionId, status: 'FAILED', latencyMs: Date.now() - start,
            retryable: false,
            error: { code: 'NOT_FOUND', message: `Item '${id}' not found`, statusCode: 404, retryable: false, category: 'NOT_FOUND', occurredAt: now },
            telemetry: { ...base.telemetry, latencyMs: Date.now() - start },
          };
        }
        output = { item };
        break;
      }

      case 'create_item': {
        const name = String(action.input['name'] ?? 'Unnamed');
        const newItem: HelloItem = { id: `hello-${Date.now()}`, name, createdAt: now };
        _items.push(newItem);
        output = { item: newItem, created: true };
        break;
      }

      case 'delete_item': {
        const id = String(action.input['id'] ?? '');
        const before = _items.length;
        _items = _items.filter(i => i.id !== id);
        output = { deleted: _items.length < before, id };
        break;
      }

      default:
        return {
          ...base, actionId: action.actionId, status: 'FAILED', latencyMs: Date.now() - start,
          retryable: false,
          error: { code: 'UNKNOWN_ACTION', message: `Action '${action.actionId}' not implemented`, retryable: false, category: 'VALIDATION', occurredAt: now },
          telemetry: { ...base.telemetry, latencyMs: Date.now() - start },
        };
    }

    const latencyMs = Date.now() - start;
    return {
      ...base, actionId: action.actionId, status: 'SUCCESS', output, latencyMs,
      telemetry: { ...base.telemetry, latencyMs },
    };
  }

  protected async onDisconnect(_session: IConnectorSession): Promise<void> {
    this.authenticated = false;
  }

  protected async onShutdown(): Promise<void> {
    this.authenticated = false;
  }

  protected async onHealthCheck(): Promise<IConnectorHealth> {
    return {
      connectorId: this.id,
      status: 'HEALTHY',
      details: `HelloConnector v${this.version} — ${_items.length} items, authenticated=${this.authenticated}`,
      checks: {
        initialized: !!this.initializedAt,
        authenticated: this.authenticated,
        storeIntact: Array.isArray(_items),
      },
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  isAuthenticated(): boolean { return this.authenticated; }
  getItems(): HelloItem[] { return [..._items]; }
}