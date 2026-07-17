// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeEvent
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export type RuntimeEventType =
  | "EXECUTION_CREATED"
  | "EXECUTION_QUEUED"
  | "EXECUTION_STARTED"
  | "EXECUTION_RUNNING"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXECUTION_CANCELLED"
  | "EXECUTION_TIMEOUT"
  | "RETRY_SCHEDULED"
  | "RETRY_EXHAUSTED"
  | "HEALTH_CHANGED"
  | "METRIC_RECORDED"
  | "LIFECYCLE_TRANSITION"
  | "SCHEDULER_QUEUED"
  | "SCHEDULER_READY"
  | "SCHEDULER_RUNNING"
  | "SCHEDULER_COMPLETED";

export interface RuntimeEvent {
  readonly type: RuntimeEventType;
  readonly executionId: string;
  readonly runtimeLabel: string;
  readonly timestamp: number;
  readonly detail?: string;
  readonly payload?: Record<string, unknown>;
}