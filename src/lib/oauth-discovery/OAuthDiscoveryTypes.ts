/**
 * OAuthDiscoveryTypes.ts — Sprint 6.4.1A
 * Core types for the OAuth Configuration & Discovery system.
 */

export type DiscoveryProviderStatus =
  | "FULLY_CONFIGURED"
  | "PARTIALLY_CONFIGURED"
  | "MISSING_CREDENTIALS"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export type DiscoveryHealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "MISCONFIGURED"
  | "DISCONNECTED"
  | "UNKNOWN";

export type DiscoverySecretStatus = "CONFIGURED" | "MISSING" | "UNKNOWN";

export interface OAuthRedirectConfig {
  provider:         string;
  redirectUri:      string;
  callbackUri:      string;
  authorizedOrigins: string[];
  callbackPath:     string;
  redirectPath:     string;
}

export interface OAuthProviderDiscovery {
  provider:           string;
  displayName:        string;
  iconEmoji:          string;
  status:             DiscoveryProviderStatus;
  health:             DiscoveryHealthState;
  // Credentials — status only, NEVER values
  clientIdStatus:     DiscoverySecretStatus;
  clientSecretStatus: DiscoverySecretStatus;
  // URLs
  authorizationUrl:   string;
  tokenUrl:           string;
  userInfoUrl:        string;
  redirectUri:        string;
  callbackUri:        string;
  authorizedOrigins:  string[];
  // Scopes
  requiredScopes:     string[];
  configuredScopes:   string[];
  missingScopes:      string[];
  // Capabilities
  supportsRefresh:    boolean;
  supportsPKCE:       boolean;
  supportsRevoke:     boolean;
  sessionPersisted:   boolean;
  autoReconnect:      boolean;
  // Runtime state
  lastLoginAt:        number | null;
  lastErrorAt:        number | null;
  lastError:          string | null;
  tokenExpiresAt:     number | null;
  activeSessions:     number;
  // Missing items
  missingConfig:      string[];
  // Provider-specific
  requiredApis?:      string[]; // e.g. Google APIs to enable
  notes:              string[];
}

export interface OAuthDiscoveryReport {
  id:              string;
  generatedAt:     number;
  durationMs:      number;
  providers:       OAuthProviderDiscovery[];
  totalProviders:  number;
  fullyConfigured: number;
  partial:         number;
  missing:         number;
  healthy:         number;
  degraded:        number;
  issues:          string[];
  recommendations: string[];
}

export interface OAuthConfigValidation {
  provider:  string;
  valid:     boolean;
  checks:    { label: string; pass: boolean; detail: string }[];
  score:     number; // 0–100
  blockers:  string[];
  warnings:  string[];
}

export interface OAuthDiscoveryAuditEvent {
  id:        string;
  timestamp: number;
  event:     "DISCOVERY_RUN" | "PROVIDER_VALIDATED" | "CONFIG_CHANGED" | "HEALTH_CHECK" | "REDIRECT_COPIED" | "DIAGNOSTIC_RUN";
  provider:  string | null;
  result:    "SUCCESS" | "FAIL" | "INFO";
  detail:    string;
  durationMs: number;
}

export interface OAuthDiscoveryMetrics {
  totalDiscoveryRuns:   number;
  lastRunAt:            number | null;
  avgRunMs:             number;
  providersTracked:     number;
  fullyConfiguredCount: number;
  healthyCount:         number;
  totalValidations:     number;
  validationPassRate:   number;
}