/**
 * GH-05 — MultiAgentRuntime: one AgentRuntime seam (the certified GH-01/GH-02
 * contract) whose cycle is executed as Advisor -> parallel Workers ->
 * Supervisor, all inside the SAME mission, budget and permissions.
 *
 * AGENTS REASON AND EXECUTE. GUARDIAN GOVERNS.
 * - Advisor proposes plans; it never governs, never expands anything.
 * - Workers execute one bounded action each; they never decide the outcome.
 * - Supervisor reviews results and recommends; even COMPLETE never produces
 *   PASS — its recommendation is attached to the cycle as advisory evidence
 *   only when it is COMPLETE, and the Guardian's CompletionGuard alone
 *   concludes PASS/FAIL/BLOCKED from criteria + evidence + budget.
 * - GH-04A recovery is NOT duplicated: a worker failure flows back as cycle
 *   evidence and the Guardian classifies/decides exactly as before.
 * - Budget is GLOBAL to the mission: reservations of parallel workers can
 *   never push committed cost over contract.maxCostUsd, and the Guardian's
 *   costCapViolation stays the final authority (over-budget never PASSes).
 */
import {
  AgentCycleResult,
  AgentRuntime,
  Evidence,
  MissionContract,
  MissionState,
} from './missionTypes.js';
import { AdvisorAgent, frozenStateView } from './advisor.js';
import { validatePlan, validatePlanCoverage } from './advisor.js';
import {
  GlobalBudgetGuard,
  ParallelExecutionReport,
  PlanProposal,
} from './multiAgentTypes.js';
import { DeterministicSupervisor, SupervisorAgent } from './supervisor.js';
import {
  DEFAULT_MAX_PARALLEL_ACTIONS,
  ExecutionProgressSnapshot,
  ParallelWaveExecutor,
} from './parallelWaveExecutor.js';
import { filterCompletedActions } from './missionMemory.js';

export interface MultiAgentRuntimeConfig {
  /** The Advisor that proposes plans for each cycle. */
  advisor: AdvisorAgent;
  /** Supervisor; default: the deterministic builtin. Advisory in any case. */
  supervisor?: SupervisorAgent;
  /**
   * Upper bound of simultaneous in-flight workers when the contract does not
   * declare maxParallelActions. The contract value always wins.
   */
  maxParallelActions?: number;
  /** Injectable clock (same seam as the Guardian harness). Default Date.now. */
  now?: () => number;
  /**
   * HARDENING-03 — when true, a plan that cannot cover the remaining
   * completion criteria is rejected BEFORE any worker starts (fail-cycle
   * evidence multi_agent:plan_incomplete; INCOMPLETE_PLAN_EXECUTED=NO).
   * Default false: the certified suite's behavior is byte-identical; real
   * missions opt in explicitly.
   */
  requirePlanCoverage?: boolean;
}

const RUNTIME_STRATEGY = 'multi-agent';
const SUPERVISOR_SOURCE = 'supervisor';

function trunc160(value: string): string {
  return value.slice(0, 160);
}

export class MultiAgentRuntime implements AgentRuntime {
  private readonly advisor: AdvisorAgent;
  private readonly supervisor?: SupervisorAgent;
  private readonly configuredMaxParallelActions?: number;
  private readonly now: () => number;
  private readonly requirePlanCoverage: boolean;
  /**
   * HARDENING-05 — live phase for the harness heartbeat (no LLM): where the
   * runtime currently is. ADVISORY diagnostics only; it never governs.
   */
  currentPhase: 'IDLE' | 'ADVISOR' | 'WORKERS' | 'SUPERVISOR' = 'IDLE';
  /** HARDENING-05 — live worker progress snapshot (undefined outside WORKERS). */
  currentProgress: ExecutionProgressSnapshot | undefined;
  /** Last accepted-plan execution report (auditable; advisory diagnostics). */
  lastExecutionReport: ParallelExecutionReport | undefined;
  /** Every executed plan report, in cycle order (auditable history). */
  readonly executionReports: ParallelExecutionReport[] = [];
  /**
   * GH-06 — action ids skipped by duplicate-work prevention in the last
   * executed cycle (already completed with conclusive evidence).
   */
  lastSkippedActionIds: string[] = [];
  /** Last produced cycle (auditable). */
  lastCycle: AgentCycleResult | undefined;
  /** Number of executed multi-agent cycles (run+continue together). */
  executeCycleCalls = 0;

  constructor(config: MultiAgentRuntimeConfig) {
    this.advisor = config.advisor;
    this.supervisor = config.supervisor;
    this.configuredMaxParallelActions = config.maxParallelActions;
    this.now = config.now ?? (() => Date.now());
    this.requirePlanCoverage = config.requirePlanCoverage ?? false;
  }

  async runMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    return await this.executeCycle(contract, state);
  }

  async continueMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    return await this.executeCycle(contract, state);
  }

  /**
   * The harness cancels in-flight work through the official runtime seam; the
   * multi-agent executor runs inside one cycle and finishes its in-flight
   * actions safely. Nothing to interrupt outside a cycle.
   */
  async cancelMission(_contract: MissionContract, _state: MissionState): Promise<void> {
    /* no active SDK session in the multi-agent runtime */
  }

  /** Read-only reconciliation seam used by the Guardian's GH-04A recovery. */
  async getEvidence(_contract: MissionContract, state: MissionState): Promise<Evidence[]> {
    return [...state.evidence];
  }

  private async executeCycle(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    this.executeCycleCalls += 1;
    const timestamp = this.now();

    let proposal: PlanProposal;
    this.currentPhase = 'ADVISOR';
    try {
      // Frozen view: the Advisor can never mutate the sovereign mission state.
      // PRÉ-GH-07: strategic minimum-sufficient view (state summary + contract
      // constraints verbatim) — never a full transcript.
      proposal = await this.advisor.proposePlan(contract.objective, frozenStateView(state, contract));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.currentPhase = 'IDLE';
      return this.failCycle(`multi_agent:advisor_error`, trunc160(detail), timestamp);
    }

    const validation = validatePlan(proposal);
    if (!validation.valid) {
      this.currentPhase = 'IDLE';
      return this.failCycle('multi_agent:plan_invalid', trunc160(validation.detail ?? 'invalid'), timestamp);
    }

    // HARDENING-03 — coverage gate (opt-in): a plan that cannot ever produce
    // the remaining criteria's evidence is rejected BEFORE any worker starts.
    if (this.requirePlanCoverage) {
      const coverage = validatePlanCoverage(proposal, contract, state);
      if (!coverage.valid) {
        this.currentPhase = 'IDLE';
        return this.failCycle('multi_agent:plan_incomplete', trunc160(coverage.detail ?? 'incomplete'), timestamp);
      }
    }

    // GH-06 — structural duplicate-work prevention: actions already completed
    // with still-conclusive evidence are NEVER re-executed (resume safety).
    const completedFilter = filterCompletedActions(proposal, state);
    this.lastSkippedActionIds = completedFilter.skipped;
    if (completedFilter.skipped.length > 0) {
      proposal = { ...proposal, actions: completedFilter.executable };
      if (proposal.actions.length === 0) {
        // Everything the advisor proposed is already conclusively done: a
        // no-op cycle with audit evidence — the Guardian decides what that
        // means. (An originally EMPTY plan falls through: no skip happened.)
        return this.alreadyDoneCycle(completedFilter.skipped, timestamp);
      }
    }

    // Guardian-owned GLOBAL mission budget: reservations of every parallel
    // worker are charged against contract.maxCostUsd — never expanded here.
    const budgetGuard = new GlobalBudgetGuard({
      capUsd: contract.maxCostUsd,
      initialSpentUsd: state.spentCostUsd ?? 0,
    });
    const executor = new ParallelWaveExecutor({
      maxParallelActions: contract.maxParallelActions ?? this.configuredMaxParallelActions ?? DEFAULT_MAX_PARALLEL_ACTIONS,
      budgetGuard,
      now: this.now,
      // PRÉ-GH-07: worker authorization context, contract-verbatim (never expanded).
      missionContext: {
        allowedActions: contract.allowedActions ? Object.freeze([...contract.allowedActions]) : undefined,
        forbiddenActions: contract.forbiddenActions ? Object.freeze([...contract.forbiddenActions]) : undefined,
      },
      // HARDENING-05 — deterministic progress snapshots for the heartbeat.
      onProgress: (snapshot) => {
        this.currentProgress = snapshot;
      },
    });
    this.currentPhase = 'WORKERS';
    const report = await executor.executePlan(proposal);
    this.lastExecutionReport = report;
    this.executionReports.push(report);
    this.currentPhase = 'SUPERVISOR';

    const evidence: Evidence[] = [...report.evidence];
    // Supervisor review is ADVISORY: COMPLETE is surfaced as ok evidence for
    // auditability, but it never sets claimsComplete and never yields PASS —
    // insufficient evidence makes the Guardian continue/block exactly as the
    // certified GH-01/GH-04A decision table prescribes.
    const supervisor = this.supervisor ?? new DeterministicSupervisor();
    // PRÉ-GH-07: the Supervisor receives objective + plan + results + remaining
    // criteria (minimum sufficient review context; never a full transcript).
    const review = await supervisor.review({
      plan: proposal,
      results: report.results,
      state,
      objective: contract.objective,
      remainingCriteria: Object.freeze([...state.remainingSteps]),
    });
    if (review.recommendation === 'COMPLETE') {
      evidence.push({
        type: 'command_result',
        key: 'supervisor:recommendation',
        status: 'ok',
        value: review.gaps.length === 0 ? 'no_gaps' : trunc160(review.gaps.join(',')),
        timestamp: this.now(),
        source: SUPERVISOR_SOURCE,
      });
    }

    const completedActionIds = [...report.results.values()]
      .filter((result) => result.status === 'ok')
      .map((result) => result.actionId);
    const cycle: AgentCycleResult = {
      strategy: RUNTIME_STRATEGY,
      steps: completedActionIds,
      evidence,
      costUsd: report.totalCostUsd,
      // claimsComplete is NEVER set: only the Guardian concludes the mission.
    };
    this.lastCycle = cycle;
    this.currentPhase = 'IDLE';
    return cycle;
  }

  /** Structural plan/advisor failure: fail evidence for the Guardian to classify. */
  private failCycle(key: string, value: string, timestamp: number): AgentCycleResult {
    const evidence: Evidence[] = [
      {
        type: 'command_result',
        key,
        status: 'fail',
        value,
        timestamp,
        source: RUNTIME_STRATEGY,
      },
    ];
    const cycle: AgentCycleResult = {
      strategy: RUNTIME_STRATEGY,
      steps: [],
      evidence,
      costUsd: 0,
    };
    this.lastCycle = cycle;
    return cycle;
  }

  /**
   * GH-06 — every proposed action is already conclusively completed: no work
   * is re-executed. One ok audit evidence records the skip list; the Guardian
   * (never the runtime) decides what that means for the mission.
   */
  private alreadyDoneCycle(skipped: string[], timestamp: number): AgentCycleResult {
    const evidence: Evidence[] = [
      {
        type: 'command_result',
        key: 'multi_agent:actions_already_completed',
        status: 'ok',
        value: skipped.join(','),
        timestamp,
        source: RUNTIME_STRATEGY,
      },
    ];
    const cycle: AgentCycleResult = {
      strategy: RUNTIME_STRATEGY,
      steps: [],
      evidence,
      costUsd: 0,
    };
    this.lastCycle = cycle;
    return cycle;
  }
}
