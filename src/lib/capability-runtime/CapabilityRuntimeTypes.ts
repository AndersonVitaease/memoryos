/**
 * CapabilityRuntimeTypes.ts — Sprint C-03.6.3
 * Contratos oficiais do Capability Runtime.
 * SRP: apenas tipos — sem lógica.
 */

// ── Execution state machine ───────────────────────────────────────────────────

export type ExecutionState =
  | "CREATED"
  | "QUEUED"
  | "STARTING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export type TerminalState = "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";

export const TERMINAL_STATES: ReadonlySet<ExecutionState> = new Set([
  "COMPLETED", "FAILED", "CANCELLED", "TIMEOUT",
]);

// ── Context ───────────────────────────────────────────────────────────────────

export interface CapabilityExecutionContext {
  readonly executionId:   string;
  readonly capabilityId:  string;
  readonly goalId:        string;
  readonly sessionId:     string;
  readonly startedAt:     number;     // epoch ms
  readonly reason:        string;     // why this capability was invoked
}

// ── Policies ─────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  readonly maxRetries:        number;   // default 3
  readonly retryDelayMs:      number;   // base delay ms
  readonly exponentialBackoff: boolean;
}

export interface TimeoutPolicy {
  readonly timeoutMs: number;           // max allowed execution ms (0 = no limit)
}

export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({
  maxRetries: 3, retryDelayMs: 200, exponentialBackoff: true,
});

export const DEFAULT_TIMEOUT_POLICY: Readonly<TimeoutPolicy> = Object.freeze({
  timeoutMs: 5000,
});

// ── State snapshot ────────────────────────────────────────────────────────────

export interface StateSnapshot {
  readonly state:       ExecutionState;
  readonly occurredAt:  number;
  readonly detail:      string;
}

// ── Execution record ──────────────────────────────────────────────────────────

export interface ExecutionRecord {
  readonly context:       Readonly<CapabilityExecutionContext>;
  readonly state:         ExecutionState;
  readonly history:       readonly Readonly<StateSnapshot>[];
  readonly startedAt:     number;
  readonly completedAt:   number | null;
  readonly durationMs:    number | null;
  readonly retryCount:    number;
  readonly error:         string | null;
  readonly result:        unknown;
  readonly explanation:   string;
}

// ── Start options ─────────────────────────────────────────────────────────────

export interface StartOptions {
  readonly retry?:   Partial<RetryPolicy>;
  readonly timeout?: Partial<TimeoutPolicy>;
  /** Simulated executor — receives context and returns a result (or throws) */
  readonly executor?: (ctx: Readonly<CapabilityExecutionContext>) => Promise<unknown>;
}

// ── Runtime health ────────────────────────────────────────────────────────────

export type RuntimeHealthStatus = "READY" | "DEGRADED" | "FAILED";

export interface RuntimeHealth {
  readonly status:           RuntimeHealthStatus;
  readonly totalExecutions:  number;
  readonly activeExecutions: number;
  readonly completed:        number;
  readonly failed:           number;
  readonly cancelled:        number;
  readonly timedOut:         number;
  readonly totalRetries:     number;
  readonly avgDurationMs:    number;
}