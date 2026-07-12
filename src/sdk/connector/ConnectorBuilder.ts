/**
 * ConnectorBuilder.ts
 * MemoryOS Connector SDK — Official Fluent Builder for IConnectorManifest
 * Produces validated, immutable manifests ready for ConnectorRuntime registration.
 *
 * EF-31C · 2026-07-12 · Version: 1.0.0 · Status: FROZEN
 *
 * Usage:
 *   const manifest = new ConnectorBuilder('my-connector', '1.0.0', 'My Connector')
 *     .setCategory('productivity')
 *     .setAuth({ type: 'apikey', apikey: { ... } })
 *     .addScope({ id: 'read', ... })
 *     .addAction({ id: 'list_items', ... })
 *     .build();
 */

import type {
  IConnectorManifest,
  ConnectorCategory,
  ConnectorAuthConfig,
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
} from '@/runtime/connectors/interfaces/IConnectorManifest';

const DEFAULT_RETRY: ConnectorRetryPolicy = {
  maxAttempts: 3,
  strategy: 'exponential',
  delayMs: 500,
  maxDelayMs: 10000,
  jitter: true,
  retryOnStatusCodes: [429, 500, 502, 503, 504],
  dontRetryOnStatusCodes: [400, 401, 403, 404, 409, 422],
};

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerSpec = {
  enabled: true,
  failureThreshold: 5,
  successThreshold: 2,
  timeoutSeconds: 60,
  monitoringWindowSeconds: 120,
};

const DEFAULT_HEALTH_CHECK: ConnectorHealthCheckSpec = {
  endpoint: '/health',
  method: 'GET',
  expectedStatusCode: 200,
  timeoutMs: 100,
  intervalSeconds: 30,
  failureThreshold: 3,
  successThreshold: 1,
};

const DEFAULT_TELEMETRY: ConnectorTelemetrySpec = {
  trackRequestPayload: false,
  trackResponsePayload: false,
  logLevel: 'error',
  emitEvents: [],
  customMetrics: [],
  sensitiveFields: ['password', 'token', 'secret', 'key', 'credential'],
};

const DEFAULT_ROLLBACK: ConnectorRollbackPolicy = {
  supported: false,
  strategy: 'none',
  description: 'No rollback supported',
};

export class ConnectorBuilder {
  private readonly _id: string;
  private readonly _version: string;
  private readonly _name: string;
  private _description = '';
  private _owner = 'MemoryOS';
  private _category: ConnectorCategory = 'utility';
  private _tags: string[] = [];
  private _auth: ConnectorAuthConfig = { type: 'none' };
  private _scopes: ConnectorScope[] = [];
  private _permissions: ConnectorPermission[] = [];
  private _rateLimits: RateLimitSpec[] = [];
  private _timeoutMs = 30000;
  private _retryPolicy: ConnectorRetryPolicy = { ...DEFAULT_RETRY };
  private _circuitBreaker: CircuitBreakerSpec = { ...DEFAULT_CIRCUIT_BREAKER };
  private _actions: ConnectorActionSpec[] = [];
  private _webhooks: ConnectorWebhookSpec[] = [];
  private _healthCheck: ConnectorHealthCheckSpec = { ...DEFAULT_HEALTH_CHECK };
  private _failureModes: ConnectorFailureMode[] = [];
  private _telemetry: ConnectorTelemetrySpec = { ...DEFAULT_TELEMETRY };
  private _auditLevel: 'none' | 'basic' | 'full' = 'basic';
  private _rollbackPolicy: ConnectorRollbackPolicy = { ...DEFAULT_ROLLBACK };
  private _deprecated = false;
  private _deprecatedAt?: string;
  private _supersededBy?: string;

  constructor(id: string, version: string, name: string) {
    if (!id?.trim()) throw new Error('ConnectorBuilder: id is required');
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`ConnectorBuilder: version must be semver, got "${version}"`);
    if (!name?.trim()) throw new Error('ConnectorBuilder: name is required');
    this._id = id;
    this._version = version;
    this._name = name;
  }

  setDescription(v: string): this { this._description = v; return this; }
  setOwner(v: string): this { this._owner = v; return this; }
  setCategory(v: ConnectorCategory): this { this._category = v; return this; }
  addTag(v: string): this { this._tags.push(v); return this; }
  setAuth(v: ConnectorAuthConfig): this { this._auth = v; return this; }
  setTimeout(ms: number): this { this._timeoutMs = ms; return this; }
  setAuditLevel(v: 'none' | 'basic' | 'full'): this { this._auditLevel = v; return this; }

  addScope(s: ConnectorScope): this {
    if (this._scopes.some(x => x.id === s.id)) throw new Error(`ConnectorBuilder: Scope '${s.id}' already registered`);
    this._scopes.push(s);
    return this;
  }

  addPermission(p: ConnectorPermission): this {
    this._permissions.push(p);
    return this;
  }

  addRateLimit(r: RateLimitSpec): this {
    if (this._rateLimits.some(x => x.id === r.id)) throw new Error(`ConnectorBuilder: RateLimit '${r.id}' already registered`);
    this._rateLimits.push(r);
    return this;
  }

  addAction(a: ConnectorActionSpec): this {
    if (this._actions.some(x => x.id === a.id)) throw new Error(`ConnectorBuilder: Action '${a.id}' already registered`);
    this._actions.push(a);
    return this;
  }

  addWebhook(w: ConnectorWebhookSpec): this {
    if (this._webhooks.some(x => x.id === w.id)) throw new Error(`ConnectorBuilder: Webhook '${w.id}' already registered`);
    this._webhooks.push(w);
    return this;
  }

  addFailureMode(f: ConnectorFailureMode): this {
    this._failureModes.push(f);
    return this;
  }

  setHealthCheck(h: Partial<ConnectorHealthCheckSpec>): this {
    this._healthCheck = { ...this._healthCheck, ...h };
    return this;
  }

  setRetryPolicy(r: Partial<ConnectorRetryPolicy>): this {
    this._retryPolicy = { ...this._retryPolicy, ...r };
    return this;
  }

  setCircuitBreaker(c: Partial<CircuitBreakerSpec>): this {
    this._circuitBreaker = { ...this._circuitBreaker, ...c };
    return this;
  }

  setTelemetry(t: Partial<ConnectorTelemetrySpec>): this {
    this._telemetry = { ...this._telemetry, ...t };
    return this;
  }

  setRollbackPolicy(r: ConnectorRollbackPolicy): this {
    this._rollbackPolicy = r;
    return this;
  }

  markDeprecated(supersededBy?: string): this {
    this._deprecated = true;
    this._deprecatedAt = new Date().toISOString();
    this._supersededBy = supersededBy;
    return this;
  }

  build(): IConnectorManifest {
    if (this._actions.length === 0) {
      throw new Error('ConnectorBuilder: At least one action must be registered before build()');
    }
    return Object.freeze({
      id: this._id,
      version: this._version,
      schemaVersion: 1,
      name: this._name,
      description: this._description,
      owner: this._owner,
      category: this._category,
      tags: Object.freeze([...this._tags]),
      auth: Object.freeze(this._auth),
      scopes: Object.freeze([...this._scopes]),
      permissions: Object.freeze([...this._permissions]),
      rateLimits: Object.freeze([...this._rateLimits]),
      timeoutMs: this._timeoutMs,
      retryPolicy: Object.freeze(this._retryPolicy),
      circuitBreaker: Object.freeze(this._circuitBreaker),
      supportedActions: Object.freeze([...this._actions]),
      webhooks: Object.freeze([...this._webhooks]),
      healthCheck: Object.freeze(this._healthCheck),
      failureModes: Object.freeze([...this._failureModes]),
      telemetry: Object.freeze(this._telemetry),
      auditLevel: this._auditLevel,
      rollbackPolicy: Object.freeze(this._rollbackPolicy),
      deprecated: this._deprecated,
      deprecatedAt: this._deprecatedAt,
      supersededBy: this._supersededBy,
    });
  }
}