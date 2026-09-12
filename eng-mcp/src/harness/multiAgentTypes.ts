/**
 * GH-05 — Multi-agent mission types: Advisor/Supervisor/Worker + parallel plan
 * execution. Minimal surface: nothing here governs — only the Guardian Harness
 * (GH-01/GH-04A) decides CONTINUE/RECOVER/BLOCK/PASS. No distributed
 * infrastructure: everything is a local, in-process scheduler/lock/budget.
 */
import { Evidence, MissionState } from './missionTypes.js';

/** How an action touches each of its resourceKeys (default 'read'). */
export type ResourceMode = 'read' | 'write';

/**
 * Everything a bounded action may use. No contract object, no permissions
 * object, no budget, no mission state, no transcript — a Worker receives
 * ONLY the minimum sufficient context of its own action.
 *
 * PRÉ-GH-07 (role context budget): the action-specific fields below describe
 * exactly this action (dependencies, resources, mode, expected evidence) plus
 * the contract authorization VERBATIM (allowedActions/forbiddenActions) —
 * never the full transcript, never other workers' results.
 */
export interface ActionExecutionContext {
  actionId: string;
  /** This action's description (what it is), when the plan declares one. */
  actionDescription?: string;
  /** Dependencies relevant to this action (ids that had to finish first). */
  dependsOn?: readonly string[];
  /** Resources/files this action touches and how (read/write). */
  resourceKeys?: readonly string[];
  mode?: ResourceMode;
  /** Evidence keys this action must produce ok (the success contract). */
  expectedEvidence?: readonly string[];
  /**
   * HARDENING-02 — the structured input of THIS action, verbatim from the
   * plan (frozen by the Worker when it is an object). The worker never
   * guesses what to run: the advisor's structured command travels here,
   * never merged into the objective text (CERT-01 finding: verbatim-input
   * workaround in the objective).
   */
  actionInput?: unknown;
  /** Contract authorization, VERBATIM (never expanded by any role). */
  allowedActions?: readonly string[];
  forbiddenActions?: readonly string[];
  /** Injectable clock (same seam as the Guardian harness). */
  now(): number;
}

export interface WorkerOutput {
  evidence?: Evidence[];
  costUsd?: number;
}

/** Callable body of one bounded action. A Worker runs exactly this — no more. */
export type ActionRunner = (ctx: ActionExecutionContext) => Promise<WorkerOutput>;

export interface PlanAction {
  id: string;
  description?: string;
  /** Action ids that must finish with status 'ok' before this one may start. */
  dependsOn: string[];
  /** Resources the action touches. read+read may overlap; write excludes all. */
  resourceKeys?: string[];
  mode?: ResourceMode;
  /** Conservative reservation charged against the GLOBAL mission budget. */
  estimatedCostUsd?: number;
  /** Evidence keys the action must produce ok for the Supervisor to see no gap. */
  expectedEvidence?: string[];
  /**
   * HARDENING-02 — structured input for this action's run (e.g. the exact
   * MCP tool input). Transported verbatim to ctx.actionInput; never merged
   * into the objective. Must be JSON-serializable (validatePlan enforces).
   */
  input?: unknown;
  /** The bounded execution body. Workers never receive anything else. */
  run: ActionRunner;
}

export interface PlanProposal {
  planId: string;
  advisorId: string;
  actions: PlanAction[];
}

export interface PlanValidation {
  valid: boolean;
  detail?: string;
}

/** Terminal status of one planned action. */
export type ActionStatus =
  | 'ok'
  | 'fail'
  | 'transient'
  | 'hard'
  | 'cancelled'
  | 'budget_blocked'
  | 'dependency_failed';

export interface WorkerResult {
  actionId: string;
  status: ActionStatus;
  /** false when the action never started (cancelled/budget_blocked/dependency_failed). */
  started: boolean;
  startMs?: number;
  endMs?: number;
  evidence: Evidence[];
  costUsd: number;
  error?: string;
}

/** Supervisor is ADVISORY: COMPLETE never produces PASS — Guardian-only. */
export type SupervisorRecommendation = 'CONTINUE' | 'RECOVER' | 'COMPLETE';

export interface SupervisorReviewInput {
  plan: PlanProposal;
  results: Map<string, WorkerResult>;
  state: MissionState;
  /**
   * PRÉ-GH-07 (role context budget): strategic context — the mission
   * objective and the remaining completion criteria the Guardian verifies.
   * Never the full transcript.
   */
  objective?: string;
  remainingCriteria?: readonly string[];
}

export interface SupervisorReport {
  recommendation: SupervisorRecommendation;
  /** Named gaps for the Guardian's own decision — advisory only. */
  gaps: string[];
  reasons: string[];
}

/** Global mission budget seam: reservation-based, cap never expanded. */
export interface BudgetGuard {
  /** Try to reserve the estimated cost BEFORE starting an action. */
  tryReserve(estimatedCostUsd: number): boolean;
  /** Settle a finished action: release the reservation, commit the real cost. */
  settle(reservedCostUsd: number, actualCostUsd: number): void;
  /** Real cost committed so far by this guard. */
  committedUsd(): number;
  /** The mission cap, when the contract declares one. */
  capUsd(): number | undefined;
}

export interface GlobalBudgetGuardOptions {
  capUsd?: number;
  initialSpentUsd?: number;
}

/**
 * GH-05 global mission budget: committed + reserved may never exceed the cap,
 * so a new Worker can never be started when the cap forbids it. The cap itself
 * is never modified — the Guardian's costCapViolation stays sovereign.
 */
export class GlobalBudgetGuard implements BudgetGuard {
  private readonly cap?: number;
  private reserved = 0;
  private committed: number;

  constructor(options: GlobalBudgetGuardOptions = {}) {
    this.cap = options.capUsd;
    this.committed = options.initialSpentUsd ?? 0;
  }

  tryReserve(estimatedCostUsd: number): boolean {
    if (this.cap === undefined) return true;
    if (this.committed + this.reserved + estimatedCostUsd > this.cap) return false;
    this.reserved += estimatedCostUsd;
    return true;
  }

  settle(reservedCostUsd: number, actualCostUsd: number): void {
    this.reserved -= reservedCostUsd;
    this.committed += actualCostUsd;
  }

  committedUsd(): number {
    return this.committed;
  }

  capUsd(): number | undefined {
    return this.cap;
  }
}

export interface ExecutionActionRecord {
  actionId: string;
  /** Topological wave level of the action (0 = first wave). */
  wave: number;
  status: ActionStatus;
  startMs?: number;
  endMs?: number;
  costUsd: number;
}

export interface ParallelExecutionReport {
  planId: string;
  waveCount: number;
  /** Highest observed number of simultaneous in-flight actions. */
  maxObservedConcurrency: number;
  records: ExecutionActionRecord[];
  /** Aggregated worker evidence, in settlement order. */
  evidence: Evidence[];
  totalCostUsd: number;
  results: Map<string, WorkerResult>;
  /** true when a HARD marker stopped new starts inside the plan. */
  aborted: boolean;
}
