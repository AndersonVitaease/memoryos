// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — ExecutionChain (Thin Orchestrator — Architecture Freeze)
//
// Responsibilities:
//   1. Start execution (clock + metrics + event)
//   2. Build ExecutionState with userInput
//   3. Call ExecutionPipeline
//   4. Delegate report assembly to ExecutionReportAssembler
//   5. Return result
//
// ZERO business logic. ZERO field access. ZERO manual state copies.
// NO _populateBag. NO Map<string, unknown>. NO new inside execute().
// ══════════════════════════════════════════════════════════════════════════════

import { ExecutionCompositionRoot }     from "./ExecutionCompositionRoot";
import type { ComposedRuntime, CompositionDeps } from "./ExecutionCompositionRoot";
import { createEmptyExecutionState, ExecutionStateFactory } from "./ExecutionState";
import { ExecutionReportAssembler }           from "./ExecutionReportAssembler";
import type { ExecutionState }          from "./ExecutionState";
import { ExecutionStage }               from "./ExecutionStage";
import type { RuntimeEventBus }         from "../runtime-infra/RuntimeEventBus";
import type { RuntimeMetrics }          from "../runtime-infra/RuntimeMetrics";
import type { RuntimeEventType }        from "../runtime-infra/RuntimeEvent";
import type { UserInput, ExecutionChainReport } from "./ExecutionChainTypes";
import type { ExecutionContext }         from "./ExecutionContext";
import type { ExplainabilityEvidence }  from "./PipelineStage";

const EV_EXEC_STARTED:   RuntimeEventType = "EXECUTION_STARTED";
const EV_EXEC_COMPLETED: RuntimeEventType = "EXECUTION_COMPLETED";
const EV_EXEC_FAILED:    RuntimeEventType = "EXECUTION_FAILED";

export type ExecutionChainDeps = CompositionDeps & {
  connectorRegistry?: CompositionDeps["connectorRegistry"];
};

export class ExecutionChain {
  private readonly _rt:        ComposedRuntime;
  private readonly _assembler: ExecutionReportAssembler;

  constructor(deps: ExecutionChainDeps = {}) {
    this._rt = ExecutionCompositionRoot.compose(deps);
    // EF-26: assembler is constructed by CompositionRoot, injected here — no 'new' in chain
    this._assembler = this._rt.reportAssembler;
  }

  async execute(input: UserInput): Promise<ExecutionChainReport> {
    const chainId   = this._rt.idProvider.next("chain");
    const startedAt = this._rt.clock.now();

    this._rt.metrics.recordExecution();
    this._emit(EV_EXEC_STARTED, chainId, "ExecutionChain started");

    // EF-7.2.8A: new instance per execution — zero shared state
    // Seed the state with userInput so pipeline stages can read it
    const initialState = ExecutionStateFactory.update(
      ExecutionStateFactory.moveToStage(createEmptyExecutionState(), ExecutionStage.USER_INPUT),
      { userInput: input },
    );

    const evidences: ExplainabilityEvidence[] = [];
    const ctx = {
      ...ExecutionCompositionRoot.buildContext(this._rt, chainId, input.sessionId, input.userId),
      evidences,
    } as ExecutionContext;

    const pipeResult = await this._rt.pipeline.execute(ctx, initialState);

    const completedAt = this._rt.clock.now();
    const durationMs  = completedAt - startedAt;

    if (!pipeResult.success) {
      this._rt.metrics.recordFailure();
      this._emit(EV_EXEC_FAILED, chainId, "pipeline aborted");
    } else {
      this._rt.metrics.recordSuccess(durationMs);
      this._emit(EV_EXEC_COMPLETED, chainId, `completed in ${durationMs}ms`, { durationMs });
    }

    return this._assembler.assemble(
      chainId, startedAt, completedAt,
      input, pipeResult.state, pipeResult.success,
      pipeResult.stageRecords,
    );
  }

  bus():     RuntimeEventBus { return this._rt.eventBus; }
  metrics(): RuntimeMetrics  { return this._rt.metrics; }

  private _emit(type: RuntimeEventType, executionId: string, detail?: string, payload?: Record<string, unknown>): void {
    this._rt.eventBus.publish(Object.freeze({
      type, executionId, runtimeLabel: "ExecutionChain",
      timestamp: this._rt.clock.now(), detail, payload,
    }));
  }
}