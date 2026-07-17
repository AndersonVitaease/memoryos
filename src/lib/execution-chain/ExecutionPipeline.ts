// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-01: ExecutionPipeline
// Executes any ordered sequence of PipelineStages.
// ExecutionChain delegates ALL stage execution to this class.
// ExecutionPipeline has zero knowledge of domain logic — it is a pure runner.
// ══════════════════════════════════════════════════════════════════════════════

import type { PipelineStage }   from "./PipelineStage";
import type { ExecutionContext } from "./ExecutionContext";
import type { ChainStageRecord, ChainStage, ChainStageStatus } from "./ExecutionChainTypes";
import type { RuntimeEventType } from "../runtime-infra/RuntimeEvent";

const EV_STAGE_COMPLETED: RuntimeEventType = "STAGE_COMPLETED";
const EV_STAGE_FAILED:    RuntimeEventType = "STAGE_FAILED";

export interface PipelineRunResult {
  readonly records: ChainStageRecord[];
  readonly outputs: Map<string, unknown>;
  readonly success: boolean;
  readonly failedStage: string | null;
}

export class ExecutionPipeline {
  private readonly _stages: PipelineStage[];

  constructor(stages: PipelineStage[]) {
    this._stages = stages;
  }

  /** Run all stages in sequence; stop on first failure. */
  async execute(
    context: ExecutionContext,
    initialInput: unknown,
  ): Promise<PipelineRunResult> {
    const records: ChainStageRecord[] = [];
    const outputs = new Map<string, unknown>();
    let   currentInput: unknown = initialInput;
    let   failedStage:  string | null = null;

    for (const stage of this._stages) {
      const startedAt = context.clock.now();
      try {
        const output      = await stage.execute(context, currentInput);
        const completedAt = context.clock.now();
        const durationMs  = completedAt - startedAt;

        context.metrics.recordSuccess(durationMs);
        context.eventBus.publish(Object.freeze({
          type:         EV_STAGE_COMPLETED,
          executionId:  stage.id,
          runtimeLabel: stage.id,
          timestamp:    completedAt,
          detail:       undefined,
          payload:      { stage: stage.id, durationMs },
        }));

        records.push(_record(stage.id as ChainStage, startedAt, completedAt, currentInput, output, null));
        outputs.set(stage.id, output);
        currentInput = output;
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

        records.push(_record(stage.id as ChainStage, startedAt, completedAt, currentInput, null, error));
        failedStage = stage.id;
        break;
      }
    }

    return {
      records,
      outputs,
      success:     failedStage === null,
      failedStage,
    };
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