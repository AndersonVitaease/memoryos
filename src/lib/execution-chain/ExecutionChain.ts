// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — ExecutionChain (Thin Orchestrator — Architecture Freeze)
//
// ZERO business logic. ZERO object instantiation. ZERO stage knowledge.
// Delegates entirely to:
//   * ExecutionCompositionRoot  — builds the runtime graph
//   * ExecutionPipeline         — runs the stages
//   * ExecutionContext           — carries shared services
// ══════════════════════════════════════════════════════════════════════════════

import { ExecutionCompositionRoot }         from "./ExecutionCompositionRoot";
import type { ComposedRuntime, CompositionDeps } from "./ExecutionCompositionRoot";
import type { RuntimeEventBus }             from "../runtime-infra/RuntimeEventBus";
import type { RuntimeMetrics }              from "../runtime-infra/RuntimeMetrics";
import type { RuntimeEventType }            from "../runtime-infra/RuntimeEvent";
import type {
  UserInput, ExecutionChainReport, ChainStageRecord,
} from "./ExecutionChainTypes";
import type { StageOutputBag }              from "./PipelineBuilder";
import type { ExecutionContext }            from "./ExecutionContext";
const EV_EXEC_STARTED:   RuntimeEventType = "EXECUTION_STARTED";
const EV_EXEC_COMPLETED: RuntimeEventType = "EXECUTION_COMPLETED";
const EV_EXEC_FAILED:    RuntimeEventType = "EXECUTION_FAILED";

export type ExecutionChainDeps = CompositionDeps;

export class ExecutionChain {
  private readonly _rt: ComposedRuntime;

  constructor(deps: ExecutionChainDeps = {}) {
    this._rt = ExecutionCompositionRoot.compose(deps);
  }

  async execute(input: UserInput): Promise<ExecutionChainReport> {
    const chainId   = this._rt.idProvider.next("chain");
    const startedAt = this._rt.clock.now();

    this._rt.metrics.recordExecution();
    this._emit(EV_EXEC_STARTED, chainId, "ExecutionChain started");

    const bag: Partial<StageOutputBag> = { userInput: input, records: [] };
    const ctx = {
      ...ExecutionCompositionRoot.buildContext(this._rt, chainId, input.sessionId, input.userId),
      _bag: bag,
    } as unknown as ExecutionContext;

    const pipeResult = await this._rt.pipeline.execute(ctx, input);

    this._populateBag(bag, pipeResult.outputs);
    bag.records = pipeResult.records;

    const completedAt = this._rt.clock.now();
    const durationMs  = completedAt - startedAt;

    if (!pipeResult.success) {
      this._rt.metrics.recordFailure();
      this._emit(EV_EXEC_FAILED, chainId, "pipeline aborted");
      return this._buildReport(chainId, startedAt, completedAt, pipeResult.records, input, false);
    }

    this._rt.metrics.recordSuccess(durationMs);
    this._emit(EV_EXEC_COMPLETED, chainId, `completed in ${durationMs}ms`, { durationMs });
    return this._buildReport(chainId, startedAt, completedAt, pipeResult.records, input, true);
  }

  bus():     RuntimeEventBus { return this._rt.eventBus; }
  metrics(): RuntimeMetrics  { return this._rt.metrics; }

  private _emit(type: RuntimeEventType, executionId: string, detail?: string, payload?: Record<string, unknown>): void {
    this._rt.eventBus.publish(Object.freeze({
      type, executionId, runtimeLabel: "ExecutionChain",
      timestamp: this._rt.clock.now(), detail, payload,
    }));
  }

  private _populateBag(bag: Partial<StageOutputBag>, outputs: Map<string, unknown>): void {
    const g = <T>(k: string): T => outputs.get(k) as T;
    bag.userInput = g("USER_INPUT");
    bag.intent    = g("INTENT_RUNTIME");
    bag.goal      = g("GOAL_RUNTIME");
    bag.plan      = g("PLANNING_RUNTIME");
    bag.kern      = g("KERNEL");
    bag.orch      = g("RUNTIME_ORCHESTRATOR");
    bag.cap       = g("CAPABILITY_RUNTIME");
    bag.cr        = g("CONNECTOR_RUNTIME");
    bag.conn      = g("CONNECTOR");
    bag.result    = g("RESULT");
    bag.mem       = g("MEMORY");
  }

  private _buildReport(
    chainId: string,
    startedAt: number,
    completedAt: number,
    stages: ChainStageRecord[],
    input: UserInput,
    success: boolean,
  ): ExecutionChainReport {
    const get = (id: string): unknown => stages.find(s => s.stage === id)?.output ?? null;
    return Object.freeze({
      chainId,
      sessionId:            input.sessionId,
      userId:               input.userId,
      startedAt,
      completedAt,
      totalDurationMs:      completedAt - startedAt,
      status:               success ? "COMPLETED" as const : "FAILED" as const,
      stages:               Object.freeze(stages),
      userInput:            input,
      finalOutput:          success ? get("RESULT")         : null,
      memoryResult:         success ? get("MEMORY")         : null,
      explainabilityResult: success ? get("EXPLAINABILITY") : null,
      auditResult:          success ? get("AUDIT")          : null,
      stagesPassed:         stages.filter(s => s.status === "COMPLETED").length,
      stagesTotal:          stages.length,
    }) as ExecutionChainReport;
  }
}