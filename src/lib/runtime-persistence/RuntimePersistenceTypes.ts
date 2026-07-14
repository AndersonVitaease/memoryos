/**
 * RuntimePersistenceTypes.ts — Sprint 6.3.4
 * Shared types for Persistent Runtime & Connector Sessions.
 * SECURITY: No tokens, secrets, passwords, or credentials are ever stored here.
 */

export type ConnectorSessionStatus =
  | "CONNECTED"
  | "RESTORING"
  | "SESSION_EXPIRED"
  | "DISCONNECTED"
  | "ERROR"
  | "DISABLED";

export type BootstrapPhase =
  | "BOOT"
  | "RUNTIME"
  | "RESTORE_SESSIONS"
  | "WARMUP"
  | "HEALTH"
  | "KNOWLEDGE_GRAPH"
  | "ACCEPTANCE"
  | "DASHBOARD"
  | "READY"
  | "FAILED";

export type HealthCheckStatus = "PASS" | "FAIL" | "SKIP" | "DEGRADED";

export interface ConnectorSessionRecord {
  /** Unique session id — never contains credentials */
  id:           string;
  connectorId:  string;
  provider:     string;
  displayName:  string;
  status:       ConnectorSessionStatus;
  statusReason: string;
  capabilities: string[];
  health:       "HEALTHY" | "DEGRADED" | "UNKNOWN";
  metadata:     Record<string, string | number | boolean>;
  createdAt:    number;
  updatedAt:    number;
  expiresAt:    number | null; // null = no expiry tracked (re-check at restore)
  /** NEVER store token, secret, password, refreshToken, clientSecret */
}

export interface SerializedSession {
  version:   number;
  sessions:  ConnectorSessionRecord[];
  savedAt:   number;
}

export interface RestoreResult {
  total:     number;
  restored:  number;
  expired:   number;
  failed:    number;
  sessions:  ConnectorSessionRecord[];
}

export interface HealthCheckResult {
  component:  string;
  status:     HealthCheckStatus;
  detail:     string;
  durationMs: number;
}

export interface BootstrapReport {
  id:         string;
  startedAt:  number;
  completedAt: number;
  durationMs: number;
  phase:      BootstrapPhase;
  success:    boolean;
  phases:     { phase: BootstrapPhase; status: "PASS" | "FAIL" | "SKIP"; durationMs: number; detail: string }[];
  healthChecks: HealthCheckResult[];
  restoreResult: RestoreResult | null;
  errors:     string[];
}

export interface ReconnectAttempt {
  id:           string;
  connectorId:  string;
  provider:     string;
  triggeredAt:  number;
  result:       "RECONNECTED" | "SESSION_EXPIRED" | "FAILED" | "SKIPPED";
  detail:       string;
  durationMs:   number;
}

export interface PersistenceAuditEntry {
  id:         string;
  actor:      string;
  action:     string;
  target:     string;
  result:     string;
  detail:     string;
  timestamp:  number;
}