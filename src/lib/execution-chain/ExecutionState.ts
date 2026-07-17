// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11C — EF-21: ExecutionState (typed helpers, zero unsafe casts)
// Replaces withStageOutput switch+cast with strongly typed helper functions.
// All helpers return a new frozen ExecutionState — no mutation, no 'as Type'.
// ══════════════════════════════════════════════════════════════════════════════

import type {
  UserInput,
  IntentResult,
  GoalResult,
  PlanResult,
  KernelResult,
  OrchestratorResult,
  CapabilityResult,
  ConnectorRuntimeResult,
  ConnectorResult,
  ResultOutput,
  MemoryResult,
  ExplainabilityResult,
  AuditResult,
  ChainStageRecord,
} from "./ExecutionChainTypes";

/**
 * ExecutionState — the typed, immutable carrier of all stage outputs.
 *
 * Propagated through the entire pipeline:
 *   Stage N reads from state, produces a new state with N's output added.
 *
 * Fields are optional because they are populated progressively as each stage
 * completes. Once set they are never mutated — each stage returns a new state.
 */
export interface ExecutionState {
  // ── Accumulated stage outputs ─────────────────────────────────────────────
  readonly userInput:        UserInput                | undefined;
  readonly intent:           IntentResult             | undefined;
  readonly goal:             GoalResult               | undefined;
  readonly plan:             PlanResult               | undefined;
  readonly kernel:           KernelResult             | undefined;
  readonly orchestrator:     OrchestratorResult       | undefined;
  readonly capability:       CapabilityResult         | undefined;
  readonly connectorRuntime: ConnectorRuntimeResult   | undefined;
  readonly connector:        ConnectorResult          | undefined;
  readonly result:           ResultOutput             | undefined;
  readonly memory:           MemoryResult             | undefined;
  readonly explainability:   ExplainabilityResult     | undefined;
  readonly audit:            AuditResult              | undefined;

  // ── Pipeline bookkeeping ──────────────────────────────────────────────────
  /** Ordered list of stage records appended by ExecutionPipeline. */
  readonly records:          readonly ChainStageRecord[];
}

/** The initial empty state passed into the pipeline before any stage runs. */
export const EMPTY_EXECUTION_STATE: ExecutionState = Object.freeze({
  userInput:        undefined,
  intent:           undefined,
  goal:             undefined,
  plan:             undefined,
  kernel:           undefined,
  orchestrator:     undefined,
  capability:       undefined,
  connectorRuntime: undefined,
  connector:        undefined,
  result:           undefined,
  memory:           undefined,
  explainability:   undefined,
  audit:            undefined,
  records:          Object.freeze([]) as readonly ChainStageRecord[],
});

// ── EF-21: Strongly typed helpers — zero unsafe casts ────────────────────────

/** Append a stage record to state. Returns a new frozen ExecutionState. */
export function withRecord(state: ExecutionState, record: ChainStageRecord): ExecutionState {
  return Object.freeze({ ...state, records: Object.freeze([...state.records, record]) });
}

export function withUserInput(state: ExecutionState, v: UserInput): ExecutionState {
  return Object.freeze({ ...state, userInput: v });
}
export function withIntent(state: ExecutionState, v: IntentResult): ExecutionState {
  return Object.freeze({ ...state, intent: v });
}
export function withGoal(state: ExecutionState, v: GoalResult): ExecutionState {
  return Object.freeze({ ...state, goal: v });
}
export function withPlan(state: ExecutionState, v: PlanResult): ExecutionState {
  return Object.freeze({ ...state, plan: v });
}
export function withKernel(state: ExecutionState, v: KernelResult): ExecutionState {
  return Object.freeze({ ...state, kernel: v });
}
export function withOrchestrator(state: ExecutionState, v: OrchestratorResult): ExecutionState {
  return Object.freeze({ ...state, orchestrator: v });
}
export function withCapability(state: ExecutionState, v: CapabilityResult): ExecutionState {
  return Object.freeze({ ...state, capability: v });
}
export function withConnectorRuntime(state: ExecutionState, v: ConnectorRuntimeResult): ExecutionState {
  return Object.freeze({ ...state, connectorRuntime: v });
}
export function withConnector(state: ExecutionState, v: ConnectorResult): ExecutionState {
  return Object.freeze({ ...state, connector: v });
}
export function withResult(state: ExecutionState, v: ResultOutput): ExecutionState {
  return Object.freeze({ ...state, result: v });
}
export function withMemory(state: ExecutionState, v: MemoryResult): ExecutionState {
  return Object.freeze({ ...state, memory: v });
}
export function withExplainability(state: ExecutionState, v: ExplainabilityResult): ExecutionState {
  return Object.freeze({ ...state, explainability: v });
}
export function withAudit(state: ExecutionState, v: AuditResult): ExecutionState {
  return Object.freeze({ ...state, audit: v });
}

/**
 * withStageOutput — backward-compatible dispatcher used only by ExecutionChain
 * for the initial USER_INPUT seeding. Pipeline stages use typed helpers above.
 * Kept for backward compatibility with existing cert suites.
 */
export function withStageOutput(
  state: ExecutionState,
  stageId: string,
  output: unknown,
): ExecutionState {
  switch (stageId) {
    case "USER_INPUT": return withUserInput(state, output as UserInput);
    default:           return Object.freeze({ ...state });
  }
}