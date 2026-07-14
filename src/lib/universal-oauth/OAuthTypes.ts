/**
 * OAuthTypes.ts — Sprint 6.4.0
 * Universal OAuth Platform — Core Type Definitions
 */

export type OAuthProviderName =
  | "google"
  | "microsoft"
  | "slack"
  | "notion"
  | "dropbox"
  | "hubspot"
  | "meta"
  | "github";

export type OAuthHealthState =
  | "CONNECTED"
  | "CONNECTING"
  | "REFRESHING"
  | "SESSION_EXPIRED"
  | "DISCONNECTED"
  | "ERROR";

export type OAuthGrantType =
  | "authorization_code"
  | "refresh_token"
  | "client_credentials";

export type OAuthSessionStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "REFRESHING"
  | "REVOKED"
  | "PENDING";

export type OAuthAuditEvent =
  | "SESSION_CREATED"
  | "SESSION_RESTORED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "TOKEN_REFRESHED"
  | "TOKEN_REFRESH_FAILED"
  | "SCOPE_GRANTED"
  | "SCOPE_DENIED"
  | "HEALTH_CHECK"
  | "DIAGNOSTIC_RUN"
  | "PERMISSION_VALIDATED";

export interface OAuthProviderConfig {
  name:               OAuthProviderName;
  displayName:        string;
  authorizationUrl:   string;
  tokenUrl:           string;
  refreshUrl:         string;
  userInfoUrl:        string;
  supportedScopes:    string[];
  supportedGrants:    OAuthGrantType[];
  supportsRefresh:    boolean;
  supportsRevoke:     boolean;
  iconEmoji:          string;
  color:              string;
}

export interface OAuthScope {
  id:          string;
  name:        string;
  description: string;
  required:    boolean;
  provider:    OAuthProviderName;
  service?:    string; // e.g. "calendar", "drive", "gmail"
}

export interface OAuthSession {
  id:              string;
  provider:        OAuthProviderName;
  userId:          string;
  status:          OAuthSessionStatus;
  grantedScopes:   string[];
  requiredScopes:  string[];
  createdAt:       number;
  expiresAt:       number | null;
  lastRefreshedAt: number | null;
  lastValidatedAt: number | null;
  metadata:        Record<string, string | number | boolean>;
  health:          OAuthHealthState;
}

export interface OAuthTokenRecord {
  sessionId:       string;
  provider:        OAuthProviderName;
  tokenType:       "access" | "refresh" | "id";
  // Tokens NEVER stored in plain text — only masked reference
  maskedRef:       string;
  expiresAt:       number | null;
  issuedAt:        number;
  scopes:          string[];
}

export interface OAuthPermissionMap {
  provider:   OAuthProviderName;
  service:    string;
  scopes:     string[];
  required:   boolean;
  grantedAt?: number;
}

export interface OAuthRefreshAttempt {
  sessionId:   string;
  provider:    OAuthProviderName;
  startedAt:   number;
  completedAt: number;
  durationMs:  number;
  success:     boolean;
  result:      "REFRESHED" | "FAILED" | "NOT_SUPPORTED" | "SESSION_EXPIRED";
  error?:      string;
}

export interface OAuthDiagnosticResult {
  sessionId:        string;
  provider:         OAuthProviderName;
  runAt:            number;
  durationMs:       number;
  healthState:      OAuthHealthState;
  expirationOk:     boolean;
  refreshCapable:   boolean;
  scopesValid:      boolean;
  providerReachable: boolean;
  overall:          boolean;
  issues:           string[];
}

export interface OAuthAuditEntry {
  id:        string;
  timestamp: number;
  event:     OAuthAuditEvent;
  provider:  OAuthProviderName | "SYSTEM";
  sessionId: string | null;
  scopes:    string[];
  result:    "SUCCESS" | "FAIL" | "INFO";
  durationMs: number;
  detail:    string;
  // NEVER contains: token, secret, code, password
}

export interface OAuthMetricSnapshot {
  totalSessions:        number;
  activeSessions:       number;
  expiredSessions:      number;
  totalRefreshAttempts: number;
  successfulRefreshes:  number;
  failedRefreshes:      number;
  avgAuthMs:            number;
  avgRefreshMs:         number;
  avgRecoveryMs:        number;
  providerBreakdown:    Record<string, number>;
}

export interface OAuthHealthSnapshot {
  provider:  OAuthProviderName;
  sessionId: string | null;
  state:     OAuthHealthState;
  lastCheck: number;
  detail:    string;
}

export interface OAuthPersistenceRecord {
  sessionId:       string;
  provider:        OAuthProviderName;
  status:          OAuthSessionStatus;
  grantedScopes:   string[];
  expiresAt:       number | null;
  lastRefreshedAt: number | null;
  metadata:        Record<string, string | number | boolean>;
  // NEVER contains tokens
}