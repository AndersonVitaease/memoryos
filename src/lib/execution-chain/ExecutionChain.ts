// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — ExecutionChain (Thin Orchestrator)
//
// This class has ZERO business logic. It only:
//   1. Receives injected dependencies
//   2. Coordinates stage execution in sequence
//   3. Collects per-stage evidence for Explainability
//   4. Publishes lifecycle events to the shared EventBus
//   5. Records metrics via RuntimeMetrics
//   6. Consolidates the final report
//
// All time comes from: runtimeClock.now()
// All IDs come from:   executionIdProvider.next()
// All connector resolution from: connectorRegistry.resolve()
// ══════════════════════════════════════════════════════════════════════════════

import type { IClock } from "../runtime-infra/RuntimeClockTypes";
import type { IExecutionIdProvider } from "../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus } from "../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics } from "../runtime-infra/RuntimeMetrics";
import { SystemClock } from "../runtime-infra/RuntimeClock";
import { UUIDProvider } from "../runtime-infra/RuntimeExecutionIdProvider";

import type {
  ChainStage, ChainStageRecord, ChainStageStatus,
  UserInput, IntentResult, GoalResult, PlanResult, KernelResult,
  OrchestratorResult, CapabilityResult, ConnectorRuntimeResult,
  ConnectorResult, ResultOutput, MemoryResult, ExplainabilityResult,
  AuditResult, ExecutionChainReport,
} from "./ExecutionChainTypes";

import type { IConnectorRegistry } from "./ConnectorRegistry";
import { ConnectorRegistry } from "./ConnectorRegistry";

import type { IIntentRuntime }           from "./stages/IntentRuntimeStage";
import type { IGoalRuntime }             from "./stages/GoalRuntimeStage";
import type { IPlanningRuntime }         from "./stages/PlanningRuntimeStage";
import type { IKernel }                  from "./stages/KernelStage";
import type { IRuntimeOrchestrator }     from "./stages/RuntimeOrchestratorStage";
import type { ICapabilityRuntime }       from "./stages/CapabilityRuntimeStage";
import type { IConnectorRuntimeStage }   from "./stages/ConnectorRuntimeStageImpl";
import type { IConnectorStage }          from "./stages/ConnectorStage";
import type { IResultStage }             from "./stages/ResultStage";
import type { IMemoryEngine }            from "./stages/MemoryStage";
import type { IExplainabilityEngine }    from "./stages/ExplainabilityStage";
import type { IAuditEngine }             from "./stages/AuditStage";

import { IntentRuntimeStage }         from "./stages/IntentRuntimeStage";
import { GoalRuntimeStage }           from "./stages/GoalRuntimeStage";
import { PlanningRuntimeStage }       from "./stages/PlanningRuntimeStage";
import { KernelStage }                from "./stages/KernelStage";
import { RuntimeOrchestratorStage }   from "./stages/RuntimeOrchestratorStage";
import { CapabilityRuntimeStageImpl } from "./stages/CapabilityRuntimeStage";
import { ConnectorRuntimeStageImpl }  from "./stages/ConnectorRuntimeStageImpl";
import { ConnectorStageImpl }         from "./stages/ConnectorStage";
import { ResultStageImpl }            from "./stages/ResultStage";
import { MemoryStageImpl }            from "./stages/MemoryStage";
import { ExplainabilityStageImpl }    from "./stages/ExplainabilityStage";
import { AuditStageImpl }             from "./stages/AuditStage";

// ── Stage event types emitted on the shared bus ───────────────────────────────
// (extends the existing RuntimeEvent types with chain-specific events)
import type { RuntimeEventType } from "../runtime-infra/RuntimeEvent";

const EV_EXEC_STARTED:    RuntimeEventType = "EXECUTION_STARTED";
const EV_STAGE_COMPLETED: RuntimeEventType = "STAGE_COMPLETED";
const EV_STAGE_FAILED:    RuntimeEventType = "STAGE_FAILED";
const EV_EXEC_COMPLETED:  RuntimeEventType = "EXECUTION_COMPLETED";
const EV_EXEC_FAILED:     RuntimeEventType = "EXECUTION_FAILED";

// ── Dependency container ──────────────────────────────────────────────────────
export interface ExecutionChainDeps {
  // Infrastructure
  runtimeClock?:          IClock;
  executionIdProvider?:   IExecutionIdProvider;
  eventBus?:              RuntimeEventBus;
  metrics?:               RuntimeMetrics;
  // Stage runtimes (all optional — defaults provided)
  intentRuntime?:         IIntentRuntime;
  goalRuntime?:           IGoalRuntime;
  planningRuntime?:       IPlanningRuntime;
  kernel?:                IKernel;
  runtimeOrchestrator?:   IRuntimeOrchestrator;
  capabilityRuntime?:     ICapabilityRuntime;
  connectorRuntime?:      IConnectorRuntimeStage;
  connectorRegistry?:     IConnectorRegistry;
  connectorStage?:        IConnectorStage;
  resultStage?:           IResultStage;
  memoryEngine?:          IMemoryEngine;
  explainabilityEngine?:  IExplainabilityEngine;
  auditEngine?:           IAuditEngine;
}

// ── Thin Orchestrator ─────────────────────────────────────────────────────────
export class ExecutionChain {
  // Infrastructure — injected, never instantiated internally
  private readonly _clock:   IClock;
  private readonly _ids:     IExecutionIdProvider;
  private readonly _bus:     RuntimeEventBus;
  private readonly _metrics: RuntimeMetrics;

  // Stage delegates — injected
  private readonly _intent:       IIntentRuntime;
  private readonly _goal:         IGoalRuntime;
  private readonly _planning:     IPlanningRuntime;
  private readonly _kernel:       IKernel;
  private readonly _orchestrator: IRuntimeOrchestrator;
  private readonly _capability:   ICapabilityRuntime;
  private readonly _crStage:      IConnectorRuntimeStage;
  private readonly _connector:    IConnectorStage;
  private readonly _result:       IResultStage;
  private readonly _memory:       IMemoryEngine;
  private readonly _explain:      IExplainabilityEngine;
  private readonly _audit:        IAuditEngine;

  constructor(deps: ExecutionChainDeps = {}) {
    // Infrastructure defaults
    this._clock   = deps.runtimeClock        ?? new SystemClock();
    this._ids     = deps.executionIdProvider ?? new UUIDProvider();
    this._bus     = deps.eventBus            ?? new RuntimeEventBus(1000);
    this._metrics = deps.metrics             ?? new RuntimeMetrics(60000, () => this._clock.now());

    const registry: IConnectorRegistry = deps.connectorRegistry ?? new ConnectorRegistry();

    // Stage defaults — each stage gets the same clock + id provider
    this._intent       = deps.intentRuntime        ?? new IntentRuntimeStage();
    this._goal         = deps.goalRuntime          ?? new GoalRuntimeStage(this._ids);
    this._planning     = deps.planningRuntime      ?? new PlanningRuntimeStage(this._ids, registry);
    this._kernel       = deps.kernel               ?? new KernelStage(this._ids);
    this._orchestrator = deps.runtimeOrchestrator  ?? new RuntimeOrchestratorStage(this._ids);
    this._capability   = deps.capabilityRuntime    ?? new CapabilityRuntimeStageImpl(this._ids);
    this._crStage      = deps.connectorRuntime     ?? new ConnectorRuntimeStageImpl(this._ids);
    this._connector    = deps.connectorStage       ?? new ConnectorStageImpl(this._clock);
    this._result       = deps.resultStage          ?? new ResultStageImpl(this._ids);
    this._memory       = deps.memoryEngine         ?? new MemoryStageImpl(this._ids);
    this._explain      = deps.explainabilityEngine ?? new ExplainabilityStageImpl(this._ids);
    this._audit        = deps.auditEngine          ?? new AuditStageImpl(this._ids, this._clock);
  }

  // ── Execute — pure coordination, no business logic ────────────────────────
  async execute(input: UserInput): Promise<ExecutionChainReport> {
    const chainId   = this._ids.next("chain");
    const startedAt = this._clock.now();
    const stages: ChainStageRecord[] = [];
    const evidences: string[] = [];   // per-stage evidence collected for Explainability

    this._metrics.recordExecution();
    this._emit(EV_EXEC_STARTED, chainId, "ExecutionChain started");

    // Stage 1 — USER_INPUT (no-op; marks the start)
    stages.push(this._record("USER_INPUT", startedAt, startedAt, input, input, null));

    // ── Stage 2 — INTENT_RUNTIME ─────────────────────────────────────────────
    let intent!: IntentResult;
    {
      const { record, output } = await this._run("INTENT_RUNTIME", input,
        () => this._intent.classify(input));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      intent = output;
      if (intent.evidence) evidences.push(intent.evidence);
    }

    // ── Stage 3 — GOAL_RUNTIME ───────────────────────────────────────────────
    let goal!: GoalResult;
    {
      const { record, output } = await this._run("GOAL_RUNTIME", intent,
        () => this._goal.derive(intent, input));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      goal = output;
      if (goal.evidence) evidences.push(goal.evidence);
    }

    // ── Stage 4 — PLANNING_RUNTIME ───────────────────────────────────────────
    let plan!: PlanResult;
    {
      const { record, output } = await this._run("PLANNING_RUNTIME", goal,
        () => this._planning.plan(goal, intent));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      plan = output;
      if (plan.evidence) evidences.push(plan.evidence);
    }

    // ── Stage 5 — KERNEL ─────────────────────────────────────────────────────
    let kern!: KernelResult;
    {
      const { record, output } = await this._run("KERNEL", plan,
        () => this._kernel.apply(plan, input));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      kern = output;
      if (kern.evidence) evidences.push(kern.evidence);
    }

    // ── Stage 6 — RUNTIME_ORCHESTRATOR ──────────────────────────────────────
    let orch!: OrchestratorResult;
    {
      const { record, output } = await this._run("RUNTIME_ORCHESTRATOR", kern,
        () => this._orchestrator.orchestrate(kern, plan));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      orch = output;
      if (orch.evidence) evidences.push(orch.evidence);
    }

    // ── Stage 7 — CAPABILITY_RUNTIME ─────────────────────────────────────────
    let cap!: CapabilityResult;
    {
      const { record, output } = await this._run("CAPABILITY_RUNTIME", orch,
        () => this._capability.prepare(orch));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      cap = output;
      if (cap.evidence) evidences.push(cap.evidence);
    }

    // ── Stage 8 — CONNECTOR_RUNTIME ──────────────────────────────────────────
    let cr!: ConnectorRuntimeResult;
    {
      const { record, output } = await this._run("CONNECTOR_RUNTIME", cap,
        () => this._crStage.connect(orch));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      cr = output;
      if (cr.evidence) evidences.push(cr.evidence);
    }

    // ── Stage 9 — CONNECTOR ──────────────────────────────────────────────────
    let conn!: ConnectorResult;
    {
      const { record, output } = await this._run("CONNECTOR", cr,
        () => this._connector.execute(orch, cr, input));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      conn = output;
      if (conn.evidence) evidences.push(conn.evidence);
    }

    // ── Stage 10 — RESULT ────────────────────────────────────────────────────
    let result!: ResultOutput;
    {
      const { record, output } = await this._run("RESULT", conn,
        () => this._result.produce(conn, intent));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      result = output;
      if (result.evidence) evidences.push(result.evidence);
    }

    // ── Stage 11 — MEMORY ────────────────────────────────────────────────────
    let mem!: MemoryResult;
    {
      const { record, output } = await this._run("MEMORY", result,
        () => this._memory.memorize(result, goal, input));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      mem = output;
      if (mem.evidence) evidences.push(mem.evidence);
    }

    // ── Stage 12 — EXPLAINABILITY ────────────────────────────────────────────
    // Evidence is passed in — never reconstructed from final state
    let expl!: ExplainabilityResult;
    {
      const { record, output } = await this._run("EXPLAINABILITY", mem,
        () => this._explain.explain(stages, result, intent, evidences));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      expl = output;
    }

    // ── Stage 13 — AUDIT ─────────────────────────────────────────────────────
    // Consumes official bus events — never post-hoc state analysis
    let audit!: AuditResult;
    {
      const { record, output } = await this._run("AUDIT", expl,
        () => this._audit.audit(chainId, mem, expl, this._bus));
      stages.push(record);
      if (!output) return this._fail(chainId, startedAt, stages, input);
      audit = output;
    }

    const completedAt = this._clock.now();
    const durationMs  = completedAt - startedAt;
    this._metrics.recordSuccess(durationMs);
    this._emit(EV_EXEC_COMPLETED, chainId, `completed in ${durationMs}ms`, { durationMs });

    return Object.freeze({
      chainId,
      sessionId:            input.sessionId,
      userId:               input.userId,
      startedAt,
      completedAt,
      totalDurationMs:      durationMs,
      status:               "COMPLETED" as const,
      stages:               Object.freeze(stages) as unknown as ChainStageRecord[],
      userInput:            input,
      finalOutput:          result,
      memoryResult:         mem,
      explainabilityResult: expl,
      auditResult:          audit,
      stagesPassed:         stages.filter(s => s.status === "COMPLETED").length,
      stagesTotal:          stages.length,
    });
  }

  // ── Public accessors for Dashboard consumption ────────────────────────────
  bus():     RuntimeEventBus { return this._bus; }
  metrics(): RuntimeMetrics  { return this._metrics; }

  // ── Private helpers — no business logic ──────────────────────────────────

  private async _run<T>(
    stage: ChainStage,
    input: unknown,
    fn: () => Promise<T>,
  ): Promise<{ record: ChainStageRecord; output: T | null }> {
    const startedAt = this._clock.now();
    try {
      const output      = await fn();
      const completedAt = this._clock.now();
      const durationMs  = completedAt - startedAt;
      this._metrics.recordSuccess(durationMs);
      this._emit(EV_STAGE_COMPLETED, stage, undefined, { stage, durationMs });
      return {
        record: this._record(stage, startedAt, completedAt, input, output, null),
        output,
      };
    } catch (e: unknown) {
      const completedAt = this._clock.now();
      const error       = String((e as Error).message ?? e);
      this._metrics.recordFailure();
      this._emit(EV_STAGE_FAILED, stage, error);
      return {
        record: this._record(stage, startedAt, completedAt, input, null, error),
        output: null,
      };
    }
  }

  private _record(
    stage: ChainStage,
    startedAt: number,
    completedAt: number,
    input: unknown,
    output: unknown,
    error: string | null,
  ): ChainStageRecord {
    return Object.freeze({
      stage,
      status:      (error ? "FAILED" : "COMPLETED") as ChainStageStatus,
      startedAt,
      completedAt,
      durationMs:  completedAt - startedAt,
      input,
      output,
      error,
    });
  }

  private _emit(
    type: RuntimeEventType,
    executionId: string,
    detail?: string,
    payload?: Record<string, unknown>,
  ): void {
    this._bus.publish(Object.freeze({
      type,
      executionId,
      runtimeLabel:  "ExecutionChain",
      timestamp:     this._clock.now(),
      detail,
      payload,
    }));
  }

  private _fail(
    chainId: string,
    startedAt: number,
    stages: ChainStageRecord[],
    input: UserInput,
  ): ExecutionChainReport {
    const completedAt = this._clock.now();
    this._metrics.recordFailure();
    this._emit(EV_EXEC_FAILED, chainId, "pipeline aborted");
    return Object.freeze({
      chainId,
      sessionId:            input.sessionId,
      userId:               input.userId,
      startedAt,
      completedAt,
      totalDurationMs:      completedAt - startedAt,
      status:               "FAILED" as const,
      stages:               Object.freeze(stages) as unknown as ChainStageRecord[],
      userInput:            input,
      finalOutput:          null,
      memoryResult:         null,
      explainabilityResult: null,
      auditResult:          null,
      stagesPassed:         stages.filter(s => s.status === "COMPLETED").length,
      stagesTotal:          stages.length,
    });
  }
}