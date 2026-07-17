// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11C — EF-22: PipelineInstrumentation
// Separates ALL instrumentation concerns from ExecutionPipeline.
//
// Responsibilities:
//   - metrics recording
//   - event bus publishing
//   - explainability evidence collection
//   - stage record creation
//
// ExecutionPipeline is responsible ONLY for:
//   - stage ordering
//   - state propagation
//   - failure interruption
// ══════════════════════════════════════════════════════════════════════════════

import type { ExecutionContext }           from "./ExecutionContext";
import type { ChainStage, ChainStageStatus, ChainStageRecord } from "./ExecutionChainTypes";
import type { RuntimeEventType }           from "../runtime-infra/RuntimeEvent";
import type { ExplainabilityEvidence }     from "./PipelineStage";

const EV_STAGE_COMPLETED: RuntimeEventType = "STAGE_COMPLETED";
const EV_STAGE_FAILED:    RuntimeEventType = "STAGE_FAILED";

export class PipelineInstrumentation {
  /** Called after a stage succeeds. Records metrics, event, evidence, and builds the stage record. */
  onSuccess(
    context:     ExecutionContext,
    stageId:     string,
    startedAt:   number,
    completedAt: number,
    stageInput:  unknown,
    output:      unknown,
  ): ChainStageRecord {
    const durationMs = completedAt - startedAt;

    // Metrics
    context.metrics.recordSuccess(durationMs);

    // EF-23: Evidence V3 with reasoning + metadata fields
    const evidence: ExplainabilityEvidence = {
      runtimeId:  stageId,
      timestamp:  completedAt,
      durationMs,
      input:      Object.freeze({ stage: stageId }),
      output:     typeof output === "object" && output !== null ? (output as Record<string, unknown>) : { value: output },
      reasoning:  `Stage ${stageId} executed successfully in ${durationMs}ms`,
      decision:   `${stageId} completed in ${durationMs}ms`,
      confidence: 1.0,
      policies:   [],
      metadata:   Object.freeze({ stageInput: typeof stageInput }),
    };
    context.evidences.push(evidence);

    // Event
    context.eventBus.publish(Object.freeze({
      type:         EV_STAGE_COMPLETED,
      executionId:  stageId,
      runtimeLabel: stageId,
      timestamp:    completedAt,
      detail:       undefined,
      payload:      Object.freeze({ stage: stageId, durationMs }),
    }));

    return this._record(stageId as ChainStage, startedAt, completedAt, stageInput, output, null);
  }

  /** Called after a stage fails. Records metrics, event, and builds the failed stage record. */
  onFailure(
    context:     ExecutionContext,
    stageId:     string,
    startedAt:   number,
    completedAt: number,
    stageInput:  unknown,
    error:       string,
  ): ChainStageRecord {
    // Metrics
    context.metrics.recordFailure();

    // Event
    context.eventBus.publish(Object.freeze({
      type:         EV_STAGE_FAILED,
      executionId:  stageId,
      runtimeLabel: stageId,
      timestamp:    completedAt,
      detail:       error,
      payload:      Object.freeze({ stage: stageId }),
    }));

    return this._record(stageId as ChainStage, startedAt, completedAt, stageInput, null, error);
  }

  private _record(
    stage:       ChainStage,
    startedAt:   number,
    completedAt: number,
    input:       unknown,
    output:      unknown,
    error:       string | null,
  ): ChainStageRecord {
    return Object.freeze({
      stage,
      status:     (error ? "FAILED" : "COMPLETED") as ChainStageStatus,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      input,
      output,
      error,
    });
  }
}