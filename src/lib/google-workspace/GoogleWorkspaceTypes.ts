/**
 * GoogleWorkspaceTypes.ts — Engineering Sprint 7.0
 * Shared type definitions for the Google Workspace Connector Suite.
 * Zero dependencies on Core layers.
 */

// ── Service identifiers ───────────────────────────────────────────────────────

export type GWSServiceId =
  | "gmail"
  | "drive"
  | "calendar"
  | "contacts"
  | "docs"
  | "sheets"
  | "tasks"
  | "keep";

export const GWS_SERVICE_LABELS: Record<GWSServiceId, string> = {
  gmail:    "Gmail",
  drive:    "Google Drive",
  calendar: "Google Calendar",
  contacts: "Google Contacts",
  docs:     "Google Docs",
  sheets:   "Google Sheets",
  tasks:    "Google Tasks",
  keep:     "Google Keep",
};

// ── Token ─────────────────────────────────────────────────────────────────────

export interface GWSToken {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;     // epoch ms
  scopes:       string[];
  email:        string;
  userId:       string;
}

// ── Capability ────────────────────────────────────────────────────────────────

export interface GWSCapability {
  id:          string;
  serviceId:   GWSServiceId;
  name:        string;
  description: string;
  requiredScopes: string[];
  handler:     (ctx: GWSCapabilityContext) => Promise<GWSCapabilityResult>;
}

export interface GWSCapabilityContext {
  serviceId: GWSServiceId;
  token:     GWSToken;
  params:    Record<string, unknown>;
  userId:    string;
  requestId: string;
}

export interface GWSCapabilityResult {
  success: boolean;
  data:    unknown;
  error:   string | null;
  durationMs: number;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface GWSAuditEntry {
  id:         string;
  serviceId:  GWSServiceId;
  capability: string;
  userId:     string;
  requestId:  string;
  startedAt:  number;
  completedAt: number;
  durationMs: number;
  success:    boolean;
  errorCode:  string | null;
  errorMsg:   string | null;
}

// ── Rate limit ────────────────────────────────────────────────────────────────

export interface GWSQuota {
  serviceId:       GWSServiceId;
  requestsPerMin:  number;
  requestsPerDay:  number;
  currentMinCount: number;
  currentDayCount: number;
  lastResetMin:    number;
  lastResetDay:    number;
}

// ── Permission ────────────────────────────────────────────────────────────────

export interface GWSPermissionCheck {
  serviceId:      GWSServiceId;
  requiredScopes: string[];
  grantedScopes:  string[];
  allowed:        boolean;
  missing:        string[];
}

// ── Error ─────────────────────────────────────────────────────────────────────

export type GWSErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "TOKEN_EXPIRED"
  | "INSUFFICIENT_SCOPES"
  | "UNKNOWN";

export interface GWSError {
  code:       GWSErrorCode;
  message:    string;
  retryable:  boolean;
  retryAfter: number | null;  // ms
  raw:        unknown;
}