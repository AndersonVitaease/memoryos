// Connector Runtime — Types — EF-35 Extended
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

export type ConnectorResultStatus =
  | "SUCCESS"
  | "FAILED"
  | "DENIED"
  | "TIMEOUT"
  | "CANCELLED"
  | "NOT_CONFIGURED"
  | "NOT_SUPPORTED";

export interface ConnectorResult<T = unknown> {
  status: ConnectorResultStatus;
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

// EI-01 (RFC-008 / ADR-015) — Reversibility classification.
// Toda capability declara "safe" | "reversible" | "irreversible".
// Safety Gate (EI-03) so freia "irreversible". Default "safe" quando ausente.
// NADA le este campo ainda — EI-01 e apenas metadata (zero risco).
export type Reversibility = "safe" | "reversible" | "irreversible";

export interface ConnectorMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  capabilities: string[];
  // EI-01: mapa opcional capability-id -> Reversibility.
  // Capabilities nao listadas assumem "safe". Nada le ainda.
  capabilityReversibility?: Record<string, Reversibility>;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface ConnectorHealthReport {
  status: ConnectorHealthStatus;
  connectorId: string;
  checkedAt: number;
  details?: string;
}

// ── Validation Diagnostics (EF-35) ────────────────────────────────────────────

export interface ConnectorValidationResult {
  valid: boolean;
  checks: ConnectorValidationCheck[];
  summary: string;
}

export interface ConnectorValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

// ── Metrics (EF-35 Extended) ─────────────────────────────────────────────────

export interface ConnectorMetrics {
  connectorId: string;
  totalExecutions: number;
  totalFailures: number;
  totalDenied: number;
  totalTimeouts: number;
  totalSuccesses: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastExecutedAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  loadTimeMs: number | null;
  uptimeSince: number | null;
  healthHistory: ConnectorHealthStatus[];
}

// ── Execution Log ─────────────────────────────────────────────────────────────

export interface ExecutionRecord {
  executionId: string;
  connectorId: string;
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: "success" | "failure" | "denied" | "timeout";
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

export function calcP95(durations: number[]): number {
  if (durations.length === 0) return 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}