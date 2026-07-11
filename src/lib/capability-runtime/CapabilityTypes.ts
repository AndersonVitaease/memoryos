// Capability Runtime — Types
// Foundation v1.0 · Engineering First

export type CapabilityResultStatus =
  | "SUCCESS"
  | "FAILED"
  | "DENIED"
  | "TIMEOUT"
  | "CANCELLED";

export interface CapabilityContext {
  executionId: string;
  capabilityId: string;
  connectorId: string;
  userId: string;
  projectId: string;
  sessionId: string;
  goalId?: string;
  identityContext?: Record<string, unknown>;
}

export interface CapabilityLog {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface CapabilityResult<T = unknown> {
  status: CapabilityResultStatus;
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  capabilityId: string;
  connectorId: string;
  executionId: string;
  logs: CapabilityLog[];
}

export interface CapabilityMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** Connector ID this capability requires */
  connectorId: string;
  /** Operations this capability exposes */
  operations: string[];
}

export interface CapabilityMetrics {
  capabilityId: string;
  connectorId: string;
  totalExecutions: number;
  totalFailures: number;
  totalTimeouts: number;
  avgDurationMs: number;
  lastExecutedAt: number | null;
}

export interface CapabilityExecutionRecord {
  executionId: string;
  capabilityId: string;
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
export function makeCapabilityExecutionId(): string {
  return `cap_exec_${Date.now()}_${(++_seq).toString(36)}`;
}

export function makeCapabilityLog(level: CapabilityLog["level"], message: string): CapabilityLog {
  return { timestamp: Date.now(), level, message };
}