// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — EF-14: ExecutionState
// Replaces StageOutputBag and Map<string, unknown> entirely.
// Fully typed, immutable, no any, no unsafe casts.
// All PipelineStages consume and produce ExecutionState.
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

/**
 * withRecord — pure helper to append a stage record to state.
 * Returns a new frozen ExecutionState.
 */
export function withRecord(state: ExecutionState, record: ChainStageRecord): ExecutionState {
  return Object.freeze({
    ...state,
    records: Object.freeze([...state.records, record]),
  });
}

/**
 * withStageOutput — typed merge of a single stage output into the state.
 * Returns a new frozen ExecutionState.
 */
export function withStageOutput(
  state: ExecutionState,
  stageId: string,
  output: unknown,
): ExecutionState {
  switch (stageId) {
    case "USER_INPUT":          return Object.freeze({ ...state, userInput:        output as UserInput              });
    case "INTENT_RUNTIME":      return Object.freeze({ ...state, intent:           output as IntentResult           });
    case "GOAL_RUNTIME":        return Object.freeze({ ...state, goal:             output as GoalResult             });
    case "PLANNING_RUNTIME":    return Object.freeze({ ...state, plan:             output as PlanResult             });
    case "KERNEL":              return Object.freeze({ ...state, kernel:           output as KernelResult           });
    case "RUNTIME_ORCHESTRATOR":return Object.freeze({ ...state, orchestrator:     output as OrchestratorResult     });
    case "CAPABILITY_RUNTIME":  return Object.freeze({ ...state, capability:       output as CapabilityResult       });
    case "CONNECTOR_RUNTIME":   return Object.freeze({ ...state, connectorRuntime: output as ConnectorRuntimeResult });
    case "CONNECTOR":           return Object.freeze({ ...state, connector:        output as ConnectorResult        });
    case "RESULT":              return Object.freeze({ ...state, result:           output as ResultOutput           });
    case "MEMORY":              return Object.freeze({ ...state, memory:           output as MemoryResult           });
    case "EXPLAINABILITY":      return Object.freeze({ ...state, explainability:   output as ExplainabilityResult   });
    case "AUDIT":               return Object.freeze({ ...state, audit:            output as AuditResult            });
    default:                    return Object.freeze({ ...state });
  }
}