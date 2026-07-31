/**
 * ConnectionManagerTypes.ts — Phase 5.7.0 · EF-57.1
 * MemoryOS Production Validation · 2026-07-13
 */

let _seq = 0;
export function makeCMId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_seq).toString(36)}`;
}

// ── Connector State ───────────────────────────────────────────────────────────

export type ConnectorState =
  | "CONNECTED"
  | "DISCONNECTED"
  | "AUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "UNAVAILABLE"
  | "ERROR";

// ── Connector Identity ────────────────────────────────────────────────────────

export type ConnectorId = "github" | "base44";

export interface ConnectorDescriptor {
  id:           ConnectorId;
  name:         string;
  version:      string;
  capabilities: string[];
  authMethod:   "token" | "oauth" | "api_key" | "session";
  description:  string;
}

// ── Auth Token ────────────────────────────────────────────────────────────────

export interface AuthToken {
  connectorId:  ConnectorId;
  token:        string;
  tokenType:    "bearer" | "pat" | "api_key" | "session";
  expiresAt:    number | null;   // null = non-expiring
  scopes:       string[];
  acquiredAt:   number;
  issuedBy:     string;
}

// ── Connector Registration ────────────────────────────────────────────────────

export interface ConnectorRegistration {
  id:             string;
  connectorId:    ConnectorId;
  descriptor:     ConnectorDescriptor;
  state:          ConnectorState;
  token:          AuthToken | null;
  health:         ConnectorHealth;
  lastSync:       number | null;
  lastSuccess:    number | null;
  lastFailure:    number | null;
  errorMessage:   string | null;
  registeredAt:   number;
  discoveredData: DiscoveredData | null;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface ConnectorHealth {
  status:       "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  authStatus:   ConnectorState;
  latencyMs:    number | null;
  healthScore:  number;           // 0–100
  availability: number;           // 0–1
  lastCheckedAt: number | null;
  errors:       string[];
  warnings:     string[];
}

// ── Discovered Data ───────────────────────────────────────────────────────────

export interface DiscoveredData {
  connectorId:   ConnectorId;
  discoveredAt:  number;
  resources:     DiscoveredResource[];
  summary:       string;
}

export interface DiscoveredResource {
  type:  string;
  count: number;
  items: string[];
}

// ── Auth Result ───────────────────────────────────────────────────────────────

export interface AuthResult {
  success:    boolean;
  connectorId: ConnectorId;
  state:      ConnectorState;
  token:      AuthToken | null;
  error:      string | null;
  durationMs: number;
  discoveredData: DiscoveredData | null;
}

// ── Health Check Result ───────────────────────────────────────────────────────

export interface HealthCheckResult {
  connectorId:  ConnectorId;
  health:       ConnectorHealth;
  durationMs:   number;
  timestamp:    number;
}

// ── Manager Diagnostics ───────────────────────────────────────────────────────

export interface ManagerDiagnostics {
  id:            string;
  generatedAt:   number;
  connectors:    ConnectorRegistration[];
  totalConnectors: number;
  connectedCount:  number;
  healthyCount:    number;
  overallHealth:   number;
  lastFullSync:    number | null;
}