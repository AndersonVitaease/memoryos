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
  ExecutionReport,
  ExecutionWithReport,
  RuntimeExecutionContext,
  ICapabilityExecutor,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeMetadata,
} from "./RuntimeTypes";
import { makeExecutionId }             from "./RuntimeTypes";
import { RuntimeDebug }               from "@/lib/debug/RuntimeDebug";
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

  // ADR-003 / ADR-004: Runtime-owned ExecutionReport factory.
  // Reads exclusively from ctx.contribution (typed, ADR-004) with
  // fallback to ctx.metadata (untyped legacy bag) for backward compatibility.
  // Only place in the codebase where ExecutionReport is created.
  private _buildReport(
    ctx: RuntimeExecutionContext,
    result: ExecutionResult,
    t_start: number,
    overrides: Partial<ExecutionReport> = {},
  ): ExecutionReport {
    const c = ctx.contribution;

    // ── ADR-004: integrity validation — collect warnings for missing contributions ──
    const warnings: string[] = [...(c.warnings ?? [])];
    if (!c.router)    warnings.push("ADR-004: router contribution missing (PrimaryConversationRouter)");
    if (!c.goal)      warnings.push("ADR-004: goal contribution missing (ConversationGoalBridge)");
    if (!c.knowledge) warnings.push("ADR-004: knowledge contribution missing (KnowledgeStore)");

    // ── Read typed contribution (ADR-004), fall back to legacy metadata ──────────
    const userMessage  = c.router?.userMessage          ?? String(ctx.metadata["userMessage"] ?? "");
    const intent       = (c.router?.intent               ?? String(ctx.metadata["intent"] ?? "")) || null;
    const intentConf   = c.router?.intentConf           ?? Number(ctx.metadata["intentConf"] ?? 0);
    const goalType     = (c.goal?.goalType               ?? String(ctx.metadata["goalType"] ?? "")) || null;
    const connector    = c.connector?.connector         ?? String(ctx.metadata["connector"] ?? result.steps[0]?.connector ?? "");
    const capability   = c.connector?.capability        ?? String(ctx.metadata["capability"] ?? result.steps[0]?.capability ?? "");
    const episodeId    = (c.episode?.episodeId           ?? String(ctx.metadata["episodeId"] ?? "")) || null;
    const ksBefore     = c.knowledge?.knowledgeStoreBefore ?? Number(ctx.metadata["knowledgeStoreBefore"] ?? 0);
    const ksAfter      = c.knowledge?.knowledgeStoreAfter  ?? Number(ctx.metadata["knowledgeStoreAfter"]  ?? 0);
    const ksLastWrite  = c.knowledge?.ksLastWriteId     ?? String(ctx.metadata["ksLastWriteId"] ?? "none");
    const retrieval    = c.retrieval  ?? (ctx.metadata["retrieval"] as ExecutionReport["retrieval"]) ?? null;
    const planner      = c.planner    ?? (ctx.metadata["planner"]  as ExecutionReport["planner"])   ?? null;
    const learning     = c.learning   ?? (ctx.metadata["learning"] as ExecutionReport["learning"])  ?? null;
    const memory       = c.memory     ?? (ctx.metadata["memory"]   as ExecutionReport["memory"])    ?? null;
    const response     = c.response   ?? (ctx.metadata["response"] as ExecutionReport["response"])  ?? null;

    return Object.freeze({
      executionId:           result.executionId,
      userMessage,
      intent,
      intentConf,
      goalId:                result.goalId,
      goalType,
      planId:                result.planId,
      connector,
      capability,
      episodeId,
      knowledgeStoreBefore:  ksBefore,
      knowledgeStoreAfter:   ksAfter,
      knowledgeGrowth:       ksAfter - ksBefore,
      ksLastWriteId:         ksLastWrite,
      retrieval,
      planner,
      learning,
      memory,
      response,
      totalDurationMs:       Date.now() - t_start,
      errors:                result.errors,
      warnings:              Object.freeze(warnings),
      ...overrides,
    } satisfies ExecutionReport);
  }

  constructor(
    executor: ICapabilityExecutor = new MockCapabilityExecutor(),
    policy:   ExecutionPolicy     = DEFAULT_EXECUTION_POLICY,
  ) {
    this._dispatcher = new ExecutionDispatcher(executor);
    this._policy     = policy;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // A-01: accept pipelineExecutionId so the Runtime reuses the Pipeline's canonical ID
  // instead of generating its own. All downstream components (Dispatcher → CCE → UCR →
  // UCRBridge → Connector) propagate this single ID without ever creating a new one.
  async execute(plan: ExecutionPlan, pipelineExecutionId?: string): Promise<ExecutionWithReport> {
    const t_start = Date.now();

    // [RUNTIME-PROBE][RTE-01] ConversationRuntimeEngine.execute() entered
    console.log("[RUNTIME-PROBE][RTE-01]", {
      probe:      "runtimeEngine:execute:entry",
      t:          performance.now(),
      ts:         t_start,
      planId:     plan.id,
      goalId:     plan.goalId,
      goalType:   plan.goalType,
      steps:      plan.steps.map(s => `${s.connector}.${s.capability}`),
      executorType: (this._dispatcher as any)._executor?.constructor?.name ?? "unknown",
      pipelineExecutionId: pipelineExecutionId ?? "not-provided",
      note:       "executorType=ConnectorCapabilityExecutor is expected. Registry may still be empty if placeholder.",
    });
    // A-01: pass pipelineExecutionId into context so ECF reuses it instead of generating new one
    const ctx = executionContextFactory.create(plan, this._policy, pipelineExecutionId);

    if (!ctx) {
      // Plan failed validation — return a structured failure + empty report.
      // A-01: use pipelineExecutionId here too so even validation-failures share the same ID.
      const now = Date.now();
      const executionResult = Object.freeze({
        executionId: pipelineExecutionId ?? makeExecutionId(),
        planId:      plan.id,
        goalId:      plan.goalId,
        status:      "failed" as ExecutionStatus,
        steps:       Object.freeze([]),
        startedAt:   now,
        finishedAt:  now,
        durationMs:  0,
        errors:      Object.freeze(["Plan failed validation"]),
      });
      const executionReport = this._buildReport(
        { executionId: executionResult.executionId, planId: plan.id, goalId: plan.goalId,
          plan, createdAt: now, startedAt: now, finishedAt: now, status: "failed",
          currentStepIndex: 0, stepResults: [], cancelRequested: false, timeoutAt: null, metadata: {} },
        executionResult,
        t_start,
        { errors: Object.freeze(["Plan failed validation"]) },
      );
      return { executionResult, executionReport };
    }

    this._contexts.set(ctx.executionId, ctx);
    ctx.status    = "running";
    ctx.startedAt = Date.now();
    ctx.timeoutAt = Date.now() + this._policy.timeoutMs;

    // ── Single source of truth for executionId ────────────────────────────────
    // ConversationRuntimeEngine is the ONLY component that creates executionIds.
    // It registers its own ID into RuntimeDebug so all downstream components
    // (Planner, Connector, ContextBuilder, Executor, Store) can emit correlated
    // events without generating any ID themselves.
    RuntimeDebug.registerExecution(
      ctx.executionId,
      "system",
      `runtime — ${ctx.executionId}`,
    );

    this._emit(ctx, "execution_started", null);

    try {
      if (plan.steps.length === 0) {
        return this._finalize(ctx, "completed", t_start);
      }

      for (let i = 0; i < plan.steps.length; i++) {
        if (ctx.cancelRequested) return this._finalize(ctx, "cancelled", t_start);
        if (Date.now() > (ctx.timeoutAt ?? Infinity)) return this._finalize(ctx, "timeout", t_start);

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
          return this._finalize(ctx, stepResult.status === "timeout" ? "timeout" : "failed", t_start);
        }
      }

      return this._finalize(ctx, "completed", t_start);

    } catch (err) {
      ctx.metadata["fatalError"] = (err as Error).message;
      return this._finalize(ctx, "failed", t_start);
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

  private _finalize(ctx: RuntimeExecutionContext, status: ExecutionStatus, t_start: number): ExecutionWithReport {
    ctx.status     = status;
    ctx.finishedAt = Date.now();

    // Close the RuntimeDebug execution when the Runtime finishes
    RuntimeDebug.closeExecution(ctx.executionId);

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

    const executionResult: ExecutionResult = Object.freeze({
      executionId: ctx.executionId,
      planId:      ctx.planId,
      goalId:      ctx.goalId,
      status,
      steps:       Object.freeze([...ctx.stepResults]),
      startedAt:   ctx.startedAt ?? ctx.createdAt,
      finishedAt:  ctx.finishedAt!,
      durationMs:  ctx.finishedAt! - (ctx.startedAt ?? ctx.createdAt),
      errors:      Object.freeze(errors),
    });

    // ADR-003: ExecutionReport built exclusively here — single source of truth
    const executionReport = this._buildReport(ctx, executionResult, t_start);

    return { executionResult, executionReport };
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