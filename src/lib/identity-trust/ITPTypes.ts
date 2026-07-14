/**
 * ITPTypes.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Single source of truth for all types, interfaces, enums, and event contracts
 * of the Identity & Trust Platform (ITP).
 *
 * Principles: SRP · Immutability · Zero Circular Dependencies · Multi-Tenant Ready
 */

// ─── OAuth Flow Types ─────────────────────────────────────────────────────────

export type OAuthFlow =
  | 'authorization_code'
  | 'authorization_code_pkce'
  | 'client_credentials'
  | 'device_authorization'
  | 'refresh_token';

export type GrantType =
  | 'authorization_code'
  | 'client_credentials'
  | 'refresh_token'
  | 'urn:ietf:params:oauth:grant-type:device_code';

export type ProviderCategory =
  | 'productivity'
  | 'communication'
  | 'storage'
  | 'crm'
  | 'development'
  | 'identity'
  | 'social'
  | 'analytics'
  | 'other';

// ─── Connection State Machine ─────────────────────────────────────────────────

export type ConnectionState =
  | 'NOT_CONNECTED'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'REFRESHING'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

/** Valid transitions — machine rejects any unlisted pair. */
export const CONNECTION_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  NOT_CONNECTED:  ['AUTHENTICATING', 'ERROR'],
  AUTHENTICATING: ['CONNECTED', 'ERROR', 'NOT_CONNECTED'],
  CONNECTED:      ['TOKEN_EXPIRED', 'REFRESHING', 'REVOKED', 'DISCONNECTED', 'ERROR'],
  TOKEN_EXPIRED:  ['REFRESHING', 'REVOKED', 'DISCONNECTED', 'ERROR'],
  REFRESHING:     ['CONNECTED', 'REVOKED', 'ERROR'],
  REVOKED:        ['NOT_CONNECTED'],
  DISCONNECTED:   ['AUTHENTICATING', 'NOT_CONNECTED'],
  ERROR:          ['NOT_CONNECTED', 'AUTHENTICATING'],
};

// ─── Trust Classification ─────────────────────────────────────────────────────

export type TrustLevel = 'untrusted' | 'low' | 'medium' | 'high' | 'verified';
export type RiskClassification = 'critical' | 'high' | 'medium' | 'low' | 'minimal';

// ─── Identity Events ──────────────────────────────────────────────────────────

export type IdentityEventType =
  | 'PROVIDER_REGISTERED'
  | 'AUTH_STARTED'
  | 'AUTH_COMPLETED'
  | 'AUTH_FAILED'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'CONNECTION_OPENED'
  | 'CONNECTION_CLOSED'
  | 'SCOPES_UPDATED';

export interface IdentityEvent {
  id:             string;
  timestamp:      string;
  providerId:     string;
  connectionId:   string;
  requestId:      string;
  correlationId:  string;
  organizationId: string;
  actor:          string;
  eventType:      IdentityEventType;
  payload:        Record<string, unknown>;
  status:         'SUCCESS' | 'FAILURE' | 'PENDING';
}

// ─── Multi-Tenant Context ─────────────────────────────────────────────────────

export interface TenantContext {
  organizationId: string;
  workspaceId:    string;
  connectorId:    string;
  accountId:      string;
  userId:         string;
}

// ─── Provider Definition ──────────────────────────────────────────────────────

export interface OAuthProviderDefinition {
  id:                  string;
  name:                string;
  version:             string;
  category:            ProviderCategory;
  icon:                string;
  capabilities:        string[];
  supportedFlows:      OAuthFlow[];
  supportedGrantTypes: GrantType[];
  supportedScopes:     string[];
  documentation:       string;
  health:              'healthy' | 'degraded' | 'unavailable' | 'unknown';
  registeredAt:        string;
  metadata:            Record<string, unknown>;
}

// ─── Auth Request / Result ────────────────────────────────────────────────────

export interface AuthRequest {
  providerId:    string;
  flow:          OAuthFlow;
  scopes:        string[];
  tenant:        TenantContext;
  redirectUri?:  string;
  codeVerifier?: string;   // PKCE
  deviceCode?:   string;   // Device flow
  metadata?:     Record<string, unknown>;
}

export interface AuthResult {
  success:      boolean;
  connectionId: string;
  providerId:   string;
  tenant:       TenantContext;
  scopes:       string[];
  expiresAt:    string;
  error?:       string;
  /** Token is intentionally opaque — never expose raw value. */
  tokenRef:     string;
}

// ─── Credential Record ────────────────────────────────────────────────────────

/** Internal credential — tokens are NEVER exposed via public API. */
export interface CredentialRecord {
  id:              string;
  connectionId:    string;
  providerId:      string;
  tenant:          TenantContext;
  /** Stored as opaque reference — raw value is in SecretsProvider only. */
  accessTokenRef:  string;
  refreshTokenRef: string | null;
  scopes:          string[];
  expiresAt:       string;
  issuedAt:        string;
  state:           ConnectionState;
  metadata:        Record<string, unknown>;
}

// ─── Permission Grant ─────────────────────────────────────────────────────────

export interface ScopeGrant {
  id:           string;
  connectionId: string;
  providerId:   string;
  tenant:       TenantContext;
  scopes:       string[];
  grantedAt:    string;
  expiresAt?:   string;
  consentedBy:  string;
  status:       'active' | 'pending' | 'revoked' | 'expired';
}

// ─── Trust Record ─────────────────────────────────────────────────────────────

export interface TrustRecord {
  connectionId:     string;
  providerId:       string;
  tenant:           TenantContext;
  trustLevel:       TrustLevel;
  riskClassification: RiskClassification;
  verifiedAt:       string;
  validUntil:       string;
  integrityHash:    string;
  origin:           string;
  reasons:          string[];
}

// ─── Secrets ──────────────────────────────────────────────────────────────────

export type SecretBackend =
  | 'hashicorp_vault'
  | 'aws_secrets_manager'
  | 'azure_key_vault'
  | 'google_secret_manager'
  | 'local_encrypted'
  | 'memory'; // for testing only

// ─── Identity Metrics ─────────────────────────────────────────────────────────

export interface IdentityMetrics {
  totalProviders:       number;
  activeConnections:    number;
  authAttempts:         number;
  authSuccesses:        number;
  authFailures:         number;
  tokenRefreshes:       number;
  tokenRevocations:     number;
  tokenExpirations:     number;
  avgAuthLatencyMs:     number;
  connectionsByProvider: Record<string, number>;
}