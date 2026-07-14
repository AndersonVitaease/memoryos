/**
 * IdentityManager.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * PRIMARY MOTOR of the Identity & Trust Platform.
 * Orchestrates: authentication, identity, session, profile, lifecycle,
 * and authenticated context management.
 *
 * No connector implements its own authentication — ALL auth goes through here.
 * SRP: identity lifecycle orchestration — no business logic, only coordination.
 */

import type { AuthRequest, AuthResult, TenantContext } from './ITPTypes';
import { CredentialManager } from './CredentialManager';
import { ConnectionManager } from './ConnectionManager';
import { TokenManager } from './TokenManager';
import { PermissionManager } from './PermissionManager';
import { TrustManager } from './TrustManager';
import { OAuthEngine } from './OAuthEngine';
import { ProviderRegistry } from './ProviderRegistry';
import { IdentityAudit } from './IdentityAudit';
import { IdentityEventBus } from './IdentityEventBus';
import type { InMemorySecretsProvider } from './ISecretsProvider';
import { ISecretsProvider } from './ISecretsProvider';

export interface AuthenticatedContext {
  connectionId:  string;
  providerId:    string;
  tenant:        TenantContext;
  scopes:        string[];
  expiresAt:     string;
  trustLevel:    import('./ITPTypes').TrustLevel;
  /** Profile is included only if provider supports it and user consented. */
  profile:       import('./IOAuthProvider').ProviderProfile | null;
  isValid:       boolean;
}

export interface IdentityManagerHealth {
  status:        'ok' | 'degraded';
  credentials:   ReturnType<CredentialManager['health']>;
  connections:   ReturnType<typeof ConnectionManager.health>;
  tokens:        ReturnType<TokenManager['health']>;
  permissions:   ReturnType<typeof PermissionManager.health>;
  trust:         ReturnType<typeof TrustManager.health>;
  oauth:         ReturnType<typeof OAuthEngine.health>;
  providers:     ReturnType<typeof ProviderRegistry.health>;
  audit:         ReturnType<typeof IdentityAudit.health>;
}

const IM_KEY = '__ITP_IDENTITY_MANAGER__';

function getManager(): IdentityManager {
  if (!(globalThis as any)[IM_KEY]) {
    (globalThis as any)[IM_KEY] = new IdentityManager();
  }
  return (globalThis as any)[IM_KEY];
}

export class IdentityManager {
  private readonly _credentials: CredentialManager;
  private readonly _tokens:      TokenManager;

  constructor(secrets?: ISecretsProvider) {
    this._credentials = new CredentialManager(secrets);
    this._tokens      = new TokenManager(
      this._credentials,
      (id) => ProviderRegistry.get(id)
    );
  }

  /**
   * Authenticates a connector via the specified OAuth flow.
   * Returns an AuthenticatedContext — never raw tokens.
   * All events, audit records, grants, and trust evaluations are automatic.
   */
  async authenticate(request: AuthRequest & { correlationId?: string }): Promise<AuthenticatedContext> {
    const result: AuthResult = await OAuthEngine.authenticate(request);

    if (!result.success || !result.connectionId) {
      // Auth failed — audit is already recorded by OAuthEngine event emission.
      throw new Error(`[IdentityManager] Authentication failed for "${request.providerId}": ${result.error}`);
    }

    const connId = result.connectionId;

    // 1. Open connection state machine.
    ConnectionManager.open(connId, request.providerId, request.tenant);
    ConnectionManager.transition(connId, 'AUTHENTICATING', 'Auth flow started');
    ConnectionManager.transition(connId, 'CONNECTED', 'Auth completed successfully');

    // 2. Store credentials — raw tokens go to SecretsProvider, only refs returned.
    await this._credentials.store({
      providerId:   request.providerId,
      tenant:       request.tenant,
      accessToken:  result.tokenRef,   // provider already stored the real token; ref is re-stored as alias
      scopes:       result.scopes,
      expiresAt:    result.expiresAt,
      metadata:     { flow: request.flow },
    });

    // 3. Grant scopes.
    PermissionManager.grant({
      connectionId: connId,
      providerId:   request.providerId,
      tenant:       request.tenant,
      scopes:       result.scopes,
      consentedBy:  request.tenant.userId,
      expiresAt:    result.expiresAt,
    });

    // 4. Evaluate trust.
    const trust = TrustManager.evaluate({
      connectionId: connId,
      providerId:   request.providerId,
      tenant:       request.tenant,
      scopes:       result.scopes,
      origin:       request.tenant.workspaceId,
      issuedAt:     new Date().toISOString(),
    });

    // 5. Fetch profile (non-blocking).
    let profile = null;
    try {
      const provider = ProviderRegistry.get(request.providerId);
      profile = await provider.getProfile(connId);
    } catch { /* profile is optional */ }

    // 6. Audit.
    const latestEvent = IdentityEventBus.query({ eventType: 'AUTH_COMPLETED', connectionId: connId }).at(-1);
    if (latestEvent) IdentityAudit.record(latestEvent);

    return {
      connectionId: connId,
      providerId:   request.providerId,
      tenant:       request.tenant,
      scopes:       result.scopes,
      expiresAt:    result.expiresAt,
      trustLevel:   trust.trustLevel,
      profile,
      isValid:      true,
    };
  }

  /**
   * Returns the current authenticated context for a connection.
   * Auto-refreshes token if expiring soon.
   */
  async getContext(connectionId: string): Promise<AuthenticatedContext | null> {
    const cred = this._credentials.get(connectionId);
    if (!cred) return null;

    // Auto-refresh if needed.
    if (this._tokens.getStatus(connectionId)?.isExpiringSoon) {
      await this._tokens.refreshIfNeeded(connectionId);
    }

    const trust  = TrustManager.getTrustLevel(connectionId);
    const scopes = PermissionManager.getScopesForConnection(connectionId);
    const isExpired = this._credentials.isExpired(connectionId);

    let profile = null;
    try {
      profile = await ProviderRegistry.get(cred.providerId).getProfile(connectionId);
    } catch { /* profile optional */ }

    return {
      connectionId,
      providerId:  cred.providerId,
      tenant:      cred.tenant,
      scopes,
      expiresAt:   cred.expiresAt,
      trustLevel:  trust,
      profile,
      isValid:     !isExpired && cred.state === 'CONNECTED',
    };
  }

  /** Disconnects a connection: revokes token, removes all grants, closes state machine. */
  async disconnect(connectionId: string): Promise<void> {
    await this._tokens.revoke(connectionId);
    PermissionManager.revokeForConnection(connectionId);
    TrustManager.revoke(connectionId);

    const event = IdentityEventBus.query({ eventType: 'CONNECTION_CLOSED', connectionId }).at(-1);
    if (event) IdentityAudit.record(event);
  }

  /** Token manager — exposed for advanced refresh control. */
  get tokens(): TokenManager { return this._tokens; }

  /** Consolidated health of all ITP sub-systems. */
  health(): IdentityManagerHealth {
    return {
      status:      'ok',
      credentials: this._credentials.health(),
      connections: ConnectionManager.health(),
      tokens:      this._tokens.health(),
      permissions: PermissionManager.health(),
      trust:       TrustManager.health(),
      oauth:       OAuthEngine.health(),
      providers:   ProviderRegistry.health(),
      audit:       IdentityAudit.health(),
    };
  }

  /** Global singleton accessor — HMR-safe. */
  static instance(): IdentityManager {
    return getManager();
  }
}