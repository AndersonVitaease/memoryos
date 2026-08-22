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

import type { ExecutionPlan, ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
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
  ConnectorExecutionContext,
} from "./RuntimeTypes";
import { makeExecutionId }             from "./RuntimeTypes";
import { RuntimeDebug }               from "@/lib/debug/RuntimeDebug";
import { runtimeObsStore }            from "./RuntimeObservabilityStore";
import { MockCapabilityExecutor }      from "./MockCapabilityExecutor";
import { ExecutionDispatcher }         from "./ExecutionDispatcher";
import { ExecutionOrchestrator }       from "./ExecutionOrchestrator";
import { executionContextFactory }     from "./ExecutionContextFactory";
import type { ExecutionPolicy, ParallelismConfig } from "./ExecutionPolicy";
import { DEFAULT_EXECUTION_POLICY }   from "./ExecutionPolicy";
import { base44 } from "@/api/base44Client";
import { resolveResourcePolicies } from "./ResourcePolicyResolver";

// ── Event listener ────────────────────────────────────────────────────────────

type RuntimeEventListener = (event: RuntimeEvent) => void;

// ── ConversationRuntimeEngine ─────────────────────────────────────────────────

export class ConversationRuntimeEngine {
  private readonly _dispatcher:  ExecutionDispatcher;
  private readonly _orchestrator: ExecutionOrchestrator;
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
    this._dispatcher  = new ExecutionDispatcher(executor);
    this._orchestrator = new ExecutionOrchestrator();
    this._policy      = policy;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // A-01: accept pipelineExecutionId so the Runtime reuses the Pipeline's canonical ID.
  // B-02: accept connectorCtx so real identity propagates to every connector.execute().
  async execute(plan: ExecutionPlan, pipelineExecutionId?: string, connectorCtx?: ConnectorExecutionContext, policyOverride?: ExecutionPolicy): Promise<ExecutionWithReport> {
    const t_start = Date.now();
    // AP-04 (RFC-010/ADR-017): composite capabilities (Adaptive Process) recebem
    // uma policy estendida (COMPOSITE_EXECUTION_POLICY) — o step unico engloba o
    // loop reflexivo inteiro. Non-composite: policyOverride undefined → usa
    // this._policy (paridade ADR-015, comportamento 100% identico ao anterior).
    const policy = policyOverride ?? this._policy;

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
    // A-01: pass pipelineExecutionId into context so ECF reuses it instead of generating new one.
    // B-02: pass connectorCtx so real identity is stored in RuntimeExecutionContext.
    const ctx = executionContextFactory.create(plan, policy, pipelineExecutionId, connectorCtx);

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
        {
          executionId: executionResult.executionId, planId: plan.id, goalId: plan.goalId,
          plan, createdAt: now, startedAt: now, finishedAt: now, status: "failed",
          currentStepIndex: 0, stepResults: [], cancelRequested: false, timeoutAt: null,
          metadata: {},
          contribution: {},
          // B-02: validation-failure path — use provided connectorCtx or anonymous sentinel
          connectorCtx: connectorCtx ?? { userId: "anonymous", workspaceId: "anonymous", sessionId: "anonymous", origin: "unknown" },
        },
        executionResult,
        t_start,
        { errors: Object.freeze(["Plan failed validation"]) },
      );
      return { executionResult, executionReport };
    }

    this._contexts.set(ctx.executionId, ctx);
    ctx.status    = "running";
    ctx.startedAt = Date.now();
    ctx.timeoutAt = Date.now() + policy.timeoutMs;

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

    // D-01/D-02: evento padronizado de início de execução
    // Observability V2: registra a policy aplicada (timeoutMs, stepTimeoutMs)
    // e parentExecutionId para correlação de sub-capabilities.
    runtimeObsStore.record({
      executionId:  ctx.executionId,
      stepId:       null,
      connectorId:  null,
      capability:   null,
      kind:         "execution_started",
      status:       "running",
      startedAt:    ctx.startedAt ?? t_start,
      finishedAt:   ctx.startedAt ?? t_start,
      durationMs:   0,
      error:        null,
      planId:       ctx.planId,
      goalId:       ctx.goalId,
      timeoutMs:          policy.timeoutMs,
      stepTimeoutMs:      policy.stepTimeoutMs,
      parentExecutionId:   connectorCtx?.requestId ?? null,
    });

    this._emit(ctx, "execution_started", null);

    try {
      if (plan.steps.length === 0) {
        return this._finalize(ctx, "completed", t_start);
      }

      // V1 RESOURCE-AWARE: resolve per-resource policies (MCP via
      // MCPServerConfig.tool_policy + não-MCP via capabilityConcurrency) para
      // TODOS os steps. Quando o mapa é não-vazio, o Orchestrator usa semaphores
      // por resourceKey (recursos independentes paralelos, sem fallback=1).
      // Mapa vazio → backward-compat: usa policy.parallelism (legado).
      const resourcePolicies = await this._resolveResourcePolicies(plan.steps);
      const resolvedParallelism: ParallelismConfig | undefined =
        resourcePolicies.size > 0 ? undefined : policy.parallelism;

      const orchestration = await this._orchestrator.execute({
        steps: plan.steps,
        parallelism: resolvedParallelism,
        resourcePolicies: resourcePolicies.size > 0 ? resourcePolicies : undefined,
        isCancelled: () => ctx.cancelRequested,
        deadlineAt: ctx.timeoutAt ?? Infinity,
        dispatchStep: async (step, semaphoreWaitMs = 0) => {
          ctx.currentStepIndex = plan.steps.indexOf(step);
          return this._dispatchStep(ctx, step, policy, semaphoreWaitMs);
        },
      });

      ctx.stepResults.push(...orchestration.results);

      if (ctx.cancelRequested) return this._finalize(ctx, "cancelled", t_start);
      if (orchestration.stoppedOnFailure) {
        const failed = orchestration.results.find((result) => result.status === "failed" || result.status === "timeout");
        return this._finalize(ctx, failed?.status === "timeout" ? "timeout" : "failed", t_start);
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
      totalCompleted:    this._totalCompleted,
      totalFailed:       this._totalFailed,
      totalCancelled:    this._totalCancelled,
      activeCount:       this.getRunningExecutions().length,
      totalTracked:      this._contexts.size,
      policy:            this._policy,
      // D-05: métricas de observabilidade consolidadas
      obsEvents:         runtimeObsStore.totalEvents(),
      obsExecutions:     runtimeObsStore.totalExecutions(),
      recentSummaries:   runtimeObsStore.getRecentSummaries(5),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _dispatchStep(
    ctx: RuntimeExecutionContext,
    step: import("@/lib/planning-engine-e022/ExecutionPlanTypes").ExecutionStep,
    policy: ExecutionPolicy,
    semaphoreWaitMs = 0,
  ): Promise<import("./RuntimeTypes").StepResult> {
    this._emit(ctx, "execution_step_started", step.id);

    const _stepStartedAt = Date.now();
    const _stepTimeoutMs = Math.min(
      policy.stepTimeoutMs,
      Math.max(100, (ctx.timeoutAt ?? Infinity) - Date.now()),
    );
    runtimeObsStore.record({
      executionId:  ctx.executionId,
      stepId:       step.id,
      connectorId:  step.connector,
      capability:   step.capability,
      kind:         "step_started",
      status:       "running",
      startedAt:    _stepStartedAt,
      finishedAt:   _stepStartedAt,
      durationMs:   0,
      error:        null,
      planId:       ctx.planId,
      goalId:       ctx.goalId,
      timeoutMs:          policy.timeoutMs,
      stepTimeoutMs:      _stepTimeoutMs,
      parentExecutionId:   ctx.connectorCtx?.requestId ?? null,
    });

    const stepResult = await this._dispatcher.dispatch({
      executionId:   ctx.executionId,
      step,
      stepTimeoutMs: Math.min(
        policy.stepTimeoutMs,
        Math.max(100, (ctx.timeoutAt ?? Infinity) - Date.now()),
      ),
      connectorCtx: ctx.connectorCtx,
      semaphoreWaitMs,
    });

    this._emit(ctx, "execution_step_completed", step.id);

    const _stepKind =
      stepResult.status === "completed" ? "step_completed" :
      stepResult.status === "timeout"   ? "step_timeout"   :
      "step_failed";
    runtimeObsStore.record({
      executionId:  ctx.executionId,
      stepId:       stepResult.stepId,
      connectorId:  stepResult.connector,
      capability:   stepResult.capability,
      kind:         _stepKind,
      status:       stepResult.status,
      startedAt:    stepResult.startedAt,
      finishedAt:   stepResult.finishedAt,
      durationMs:   stepResult.durationMs,
      error:        stepResult.error,
      planId:       ctx.planId,
      goalId:       ctx.goalId,
      timeoutMs:          policy.timeoutMs,
      stepTimeoutMs:      _stepTimeoutMs,
      parentExecutionId:   ctx.connectorCtx?.requestId ?? null,
    });

    return stepResult;
  }

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

    // D-01/D-02/D-05: evento de encerramento + fechar summary consolidado
    const _now = ctx.finishedAt!;
    const _obsKind =
      status === "completed" ? "execution_completed" :
      status === "cancelled" ? "execution_cancelled" :
      status === "timeout"   ? "execution_timeout"   :
      "execution_failed";
    runtimeObsStore.record({
      executionId:  ctx.executionId,
      stepId:       null,
      connectorId:  null,
      capability:   null,
      kind:         _obsKind,
      status,
      startedAt:    ctx.startedAt ?? ctx.createdAt,
      finishedAt:   _now,
      durationMs:   _now - (ctx.startedAt ?? ctx.createdAt),
      error:        ctx.metadata["fatalError"] as string ?? null,
      planId:       ctx.planId,
      goalId:       ctx.goalId,
      timeoutMs:          policy?.timeoutMs ?? null,
      stepTimeoutMs:      policy?.stepTimeoutMs ?? null,
      parentExecutionId:   ctx.connectorCtx?.requestId ?? null,
    });
    // D-05: produzir summary consolidado — tempo total, por connector, por etapa
    runtimeObsStore.closeExecution(ctx.executionId, status);

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

  /**
   * V1 RESOURCE-AWARE: resolve Map<resourceKey, maxConcurrent> para TODOS os
   * steps da execução. Delega ao ResourcePolicyResolver compartilhado (mesma
   * implementação usada pelo DynamicWaveRunner — FAST e ADAPTIVE paths
   * produzem políticas idênticas).
   */
  private async _resolveResourcePolicies(
    steps: readonly ExecutionStep[],
  ): Promise<Map<string, number>> {
    return resolveResourcePolicies(steps);
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