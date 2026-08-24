/**
 * RuntimeDiagnostics — Payload-free structural diagnostic types and sanitization.
 *
 * Extracted from RuntimeDebug to keep the debug bus focused on event lifecycle.
 * All types are structural (no payloads) to keep the diagnostic surface safe.
 */

export type TraceCompleteness = "COMPLETE" | "INCOMPLETE" | "PARTIAL";

export interface RuntimeDiagnosticEventInput {
  executionId: string;
  component: string;
  event: string;
  source?: string;
  status?: string;
  stepId?: string;
  connectorId?: string;
  capability?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  hasError?: boolean;
  errorType?: string;
  errorCode?: string;
  planId?: string;
  goalId?: string;
  timeoutMs?: number;
  stepTimeoutMs?: number;
  parentExecutionId?: string;
}

export interface RuntimeDiagnosticEvent {
  sequence: number;
  timestamp: number;
  executionId: string;
  component: string;
  event: string;
  source?: string;
  status?: string;
  stepId?: string;
  connectorId?: string;
  capability?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  hasError: boolean;
  errorType?: string;
  errorCode?: string;
  planId?: string;
  goalId?: string;
  timeoutMs?: number;
  stepTimeoutMs?: number;
  parentExecutionId?: string;
}

export interface RuntimeDiagnosticErrorEntry {
  sequence: number;
  timestamp: number;
  component: string;
  event: string;
  errorCode?: string;
  errorType?: string;
}

export interface RuntimeDiagnosticSnapshot {
  readonly executionId: string;
  readonly status?: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly durationMs?: number;
  readonly components: readonly string[];
  readonly steps: readonly string[];
  readonly connectors: readonly string[];
  readonly capabilities: readonly string[];
  readonly errors: readonly RuntimeDiagnosticErrorEntry[];
  readonly events: readonly RuntimeDiagnosticEvent[];
  readonly gaps: readonly string[];
  readonly traceCompleteness: TraceCompleteness;
  readonly truncated: boolean;
}

/**
 * Resolve the canonical correlation ID for a runtime event.
 * Prefers an explicit executionId from the payload, falling back to the
 * event's own ID so that every event always has a non-empty correlation.
 */
export function resolveRuntimeCorrelationId(
  eventId: string,
  payload?: Record<string, unknown>,
): string {
  if (payload) {
    const candidates = [
      payload.executionId,
      payload.execution_id,
      payload.correlationId,
      payload.correlation_id,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate) return candidate;
    }
  }
  return eventId;
}

/**
 * Sanitize a raw diagnostic input into a frozen, payload-free event with
 * an assigned sequence number and timestamp. Never throws.
 */
export function sanitizeDiagnosticEvent(
  input: RuntimeDiagnosticEventInput,
  sequence: number,
): RuntimeDiagnosticEvent {
  return Object.freeze({
    sequence,
    timestamp: Date.now(),
    executionId: input.executionId,
    component: input.component,
    event: input.event,
    source: input.source,
    status: input.status,
    stepId: input.stepId,
    connectorId: input.connectorId,
    capability: input.capability,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    hasError: input.hasError ?? false,
    errorType: input.errorType,
    errorCode: input.errorCode,
    planId: input.planId,
    goalId: input.goalId,
    timeoutMs: input.timeoutMs,
    stepTimeoutMs: input.stepTimeoutMs,
    parentExecutionId: input.parentExecutionId,
  });
}