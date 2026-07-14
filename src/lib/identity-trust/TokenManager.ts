/**
 * TokenManager.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Manages token lifecycle: automatic refresh, invalidation, cache,
 * synchronization, expiry, and revocation.
 * Never exposes raw tokens — delegates storage to CredentialManager.
 *
 * SRP: token lifecycle orchestration — nothing else.
 */

import type { TenantContext } from './ITPTypes';
import type { CredentialManager } from './CredentialManager';
import type { IOAuthProvider, RefreshRequest } from './IOAuthProvider';
import { ConnectionManager } from './ConnectionManager';
import { IdentityEventBus } from './IdentityEventBus';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export interface TokenStatus {
  connectionId: string;
  providerId:   string;
  isValid:      boolean;
  isExpired:    boolean;
  isExpiringSoon: boolean;
  expiresAt:    string;
  scopes:       string[];
}

export class TokenManager {
  constructor(
    private readonly _credentials: CredentialManager,
    private readonly _providerFn: (providerId: string) => IOAuthProvider
  ) {}

  /** Returns token status metadata — never the raw token. */
  getStatus(connectionId: string): TokenStatus | null {
    const cred = this._credentials.get(connectionId);
    if (!cred) return null;

    const now       = Date.now();
    const expiresMs = new Date(cred.expiresAt).getTime();
    const isExpired = now >= expiresMs;
    const isExpiringSoon = !isExpired && (expiresMs - now) < REFRESH_BUFFER_MS;

    return {
      connectionId,
      providerId:     cred.providerId,
      isValid:        !isExpired && cred.state === 'CONNECTED',
      isExpired,
      isExpiringSoon,
      expiresAt:      cred.expiresAt,
      scopes:         [...cred.scopes],
    };
  }

  /**
   * Refreshes the access token if expired or expiring soon.
   * Returns true if a refresh was performed.
   */
  async refreshIfNeeded(connectionId: string): Promise<boolean> {
    const status = this.getStatus(connectionId);
    if (!status) throw new Error(`[TokenManager] Connection not found: ${connectionId}`);
    if (!status.isExpired && !status.isExpiringSoon) return false;

    return this.forceRefresh(connectionId);
  }

  /** Forces a token refresh regardless of expiry state. */
  async forceRefresh(connectionId: string): Promise<boolean> {
    const cred = this._credentials.get(connectionId);
    if (!cred) throw new Error(`[TokenManager] Connection not found: ${connectionId}`);
    if (!cred.refreshTokenRef) {
      throw new Error(`[TokenManager] No refresh token for connection: ${connectionId}`);
    }

    ConnectionManager.transition(connectionId, 'REFRESHING', 'Token refresh initiated');

    const provider = this._providerFn(cred.providerId);
    const rawRefreshToken = await this._credentials._resolveRefreshToken(connectionId);
    if (!rawRefreshToken) {
      ConnectionManager.transition(connectionId, 'ERROR', 'Refresh token missing from secrets');
      return false;
    }

    const req: RefreshRequest = {
      connectionId,
      refreshTokenRef: rawRefreshToken,
      scopes: cred.scopes,
    };

    const result = await provider.refresh(req);

    if (!result.success) {
      ConnectionManager.transition(connectionId, 'ERROR', result.error ?? 'Refresh failed');
      IdentityEventBus.emit({
        eventType:      'AUTH_FAILED',
        providerId:     cred.providerId,
        connectionId,
        organizationId: cred.tenant.organizationId,
        actor:          'system',
        payload:        { error: result.error },
        status:         'FAILURE',
      });
      return false;
    }

    // Update credential with the new token — newTokenRef is already stored in secrets by provider.
    await this._credentials.updateAccessToken(connectionId, result.newTokenRef, result.newExpiresAt);
    ConnectionManager.transition(connectionId, 'CONNECTED', 'Token refreshed successfully');

    IdentityEventBus.emit({
      eventType:      'TOKEN_REFRESHED',
      providerId:     cred.providerId,
      connectionId,
      organizationId: cred.tenant.organizationId,
      actor:          'system',
      payload:        { newExpiresAt: result.newExpiresAt },
      status:         'SUCCESS',
    });

    return true;
  }

  /** Marks a token as expired and transitions connection state. */
  markExpired(connectionId: string): void {
    const cred = this._credentials.get(connectionId);
    if (!cred) return;

    if (ConnectionManager.canTransition(connectionId, 'TOKEN_EXPIRED')) {
      ConnectionManager.transition(connectionId, 'TOKEN_EXPIRED', 'Token manually marked expired');
    }

    IdentityEventBus.emit({
      eventType:      'TOKEN_EXPIRED',
      providerId:     cred.providerId,
      connectionId,
      organizationId: cred.tenant.organizationId,
      actor:          'system',
      payload:        { markedAt: new Date().toISOString() },
      status:         'FAILURE',
    });
  }

  /** Invalidates and revokes a token via the provider. */
  async revoke(connectionId: string): Promise<boolean> {
    const cred = this._credentials.get(connectionId);
    if (!cred) return false;

    const provider = this._providerFn(cred.providerId);
    const rawToken = await this._credentials._resolveAccessToken(connectionId);

    let success = false;
    if (rawToken) {
      const result = await provider.revoke({ connectionId, tokenRef: rawToken });
      success = result.success;
    }

    await this._credentials.revoke(connectionId);
    if (ConnectionManager.canTransition(connectionId, 'REVOKED')) {
      ConnectionManager.transition(connectionId, 'REVOKED', 'Token revoked');
    }

    IdentityEventBus.emit({
      eventType:      'TOKEN_REVOKED',
      providerId:     cred.providerId,
      connectionId,
      organizationId: cred.tenant.organizationId,
      actor:          'system',
      payload:        { success },
      status:         success ? 'SUCCESS' : 'FAILURE',
    });

    return success;
  }

  health(): { status: 'ok'; credentialStats: ReturnType<CredentialManager['stats']> } {
    return { status: 'ok', credentialStats: this._credentials.stats() };
  }
}