/**
 * ExecutionDispatcher.ts — Engineering Sprint E-02.3A
 * Intermediary layer between the Runtime and the CapabilityExecutor.
 *
 * SRP: receber um ExecutionStep, resolver o executor correto, executar,
 *      e retornar um StepResult.
 *
 * O Runtime nunca invoca um executor diretamente — sempre via Dispatcher.
 *
 * Open/Closed: na Sprint E-02.4, o ConnectorRouter será plugado aqui
 * como ICapabilityExecutor — sem alterar o Runtime nem este Dispatcher.
 *
 * Dependency Inversion: depende de ICapabilityExecutor (interface),
 * não de MockCapabilityExecutor ou ConnectorRouter (implementações).
 *
 * Nenhum connector real, nenhuma rede, nenhum OAuth.
 */

import type { ExecutionStep }          from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type {
  ICapabilityExecutor,
  StepResult,
  StepStatus,
  RetryContext,
} from "./RuntimeTypes";
import { connectorMetrics }           from "@/lib/connector-runtime/ConnectorMetricsStore";
// OIE Fase 1 (Sprint 1): RuntimeObserver em shadow mode — escreve
// ExecutionObservation apos cada dispatch. Fire-and-forget: nunca
// rejeita, nunca bloqueia, nunca altera o StepResult. Erro de
// instrumentacao nao pode quebrar a execucao real.
import { RuntimeObserver }            from "@/lib/operational-intelligence/RuntimeObserver";

// ── DispatchInput ─────────────────────────────────────────────────────────────

import type { ConnectorExecutionContext } from "./RuntimeTypes";

export interface DispatchInput {
  readonly executionId:   string;
  readonly step:          ExecutionStep;
  readonly stepTimeoutMs: number;
  /** B-03: real connector context forwarded from RuntimeExecutionContext.connectorCtx */
  readonly connectorCtx:  ConnectorExecutionContext;
}

// ── ExecutionDispatcher ───────────────────────────────────────────────────────

export class ExecutionDispatcher {
  constructor(private readonly _executor: ICapabilityExecutor) {}

  /**
   * Dispatches a single step to the registered executor.
   * Applies step-level timeout via Promise.race.
   * Never throws — always returns a StepResult.
   */
  async dispatch(input: DispatchInput): Promise<StepResult> {
    const { executionId, step, stepTimeoutMs, connectorCtx } = input;
    console.group("[TRACE-DISPATCH-03]");
    console.log({ connector: step.connector, capability: step.capability, executionId });
    console.groupEnd();
    const startedAt  = Date.now();
    const retryCtx: RetryContext = { attempt: 1, maxAttempts: 1, lastError: null };
    // [RUNTIME-PROBE][EXD-01] ExecutionDispatcher.dispatch() entered
    console.log("[RUNTIME-PROBE][EXD-01]", {
      probe:      "dispatcher:dispatch:entry",
      t:          performance.now(),
      ts:         Date.now(),
      executionId,
      connector:  step.connector,
      capability: step.capability,
      stepId:     step.id,
      stepTimeoutMs,
    });

    try {
      // B-03: connectorCtx forwarded intact — never re-created here
      const outputPromise = this._executor.execute({ executionId, step, retryCtx, connectorCtx });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Step timeout")), Math.max(stepTimeoutMs, 100)),
      );

      const output     = await Promise.race([outputPromise, timeoutPromise]);
      const finishedAt = Date.now();
      const success    = output.status === "completed" || output.status === "success";

      // C-06: prefer the connector-reported duration over the Dispatcher-measured wall-clock.
      // connectorDurationMs is set by UCRBridge using the runtime connector's own result.duration.
      // Dispatcher-measured durationMs includes bridge overhead and is used only as fallback.
      const dispatcherDurationMs = finishedAt - startedAt;
      const durationMs = (typeof output.connectorDurationMs === "number" && output.connectorDurationMs > 0)
        ? output.connectorDurationMs
        : dispatcherDurationMs;

      // ── Metrics ─────────────────────────────────────────────────────────
      connectorMetrics.record(step.connector, success, durationMs, output.error ?? undefined);

      // OIE Fase 1: observa a execucao em shadow mode (fire-and-forget).
      // O .catch(() => {}) aqui e redundante (o Observer tem catch interno),
      // mas garante que nenhuma promise rejeitada flutue mesmo em edge cases
      // de build/transpile. Shadow = nada le esta observacao ainda.
      RuntimeObserver.observe({
        executionId,
        stepId: step.id,
        connector: step.connector,
        capability: step.capability,
        status: output.status as StepStatus,
        error: output.error ?? null,
        durationMs,
        startedAt,
        finishedAt,
        sessionId: connectorCtx.sessionId,
        goalType: step.goalType,
        sprintTag: "S1-OIE",
      }).catch(() => { /* shadow mode: swallow */ });

      return Object.freeze({
        stepId:     step.id,
        connector:  step.connector,
        capability: step.capability,
        status:     output.status as StepStatus,
        output:     output.output,
        error:      output.error,
        startedAt,
        finishedAt,
        durationMs,
        attempt:    1,
        // C-04: logs propagated from connector through the entire chain
        logs:                output.logs,
        // C-05: original connector status preserved for observability
        connectorStatus:     output.connectorStatus,
        // C-06: both durations preserved — connector-reported and dispatcher-measured
        connectorDurationMs: output.connectorDurationMs,
      });
    } catch (err) {
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;
      const isTimeout  = (err as Error).message === "Step timeout";
      const errMsg     = (err as Error).message;

      // ── Metrics ─────────────────────────────────────────────────────────
      connectorMetrics.record(step.connector, false, durationMs, errMsg);

      // OIE Fase 1: observa a falha em shadow mode (fire-and-forget).
      RuntimeObserver.observe({
        executionId,
        stepId: step.id,
        connector: step.connector,
        capability: step.capability,
        status: (isTimeout ? "timeout" : "failed") as StepStatus,
        error: errMsg,
        durationMs,
        startedAt,
        finishedAt,
        sessionId: connectorCtx.sessionId,
      }).catch(() => { /* shadow mode: swallow */ });

      return Object.freeze({
        stepId:     step.id,
        connector:  step.connector,
        capability: step.capability,
        status:     (isTimeout ? "timeout" : "failed") as StepStatus,
        output:     null,
        error:      errMsg,
        startedAt,
        finishedAt,
        durationMs,
        attempt:    1,
        // C-04/C-05/C-06: not available on exception path — omitted (optional fields)
      });
    }
  }
}