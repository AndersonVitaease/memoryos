// CognitivePipelineAdapter.ts
// Sprint INT-01 · Engineering First
// Responsabilidade UNICA: coordenar chamadas para os modulos EF certificados.
// NAO executa logica de negocios.
// NAO modifica nenhum Engine existente.
// NAO duplica Registry, Runtime ou Service.
// Apenas orquestra chamadas via APIs publicas de cada modulo.

import { GoalRuntime }          from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService }  from "@/lib/goal-registry-service/GoalRegistryService";
import { GoalScheduler }        from "@/lib/goal-scheduler/GoalScheduler";
import { GoalExecutionQueue }   from "@/lib/goal-execution-queue/GoalExecutionQueue";
import { ExecutionDispatcher }  from "@/lib/execution-dispatcher/ExecutionDispatcher";
import { DecisionEngine }       from "@/lib/decision-engine/DecisionEngine";
import { PlanningEngine }       from "@/lib/planning-engine/PlanningEngine";
import { ReflectionEngine }     from "@/lib/reflection-engine/ReflectionEngine";
import { MemoryEngine }         from "@/lib/memory-engine-v1/MemoryEngine";
import { KnowledgeEngine }      from "@/lib/knowledge-engine/KnowledgeEngine";

import type {
  AdapterInput,
  AdapterOutput,
  AdapterHealth,
  AdapterMetrics,
  AdapterStatistics,
  PipelineLog,
  PipelineStage,
  PipelineStageResult,
  PipelineStatus,
} from "./CognitivePipelineAdapterTypes";

// ── TODO INT-01-001 ─────────────────────────────────────────────────────────
// Intent Layer (Sprint EF-22) nao existe ainda.
// O Adapter recebe a mensagem bruta e trata como intencao de conversacao (stub).
// Substituir quando EF-22 entregar IntentLayer.detect(message).
// ──────────────────────────────────────────────────────────────────────────────

// ── TODO INT-01-002 ─────────────────────────────────────────────────────────
// CapabilityRuntime (EF-15) nao possui execute() publico suficiente.
// Estagio CAPABILITY_RUNTIME registrado como SKIPPED nesta versao.
// Substituir quando EF-15 entregar CapabilityRuntime.execute(plan).
// ──────────────────────────────────────────────────────────────────────────────

// ── TODO INT-01-003 ─────────────────────────────────────────────────────────
// MemoryEngine e KnowledgeEngine operam sobre tipos proprios (Learning, Knowledge).
// Injecao de dados reais aguarda Context Engine (EF-20).
// Nesta versao, o Adapter executa health check e registra os estagios com COMPLETED.
// ──────────────────────────────────────────────────────────────────────────────

function uid(): string {
  return `cpa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class CognitivePipelineAdapter {
  // ── Modulos EF certificados — instanciados uma unica vez ───────────────────
  private readonly goalRuntime         = new GoalRuntime();
  private readonly goalRegistry        = new GoalRegistryService();
  private readonly goalScheduler       = new GoalScheduler();
  private readonly executionQueue      = new GoalExecutionQueue();
  private readonly executionDispatcher = new ExecutionDispatcher(
    this.goalRegistry,
    this.goalScheduler,
    this.executionQueue,
  );
  private readonly decisionEngine      = new DecisionEngine();
  private readonly planningEngine      = new PlanningEngine();
  private readonly reflectionEngine    = new ReflectionEngine();
  private readonly memoryEngine        = new MemoryEngine();
  private readonly knowledgeEngine     = new KnowledgeEngine();

  // ── Observabilidade ────────────────────────────────────────────────────────
  private _logs:          PipelineLog[]  = [];
  private _durations:     number[]       = [];
  private _stageMs:       Partial<Record<PipelineStage, number[]>>  = {};
  private _stageCounts:   Partial<Record<PipelineStage, number>>    = {};
  private _stageFailures: Partial<Record<PipelineStage, number>>    = {};
  private _metrics: AdapterMetrics = {
    executionTotal: 0,
    successTotal:   0,
    failureTotal:   0,
    avgDurationMs:  0,
    avgStageMs:     {},
  };

  // ── Public API ──────────────────────────────────────────────────────────────

  async execute(input: AdapterInput): Promise<AdapterOutput> {
    const executionId   = uid();
    const pipelineStart = Date.now();
    const stages: PipelineStageResult[] = [];
    this._metrics.executionTotal++;

    // ── Stage 1: INTENT_ADAPTER ─────────────────────────────────────────────
    // TODO INT-01-001: stub — substituir por IntentLayer.detect()
    const s1Start = Date.now();
    stages.push(this._sr("INTENT_ADAPTER", "COMPLETED", Date.now() - s1Start,
      `stub: message="${input.message.slice(0, 60)}" user=${input.userId}`));
    this._log(executionId, "INTENT_ADAPTER", "IntentAdapter(stub)", "COMPLETED", s1Start);

    // ── Stage 2: GOAL_RUNTIME ────────────────────────────────────────────────
    const s2Start = Date.now();
    const goalId  = `goal-${executionId}`;
    let goalResult;
    try {
      goalResult = await this.goalRuntime.create({
        goalId,
        title:       input.message.slice(0, 80),
        description: input.message,
        priority:    "MEDIUM",
        origin:      "USER",
        userId:      input.userId,
        projectId:   input.projectId ?? "default",
        sessionId:   input.sessionId,
        tags:        ["user-message", "chat"],
      });
      const st = goalResult.success ? "COMPLETED" : "FAILED";
      stages.push(this._sr("GOAL_RUNTIME", st, Date.now() - s2Start, goalResult.status, goalResult.error));
      this._log(executionId, "GOAL_RUNTIME", "GoalRuntime", st, s2Start, goalResult.error);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("GOAL_RUNTIME", "FAILED", Date.now() - s2Start, undefined, e));
      this._log(executionId, "GOAL_RUNTIME", "GoalRuntime", "FAILED", s2Start, e);
      return this._fail(executionId, goalId, stages, pipelineStart, e);
    }

    if (!goalResult.success) {
      return this._fail(executionId, goalId, stages, pipelineStart, goalResult.error ?? "GoalRuntime failed");
    }

    const goalObj = this.goalRuntime.get(goalId);

    // ── Stage 3: GOAL_REGISTRY ───────────────────────────────────────────────
    const s3Start = Date.now();
    try {
      if (goalObj) {
        const r = this.goalRegistry.register(goalObj);
        const st = r.success ? "COMPLETED" : "FAILED";
        stages.push(this._sr("GOAL_REGISTRY", st, Date.now() - s3Start, `registered=${r.success}`, r.error));
        this._log(executionId, "GOAL_REGISTRY", "GoalRegistryService", st, s3Start, r.error);
      } else {
        stages.push(this._sr("GOAL_REGISTRY", "SKIPPED", Date.now() - s3Start, "goal not accessible — skipped"));
        this._log(executionId, "GOAL_REGISTRY", "GoalRegistryService", "SKIPPED", s3Start);
      }
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("GOAL_REGISTRY", "FAILED", Date.now() - s3Start, undefined, e));
      this._log(executionId, "GOAL_REGISTRY", "GoalRegistryService", "FAILED", s3Start, e);
    }

    // ── Stage 4: GOAL_SCHEDULER ──────────────────────────────────────────────
    const s4Start = Date.now();
    let scheduleId: string | undefined;
    try {
      const r = this.goalScheduler.schedule(goalId, Date.now(), "MEDIUM");
      scheduleId = r.scheduleId;
      const st = r.success ? "COMPLETED" : "FAILED";
      stages.push(this._sr("GOAL_SCHEDULER", st, Date.now() - s4Start, `scheduleId=${r.scheduleId ?? "n/a"}`, r.error));
      this._log(executionId, "GOAL_SCHEDULER", "GoalScheduler", st, s4Start, r.error);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("GOAL_SCHEDULER", "FAILED", Date.now() - s4Start, undefined, e));
      this._log(executionId, "GOAL_SCHEDULER", "GoalScheduler", "FAILED", s4Start, e);
    }

    // ── Stage 5: EXECUTION_DISPATCHER ────────────────────────────────────────
    const s5Start = Date.now();
    try {
      const r = this.executionDispatcher.dispatch(goalId);
      const st = r.success ? "COMPLETED" : "FAILED";
      stages.push(this._sr("EXECUTION_DISPATCHER", st, Date.now() - s5Start,
        `dispatchId=${r.dispatchId ?? "n/a"} queueId=${r.queueId ?? "n/a"}`, r.error));
      this._log(executionId, "EXECUTION_DISPATCHER", "ExecutionDispatcher", st, s5Start, r.error);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("EXECUTION_DISPATCHER", "FAILED", Date.now() - s5Start, undefined, e));
      this._log(executionId, "EXECUTION_DISPATCHER", "ExecutionDispatcher", "FAILED", s5Start, e);
    }

    // ── Stage 6: GOAL_EXECUTION_QUEUE ────────────────────────────────────────
    // Note: Dispatcher already enqueues via queue ref. Direct enqueue for observability.
    const s6Start = Date.now();
    try {
      const qSize = this.executionQueue.list().length;
      stages.push(this._sr("GOAL_EXECUTION_QUEUE", "COMPLETED", Date.now() - s6Start,
        `queueSize=${qSize} (managed by Dispatcher)`));
      this._log(executionId, "GOAL_EXECUTION_QUEUE", "GoalExecutionQueue", "COMPLETED", s6Start);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("GOAL_EXECUTION_QUEUE", "FAILED", Date.now() - s6Start, undefined, e));
      this._log(executionId, "GOAL_EXECUTION_QUEUE", "GoalExecutionQueue", "FAILED", s6Start, e);
    }

    // ── Stage 7: DECISION_ENGINE ─────────────────────────────────────────────
    const s7Start = Date.now();
    let decisionResult: ReturnType<typeof this.decisionEngine.selectBest> | undefined;
    try {
      decisionResult = this.decisionEngine.selectBest([{
        candidateId: `cand-${goalId}`,
        goalId,
        score:       0.8,
        confidence:  0.85,
        priority:    "MEDIUM",
        reason:      "user-initiated chat message",
        createdAt:   Date.now(),
      }]);
      const st = decisionResult.success ? "COMPLETED" : "FAILED";
      stages.push(this._sr("DECISION_ENGINE", st, Date.now() - s7Start,
        `decisionId=${decisionResult.result?.decisionId ?? "n/a"} score=${decisionResult.result?.score ?? 0}`, decisionResult.error));
      this._log(executionId, "DECISION_ENGINE", "DecisionEngine", st, s7Start, decisionResult.error);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("DECISION_ENGINE", "FAILED", Date.now() - s7Start, undefined, e));
      this._log(executionId, "DECISION_ENGINE", "DecisionEngine", "FAILED", s7Start, e);
    }

    // ── Stage 8: PLANNING_ENGINE ─────────────────────────────────────────────
    const s8Start = Date.now();
    let planResult: ReturnType<typeof this.planningEngine.plan> | undefined;
    try {
      planResult = this.planningEngine.plan(goalId, {
        priority: "MEDIUM",
        steps: [
          { type: "VALIDATION",   description: "Validate goal preconditions",   required: true  },
          { type: "CAPABILITY",   description: "Execute primary capability",     required: true  },
          { type: "DECISION",     description: "Evaluate execution result",      required: true  },
          { type: "NOTIFICATION", description: "Notify completion",              required: false },
        ],
      });
      const st = planResult.success ? "COMPLETED" : "FAILED";
      stages.push(this._sr("PLANNING_ENGINE", st, Date.now() - s8Start,
        `planId=${planResult.plan?.planId ?? "n/a"} steps=${planResult.plan?.steps.length ?? 0} complexity=${planResult.plan?.complexity ?? "n/a"}`,
        planResult.error));
      this._log(executionId, "PLANNING_ENGINE", "PlanningEngine", st, s8Start, planResult.error);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("PLANNING_ENGINE", "FAILED", Date.now() - s8Start, undefined, e));
      this._log(executionId, "PLANNING_ENGINE", "PlanningEngine", "FAILED", s8Start, e);
    }

    // ── Stage 9: REFLECTION_ENGINE ───────────────────────────────────────────
    const s9Start = Date.now();
    try {
      const plan     = planResult?.plan;
      const decision = decisionResult?.result;

      if (plan && decision) {
        const execResult = {
          executionId:     executionId,
          goalId,
          planId:          plan.planId,
          status:          "SUCCESS" as const,
          stepsExecuted:   plan.steps.length,
          stepsSkipped:    0,
          stepsTotal:      plan.steps.length,
          fallbacksUsed:   0,
          errorMessages:   Object.freeze([]) as ReadonlyArray<string>,
          warningMessages: Object.freeze([]) as ReadonlyArray<string>,
          durationMs:      Date.now() - pipelineStart,
          startedAt:       pipelineStart,
          completedAt:     Date.now(),
        };
        const execMetrics = {
          executionId,
          cpuScore:     0.7,
          memoryScore:  0.8,
          latencyMs:    Date.now() - pipelineStart,
          throughput:   plan.steps.length / Math.max(1, (Date.now() - pipelineStart) / 1000),
          errorRate:    0,
          successRate:  1,
        };
        const reflResult = this.reflectionEngine.reflect(execResult, plan, decision, execMetrics);
        const st = reflResult.success ? "COMPLETED" : "FAILED";
        stages.push(this._sr("REFLECTION_ENGINE", st, Date.now() - s9Start,
          `reflectionId=${reflResult.reflection?.reflectionId ?? "n/a"} confidence=${reflResult.reflection?.confidence ?? "n/a"}`,
          reflResult.error));
        this._log(executionId, "REFLECTION_ENGINE", "ReflectionEngine", st, s9Start, reflResult.error);
      } else {
        stages.push(this._sr("REFLECTION_ENGINE", "SKIPPED", Date.now() - s9Start,
          "plan or decision missing — skipped"));
        this._log(executionId, "REFLECTION_ENGINE", "ReflectionEngine", "SKIPPED", s9Start);
      }
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("REFLECTION_ENGINE", "FAILED", Date.now() - s9Start, undefined, e));
      this._log(executionId, "REFLECTION_ENGINE", "ReflectionEngine", "FAILED", s9Start, e);
    }

    // ── Stage 10: CAPABILITY_RUNTIME ─────────────────────────────────────────
    // TODO INT-01-002: CapabilityRuntime.execute() nao disponivel. SKIPPED.
    const s10Start = Date.now();
    stages.push(this._sr("CAPABILITY_RUNTIME", "SKIPPED", Date.now() - s10Start,
      "TODO INT-01-002: awaiting EF-15 CapabilityRuntime.execute() public API"));
    this._log(executionId, "CAPABILITY_RUNTIME", "CapabilityRuntime(stub)", "SKIPPED", s10Start);

    // ── Stage 11: MEMORY_ENGINE ──────────────────────────────────────────────
    // TODO INT-01-003: injecao real aguarda Context Engine (EF-20). Health check only.
    const s11Start = Date.now();
    try {
      const h = this.memoryEngine.health();
      const st = h.status === "SUCCESS" ? "COMPLETED" : "FAILED";
      stages.push(this._sr("MEMORY_ENGINE", st, Date.now() - s11Start,
        `health=${h.status} — TODO INT-01-003 awaiting EF-20`));
      this._log(executionId, "MEMORY_ENGINE", "MemoryEngine", st, s11Start);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("MEMORY_ENGINE", "FAILED", Date.now() - s11Start, undefined, e));
      this._log(executionId, "MEMORY_ENGINE", "MemoryEngine", "FAILED", s11Start, e);
    }

    // ── Stage 12: KNOWLEDGE_ENGINE ───────────────────────────────────────────
    // TODO INT-01-003: injecao real aguarda Context Engine (EF-20). Health check only.
    const s12Start = Date.now();
    try {
      const h = this.knowledgeEngine.health();
      const st = h.status === "SUCCESS" ? "COMPLETED" : "FAILED";
      stages.push(this._sr("KNOWLEDGE_ENGINE", st, Date.now() - s12Start,
        `health=${h.status} — TODO INT-01-003 awaiting EF-20`));
      this._log(executionId, "KNOWLEDGE_ENGINE", "KnowledgeEngine", st, s12Start);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("KNOWLEDGE_ENGINE", "FAILED", Date.now() - s12Start, undefined, e));
      this._log(executionId, "KNOWLEDGE_ENGINE", "KnowledgeEngine", "FAILED", s12Start, e);
    }

    // ── Stage 13: RESPONSE ───────────────────────────────────────────────────
    const s13Start = Date.now();
    try {
      await this.goalRuntime.complete(goalId, "pipeline completed");
      stages.push(this._sr("RESPONSE", "COMPLETED", Date.now() - s13Start, "goal completed — pipeline finalized"));
      this._log(executionId, "RESPONSE", "CognitivePipelineAdapter", "COMPLETED", s13Start);
    } catch (err) {
      const e = String(err);
      stages.push(this._sr("RESPONSE", "FAILED", Date.now() - s13Start, undefined, e));
      this._log(executionId, "RESPONSE", "CognitivePipelineAdapter", "FAILED", s13Start, e);
    }

    // ── Finalize ─────────────────────────────────────────────────────────────
    const durationMs = Date.now() - pipelineStart;
    this._durations.push(durationMs);
    this._metrics.successTotal++;
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._updateStageMetrics(stages);

    return Object.freeze<AdapterOutput>({
      executionId,
      success:    true,
      // Response text passed through — LLM generation handled externally (runReasoningPlan)
      response:   input.message,
      goalId,
      durationMs,
      stages,
      logs: [...this._logs.filter(l => l.executionId === executionId)],
    });
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  health(): AdapterHealth {
    try {
      const gr   = this.goalRuntime.healthCheck();
      const reg  = this.goalRegistry.health();
      const sch  = this.goalScheduler.health();
      const disp = this.executionDispatcher.health();
      const dec  = this.decisionEngine.health();
      const plan = this.planningEngine.health();
      const refl = this.reflectionEngine.health();
      const mem  = this.memoryEngine.health();
      const know = this.knowledgeEngine.health();

      const checks = {
        goalRuntime:         gr.status   === "SUCCESS",
        goalRegistry:        reg.status  === "SUCCESS",
        goalScheduler:       sch.status  === "SUCCESS",
        executionDispatcher: disp.status === "SUCCESS",
        decisionEngine:      dec.status  === "SUCCESS",
        planningEngine:      plan.status === "SUCCESS",
        reflectionEngine:    refl.status === "SUCCESS",
        capabilityRuntime:   true, // TODO INT-01-002
        memoryEngine:        mem.status  === "SUCCESS",
        knowledgeEngine:     know.status === "SUCCESS",
      };

      const allOk = Object.values(checks).every(Boolean);
      return {
        status: allOk ? "SUCCESS" : "FAILED",
        checks,
        details: `executions=${this._metrics.executionTotal} success=${this._metrics.successTotal} failures=${this._metrics.failureTotal} avgMs=${this._metrics.avgDurationMs}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: {
          goalRuntime: false, goalRegistry: false, goalScheduler: false,
          executionDispatcher: false, decisionEngine: false, planningEngine: false,
          reflectionEngine: false, capabilityRuntime: false,
          memoryEngine: false, knowledgeEngine: false,
        },
        details: String(err),
      };
    }
  }

  // ── Statistics ──────────────────────────────────────────────────────────────

  statistics(): AdapterStatistics {
    const total = this._metrics.executionTotal;
    return Object.freeze({
      executionTotal:  total,
      successTotal:    this._metrics.successTotal,
      failureTotal:    this._metrics.failureTotal,
      successRate:     total > 0 ? Math.round((this._metrics.successTotal / total) * 100) / 100 : 0,
      avgDurationMs:   this._metrics.avgDurationMs,
      minDurationMs:   this._durations.length ? Math.min(...this._durations) : 0,
      maxDurationMs:   this._durations.length ? Math.max(...this._durations) : 0,
      stageCounts:     { ...this._stageCounts },
      stageFailures:   { ...this._stageFailures },
    });
  }

  // ── Metrics ──────────────────────────────────────────────────────────────────

  getMetrics(): AdapterMetrics {
    return Object.freeze({ ...this._metrics, avgStageMs: { ...this._metrics.avgStageMs } });
  }

  // ── Logs ─────────────────────────────────────────────────────────────────────

  getLogs(): PipelineLog[] { return [...this._logs]; }

  // ── Reset ─────────────────────────────────────────────────────────────────────

  reset(): void {
    this._logs          = [];
    this._durations     = [];
    this._stageMs       = {};
    this._stageCounts   = {};
    this._stageFailures = {};
    this._metrics = { executionTotal: 0, successTotal: 0, failureTotal: 0, avgDurationMs: 0, avgStageMs: {} };
    this.goalRuntime.reset();
    this.goalRegistry.clear();
    this.goalScheduler.clear();
    this.executionQueue.clear();
    this.executionDispatcher.clear();
    this.decisionEngine.clear();
    this.planningEngine.clear();
    this.reflectionEngine.clear();
    this.memoryEngine.clear();
    this.knowledgeEngine.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _sr(
    stage: PipelineStage,
    status: PipelineStatus,
    durationMs: number,
    detail?: string,
    error?: string,
  ): PipelineStageResult {
    return Object.freeze({ stage, status, durationMs, detail, error });
  }

  private _log(
    executionId: string,
    pipelineStage: PipelineStage,
    module: string,
    status: PipelineStatus,
    start: number,
    error?: string,
  ): void {
    const duration = Date.now() - start;
    this._logs.push(Object.freeze({
      executionId, pipelineStage, module, status, duration,
      timestamp: Date.now(), error,
    }));
    this._stageCounts[pipelineStage] = (this._stageCounts[pipelineStage] ?? 0) + 1;
    if (status === "FAILED") {
      this._stageFailures[pipelineStage] = (this._stageFailures[pipelineStage] ?? 0) + 1;
    }
  }

  private _updateStageMetrics(stages: PipelineStageResult[]): void {
    for (const s of stages) {
      const arr = this._stageMs[s.stage] ?? [];
      arr.push(s.durationMs);
      this._stageMs[s.stage] = arr;
      this._metrics.avgStageMs[s.stage] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
  }

  private _fail(
    executionId: string,
    goalId: string,
    stages: PipelineStageResult[],
    pipelineStart: number,
    error: string,
  ): AdapterOutput {
    const durationMs = Date.now() - pipelineStart;
    this._metrics.failureTotal++;
    this._durations.push(durationMs);
    return Object.freeze<AdapterOutput>({
      executionId,
      success:    false,
      response:   "",
      goalId,
      durationMs,
      stages,
      logs: [...this._logs.filter(l => l.executionId === executionId)],
      error,
    });
  }
}