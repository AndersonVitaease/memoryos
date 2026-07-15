/**
 * ConversationRuntimeEngine.ts — Engineering Sprint E-02.3
 * The operational core of MemoryOS.
 *
 * SRP: interpretar ExecutionPlan, percorrer steps, controlar estados,
 *      emitir eventos, controlar cancelamento e timeout.
 *
 * Runtime conhece APENAS:
 *   - ExecutionPlan / ExecutionStep
 *   - ICapabilityExecutor (interface, não implementação)
 *   - RuntimeExecutionContext
 *
 * Runtime NAO conhece:
 *   - Gmail, Calendar, Drive, GitHub
 *   - OAuth / sessão
 *   - LLM / Summarize
 *   - ConversationPipeline
 *
 * Connectors serão plugados via ICapabilityExecutor (ConnectorRouter)
 * na Sprint E-02.4 sem alterar este arquivo (Open/Closed Principle).
 */

import type { ExecutionPlan }      from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type {
  ExecutionStatus,
  StepStatus,
  StepResult,
  ExecutionResult,
  RuntimeExecutionContext,
  ICapabilityExecutor,
  RuntimeEvent,
  RuntimeEventType,
  RetryContext,
} from "./RuntimeTypes";
import { makeExecutionId }         from "./RuntimeTypes";
import { MockCapabilityExecutor }  from "./MockCapabilityExecutor";

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS   = 30_000;  // 30 s per execution
const DEFAULT_STEP_TIMEOUT = 10_000;  // 10 s per step

// ── Event listener ────────────────────────────────────────────────────────────

type RuntimeEventListener = (event: RuntimeEvent) => void;

// ── ConversationRuntimeEngine ─────────────────────────────────────────────────

export class ConversationRuntimeEngine {
  private readonly _executor: ICapabilityExecutor;
  private readonly _contexts = new Map<string, RuntimeExecutionContext>();
  private readonly _listeners: RuntimeEventListener[] = [];
  private _totalCompleted = 0;
  private _totalFailed    = 0;
  private _totalCancelled = 0;

  constructor(executor?: ICapabilityExecutor) {
    this._executor = executor ?? new MockCapabilityExecutor();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Executes an ExecutionPlan sequentially through the capability executor.
   * Never throws — always returns an ExecutionResult.
   */
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    const executionId = makeExecutionId();
    const ctx         = this._makeContext(executionId, plan);
    this._contexts.set(executionId, ctx);

    ctx.status    = "running";
    ctx.startedAt = Date.now();
    ctx.timeoutAt = Date.now() + DEFAULT_TIMEOUT_MS;

    this._emit(ctx, "execution_started", null);

    try {
      // Empty plan — complete immediately
      if (plan.steps.length === 0) {
        return this._finalize(ctx, "completed");
      }

      for (let i = 0; i < plan.steps.length; i++) {
        if (ctx.cancelRequested) {
          return this._finalize(ctx, "cancelled");
        }
        if (Date.now() > (ctx.timeoutAt ?? Infinity)) {
          return this._finalize(ctx, "timeout");
        }

        ctx.currentStepIndex = i;
        const step = plan.steps[i];
        const stepStartedAt = Date.now();

        this._emit(ctx, "execution_step_started", step.id);

        const retryCtx: RetryContext = { attempt: 1, maxAttempts: 1, lastError: null };

        let stepResult: StepResult;
        try {
          const stepTimeoutMs = Math.min(
            DEFAULT_STEP_TIMEOUT,
            (ctx.timeoutAt ?? Infinity) - Date.now(),
          );

          const outputPromise = this._executor.execute({ executionId, step, retryCtx });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Step timeout")), stepTimeoutMs),
          );

          const output = await Promise.race([outputPromise, timeoutPromise]);
          const finishedAt = Date.now();

          stepResult = Object.freeze({
            stepId:     step.id,
            connector:  step.connector,
            capability: step.capability,
            status:     output.status as StepStatus,
            output:     output.output,
            error:      output.error,
            startedAt:  stepStartedAt,
            finishedAt,
            durationMs: finishedAt - stepStartedAt,
            attempt:    1,
          });
        } catch (err) {
          const finishedAt = Date.now();
          const isTimeout  = (err as Error).message === "Step timeout";
          const status: StepStatus = isTimeout ? "timeout" : "failed";

          stepResult = Object.freeze({
            stepId:     step.id,
            connector:  step.connector,
            capability: step.capability,
            status,
            output:     null,
            error:      (err as Error).message,
            startedAt:  stepStartedAt,
            finishedAt,
            durationMs: finishedAt - stepStartedAt,
            attempt:    1,
          });
        }

        ctx.stepResults.push(stepResult);
        this._emit(ctx, "execution_step_completed", step.id);

        // Abort on hard step failure
        if (stepResult.status === "failed" || stepResult.status === "timeout") {
          return this._finalize(ctx, stepResult.status === "timeout" ? "timeout" : "failed");
        }
      }

      return this._finalize(ctx, "completed");

    } catch (err) {
      ctx.metadata["fatalError"] = (err as Error).message;
      return this._finalize(ctx, "failed");
    }
  }

  /**
   * Requests cancellation of a running execution.
   * The execution will stop at the next step boundary.
   */
  cancel(executionId: string): boolean {
    const ctx = this._contexts.get(executionId);
    if (!ctx || ctx.status !== "running") return false;
    ctx.cancelRequested = true;
    return true;
  }

  getExecution(executionId: string): RuntimeExecutionContext | null {
    return this._contexts.get(executionId) ?? null;
  }

  getRunningExecutions(): RuntimeExecutionContext[] {
    return [...this._contexts.values()].filter((c) => c.status === "running");
  }

  // ── Observability ──────────────────────────────────────────────────────────

  onEvent(listener: RuntimeEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  getMetrics() {
    return {
      totalCompleted: this._totalCompleted,
      totalFailed:    this._totalFailed,
      totalCancelled: this._totalCancelled,
      activeCount:    this.getRunningExecutions().length,
      totalTracked:   this._contexts.size,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _makeContext(executionId: string, plan: ExecutionPlan): RuntimeExecutionContext {
    return {
      executionId,
      planId:          plan.id,
      goalId:          plan.goalId,
      plan,
      createdAt:       Date.now(),
      startedAt:       null,
      finishedAt:      null,
      status:          "queued",
      currentStepIndex: -1,
      stepResults:     [],
      cancelRequested: false,
      timeoutAt:       null,
      metadata:        {},
    };
  }

  private _finalize(ctx: RuntimeExecutionContext, status: ExecutionStatus): ExecutionResult {
    ctx.status     = status;
    ctx.finishedAt = Date.now();

    const eventType: RuntimeEventType =
      status === "completed"  ? "execution_completed"  :
      status === "failed"     ? "execution_failed"      :
      status === "cancelled"  ? "execution_cancelled"   :
      status === "timeout"    ? "execution_timeout"     :
      "execution_completed";

    this._emit(ctx, eventType, null);

    if (status === "completed")  this._totalCompleted++;
    if (status === "failed")     this._totalFailed++;
    if (status === "cancelled")  this._totalCancelled++;

    const errors = ctx.stepResults
      .filter((s) => s.error !== null)
      .map((s) => `[${s.connector}.${s.capability}] ${s.error}`);

    return Object.freeze({
      executionId: ctx.executionId,
      planId:      ctx.planId,
      goalId:      ctx.goalId,
      status,
      steps:       Object.freeze([...ctx.stepResults]),
      startedAt:   ctx.startedAt ?? ctx.createdAt,
      finishedAt:  ctx.finishedAt,
      durationMs:  ctx.finishedAt - (ctx.startedAt ?? ctx.createdAt),
      errors:      Object.freeze(errors),
    });
  }

  private _emit(
    ctx: RuntimeExecutionContext,
    type: RuntimeEventType,
    stepId: string | null,
  ): void {
    const step = stepId !== null
      ? ctx.plan.steps.find((s) => s.id === stepId) ?? null
      : null;

    const event: RuntimeEvent = {
      type,
      executionId: ctx.executionId,
      planId:      ctx.planId,
      goalId:      ctx.goalId,
      stepId:      stepId,
      connector:   step?.connector ?? null,
      capability:  step?.capability ?? null,
      status:      ctx.status,
      durationMs:  ctx.startedAt !== null ? Date.now() - ctx.startedAt : null,
      timestamp:   Date.now(),
    };

    for (const l of this._listeners) {
      try { l(event); } catch { /* never crash the runtime */ }
    }
  }
}

// ── App-wide singleton (shared mock executor by default) ──────────────────────

const _KEY = "__CONV_RUNTIME_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new ConversationRuntimeEngine(new MockCapabilityExecutor());
}

export const conversationRuntimeEngine: ConversationRuntimeEngine = (
  globalThis as unknown as Record<string, ConversationRuntimeEngine>
)[_KEY];