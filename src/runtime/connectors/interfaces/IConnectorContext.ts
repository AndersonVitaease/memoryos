/**
 * IConnectorContext.ts
 * Connector Runtime Foundation — EF-31
 * Engineering First · Sprint EF-31
 * Date: 2026-07-12 · Version: 1.0.0 · Status: Official
 */

export interface IConnectorContext {
  readonly correlationId: string;
  readonly executionId: string;
  readonly userId: string;
  readonly projectId?: string;
  readonly sessionId?: string;
  readonly goalId?: string;
  readonly credentials: Readonly<ConnectorCredentials>;
  readonly grantedScopes: ReadonlyArray<string>;
  readonly grantedPermissions: ReadonlyArray<string>;
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: string;
}

export interface ConnectorCredentials {
  readonly type: 'oauth2' | 'apikey' | 'basic' | 'bearer' | 'none';
  // Tokens are opaque references — never expose raw values
  readonly tokenRef?: string;     // reference key to retrieve token from secure store
  readonly apiKeyRef?: string;    // reference key to retrieve API key from secure store
  readonly usernameRef?: string;
  readonly passwordRef?: string;
  readonly expiresAt?: string;    // ISO8601 UTC
  readonly refreshTokenRef?: string;
}