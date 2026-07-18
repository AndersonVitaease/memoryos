/**
 * ExecutionState.ts — Sprint P-01.11B
 *
 * Immutable value object representing the complete state of a single execution.
 * SRP: state representation only — no logic, no side effects, no pipeline knowledge.
 * Every field is readonly. Instances are Object.freeze()-ed.
 */

import { ExecutionStage } from "./ExecutionStage";

export interface ExplanationNode {
  readonly origin:      string;
  readonly evidence:    readonly string[];
  readonly reasoning:   string;
  readonly confidence:  number;
  readonly timestamp:   string;
}

export interface ConnectorCall {
  readonly connectorId:  string;
  readonly capability:   string;
  readonly startedAt:    string;
  readonly completedAt:  string;
  readonly durationMs:   number;
  readonly success:      boolean;
  readonly error:        string | null;
}

export interface MemoryQuery {
  readonly queryId:     string;
  readonly query:       string;
  readonly providerId:  string;
  readonly startedAt:   string;
  readonly durationMs:  number;
  readonly resultCount: number;
}

export interface StageRecord {
  readonly stageId:     string;
  readonly stageName:   string;
  readonly startedAt:   string;
  readonly completedAt: string;
  readonly durationMs:  number;
  readonly status:      "completed" | "failed" | "skipped";
  readonly error:       string | null;
}

export interface ExecutionTelemetry {
  readonly totalDurationMs:     number;
  readonly stageCount:          number;
  readonly connectorCallCount:  number;
  readonly memoryQueryCount:    number;
  readonly decisionCount:       number;
  readonly retryCount:          number;
  readonly overallConfidence:   number;
}

export interface ExecutionTimestamps {
  readonly createdAt:   string;
  readonly startedAt:   string;
  readonly completedAt: string | null;
  readonly failedAt:    string | null;
}

export interface ExecutionState {
  readonly executionId:       string;
  readonly goalId:            string;
  readonly pipelineId:        string;
  readonly currentStage:      string;
  readonly completedStages:   readonly StageRecord[];
  readonly pendingStages:     readonly string[];
  readonly failedStages:      readonly StageRecord[];
  readonly connectorCalls:    readonly ConnectorCall[];
  readonly memoryQueries:     readonly MemoryQuery[];
  readonly decisions:         readonly string[];
  readonly explanations:      readonly ExplanationNode[];
  readonly telemetry:         ExecutionTelemetry;
  readonly timestamps:        ExecutionTimestamps;
  readonly status:            "running" | "completed" | "failed" | "aborted";
}

/** Factory — produces a frozen ExecutionState. */
export const ExecutionStateFactory = {
  create(params: {
    executionId:  string;
    goalId:       string;
    pipelineId:   string;
    stages:       string[];
  }): ExecutionState {
    const now = new Date().toISOString();
    const state: ExecutionState = {
      executionId:     params.executionId,
      goalId:          params.goalId,
      pipelineId:      params.pipelineId,
      currentStage:    params.stages[0] ?? "",
      completedStages: Object.freeze([]),
      pendingStages:   Object.freeze([...params.stages]),
      failedStages:    Object.freeze([]),
      connectorCalls:  Object.freeze([]),
      memoryQueries:   Object.freeze([]),
      decisions:       Object.freeze([]),
      explanations:    Object.freeze([]),
      telemetry:       Object.freeze({
        totalDurationMs:    0,
        stageCount:         params.stages.length,
        connectorCallCount: 0,
        memoryQueryCount:   0,
        decisionCount:      0,
        retryCount:         0,
        overallConfidence:  0,
      }),
      timestamps: Object.freeze({
        createdAt:   now,
        startedAt:   now,
        completedAt: null,
        failedAt:    null,
      }),
      status: "running",
    };
    return Object.freeze(state);
  },

  /** Produce a new frozen state with updated fields (immutable update pattern). */
  update(existing: ExecutionState, delta: Partial<ExecutionState>): ExecutionState {
    return Object.freeze({ ...existing, ...delta });
  },

  /** Add an explanation node — returns new frozen state. */
  addExplanation(state: ExecutionState, node: ExplanationNode): ExecutionState {
    return ExecutionStateFactory.update(state, {
      explanations: Object.freeze([...state.explanations, Object.freeze(node)]),
      telemetry: Object.freeze({
        ...state.telemetry,
        decisionCount: state.telemetry.decisionCount + 1,
        overallConfidence: node.confidence,
      }),
    });
  },

  /** Mark a stage completed — returns new frozen state. */
  completeStage(state: ExecutionState, record: StageRecord): ExecutionState {
    return ExecutionStateFactory.update(state, {
      completedStages: Object.freeze([...state.completedStages, Object.freeze(record)]),
      pendingStages:   Object.freeze(state.pendingStages.filter(s => s !== record.stageId)),
      currentStage:    state.pendingStages.find(s => s !== record.stageId) ?? "",
    });
  },

  /**
   * moveToStage — generic stage transition. Pipeline-agnostic.
   * SRP: updates currentStage only; no stage-specific knowledge required.
   */
  moveToStage(state: ExecutionState, stage: ExecutionStage): ExecutionState {
    return ExecutionStateFactory.update(state, { currentStage: stage });
  },
};

// ── Single generic record helper (pipeline infrastructure only) ───────────────

export function withRecord(state: ExecutionState, record: StageRecord): ExecutionState {
  return ExecutionStateFactory.completeStage(state, record);
}

/** Canonical empty state — use as initial value before the pipeline starts. */
export const EMPTY_EXECUTION_STATE: ExecutionState = ExecutionStateFactory.create({
  executionId: "",
  goalId:      "",
  pipelineId:  "",
  stages:      [],
});