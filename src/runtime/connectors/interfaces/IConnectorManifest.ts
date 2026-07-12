/**
 * IConnectorManifest.ts
 * Connector Runtime Foundation — EF-31
 * Engineering First · Sprint EF-31
 * Date: 2026-07-12 · Version: 1.0.0 · Status: Official
 */

export type ConnectorAuthType = 'oauth2' | 'apikey' | 'basic' | 'bearer' | 'none';
export type ConnectorCategory =
  | 'productivity'
  | 'communication'
  | 'repository'
  | 'storage'
  | 'crm'
  | 'project'
  | 'calendar'
  | 'data'
  | 'ai'
  | 'payment'
  | 'utility';

export interface IConnectorManifest {
  readonly id: string;
  readonly version: string;
  readonly schemaVersion: number;
  readonly name: string;
  readonly description: string;
  readonly owner: string;
  readonly category: ConnectorCategory;
  readonly tags: ReadonlyArray<string>;
  readonly auth: ConnectorAuthConfig;
  readonly scopes: ReadonlyArray<ConnectorScope>;
  readonly permissions: ReadonlyArray<ConnectorPermission>;
  readonly rateLimits: ReadonlyArray<RateLimitSpec>;
  readonly timeoutMs: number;
  readonly retryPolicy: ConnectorRetryPolicy;
  readonly circuitBreaker: CircuitBreakerSpec;
  readonly supportedActions: ReadonlyArray<ConnectorActionSpec>;
  readonly webhooks: ReadonlyArray<ConnectorWebhookSpec>;
  readonly healthCheck: ConnectorHealthCheckSpec;
  readonly failureModes: ReadonlyArray<ConnectorFailureMode>;
  readonly telemetry: ConnectorTelemetrySpec;
  readonly auditLevel: 'none' | 'basic' | 'full';
  readonly rollbackPolicy: ConnectorRollbackPolicy;
  readonly deprecated?: boolean;
  readonly deprecatedAt?: string;
  readonly supersededBy?: string;
}

export interface ConnectorAuthConfig {
  readonly type: ConnectorAuthType;
  readonly oauth2?: OAuth2Config;
  readonly apikey?: ApiKeyConfig;
  readonly basic?: BasicAuthConfig;
  readonly bearer?: BearerConfig;
}

export interface OAuth2Config {
  readonly authorizationUrl: string;
  readonly tokenUrl: string;
  readonly refreshUrl: string;
  readonly defaultScopes: ReadonlyArray<string>;
  readonly pkce: boolean;
  readonly tokenStorage: 'memory' | 'encrypted_storage';
  readonly refreshStrategy: 'proactive' | 'reactive';
  readonly expiryBufferSeconds: number;
}

export interface ApiKeyConfig {
  readonly headerName: string;
  readonly prefix?: string;
  readonly rotationPolicy: 'manual' | 'scheduled';
  readonly secretName: string;
}

export interface BasicAuthConfig {
  readonly usernameField: string;
  readonly passwordField: string;
}

export interface BearerConfig {
  readonly headerName: string;
  readonly secretName: string;
}

export interface ConnectorScope {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly sensitiveData: boolean;
  readonly capabilities: ReadonlyArray<string>;
}

export interface ConnectorPermission {
  readonly action: string;
  readonly scope: string;
  readonly description: string;
  readonly sensitive: boolean;
}

export interface RateLimitSpec {
  readonly id: string;
  readonly description: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly scope: 'global' | 'per_user' | 'per_action';
  readonly strategy: 'fixed_window' | 'sliding_window' | 'token_bucket';
  readonly onExceeded: 'queue' | 'reject' | 'retry_after';
  readonly retryAfterSeconds?: number;
}

export interface ConnectorRetryPolicy {
  readonly maxAttempts: number;
  readonly strategy: 'exponential' | 'linear' | 'fixed';
  readonly delayMs: number;
  readonly maxDelayMs: number;
  readonly jitter: boolean;
  readonly retryOnStatusCodes: ReadonlyArray<number>;
  readonly dontRetryOnStatusCodes: ReadonlyArray<number>;
}

export interface CircuitBreakerSpec {
  readonly enabled: boolean;
  readonly failureThreshold: number;
  readonly successThreshold: number;
  readonly timeoutSeconds: number;
  readonly monitoringWindowSeconds: number;
}

export interface ConnectorActionSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GRAPHQL' | 'GRPC';
  readonly endpoint: string;
  readonly requiredScopes: ReadonlyArray<string>;
  readonly idempotent: boolean;
  readonly sideEffects: ReadonlyArray<string>;
  readonly rateLimitId?: string;
  readonly timeoutMs?: number;
  readonly paginated: boolean;
  readonly paginationStrategy?: 'cursor' | 'offset' | 'page_token';
}

export interface ConnectorWebhookSpec {
  readonly id: string;
  readonly eventType: string;
  readonly description: string;
  readonly signatureVerification: {
    readonly enabled: boolean;
    readonly algorithm?: 'hmac-sha256' | 'hmac-sha1';
    readonly headerName?: string;
    readonly secretName?: string;
  };
  readonly idempotencyKey?: string;
  readonly deliveryGuarantee: 'at_least_once' | 'at_most_once' | 'exactly_once';
}

export interface ConnectorHealthCheckSpec {
  readonly endpoint: string;
  readonly method: 'GET' | 'HEAD';
  readonly expectedStatusCode: number;
  readonly timeoutMs: number;
  readonly intervalSeconds: number;
  readonly failureThreshold: number;
  readonly successThreshold: number;
}

export interface ConnectorFailureMode {
  readonly code: string;
  readonly statusCode?: number;
  readonly description: string;
  readonly probability: 'low' | 'medium' | 'high';
  readonly impact: 'low' | 'medium' | 'high' | 'critical';
  readonly recovery: 'automatic' | 'manual' | 'user_action';
  readonly recoveryDescription: string;
  readonly resultStatus: 'FAILED' | 'TIMEOUT' | 'DENIED' | 'CANCELLED';
}

export interface ConnectorTelemetrySpec {
  readonly trackRequestPayload: boolean;
  readonly trackResponsePayload: boolean;
  readonly logLevel: 'none' | 'error' | 'warn' | 'info';
  readonly emitEvents: ReadonlyArray<string>;
  readonly customMetrics: ReadonlyArray<string>;
  readonly sensitiveFields: ReadonlyArray<string>;
}

export interface ConnectorRollbackPolicy {
  readonly supported: boolean;
  readonly strategy: 'none' | 'compensating' | 'idempotent_replay' | 'manual';
  readonly timeoutMs?: number;
  readonly requiresApproval?: boolean;
  readonly description: string;
}