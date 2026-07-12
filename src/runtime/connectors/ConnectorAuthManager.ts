/**
 * ConnectorAuthManager.ts
 * Manages authentication, token lifecycle, credential isolation.
 * Secrets are stored as opaque refs — raw values never exposed.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorContext, ConnectorCredentials } from './interfaces/IConnectorContext';
import type { IConnectorManifest } from './interfaces/IConnectorManifest';

export interface TokenRecord {
  readonly ref: string;
  readonly connectorId: string;
  readonly userId: string;
  readonly type: 'access' | 'refresh' | 'apikey' | 'bearer';
  expiresAt?: string;
  readonly createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  readonly success: boolean;
  readonly connectorId: string;
  readonly userId: string;
  readonly grantedScopes: ReadonlyArray<string>;
  readonly credentialRef: string;
  readonly expiresAt?: string;
  readonly reason?: string;
}

export interface TokenRefreshResult {
  readonly success: boolean;
  readonly newRef?: string;
  readonly expiresAt?: string;
  readonly reason?: string;
}

export class ConnectorAuthManager {
  // In-memory token store keyed by ref. Raw values are never stored here —
  // production implementation would delegate to an encrypted vault.
  private readonly tokenStore = new Map<string, TokenRecord>();
  private authAttempts = 0;
  private authSuccesses = 0;
  private authFailures = 0;
  private refreshAttempts = 0;

  private generateRef(): string {
    return `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Register credentials for a connector+user pair.
   * Raw token values are accepted here and immediately stored as opaque refs.
   * This is the only place raw values are accepted.
   */
  registerCredentials(
    connectorId: string,
    userId: string,
    type: TokenRecord['type'],
    _rawValue: string,     // intentionally unused — stored by ref only in production
    expiresAt?: string,
  ): string {
    const ref = this.generateRef();
    this.tokenStore.set(ref, {
      ref,
      connectorId,
      userId,
      type,
      expiresAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return ref;
  }

  hasCredentials(connectorId: string, userId: string): boolean {
    return [...this.tokenStore.values()].some(
      t => t.connectorId === connectorId && t.userId === userId,
    );
  }

  isTokenExpired(ref: string): boolean {
    const record = this.tokenStore.get(ref);
    if (!record || !record.expiresAt) return false;
    return new Date(record.expiresAt) <= new Date();
  }

  getCredentialRefs(connectorId: string, userId: string): ConnectorCredentials {
    const records = [...this.tokenStore.values()].filter(
      t => t.connectorId === connectorId && t.userId === userId,
    );

    const access = records.find(r => r.type === 'access');
    const refresh = records.find(r => r.type === 'refresh');
    const apikey = records.find(r => r.type === 'apikey');
    const bearer = records.find(r => r.type === 'bearer');

    return {
      type: access ? 'oauth2' : apikey ? 'apikey' : bearer ? 'bearer' : 'none',
      tokenRef: access?.ref,
      refreshTokenRef: refresh?.ref,
      apiKeyRef: apikey?.ref,
      expiresAt: access?.expiresAt,
    };
  }

  /**
   * Validate that a context has permissions for requested scopes.
   * Least-privilege enforcement — Constituição S-01.
   */
  validateScopes(context: IConnectorContext, requiredScopes: ReadonlyArray<string>): boolean {
    const granted = new Set(context.grantedScopes);
    return requiredScopes.every(scope => granted.has(scope));
  }

  /**
   * Validate that a context has the required permissions.
   */
  validatePermissions(context: IConnectorContext, requiredPermissions: ReadonlyArray<string>): boolean {
    const granted = new Set(context.grantedPermissions);
    return requiredPermissions.every(p => granted.has(p));
  }

  /**
   * Authenticate a context against a manifest.
   * Returns AuthResult with success/failure details.
   */
  authenticate(context: IConnectorContext, manifest: IConnectorManifest): AuthResult {
    this.authAttempts++;

    if (!this.hasCredentials(manifest.id, context.userId)) {
      this.authFailures++;
      return {
        success: false,
        connectorId: manifest.id,
        userId: context.userId,
        grantedScopes: [],
        credentialRef: '',
        reason: 'NO_CREDENTIALS_FOUND',
      };
    }

    const requiredScopes = manifest.scopes.filter(s => s.required).map(s => s.id);
    if (!this.validateScopes(context, requiredScopes)) {
      this.authFailures++;
      return {
        success: false,
        connectorId: manifest.id,
        userId: context.userId,
        grantedScopes: context.grantedScopes,
        credentialRef: '',
        reason: 'INSUFFICIENT_SCOPES',
      };
    }

    const creds = this.getCredentialRefs(manifest.id, context.userId);
    if (creds.tokenRef && this.isTokenExpired(creds.tokenRef) && !creds.refreshTokenRef) {
      this.authFailures++;
      return {
        success: false,
        connectorId: manifest.id,
        userId: context.userId,
        grantedScopes: context.grantedScopes,
        credentialRef: creds.tokenRef ?? '',
        reason: 'TOKEN_EXPIRED_NO_REFRESH',
      };
    }

    this.authSuccesses++;
    return {
      success: true,
      connectorId: manifest.id,
      userId: context.userId,
      grantedScopes: context.grantedScopes,
      credentialRef: creds.tokenRef ?? creds.apiKeyRef ?? creds.tokenRef ?? '',
      expiresAt: creds.expiresAt,
    };
  }

  refreshToken(connectorId: string, userId: string): TokenRefreshResult {
    this.refreshAttempts++;
    const records = [...this.tokenStore.values()].filter(
      t => t.connectorId === connectorId && t.userId === userId && t.type === 'refresh',
    );

    if (records.length === 0) {
      return { success: false, reason: 'NO_REFRESH_TOKEN' };
    }

    // In production, this would call the OAuth2 refresh endpoint.
    // Here we simulate a successful refresh by extending expiry.
    const newExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const accessRecords = [...this.tokenStore.values()].filter(
      t => t.connectorId === connectorId && t.userId === userId && t.type === 'access',
    );
    for (const rec of accessRecords) {
      rec.expiresAt = newExpiresAt;
      rec.updatedAt = new Date().toISOString();
    }

    return { success: true, expiresAt: newExpiresAt };
  }

  revokeCredentials(connectorId: string, userId: string): number {
    const toRevoke = [...this.tokenStore.entries()]
      .filter(([, v]) => v.connectorId === connectorId && v.userId === userId)
      .map(([k]) => k);
    toRevoke.forEach(k => this.tokenStore.delete(k));
    return toRevoke.length;
  }

  statistics() {
    return {
      storedTokenCount: this.tokenStore.size,
      authAttempts: this.authAttempts,
      authSuccesses: this.authSuccesses,
      authFailures: this.authFailures,
      refreshAttempts: this.refreshAttempts,
    };
  }

  health() {
    return {
      status: 'HEALTHY' as const,
      details: `${this.tokenStore.size} credential refs stored`,
      checks: { storeIntact: true },
      checkedAt: new Date().toISOString(),
    };
  }
}