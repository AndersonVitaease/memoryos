/**
 * GoogleOAuthProvider.ts
 * Sprint 6.4.2 — Google Workspace Reference Connector
 *
 * Implements IOAuthProvider for Google OAuth 2.0 (PKCE flow).
 * Registers in the Identity Platform's ProviderRegistry.
 * NO token storage — delegates 100% to ISecretsProvider via CredentialManager.
 *
 * This is a SIMULATION provider for validation.
 * Real production implementation requires Google OAuth credentials from environment.
 *
 * Principles: Zero Trust · Least Privilege · SRP
 */

import type { IOAuthProvider, ProviderCapabilities, RefreshRequest, RefreshResult, RevokeRequest, RevokeResult, ValidateRequest, ValidateResult, ProviderProfile, ProviderHealthReport } from '../../identity-trust/IOAuthProvider';
import type { OAuthFlow, GrantType, AuthRequest, AuthResult } from '../../identity-trust/ITPTypes';
import { GW_SCOPES } from './GWTypes';

export const GOOGLE_PROVIDER_ID = 'google-workspace';

let _connSeq = 0;
function makeConnId(): string { return `gw-conn-${Date.now()}-${++_connSeq}`; }

export class GoogleOAuthProvider implements IOAuthProvider {
  readonly providerId = GOOGLE_PROVIDER_ID;
  readonly name       = 'Google Workspace';
  readonly version    = '1.0.0';
  readonly category   = 'productivity' as const;

  readonly capabilities: ProviderCapabilities = {
    supportsRefresh:       true,
    supportsRevoke:        true,
    supportsPKCE:          true,
    supportsDeviceFlow:    false,
    supportsIntrospection: false,
    supportsOpenIDConnect: true,
  };

  supports(flow: OAuthFlow, grantType: GrantType): boolean {
    return (
      (flow === 'authorization_code_pkce' && grantType === 'authorization_code') ||
      (flow === 'refresh_token'           && grantType === 'refresh_token')
    );
  }

  /**
   * Simulates Google OAuth authentication.
   * In production: performs PKCE Authorization Code flow with accounts.google.com.
   * Token storage is handled by CredentialManager — never stored here.
   */
  async authenticate(request: AuthRequest): Promise<AuthResult> {
    // Simulate latency of a real OAuth round-trip.
    await delay(10);

    const connId    = makeConnId();
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

    // In production: exchange code for tokens, store via CredentialManager.
    // The tokenRef is an opaque reference — never the raw token.
    return {
      success:      true,
      connectionId: connId,
      providerId:   this.providerId,
      tenant:       request.tenant,
      scopes:       request.scopes,
      expiresAt,
      tokenRef:     `gw-tok-${connId}`,
    };
  }

  async refresh(request: RefreshRequest): Promise<RefreshResult> {
    await delay(5);
    return {
      success:      true,
      connectionId: request.connectionId,
      newTokenRef:  `gw-tok-refreshed-${Date.now()}`,
      newExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
  }

  async revoke(request: RevokeRequest): Promise<RevokeResult> {
    await delay(5);
    // In production: POST https://oauth2.googleapis.com/revoke
    return { success: true, connectionId: request.connectionId, revokedAt: new Date().toISOString() };
  }

  async validate(request: ValidateRequest): Promise<ValidateResult> {
    await delay(3);
    return {
      valid:        true,
      connectionId: request.connectionId,
      scopes:       [GW_SCOPES.GMAIL_READONLY, GW_SCOPES.CALENDAR_READONLY, GW_SCOPES.PROFILE],
      expiresAt:    new Date(Date.now() + 3_600_000).toISOString(),
      trustLevel:   'high',
    };
  }

  async getScopes(connectionId: string): Promise<string[]> {
    return [GW_SCOPES.GMAIL_READONLY, GW_SCOPES.CALENDAR_READONLY, GW_SCOPES.DRIVE_READONLY, GW_SCOPES.PROFILE, GW_SCOPES.EMAIL];
  }

  async getProfile(connectionId: string): Promise<ProviderProfile> {
    await delay(5);
    // In production: GET https://www.googleapis.com/oauth2/v2/userinfo
    return {
      id:          `gw-user-${connectionId}`,
      email:       `user-${connectionId}@gmail.com`,
      displayName: `Google User (${connectionId})`,
      avatarUrl:   '',
      rawClaims:   { iss: 'accounts.google.com', aud: 'google-workspace-connector' },
    };
  }

  async health(): Promise<ProviderHealthReport> {
    const t0 = Date.now();
    await delay(3);
    // In production: GET https://accounts.google.com/.well-known/openid-configuration
    return {
      providerId: this.providerId,
      status:     'healthy',
      latencyMs:  Date.now() - t0,
      checkedAt:  new Date().toISOString(),
      details:    { endpoint: 'accounts.google.com', oidcDiscovery: true },
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}