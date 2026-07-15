/**
 * ConversationRuntimeEngine.ts — Engineering Sprint E-02.3A (normalized)
 * The operational core of MemoryOS.
 *
 * SRP: controlar execução, estados, eventos, cancelamento, timeout.
 *      NÃO cria contextos (→ ExecutionContextFactory).
 *      NÃO invoca executors diretamente (→ ExecutionDispatcher).
 *
 * Runtime conhece APENAS:
 *   - ExecutionPlan / ExecutionStep
 *   - ICapabilityExecutor (interface)
 *   - RuntimeExecutionContext
 *   - ExecutionDispatcher
 *   - ExecutionContextFactory
 *   - ExecutionPolicy
 *
 * Runtime NAO conhece:
 *   - Gmail, Calendar, Drive, GitHub
 *   - OAuth / sessão / LLM
 *   - ConversationPipeline
 *   - MockCapabilityExecutor (apenas via ICapabilityExecutor)
 *
 * Open/Closed: ConnectorRouter será plugado via ICapabilityExecutor
 * na Sprint E-02.4 sem alterar este arquivo.
 */

import type { ExecutionPlan }           from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type {
  ExecutionStatus,
  ExecutionResult,
  RuntimeExecutionContext,
  ICapabilityExecutor,
  RuntimeEvent,
  RuntimeEventType,
} from "./RuntimeTypes";
import { makeExecutionId }             from "./RuntimeTypes";
import { MockCapabilityExecutor }      from "./MockCapabilityExecutor";
import { ExecutionDispatcher }         from "./ExecutionDispatcher";
import { executionContextFactory }     from "./ExecutionContextFactory";
import type { ExecutionPolicy }        from "./ExecutionPolicy";
import { DEFAULT_EXECUTION_POLICY }   from "./ExecutionPolicy";

// ── Event listener ────────────────────────────────────────────────────────────

type RuntimeEventListener = (event: RuntimeEvent) => void;

// ── ConversationRuntimeEngine ─────────────────────────────────────────────────

export class ConversationRuntimeEngine {
  private readonly _dispatcher:  ExecutionDispatcher;
  private readonly _policy:      ExecutionPolicy;
  private readonly _contexts     = new Map<string, RuntimeExecutionContext>();
  private readonly _listeners:   RuntimeEventListener[] = [];
  private _totalCompleted = 0;
  private _totalFailed    = 0;
  private _totalCancelled = 0;

  constructor(
    executor: ICapabilityExecutor = new MockCapabilityExecutor(),
    policy:   ExecutionPolicy     = DEFAULT_EXECUTION_POLICY,
  ) {
    this._dispatcher = new ExecutionDispatcher(executor);
    this._policy     = policy;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    // Context creation delegated to ExecutionContextFactory
    const ctx = executionContextFactory.create(plan, this._policy);

    if (!ctx) {
      // Plan failed validation — return a structured failure result
      const now = Date.now();
      return Object.freeze({
        executionId: makeExecutionId(),
        planId:      plan.id,
        goalId:      plan.goalId,
        status:      "failed" as ExecutionStatus,
        steps:       Object.freeze([]),
        startedAt:   now,
        finishedAt:  now,
        durationMs:  0,
        errors:      Object.freeze(["Plan failed validation"]),
      });
    }

    this._contexts.set(ctx.executionId, ctx);
    ctx.status    = "running";
    ctx.startedAt = Date.now();
    ctx.timeoutAt = Date.now() + this._policy.timeoutMs;

    this._emit(ctx, "execution_started", null);

    try {
      if (plan.steps.length === 0) {
        return this._finalize(ctx, "completed");
      }

      for (let i = 0; i < plan.steps.length; i++) {
        if (ctx.cancelRequested) return this._finalize(ctx, "cancelled");
        if (Date.now() > (ctx.timeoutAt ?? Infinity)) return this._finalize(ctx, "timeout");

        ctx.currentStepIndex = i;
        const step = plan.steps[i];

        this._emit(ctx, "execution_step_started", step.id);

        // Step execution delegated to ExecutionDispatcher
        const stepResult = await this._dispatcher.dispatch({
          executionId:   ctx.executionId,
          step,
          stepTimeoutMs: Math.min(
            this._policy.stepTimeoutMs,
            (ctx.timeoutAt ?? Infinity) - Date.now(),
          ),
        });

        ctx.stepResults.push(stepResult);
        this._emit(ctx, "execution_step_completed", step.id);

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

  getMetrics(): Record<string, unknown> {
    return {
      totalCompleted: this._totalCompleted,
      totalFailed:    this._totalFailed,
      totalCancelled: this._totalCancelled,
      activeCount:    this.getRunningExecutions().length,
      totalTracked:   this._contexts.size,
      policy:         this._policy,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _finalize(ctx: RuntimeExecutionContext, status: ExecutionStatus): ExecutionResult {
    ctx.status     = status;
    ctx.finishedAt = Date.now();

    const eventType: RuntimeEventType =
      status === "completed" ? "execution_completed"  :
      status === "failed"    ? "execution_failed"     :
      status === "cancelled" ? "execution_cancelled"  :
      status === "timeout"   ? "execution_timeout"    :
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
    const step = stepId ? ctx.plan.steps.find((s) => s.id === stepId) ?? null : null;
    const event: RuntimeEvent = {
      type,
      executionId: ctx.executionId,
      planId:      ctx.planId,
      goalId:      ctx.goalId,
      stepId,
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

// ── App-wide singleton via RuntimeProvider ────────────────────────────────────
// The singleton is now managed by RuntimeProvider.
// This export is kept for backward compatibility with ConversationPipeline.

const _KEY = "__CONV_RUNTIME_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new ConversationRuntimeEngine(new MockCapabilityExecutor(), DEFAULT_EXECUTION_POLICY);
}

export const conversationRuntimeEngine: ConversationRuntimeEngine = (
  globalThis as unknown as Record<string, ConversationRuntimeEngine>
)[_KEY];