/**
 * ExecutionState.ts — Sprint P-01.11B
 *
 * Immutable value object representing the complete state of a single execution.
 * SRP: state representation only — no logic, no side effects, no pipeline knowledge.
 * Every field is readonly. Instances are Object.freeze()-ed.
 */

import { ExecutionStage } from "./ExecutionStage";
import type {
  UserInput, IntentResult, GoalResult, PlanResult, KernelResult,
  OrchestratorResult, CapabilityResult, ConnectorRuntimeResult,
  ConnectorResult, ResultOutput, MemoryResult, ExplainabilityResult,
  AuditResult, ChainStageRecord,
} from "./ExecutionChainTypes";

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

  // ── Stage-specific output slots — set by pipeline stages, read by downstream stages ──
  // These replace StageOutputBag: ExecutionState is the single shared state.
  readonly userInput?:        UserInput;
  readonly intent?:           IntentResult;
  readonly goal?:             GoalResult;
  readonly plan?:             PlanResult;
  readonly kernel?:           KernelResult;
  readonly orchestrator?:     OrchestratorResult;
  readonly capability?:       CapabilityResult;
  readonly connectorRuntime?: ConnectorRuntimeResult;
  readonly connector?:        ConnectorResult;
  readonly result?:           ResultOutput;
  readonly memory?:           MemoryResult;
  readonly explainability?:   ExplainabilityResult;
  readonly audit?:            AuditResult;
  /** Legacy: full ChainStageRecord array — used by ExplainabilityStage */
  readonly records?:          readonly ChainStageRecord[];
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

/** Accepts either a StageRecord or a ChainStageRecord — normalises to StageRecord. */
export function withRecord(state: ExecutionState, record: StageRecord | ChainStageRecord): ExecutionState {
  // Normalise ChainStageRecord → StageRecord
  const sr: StageRecord = "stageId" in record
    ? (record as StageRecord)
    : Object.freeze({
        stageId:     (record as ChainStageRecord).stage as string,
        stageName:   (record as ChainStageRecord).stage as string,
        startedAt:   new Date((record as ChainStageRecord).startedAt).toISOString(),
        completedAt: new Date((record as ChainStageRecord).completedAt ?? Date.now()).toISOString(),
        durationMs:  (record as ChainStageRecord).durationMs ?? 0,
        status:      (record as ChainStageRecord).status === "COMPLETED" ? "completed" : "failed",
        error:       (record as ChainStageRecord).error ?? null,
      });

  // Also append to state.records (used by ExplainabilityStage)
  const chain = record as ChainStageRecord;
  const chainRecord = "stage" in chain ? chain : undefined;
  const newRecords = chainRecord
    ? Object.freeze([...(state.records ?? []), chainRecord])
    : state.records;

  const withRecs = chainRecord
    ? ExecutionStateFactory.update(state, { records: newRecords })
    : state;

  return ExecutionStateFactory.completeStage(withRecs, sr);
}

/**
 * createEmptyExecutionState — official pipeline initialization point.
 *
 * Each call returns a NEW ExecutionState instance.
 * No global shared state. Every execution is fully isolated.
 * Creation exclusively via ExecutionStateFactory.create() — no `new ExecutionState()`.
 */
export function createEmptyExecutionState(): ExecutionState {
  return ExecutionStateFactory.create({
    executionId: "",
    goalId:      "",
    pipelineId:  "",
    stages:      [],
  });
}

/**
 * EMPTY_EXECUTION_STATE — stable constant for tests that need a shared base.
 * Uses createEmptyExecutionState() so each access gets a fresh frozen instance.
 * Backward-compat alias for EngineeringQuality.cert.ts and legacy test files.
 */
export const EMPTY_EXECUTION_STATE: ExecutionState = createEmptyExecutionState();

// ── 13 typed stage-output helpers ─────────────────────────────────────────────
// Each sets exactly one stage-output slot and returns a new frozen ExecutionState.

export const withUserInput        = (s: ExecutionState, v: UserInput)            : ExecutionState => ExecutionStateFactory.update(s, { userInput:        v });
export const withIntent           = (s: ExecutionState, v: IntentResult)         : ExecutionState => ExecutionStateFactory.update(s, { intent:           v });
export const withGoal             = (s: ExecutionState, v: GoalResult)           : ExecutionState => ExecutionStateFactory.update(s, { goal:             v });
export const withPlan             = (s: ExecutionState, v: PlanResult)           : ExecutionState => ExecutionStateFactory.update(s, { plan:             v });
export const withKernel           = (s: ExecutionState, v: KernelResult)         : ExecutionState => ExecutionStateFactory.update(s, { kernel:           v });
export const withOrchestrator     = (s: ExecutionState, v: OrchestratorResult)   : ExecutionState => ExecutionStateFactory.update(s, { orchestrator:     v });
export const withCapability       = (s: ExecutionState, v: CapabilityResult)     : ExecutionState => ExecutionStateFactory.update(s, { capability:       v });
export const withConnectorRuntime = (s: ExecutionState, v: ConnectorRuntimeResult): ExecutionState => ExecutionStateFactory.update(s, { connectorRuntime: v });
export const withConnector        = (s: ExecutionState, v: ConnectorResult)      : ExecutionState => ExecutionStateFactory.update(s, { connector:        v });
export const withResult           = (s: ExecutionState, v: ResultOutput)         : ExecutionState => ExecutionStateFactory.update(s, { result:           v });
export const withMemory           = (s: ExecutionState, v: MemoryResult)         : ExecutionState => ExecutionStateFactory.update(s, { memory:           v });
export const withExplainability   = (s: ExecutionState, v: ExplainabilityResult) : ExecutionState => ExecutionStateFactory.update(s, { explainability:   v });
export const withAudit            = (s: ExecutionState, v: AuditResult)          : ExecutionState => ExecutionStateFactory.update(s, { audit:            v });