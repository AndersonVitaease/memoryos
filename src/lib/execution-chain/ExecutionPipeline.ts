// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — EF-01/EF-15/EF-17: ExecutionPipeline
//
// EF-15: Propagates ExecutionState through all 13 stages — no Map, no bag.
// EF-17: Automatically collects Explainability evidence per stage.
//        Each stage may ONLY complement evidence — never build it manually.
// ══════════════════════════════════════════════════════════════════════════════

import type { PipelineStage }          from "./PipelineStage";
import type { ExecutionContext }        from "./ExecutionContext";
import type { ChainStage, ChainStageStatus } from "./ExecutionChainTypes";
import type { RuntimeEventType }        from "../runtime-infra/RuntimeEvent";
import type { ChainStageRecord }        from "./ExecutionChainTypes";
import type { ExecutionState }   from "./ExecutionState";
import { withRecord, withStageOutput } from "./ExecutionState";

const EV_STAGE_COMPLETED: RuntimeEventType = "STAGE_COMPLETED";
const EV_STAGE_FAILED:    RuntimeEventType = "STAGE_FAILED";

export interface PipelineRunResult {
  readonly state:       ExecutionState;
  readonly success:     boolean;
  readonly failedStage: string | null;
}

export class ExecutionPipeline {
  private readonly _stages: PipelineStage[];

  constructor(stages: PipelineStage[]) {
    this._stages = stages;
  }

  /** Run all stages in sequence, propagating ExecutionState. Stops on first failure. */
  async execute(
    context: ExecutionContext,
    initialInput: ExecutionState,
  ): Promise<PipelineRunResult> {
    let   state:       ExecutionState = initialInput;
    let   failedStage: string | null  = null;

    for (const stage of this._stages) {
      const startedAt = context.clock.now();

      // EF-17: pipeline automatically captures input before stage execution
      const stageInput = state;

      try {
        const output      = await stage.execute(context, stageInput);
        const completedAt = context.clock.now();
        const durationMs  = completedAt - startedAt;

        context.metrics.recordSuccess(durationMs);

        // EF-17: automatic evidence collection — stage label, timing, decision
        context.evidences.push({
          runtimeId:   stage.id,
          timestamp:   completedAt,
          durationMs,
          input:       Object.freeze({ stage: stage.id }),
          output:      typeof output === "object" && output !== null ? output : { value: output },
          decision:    `${stage.id} completed in ${durationMs}ms`,
          confidence:  1.0,
          policies:    [],
        });

        context.eventBus.publish(Object.freeze({
          type:         EV_STAGE_COMPLETED,
          executionId:  stage.id,
          runtimeLabel: stage.id,
          timestamp:    completedAt,
          detail:       undefined,
          payload:      { stage: stage.id, durationMs },
        }));

        const record = _record(stage.id as ChainStage, startedAt, completedAt, stageInput, output, null);
        state = withStageOutput(withRecord(state, record), stage.id, output);

      } catch (e: unknown) {
        const completedAt = context.clock.now();
        const error       = String((e as Error).message ?? e);

        context.metrics.recordFailure();
        context.eventBus.publish(Object.freeze({
          type:         EV_STAGE_FAILED,
          executionId:  stage.id,
          runtimeLabel: stage.id,
          timestamp:    completedAt,
          detail:       error,
          payload:      { stage: stage.id },
        }));

        const record = _record(stage.id as ChainStage, startedAt, completedAt, stageInput, null, error);
        state        = withRecord(state, record);
        failedStage  = stage.id;
        break;
      }
    }

    return Object.freeze({ state, success: failedStage === null, failedStage });
  }
}

function _record(
  stage:       ChainStage,
  startedAt:   number,
  completedAt: number,
  input:       unknown,
  output:      unknown,
  error:       string | null,
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