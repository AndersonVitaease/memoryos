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
import { RuntimeDebug }               from "@/lib/debug/RuntimeDebug";
import { enrichExecutionRequest }     from "@/lib/execution-intelligence/ExecutionIntelligence";
import type { ExecutionRequest }       from "@/lib/execution-intelligence/ExecutionTypes";

// ── DispatchInput ─────────────────────────────────────────────────────────────

import type { ConnectorExecutionContext } from "./RuntimeTypes";

export interface DispatchInput {
  readonly executionId:   string;
  readonly step:          ExecutionStep;
  readonly stepTimeoutMs: number;
  /** B-03: real connector context forwarded from RuntimeExecutionContext.connectorCtx */
  readonly connectorCtx:  ConnectorExecutionContext;
  /** ms que o step aguardou no semaphore do ExecutionOrchestrator (0 se sem semaphore). */
  readonly semaphoreWaitMs?: number;
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
    const { executionId, step, stepTimeoutMs, connectorCtx, semaphoreWaitMs = 0 } = input;
    console.group("[TRACE-DISPATCH-03]");
    console.log({ connector: step.connector, capability: step.capability, executionId });
    console.groupEnd();
    const startedAt  = Date.now();

    // MCP server + toolName para telemetria de concorrencia granular (server+tool).
    // Lido de step.parameters (Planner), nunca hardcoded. Null para connectors nao-MCP.
    const mcpParams = step.connector === "mcp" ? step.parameters : null;
    const server = mcpParams
      ? (typeof mcpParams.serverName === "string" ? mcpParams.serverName
         : typeof mcpParams.serverId === "string" ? mcpParams.serverId : null)
      : null;
    const toolName = mcpParams && typeof mcpParams.toolName === "string" ? mcpParams.toolName : null;
    const retryCtx: RetryContext = { attempt: 1, maxAttempts: 1, lastError: null };
    RuntimeDebug.recordDiagnostic({
      executionId,
      component: "ExecutionDispatcher",
      source: "runtime",
      event: "dispatch_started",
      status: "running",
      stepId: step.id,
      connectorId: step.connector,
      capability: step.capability,
      startedAt,
    });
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
      // EF — Unified Step Intelligence: enriquece params EXATAMENTE UMA vez por step.
      // Single-step vindo de ExecutionRuntime.processCapability() JA foi enriquecido
      // (connectorCtx.origin comeca com "execution-intelligence") — bypass (evita double).
      // Multi-step (origin "pipeline"/outro) enriquece aqui, antes do executor, UMA vez.
      // Falha no enrichment -> cai no catch -> StepResult failed (mecanismo existente).
      // NAO muta o step original: effectiveStep preserva id/connector/capability/dependsOn.
      // multi-step safety remains an existing gap; this sprint only unifies EI enrichment.
      const effectiveStep = await this._enrichStepOnce(step, connectorCtx, executionId);
      // B-03: connectorCtx forwarded intact — never re-created here
      const outputPromise = this._executor.execute({ executionId, step: effectiveStep, retryCtx, connectorCtx });
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
        server,
        toolName,
        semaphoreWaitMs,
      }).catch(() => { /* shadow mode: swallow */ });

      RuntimeDebug.recordDiagnostic({
        executionId,
        component: "ExecutionDispatcher",
        source: "runtime",
        event: success ? "dispatch_completed" : output.status === "timeout" ? "dispatch_timeout" : "dispatch_failed",
        status: output.status,
        stepId: step.id,
        connectorId: step.connector,
        capability: step.capability,
        startedAt,
        finishedAt,
        durationMs,
        hasError: !success,
        errorType: output.status === "timeout" ? "timeout" : !success ? "connector" : undefined,
      });

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
        goalType: step.goalType,
        sprintTag: "S1-OIE",
        server,
        toolName,
        semaphoreWaitMs,
      }).catch(() => { /* shadow mode: swallow */ });

      RuntimeDebug.recordDiagnostic({
        executionId,
        component: "ExecutionDispatcher",
        source: "runtime",
        event: isTimeout ? "dispatch_timeout" : "dispatch_failed",
        status: isTimeout ? "timeout" : "failed",
        stepId: step.id,
        connectorId: step.connector,
        capability: step.capability,
        startedAt,
        finishedAt,
        durationMs,
        hasError: true,
        errorType: isTimeout ? "timeout" : "runtime",
      });

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

  /**
   * EF — Unified Step Intelligence (per-step enrichment).
   * Aplica enrichExecutionRequest UMA vez sobre step.parameters quando o step NAO
   * veio de ExecutionRuntime.processCapability() (origin !== "execution-intelligence*").
   * Retorna uma NOVA ExecutionStep com parameters enriquecidos — nunca muta o original
   * (preserva id, connector, capability, dependsOn e campos extras como goalType).
   * Single-step (origin "execution-intelligence*") retorna o MESMO step (bypass).
   */
  private async _enrichStepOnce(
    step: ExecutionStep,
    connectorCtx: ConnectorExecutionContext,
    executionId: string,
  ): Promise<ExecutionStep> {
    const origin = connectorCtx?.origin;
    if (typeof origin === "string" && origin.startsWith("execution-intelligence")) {
      return step;
    }
    const request: ExecutionRequest = {
      connectorId: step.connector,
      capability:  step.capability,
      params:      step.parameters as Record<string, unknown>,
      context:     connectorCtx,
      executionId,
    };
    const { enrichedParams } = await enrichExecutionRequest(request);
    return { ...step, parameters: enrichedParams };
  }
}