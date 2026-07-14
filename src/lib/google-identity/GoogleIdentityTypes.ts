/**
 * GoogleIdentityTypes.ts — Sprint 6.4.1
 * Type definitions for the Google Identity Provider.
 */

export type GoogleAuthState =
  | "IDLE"
  | "AUTHORIZING"
  | "EXCHANGING"
  | "FETCHING_USER"
  | "ACTIVE"
  | "REFRESHING"
  | "EXPIRED"
  | "REVOKED"
  | "ERROR";

export type GoogleHealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "EXPIRED"
  | "DISCONNECTED"
  | "UNKNOWN";

export interface GoogleUserInfo {
  id:          string;
  email:       string;
  name:        string;
  givenName:   string;
  familyName:  string;
  picture:     string;
  locale:      string;
  hd?:         string; // Hosted domain (Google Workspace)
  verified:    boolean;
}

export interface GoogleAuthSession {
  id:              string;
  state:           GoogleAuthState;
  userInfo:        GoogleUserInfo | null;
  grantedScopes:   string[];
  expiresAt:       number | null;
  createdAt:       number;
  lastRefreshedAt: number | null;
  lastValidatedAt: number;
  refreshAvailable: boolean;
  health:          GoogleHealthState;
  // Token references — NEVER raw tokens
  accessTokenRef:  string | null;
  refreshTokenRef: string | null;
}

export interface GoogleAuthorizationRequest {
  scopes:        string[];
  state:         string;
  nonce:         string;
  codeVerifier:  string;
  codeChallenge: string;
  redirectUri:   string;
  prompt?:       "none" | "consent" | "select_account";
}

export interface GoogleTokenResponse {
  // Never stored raw — only metadata
  tokenType:    string;
  expiresIn:    number;
  scope:        string;
  hasRefreshToken: boolean;
  issuedAt:     number;
}

export interface GoogleDiagnosticResult {
  sessionId:       string | null;
  runAt:           number;
  durationMs:      number;
  oauthHealthy:    boolean;
  sessionActive:   boolean;
  tokenValid:      boolean;
  scopesGranted:   string[];
  timeRemaining:   number | null;
  refreshCapable:  boolean;
  providerReachable: boolean;
  overall:         GoogleHealthState;
  issues:          string[];
  recommendations: string[];
}

export interface GoogleAuditEvent {
  id:        string;
  timestamp: number;
  event:     "LOGIN_INITIATED" | "LOGIN_COMPLETED" | "LOGIN_FAILED" | "LOGOUT"
           | "TOKEN_REFRESHED" | "TOKEN_REFRESH_FAILED" | "SESSION_EXPIRED"
           | "SESSION_RESTORED" | "SESSION_VALIDATED" | "DIAGNOSTIC_RUN"
           | "HEALTH_CHECK" | "SCOPE_VALIDATED";
  sessionId: string | null;
  scopes:    string[];
  result:    "SUCCESS" | "FAIL" | "INFO";
  durationMs: number;
  detail:    string;
}

export interface GoogleMetricSnapshot {
  totalLogins:       number;
  successfulLogins:  number;
  failedLogins:      number;
  totalRefreshes:    number;
  successfulRefreshes: number;
  failedRefreshes:   number;
  restoredSessions:  number;
  avgLoginMs:        number;
  avgRefreshMs:      number;
  activeSessions:    number;
  expiredSessions:   number;
}

export interface GooglePersistenceRecord {
  sessionId:       string;
  state:           GoogleAuthState;
  userInfo:        GoogleUserInfo | null;
  grantedScopes:   string[];
  expiresAt:       number | null;
  lastRefreshedAt: number | null;
  refreshAvailable: boolean;
  savedAt:         number;
  // NEVER contains tokens
}