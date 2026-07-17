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
import {
  withRecord,
  withUserInput, withIntent, withGoal, withPlan, withKernel,
  withOrchestrator, withCapability, withConnectorRuntime,
  withConnector, withResult, withMemory, withExplainability, withAudit,
} from "./ExecutionState";
import { PipelineInstrumentation }     from "./PipelineInstrumentation";

export interface PipelineRunResult {
  readonly state:       ExecutionState;
  readonly success:     boolean;
  readonly failedStage: string | null;
}

// Map each stage ID to its typed state helper — EF-21: no unsafe casts
const STATE_MERGER: Record<string, (s: ExecutionState, v: unknown) => ExecutionState> = {
  USER_INPUT:           (s, v) => withUserInput(s,          v as Parameters<typeof withUserInput>[1]),
  INTENT_RUNTIME:       (s, v) => withIntent(s,             v as Parameters<typeof withIntent>[1]),
  GOAL_RUNTIME:         (s, v) => withGoal(s,               v as Parameters<typeof withGoal>[1]),
  PLANNING_RUNTIME:     (s, v) => withPlan(s,               v as Parameters<typeof withPlan>[1]),
  KERNEL:               (s, v) => withKernel(s,             v as Parameters<typeof withKernel>[1]),
  RUNTIME_ORCHESTRATOR: (s, v) => withOrchestrator(s,       v as Parameters<typeof withOrchestrator>[1]),
  CAPABILITY_RUNTIME:   (s, v) => withCapability(s,         v as Parameters<typeof withCapability>[1]),
  CONNECTOR_RUNTIME:    (s, v) => withConnectorRuntime(s,   v as Parameters<typeof withConnectorRuntime>[1]),
  CONNECTOR:            (s, v) => withConnector(s,          v as Parameters<typeof withConnector>[1]),
  RESULT:               (s, v) => withResult(s,             v as Parameters<typeof withResult>[1]),
  MEMORY:               (s, v) => withMemory(s,             v as Parameters<typeof withMemory>[1]),
  EXPLAINABILITY:       (s, v) => withExplainability(s,     v as Parameters<typeof withExplainability>[1]),
  AUDIT:                (s, v) => withAudit(s,              v as Parameters<typeof withAudit>[1]),
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

        // State propagation — use typed helper via lookup (EF-21)
        const merger = STATE_MERGER[stage.id as ChainStage];
        state = merger
          ? withRecord(merger(state, output), record)
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