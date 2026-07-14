/**
 * UCPTypes.ts — Sprint 6.3.0
 * Universal Connector Platform — shared type definitions
 */

export type ConnectorCapability = "READ" | "WRITE" | "SEARCH" | "EVENTS" | "WEBHOOKS" | "SYNC";

export type ConnectorLifecycleState =
  | "REGISTERED"
  | "CONFIGURED"
  | "READY"
  | "DEGRADED"
  | "FAILED"
  | "DISCONNECTED";

export type ConnectorHealthState = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";

export interface ConnectorVersion {
  major: number;
  minor: number;
  patch: number;
  label: string; // e.g. "1.0.0"
}

export interface ConnectorCompatibility {
  runtimeVersion: string;
  workflowVersion: string;
  governanceVersion: string;
  architectureVersion: string;
  engineeringMemoryVersion: string;
  valid: boolean;
  violations: string[];
}

export interface ConnectorCapabilitySet {
  READ: boolean;
  WRITE: boolean;
  SEARCH: boolean;
  EVENTS: boolean;
  WEBHOOKS: boolean;
  SYNC: boolean;
}

export interface ConnectorHealthSnapshot {
  state: ConnectorHealthState;
  availability: number;    // 0–100
  latencyMs: number;
  errorRate: number;       // 0–100
  lastCheckedAt: number;
  message: string;
}

export interface ConnectorMetricsSnapshot {
  totalCalls: number;
  totalErrors: number;
  avgLatencyMs: number;
  availability: number;
  lastUpdatedAt: number;
}

export interface ConnectorDiagnosticsResult {
  selfTest: boolean;
  readiness: boolean;
  dependencyCheck: boolean;
  configurationValid: boolean;
  overall: boolean;
  details: string[];
  ranAt: number;
  durationMs: number;
}

export interface ConnectorAuditEntry {
  id: string;
  connectorId: string;
  event: "INSTALL" | "UPDATE" | "CONFIGURE" | "ERROR" | "LIFECYCLE_CHANGE" | "REMOVE";
  detail: string;
  timestamp: number;
}

export interface ConnectorLogEntry {
  id: string;
  connectorId: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  timestamp: number;
}

export interface ConnectorDescriptor {
  id: string;
  provider: string;
  displayName: string;
  version: ConnectorVersion;
  capabilities: ConnectorCapabilitySet;
  lifecycle: ConnectorLifecycleState;
  health: ConnectorHealthSnapshot;
  metrics: ConnectorMetricsSnapshot;
  compatibility: ConnectorCompatibility;
  registeredAt: number;
  updatedAt: number;
}

export interface UCPRuntimeStats {
  totalConnectors: number;
  readyConnectors: number;
  degradedConnectors: number;
  failedConnectors: number;
  totalCallsAllTime: number;
  runtimeStartedAt: number;
  version: string;
}