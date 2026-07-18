// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11C — EF-22: ExecutionPipeline (pure orchestrator)
//
// Responsibilities (ONLY):
//   - stage ordering
//   - state propagation via typed helpers (EF-21)
//   - failure interruption
//
// ALL instrumentation (metrics, events, evidence, records) is delegated to
// PipelineInstrumentation (EF-22). Zero instrumentation code here.
// ══════════════════════════════════════════════════════════════════════════════

import type { PipelineStage }          from "./PipelineStage";
import type { ExecutionContext }        from "./ExecutionContext";
import type { ChainStage, ChainStageRecord } from "./ExecutionChainTypes";
import type { ExecutionState }         from "./ExecutionState";
import { withRecord, ExecutionStateFactory } from "./ExecutionState";
import { ExecutionStage }              from "./ExecutionStage";
import { PipelineInstrumentation }     from "./PipelineInstrumentation";

type StateKey = keyof ExecutionState;

// Map each stage ID to its output slot on ExecutionState
const STAGE_OUTPUT_SLOT: Partial<Record<string, StateKey>> = {
  USER_INPUT:           "userInput",
  INTENT_RUNTIME:       "intent",
  GOAL_RUNTIME:         "goal",
  PLANNING_RUNTIME:     "plan",
  KERNEL:               "kernel",
  RUNTIME_ORCHESTRATOR: "orchestrator",
  CAPABILITY_RUNTIME:   "capability",
  CONNECTOR_RUNTIME:    "connectorRuntime",
  CONNECTOR:            "connector",
  RESULT:               "result",
  MEMORY:               "memory",
  EXPLAINABILITY:       "explainability",
  AUDIT:                "audit",
};

export interface PipelineRunResult {
  readonly state:       ExecutionState;
  readonly success:     boolean;
  readonly failedStage: string | null;
  /** All stage records produced during this run — used by ExecutionReportAssembler. */
  readonly stageRecords: readonly ChainStageRecord[];
}

// Map each stage ID to its ExecutionStage enum value — EF-7.2.8: generic moveToStage
const STAGE_MAP: Partial<Record<string, ExecutionStage>> = {
  USER_INPUT:           ExecutionStage.USER_INPUT,
  INTENT_RUNTIME:       ExecutionStage.INTENT_RUNTIME,
  GOAL_RUNTIME:         ExecutionStage.GOAL_RUNTIME,
  PLANNING_RUNTIME:     ExecutionStage.PLANNING_RUNTIME,
  KERNEL:               ExecutionStage.KERNEL,
  RUNTIME_ORCHESTRATOR: ExecutionStage.RUNTIME_ORCHESTRATOR,
  CAPABILITY_RUNTIME:   ExecutionStage.CAPABILITY_RUNTIME,
  CONNECTOR_RUNTIME:    ExecutionStage.CONNECTOR_RUNTIME,
  CONNECTOR:            ExecutionStage.CONNECTOR,
  RESULT:               ExecutionStage.RESULT,
  MEMORY:               ExecutionStage.MEMORY,
  EXPLAINABILITY:       ExecutionStage.EXPLAINABILITY,
  AUDIT:                ExecutionStage.AUDIT,
};

export class ExecutionPipeline {
  private readonly _stages:          PipelineStage[];
  private readonly _instrumentation: PipelineInstrumentation;

  constructor(stages: PipelineStage[], instrumentation?: PipelineInstrumentation) {
    this._stages          = stages;
    this._instrumentation = instrumentation ?? new PipelineInstrumentation();
  }

  /** Run all stages in sequence, propagating ExecutionState. Stops on first failure. */
  async execute(
    context:      ExecutionContext,
    initialInput: ExecutionState,
  ): Promise<PipelineRunResult> {
    let   state:        ExecutionState    = initialInput;
    let   failedStage:  string | null     = null;
    const stageRecords: ChainStageRecord[] = [];

    for (const stage of this._stages) {
      const startedAt  = context.clock.now();
      const stageInput = state;  // snapshot before execution

      try {
        const output      = await stage.execute(context, stageInput);
        const completedAt = context.clock.now();

        // Delegate ALL instrumentation to PipelineInstrumentation (EF-22)
        const record = this._instrumentation.onSuccess(
          context, stage.id, startedAt, completedAt, stageInput, output,
        );
        stageRecords.push(record);

        // State propagation — use generic moveToStage (EF-7.2.8)
        const enumStage = STAGE_MAP[stage.id as ChainStage];
        const stageRecord = Object.freeze({
          stageId: stage.id, stageName: stage.id,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date(completedAt).toISOString(),
          durationMs: completedAt - startedAt,
          status: "completed" as const, error: null,
        });

        // Store stage output into ExecutionState so downstream stages can read it
        const outputSlot = STAGE_OUTPUT_SLOT[stage.id];
        const withOutput = outputSlot
          ? ExecutionStateFactory.update(state, { [outputSlot]: output } as Partial<ExecutionState>)
          : state;

        state = enumStage
          ? withRecord(ExecutionStateFactory.moveToStage(withOutput, enumStage), stageRecord)
          : withRecord(withOutput, stageRecord);

      } catch (e: unknown) {
        const completedAt = context.clock.now();
        const error       = String((e as Error).message ?? e);

        const record = this._instrumentation.onFailure(
          context, stage.id, startedAt, completedAt, stageInput, error,
        );
        stageRecords.push(record);

        const stageRecord = Object.freeze({
          stageId: stage.id, stageName: stage.id,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date(completedAt).toISOString(),
          durationMs: completedAt - startedAt,
          status: "failed" as const, error,
        });
        state        = withRecord(state, stageRecord);
        failedStage  = stage.id;
        break;
      }
    }

    return Object.freeze({ state, success: failedStage === null, failedStage, stageRecords: Object.freeze(stageRecords) });
  }
}