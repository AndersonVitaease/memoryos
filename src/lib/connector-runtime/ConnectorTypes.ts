// Connector Runtime — Types
// Foundation v1.0 · Engineering First

export type ConnectorStatus = "unregistered" | "registered" | "loading" | "ready" | "executing" | "error" | "shutdown";
export type ConnectorHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

// ── Context ──────────────────────────────────────────────────────────────────

export interface ConnectorContext {
  executionId: string;
  userId: string;
  projectId: string;
  sessionId: string;
  goalId?: string;
  capabilityId?: string;
  identityContext?: Record<string, unknown>;
}

// ── Result ───────────────────────────────────────────────────────────────────

export interface ConnectorResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  connectorId: string;
  executionId: string;
  logs: ConnectorLog[];
}

export interface ConnectorLog {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export interface ConnectorMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  capabilities: string[];
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface ConnectorHealthReport {
  status: ConnectorHealthStatus;
  connectorId: string;
  checkedAt: number;
  details?: string;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface ConnectorMetrics {
  connectorId: string;
  totalExecutions: number;
  totalFailures: number;
  avgDurationMs: number;
  lastExecutedAt: number | null;
  loadTimeMs: number | null;
}

// ── Execution Log ─────────────────────────────────────────────────────────────

export interface ExecutionRecord {
  executionId: string;
  connectorId: string;
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: "success" | "failure";
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeExecutionId(): string {
  return `exec_${Date.now()}_${(++_seq).toString(36)}`;
}

export function makeLog(level: ConnectorLog["level"], message: string): ConnectorLog {
  return { timestamp: Date.now(), level, message };
}