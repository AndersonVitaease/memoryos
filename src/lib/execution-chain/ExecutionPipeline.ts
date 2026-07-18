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
import type { ChainStage }             from "./ExecutionChainTypes";
import type { ExecutionState }         from "./ExecutionState";
import { withRecord, ExecutionStateFactory } from "./ExecutionState";
import { ExecutionStage }              from "./ExecutionStage";
import { PipelineInstrumentation }     from "./PipelineInstrumentation";

export interface PipelineRunResult {
  readonly state:       ExecutionState;
  readonly success:     boolean;
  readonly failedStage: string | null;
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
    let   state:       ExecutionState = initialInput;
    let   failedStage: string | null  = null;

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

        // State propagation — use generic moveToStage (EF-7.2.8)
        const enumStage = STAGE_MAP[stage.id as ChainStage];
        state = enumStage
          ? withRecord(ExecutionStateFactory.moveToStage(state, enumStage), record)
          : withRecord(state, record);

      } catch (e: unknown) {
        const completedAt = context.clock.now();
        const error       = String((e as Error).message ?? e);

        const record = this._instrumentation.onFailure(
          context, stage.id, startedAt, completedAt, stageInput, error,
        );

        state        = withRecord(state, record);
        failedStage  = stage.id;
        break;
      }
    }

    return Object.freeze({ state, success: failedStage === null, failedStage });
  }
}