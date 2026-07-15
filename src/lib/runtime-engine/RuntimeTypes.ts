/**
 * RuntimeTypes.ts — Engineering Sprint E-02.3
 * Canonical types for the Runtime Engine.
 *
 * SRP: apenas contratos de dados.
 * Runtime conhece: ExecutionPlan, CapabilityExecutor, ExecutionContext.
 * Runtime NAO conhece: Gmail, Calendar, Drive, OAuth, LLM.
 */

import type { ExecutionPlan, ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";

// ── Status enums ──────────────────────────────────────────────────────────────

export type ExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout"
  | "waiting_confirmation";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

// ── Retry (structure only — algorithm is Sprint E-02.4+) ──────────────────────

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs:   number;
}

export interface RetryContext {
  readonly attempt:     number;
  readonly maxAttempts: number;
  readonly lastError:   string | null;
}

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly delayMs:     number;
  readonly reason:      string;
}

// ── Step result ───────────────────────────────────────────────────────────────

export interface StepResult {
  readonly stepId:     string;
  readonly connector:  string;
  readonly capability: string;
  readonly status:     StepStatus;
  readonly output:     unknown;
  readonly error:      string | null;
  readonly startedAt:  number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly attempt:    number;
}

// ── Execution result ──────────────────────────────────────────────────────────

export interface ExecutionResult {
  readonly executionId: string;
  readonly planId:      string;
  readonly goalId:      string;
  readonly status:      ExecutionStatus;
  readonly steps:       readonly StepResult[];
  readonly startedAt:   number;
  readonly finishedAt:  number;
  readonly durationMs:  number;
  readonly errors:      readonly string[];
}

// ── Runtime execution context ─────────────────────────────────────────────────

export interface RuntimeExecutionContext {
  readonly executionId:     string;
  readonly planId:          string;
  readonly goalId:          string;
  readonly plan:            ExecutionPlan;
  readonly createdAt:       number;
  startedAt:                number | null;
  finishedAt:               number | null;
  status:                   ExecutionStatus;
  currentStepIndex:         number;
  stepResults:              StepResult[];
  cancelRequested:          boolean;
  timeoutAt:                number | null;
  readonly metadata:        Record<string, unknown>;
}

// ── Capability executor interface (Dependency Inversion) ──────────────────────

export interface CapabilityExecutorInput {
  readonly executionId: string;
  readonly step:        ExecutionStep;
  readonly retryCtx:    RetryContext;
}

export interface CapabilityExecutorOutput {
  readonly status:  StepStatus;
  readonly output:  unknown;
  readonly error:   string | null;
}

export interface ICapabilityExecutor {
  /**
   * Executes a single capability step.
   * Must never throw — return a failed output instead.
   */
  execute(input: CapabilityExecutorInput): Promise<CapabilityExecutorOutput>;
}

// ── Runtime events (in-process only) ─────────────────────────────────────────

export type RuntimeEventType =
  | "execution_started"
  | "execution_step_started"
  | "execution_step_completed"
  | "execution_completed"
  | "execution_failed"
  | "execution_cancelled"
  | "execution_timeout";

export interface RuntimeEvent {
  readonly type:        RuntimeEventType;
  readonly executionId: string;
  readonly planId:      string;
  readonly goalId:      string;
  readonly stepId:      string | null;
  readonly connector:   string | null;
  readonly capability:  string | null;
  readonly status:      ExecutionStatus | StepStatus;
  readonly durationMs:  number | null;
  readonly timestamp:   number;
}

// ── ID factory ────────────────────────────────────────────────────────────────

let _execSeq = 0;
export function makeExecutionId(): string {
  return `exec-rt-${Date.now()}-${(++_execSeq).toString(36)}`;
}