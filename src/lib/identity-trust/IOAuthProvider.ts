/**
 * IOAuthProvider.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * The ONE contract all current and future OAuth providers must implement.
 * No provider may implement its own authentication logic outside this interface.
 *
 * Principles: SRP · Interface Segregation · Least Privilege · Zero Trust
 */

import type {
  OAuthFlow,
  GrantType,
  ProviderCategory,
  AuthRequest,
  AuthResult,
  TrustLevel,
} from './ITPTypes';

// ─── Provider Capabilities ────────────────────────────────────────────────────

export interface ProviderCapabilities {
  supportsRefresh:       boolean;
  supportsRevoke:        boolean;
  supportsPKCE:          boolean;
  supportsDeviceFlow:    boolean;
  supportsIntrospection: boolean;
  supportsOpenIDConnect: boolean;
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

export interface RefreshRequest {
  connectionId:    string;
  refreshTokenRef: string; // opaque reference — resolved internally via SecretsProvider
  scopes?:         string[];
}

export interface RefreshResult {
  success:        boolean;
  connectionId:   string;
  newTokenRef:    string;
  newExpiresAt:   string;
  error?:         string;
}

// ─── Revocation ───────────────────────────────────────────────────────────────

export interface RevokeRequest {
  connectionId: string;
  tokenRef:     string;
}

export interface RevokeResult {
  success:      boolean;
  connectionId: string;
  revokedAt:    string;
  error?:       string;
}

// ─── Token Validation ─────────────────────────────────────────────────────────

export interface ValidateRequest {
  connectionId: string;
  tokenRef:     string;
}

export interface ValidateResult {
  valid:        boolean;
  connectionId: string;
  scopes:       string[];
  expiresAt:    string;
  trustLevel:   TrustLevel;
  error?:       string;
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export interface ProviderProfile {
  id:            string;
  email?:        string;
  displayName?:  string;
  avatarUrl?:    string;
  rawClaims:     Record<string, unknown>;
}

// ─── Provider Health ──────────────────────────────────────────────────────────

export interface ProviderHealthReport {
  providerId:   string;
  status:       'healthy' | 'degraded' | 'unavailable';
  latencyMs:    number;
  checkedAt:    string;
  details:      Record<string, unknown>;
}

// ─── IOAuthProvider — The Universal Contract ──────────────────────────────────

export interface IOAuthProvider {
  /** Stable provider identifier — must be globally unique across all providers. */
  readonly providerId: string;
  readonly name:       string;
  readonly version:    string;
  readonly category:   ProviderCategory;
  readonly capabilities: ProviderCapabilities;

  /**
   * Returns true if this provider can handle the given flow and grant type.
   * Called by OAuthEngine before dispatching.
   */
  supports(flow: OAuthFlow, grantType: GrantType): boolean;

  /**
   * Initiates authentication for the given request.
   * Returns an AuthResult — the raw token is stored internally via SecretsProvider.
   */
  authenticate(request: AuthRequest): Promise<AuthResult>;

  /**
   * Refreshes an access token using the stored refresh token reference.
   * Returns a RefreshResult — never exposes the raw token.
   */
  refresh(request: RefreshRequest): Promise<RefreshResult>;

  /**
   * Revokes all tokens for the given connection.
   */
  revoke(request: RevokeRequest): Promise<RevokeResult>;

  /**
   * Validates whether the current token reference is still valid.
   */
  validate(request: ValidateRequest): Promise<ValidateResult>;

  /**
   * Returns the list of scopes currently granted for a connection.
   */
  getScopes(connectionId: string): Promise<string[]>;

  /**
   * Returns the authenticated user's profile (if the provider supports it).
   * Never returns raw token data — only claims and profile fields.
   */
  getProfile(connectionId: string): Promise<ProviderProfile | null>;

  /**
   * Returns the current health status of this provider's external endpoint.
   */
  health(): Promise<ProviderHealthReport>;
}