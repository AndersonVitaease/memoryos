/**
 * GH-05 — ParallelWaveExecutor: dependency-driven wave execution with
 * MAX SAFE PARALLELISM.
 *
 * PARALLEL BY DEFAULT. SERIAL ONLY WHEN REQUIRED.
 * - Every action whose dependsOn is fully satisfied becomes ready.
 * - Ready actions start simultaneously (up to maxParallelActions) unless a
 *   resource lock forbids it; a blocked head never stops a compatible action
 *   behind it (no artificial barriers between independent actions).
 * - PRÉ-GH-07 — WORK-CONSERVING scheduler with DYNAMIC SLOT REFILL: a freed
 *   slot starts the next eligible READY action immediately (dependency-
 *   satisfied, resource-compatible, budget-reservable) — the scheduler NEVER
 *   waits for the whole wave to finish while safe READY work exists. The
 *   effective concurrency is always
 *   min(maxParallelActions, ready-and-independent actions, available budget,
 *   conflict-free resources).
 * - Resource rules (local in-process locks, no distributed machinery):
 *   READ+READ on the same key may overlap; WRITE excludes READ and WRITE on
 *   the same key; different keys never conflict. Dynamic slot refill can
 *   never start an action whose resources conflict with in-flight ones.
 * - Global mission budget via BudgetGuard reservations: an action whose
 *   estimated cost cannot be reserved NEVER starts (budget_blocked). Ten
 *   workers are never a budget authorization.
 * - HARD containment: after one hard worker result no new action starts and
 *   pending actions are cancelled; in-flight actions are left to finish
 *   safely (ignoring them mid-flight is not safe; interrupting run() is not
 *   available to the executor and stays with the runtime's cancelMission).
 * - Dependency failures propagate: an action whose dependency ended with any
 *   terminal non-ok status becomes dependency_failed (never deadlocks).
 */
import { Evidence } from './missionTypes.js';
import {
  ActionStatus,
  BudgetGuard,
  ExecutionActionRecord,
  GlobalBudgetGuard,
  ParallelExecutionReport,
  PlanAction,
  PlanProposal,
  ResourceMode,
  WorkerResult,
} from './multiAgentTypes.js';
import { WorkerAgent } from './worker.js';
import { computeActionWaves } from './advisor.js';

/**
 * PRÉ-GH-07 — default max parallelism: 10 wide-wave workers (still
 * configurable: contract.maxParallelActions wins, then the runtime config).
 * Effective concurrency is always capped by min(maxParallelActions, ready
 * and independent actions, available budget, conflict-free resources).
 */
export const DEFAULT_MAX_PARALLEL_ACTIONS = 10;

/**
 * PRÉ-GH-07 — scheduler properties, declared for auditability and PROVEN by
 * objective tests (event ordering / start-end overlap):
 * - DYNAMIC_SLOT_REFILL: the next eligible READY action starts immediately
 *   when a slot frees; no wave barrier exists.
 * - WORK_CONSERVING_SCHEDULER: in-flight capacity stays occupied whenever
 *   safe READY work exists.
 * - WAIT_FOR_FULL_WAVE_COMPLETION: false — the executor never waits for the
 *   whole first wave before starting further READY actions.
 */
export const DYNAMIC_SLOT_REFILL = true;
export const WORK_CONSERVING_SCHEDULER = true;
export const WAIT_FOR_FULL_WAVE_COMPLETION = false;

/** Read/read share a key; write excludes everything on the key. All-or-nothing. */
class ResourceLocks {
  private readonly readers = new Map<string, number>();
  private readonly writers = new Set<string>();

  private static modeOf(action: PlanAction): ResourceMode {
    return action.mode ?? 'read';
  }

  canAcquire(action: PlanAction): boolean {
    const mode = ResourceLocks.modeOf(action);
    for (const key of action.resourceKeys ?? []) {
      if (this.writers.has(key)) return false;
      if (mode === 'write' && (this.readers.get(key) ?? 0) > 0) return false;
    }
    return true;
  }

  acquire(action: PlanAction): void {
    const mode = ResourceLocks.modeOf(action);
    for (const key of action.resourceKeys ?? []) {
      if (mode === 'write') {
        this.writers.add(key);
      } else {
        this.readers.set(key, (this.readers.get(key) ?? 0) + 1);
      }
    }
  }

  release(action: PlanAction): void {
    const mode = ResourceLocks.modeOf(action);
    for (const key of action.resourceKeys ?? []) {
      if (mode === 'write') {
        this.writers.delete(key);
      } else {
        const remaining = (this.readers.get(key) ?? 0) - 1;
        if (remaining <= 0) this.readers.delete(key);
        else this.readers.set(key, remaining);
      }
    }
  }
}

/**
 * HARDENING-05 — deterministic progress snapshot emitted by the scheduler
 * while workers run. Pure counters of observed events — NO LLM, no inference,
 * no percentages (counters like workers_completed=6/10 are honest; a percent
 * of unknown-duration work is not).
 */
export interface ExecutionProgressSnapshot {
  phase: 'WORKERS';
  actionsTotal: number;
  actionsStarted: number;
  /** Terminal actions (any status: ok/fail/transient/cancelled/...). */
  actionsCompleted: number;
  workersActive: number;
  workersCompleted: number;
  /** Most recent scheduler event, e.g. start:w1 / end:w3:ok / mark:w9:budget_blocked. */
  lastEvent: string;
  /** Age of lastEvent in ms, from the executor's injectable clock. */
  lastEventAgeMs: number;
}

export interface ParallelWaveExecutorOptions {
  /** Maximum simultaneous in-flight actions (contract.maxParallelActions wins). */
  maxParallelActions?: number;
  /** Global mission budget; default: unlimited guard. */
  budgetGuard?: BudgetGuard;
  /** Injectable clock for deterministic timestamps. Default Date.now. */
  now?: () => number;
  /**
   * PRÉ-GH-07 — contract authorization handed VERBATIM to each worker's
   * minimum-sufficient action context. Never expanded, never derived.
   */
  missionContext?: {
    allowedActions?: readonly string[];
    forbiddenActions?: readonly string[];
  };
  /**
   * HARDENING-05 — optional synchronous progress sink. The executor calls it
   * with a fresh snapshot after every scheduling/settlement event; it never
   * blocks execution and never consults an LLM.
   */
  onProgress?: (snapshot: ExecutionProgressSnapshot) => void;
}

export class ParallelWaveExecutor {
  private readonly maxParallelActions: number;
  private readonly budgetGuard: BudgetGuard;
  private readonly now: () => number;
  private readonly missionContext:
    | { allowedActions?: readonly string[]; forbiddenActions?: readonly string[] }
    | undefined;
  private readonly onProgress?: (snapshot: ExecutionProgressSnapshot) => void;
  private readonly worker: WorkerAgent;

  constructor(options: ParallelWaveExecutorOptions = {}) {
    this.maxParallelActions = Math.max(1, options.maxParallelActions ?? DEFAULT_MAX_PARALLEL_ACTIONS);
    this.budgetGuard = options.budgetGuard ?? new GlobalBudgetGuard();
    this.now = options.now ?? (() => Date.now());
    this.missionContext = options.missionContext;
    this.onProgress = options.onProgress;
    this.worker = new WorkerAgent(this.now);
  }

  async executePlan(proposal: PlanProposal): Promise<ParallelExecutionReport> {
    const waves = computeActionWaves(proposal);
    const waveCount = waves.size === 0 ? 0 : Math.max(...waves.values()) + 1;
    const byId = new Map(proposal.actions.map((a) => [a.id, a] as const));
    const declaredOrder = proposal.actions.map((a) => a.id);
    const pending = new Set<string>(declaredOrder);
    const status = new Map<string, ActionStatus>();
    const results = new Map<string, WorkerResult>();
    const records: ExecutionActionRecord[] = [];
    const evidence: Evidence[] = [];
    const locks = new ResourceLocks();
    const tracked = new Set<Promise<void>>();
    let inFlight = 0;
    let maxObservedConcurrency = 0;
    let totalCostUsd = 0;
    let aborted = false;
    // HARDENING-05 — deterministic progress counters (pure event bookkeeping).
    let startedCount = 0;
    let settledCount = 0;
    let lastEventId = 'none';
    let lastEventMs = this.now();
    const emitProgress = (): void => {
      if (!this.onProgress) return;
      this.onProgress({
        phase: 'WORKERS',
        actionsTotal: proposal.actions.length,
        actionsStarted: startedCount,
        actionsCompleted: records.length,
        workersActive: inFlight,
        workersCompleted: settledCount,
        lastEvent: lastEventId,
        lastEventAgeMs: Math.max(0, this.now() - lastEventMs),
      });
    };

    const depsAllOk = (action: PlanAction): boolean =>
      action.dependsOn.every((dep) => status.get(dep) === 'ok');
    const anyDepTerminalNotOk = (action: PlanAction): boolean =>
      action.dependsOn.some((dep) => {
        const depStatus = status.get(dep);
        return depStatus !== undefined && depStatus !== 'ok';
      });

    const mark = (id: string, actionStatus: ActionStatus, result?: WorkerResult): void => {
      status.set(id, actionStatus);
      pending.delete(id);
      // HARDENING-05 — a settled worker is an 'end' event; a never-started
      // terminal mark (budget_blocked/cancelled/...) is a 'mark' event.
      lastEventId = result ? `end:${id}:${actionStatus}` : `mark:${id}:${actionStatus}`;
      lastEventMs = this.now();
      records.push({
        actionId: id,
        wave: waves.get(id) ?? 0,
        status: actionStatus,
        startMs: result?.startMs,
        endMs: result?.endMs,
        costUsd: result?.costUsd ?? 0,
      });
      if (result) {
        results.set(id, result);
        evidence.push(...result.evidence);
        totalCostUsd += result.costUsd;
      }
    };

    const startAction = (action: PlanAction): boolean => {
      if (inFlight >= this.maxParallelActions) return false;
      if (!locks.canAcquire(action)) return false; // waits for its resources
      const reserved = action.estimatedCostUsd ?? 0;
      if (!this.budgetGuard.tryReserve(reserved)) {
        mark(action.id, 'budget_blocked'); // never started: no work spent
        return true;
      }
      locks.acquire(action);
      inFlight += 1;
      startedCount += 1;
      if (inFlight > maxObservedConcurrency) maxObservedConcurrency = inFlight;
      lastEventId = `start:${action.id}`;
      lastEventMs = this.now();
      const execution = this.worker
        .perform(action, this.now, this.missionContext)
        .then((result) => {
          this.budgetGuard.settle(reserved, result.costUsd);
          locks.release(action);
          inFlight -= 1;
          settledCount += 1;
          // HARD containment: a hard marker stops every future start.
          if (result.status === 'hard') aborted = true;
          mark(action.id, result.status, result);
          emitProgress();
        });
      // WorkerAgent.perform never rejects; the catch is defensive only.
      const trackedPromise = execution.catch(() => undefined).finally(() => {
        tracked.delete(trackedPromise);
      });
      tracked.add(trackedPromise);
      pending.delete(action.id);
      return true;
    };

    while (true) {
      // 1) Dependency failures propagate before anything else is scheduled.
      if (pending.size > 0) {
        let propagated = true;
        while (propagated) {
          propagated = false;
          for (const id of declaredOrder) {
            if (!pending.has(id)) continue;
            if (anyDepTerminalNotOk(byId.get(id) as PlanAction)) {
              mark(id, 'dependency_failed');
              propagated = true;
            }
          }
        }
      }

      // 2) HARD containment: pending actions never start after a hard result;
      //    in-flight actions are left to finish safely (drained below).
      if (aborted) {
        for (const id of declaredOrder) {
          if (pending.has(id)) mark(id, 'cancelled');
        }
      }

      // 3) PARALLEL BY DEFAULT: start every ready action that fits the
      //    concurrency slot, its resources and the global budget. A blocked
      //    head never blocks a compatible follower behind it.
      if (!aborted && pending.size > 0) {
        for (const id of declaredOrder) {
          if (!pending.has(id)) continue;
          if (inFlight >= this.maxParallelActions) break;
          const action = byId.get(id) as PlanAction;
          if (!depsAllOk(action)) continue;
          startAction(action);
        }
      }
      emitProgress();

      if (inFlight > 0) {
        // Wave barrier: wait for at least one in-flight action to settle.
        await Promise.race([...tracked]);
        continue;
      }
      // Nothing in flight: remaining pending actions are unstartable — they
      // can only be budget-blocked (the scheduler always resolves one of the
      // ready ones). Defensive sweep guarantees termination.
      if (pending.size > 0) {
        for (const id of declaredOrder) {
          if (pending.has(id)) mark(id, 'budget_blocked');
        }
      }
      break;
    }
    emitProgress();

    return {
      planId: proposal.planId,
      waveCount,
      maxObservedConcurrency,
      records,
      evidence,
      totalCostUsd,
      results,
      aborted,
    };
  }
}
