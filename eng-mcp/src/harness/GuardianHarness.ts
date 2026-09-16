/**
 * GH-01 — GuardianHarness: the minimal run loop.
 * AGENTS EXECUTE. GUARDIAN VERIFIES.
 * Deterministic budget enforcement (cycles/duration/cost), no-progress guard,
 * evidence-based completion, JSON resume without redoing completed steps.
 */
import {
  AgentCycleResult,
  AgentRuntime,
  MAX_DECISION_LOG,
  MAX_FALLBACK_ATTEMPT_LOG,
  MissionContract,
  MissionDecision,
  MissionState,
  MissionStateStore,
  Evidence,
  createInitialState,
  fingerprintEvidence,
  serializeState,
  deserializeState,
} from './missionTypes.js';
import {
  classifyMissionStep,
  classifySingleAttemptOutcome,
  evaluateCompletion,
  evaluateProgress,
  evaluateNoProgress,
} from './guards.js';
import {
  MemoryAdvice,
  MissionCheckpoint,
  MissionCheckpointStore,
  MissionContext,
  MissionMemoryStore,
  consultMissionMemory,
  createCheckpoint,
  errorSignatureOf,
  extractWaveState,
} from './missionMemory.js';
import { AuthorizedExecutor } from './authorizedExecutors.js';
import {
  createUcmeGuardianMemoryStore,
  GuardianMissionMemoryRecord,
} from './ucmeMissionMemory.js';
import {
  executeFallbacks,
  primaryExecutorFailureOf,
  reconcileFallbackAttempts,
  validateFallback,
} from './executorFallback.js';

/**
 * HARDENING-05 — heartbeat configuration: a deterministic periodic line that
 * proves a long mission is alive. NO LLM, no inference, no decisions — the
 * heartbeat NEVER changes Guardian authority (it only reports).
 */
export interface HeartbeatOptions {
  /** Interval in ms. Target 30000; clamped to >= 1000 for sanity. */
  intervalMs?: number;
  /** Deterministic emitter (e.g. console.log). Called on every tick. */
  emit: (line: string) => void;
}

/**
 * HARDENING-05 — duck-typed view of optional runtime heartbeat hints
 * (MultiAgentRuntime.currentPhase/currentProgress). Read structurally so the
 * harness keeps working with any AgentRuntime: absent hints simply mean the
 * line carries phase=RUNTIME and no worker counters.
 */
interface HeartbeatRuntimeHints {
  currentPhase?: string;
  currentProgress?: {
    actionsTotal?: number;
    actionsStarted?: number;
    actionsCompleted?: number;
    workersActive?: number;
    workersCompleted?: number;
    lastEvent?: string;
    lastEventAgeMs?: number;
  };
}

export interface HarnessOptions {
  /** HARDENING-05 — periodic MISSION ALIVE heartbeat (deterministic, no LLM). */
  heartbeat?: HeartbeatOptions;
  store?: MissionStateStore;
  /**
   * GH-06 — checkpoint store. When present, begin() resumes from the
   * versioned checkpoint (fail-closed on corruption/version mismatch) and
   * every persist() also saves an atomic checkpoint, so an interrupted
   * runtime never loses more than the in-flight cycle.
   */
  checkpointStore?: MissionCheckpointStore;
  /**
   * GH-06 — experience/error memory. ADVISORY ONLY: consulted before
   * recovery to reuse known-error strategies; never alters decision kind,
   * classification, PASS, budget or permissions.
   */
  memory?: MissionMemoryStore;
  /**
   * GH-06A — ALREADY-AUTHORIZED alternative executors the Guardian may hand a
   * resolvable primary-executor failure to. The contract is never expanded:
   * an action runs only when the action AND the executor's channel are already
   * in allowedActions. Absent (the default): behavior is byte-identical to the
   * certified GH-06 flow.
   */
  executorFallback?: { executors: readonly AuthorizedExecutor[] };
  /** Injectable clock for deterministic maxDurationMs tests. */
  now?: () => number;
  /** Cost extractor (default: result.costUsd ?? 0). */
  costOf?: (result: AgentCycleResult) => number;
  /** Injectable delay for transient-retry backoff (default: setTimeout). */
  sleep?: (ms: number) => Promise<void>;
}

export interface HarnessResult {
  status: MissionState['status'];
  reason?: string;
  state: MissionState;
  serializedState: string;
}

export class GuardianHarness {
  readonly contract: MissionContract;
  private readonly runtime: AgentRuntime;
  private readonly store?: MissionStateStore;
  private readonly checkpointStore?: MissionCheckpointStore;
  private readonly memory?: MissionMemoryStore;
  private readonly fallbackExecutors: readonly AuthorizedExecutor[];
  private readonly now: () => number;
  private readonly costOf: (result: AgentCycleResult) => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly heartbeat?: HeartbeatOptions;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private state!: MissionState;
  private resumedFlag = false;
  private resumedCheckpointContext: MissionContext | undefined;
  /** GH-06 — last advisory memory consultation (auditable; never governing). */
  lastMemoryAdvice: MemoryAdvice | undefined;
  /**
   * GH-06A — last authorized-executor-fallback reconciliation summary
   * (auditable). Executor outcomes are data: PASS is still Guardian-owned.
   */
  lastFallbackSummary:
    | {
        requested: number;
        eligible: number;
        executed: number;
        skipped: number;
        loopBlocked: number;
        blockedReason?: string;
      }
    | undefined;
  /** GH-06A — the primary failure the fallback resolved (superseded downstream). */
  private fallbackResolvedFailure: Evidence | undefined;

  constructor(
    contract: MissionContract,
    runtime: AgentRuntime,
    options: HarnessOptions = {},
  ) {
    this.contract = contract;
    this.runtime = runtime;
    this.store = options.store;
    this.checkpointStore = options.checkpointStore;
    this.memory = options.memory;
    this.fallbackExecutors = options.executorFallback?.executors ?? [];
    this.now = options.now ?? (() => Date.now());
    this.costOf = options.costOf ?? ((r) => r.costUsd ?? 0);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.heartbeat = options.heartbeat;
  }

  /** true when this harness instance resumed from a checkpoint. */
  get resumedFromCheckpoint(): boolean {
    return this.resumedFlag;
  }

  /** The compact context captured in the checkpoint this harness resumed from. */
  get checkpointContext(): MissionContext | undefined {
    return this.resumedCheckpointContext;
  }

  /**
   * Start fresh or resume (checkpoint first, then plain state store);
   * completed steps are never redone. Checkpoint load is fail-closed:
   * a corrupt/incompatible checkpoint throws — state is never guessed.
   */
  async begin(): Promise<void> {
    let resumed = false;
    if (this.checkpointStore) {
      const checkpoint = await this.checkpointStore.load();
      if (checkpoint && checkpoint.state.missionId === this.contract.missionId) {
        this.state = checkpoint.state;
        this.resumedCheckpointContext = checkpoint.context;
        this.resumedFlag = true;
        resumed = true;
      }
    }
    if (!resumed) {
      const loaded = this.store ? await this.store.load() : null;
      if (loaded && loaded.missionId === this.contract.missionId) {
        this.state = loaded;
      } else {
        this.state = createInitialState(this.contract, this.now());
      }
    }
    await this.persist();
  }

  async run(): Promise<HarnessResult> {
    if (!this.state) await this.begin();
    this.state.status = 'RUNNING';
    await this.persist();
    this.startHeartbeat();

    while (this.state.status === 'RUNNING') {
      const budget = this.checkBudgetBeforeCycle();
      if (budget) return await this.finish(budget);

      // GH-04A: a recovery cycle executes inside the SAME mission and budget.
      if (this.state.lastDecision?.decision === 'RECOVER') {
        this.state.recoveryAttempts = (this.state.recoveryAttempts ?? 0) + 1;
      }

      // singleAttempt never continues a recorded session: a resumed
      // single-attempt mission re-runs its ONE inference via runMission.
      const isResume = this.state.cycle > 0 && this.contract.singleAttempt !== true;
      const satisfiedBefore = this.contract.completionCriteria.filter(
        (k) => this.state.evidence.some((e) => e.key === k && e.status === 'ok'),
      ).length;
      const result = isResume
        ? await this.runtime.continueMission(this.contract, this.state)
        : await this.runtime.runMission(this.contract, this.state);

      this.applyCycle(result);

      // GH-06A — authorized executor fallback: a resolvable PRIMARY-EXECUTOR
      // failure may hand the SAME action to an ALREADY-AUTHORIZED executor
      // (action, executor and channel re-validated against the contract
      // verbatim). This is deterministic execution, NOT a second inference:
      // single-attempt missions still close below with runMission called once.
      this.fallbackResolvedFailure = undefined;
      const fallbackBlocked = await this.attemptAuthorizedExecutorFallback(result);
      if (fallbackBlocked) return await this.finish(fallbackBlocked);
      // The primary failure the fallback resolved no longer governs the
      // certified decision: it was superseded by fallback evidence.
      const cycleEvidence = this.fallbackResolvedFailure
        ? result.evidence.filter((e) => e !== this.fallbackResolvedFailure)
        : result.evidence;

      // Single-attempt policy: exactly one LLM inference. The attempt is
      // classified and closed (with read-only recovery) — never a second
      // mission or a continued inference cycle.
      if (this.contract.singleAttempt === true) {
        return await this.finishSingleAttempt(result, satisfiedBefore);
      }

      // GH-04A — mission control: classify the observed cycle, decide
      // deterministically (CONTINUE/RECOVER/BLOCK), checkpoint the state.
      // The decision never depends on the agent claiming completion.
      let decision = this.decideAfterCycle(result, satisfiedBefore, cycleEvidence);
      this.recordDecisionCheckpoint(decision, result, cycleEvidence);
      // GH-06 — advisory memory: reuse a known error's allowlisted recovery
      // instead of re-deriving it. Never changes kind/classification/PASS.
      decision = await this.applyMemoryAdvice(decision);
      if (this.memory) await this.recordMemoryFacts(decision);
      await this.persist();
      if (decision.decision === 'BLOCK') {
        return await this.finish({ status: 'BLOCKED', reason: decision.reason });
      }

      // TRANSIENT: bounded, same-budget retry with backoff when applicable.
      if (decision.classification === 'TRANSIENT' && decision.nextAction === 'transient_non_llm_retry') {
        const backoffMs = this.contract.transientRetryBackoffMs ?? 0;
        if (backoffMs > 0) await this.sleep(backoffMs * (this.state.transientRetries ?? 1));
      }

      // EXPECTATION_MISMATCH: reconcile expectation × reality against the
      // authoritative source (read-only, in-attempt recovery action).
      if (
        decision.classification === 'EXPECTATION_MISMATCH' &&
        decision.nextAction === 'authoritative_source_query'
      ) {
        const reconciled = await this.recoverViaAuthoritativeSource();
        if (reconciled) return await this.finish(reconciled);
      }

      const noProgress = evaluateNoProgress(
        this.state,
        this.contract.maxNoProgressCycles ?? 2,
      );
      if (noProgress.blocked) {
        return await this.finish({
          status: 'BLOCKED',
          reason: `no_progress_limit_reached(${noProgress.noProgressCount}/${noProgress.limit})`,
        });
      }

      const completion = evaluateCompletion(this.contract, this.state);
      if (completion.pass) {
        // Post-cycle cost hard cap: the cycle's REAL cost is already merged by
        // applyCycle, so an over-budget mission can never conclude PASS.
        const costCap = this.costCapViolation();
        if (costCap) return await this.finish(costCap);
        return await this.finish({ status: 'PASS' });
      }
    }
    // Unreachable: loop only exits via finish(); kept for exhaustiveness.
    return await this.finish({ status: 'FAIL', reason: 'invariant_violation' });
  }

  /** Guardian decision independent of any runtime claim of completion. */
  async evaluateCompletionOnly(): Promise<HarnessResult> {
    if (!this.state) await this.begin();
    const completion = evaluateCompletion(this.contract, this.state);
    if (!completion.pass) {
      return await this.finish({
        status: 'FAIL',
        reason: `completion_criteria_missing:${completion.missing.join(',')}`,
      });
    }
    const costCap = this.costCapViolation();
    if (costCap) return await this.finish(costCap);
    return await this.finish({ status: 'PASS' });
  }

  getState(): MissionState {
    return this.state;
  }

  private applyCycle(result: AgentCycleResult): void {
    const now = this.now();
    this.state.cycle += 1;
    this.state.updatedAt = now;
    this.state.spentCostUsd = (this.state.spentCostUsd ?? 0) + this.costOf(result);

    const completed = new Set(this.state.completedSteps);
    for (const step of result.steps) completed.add(step);
    this.state.completedSteps = [...completed];

    // Merge cycle evidence idempotently: identical (type,key,status) is not new
    // evidence — re-delivering the same proof must never count as progress.
    this.mergeEvidence(result.evidence);

    const progress = evaluateProgress(this.state);
    if (progress.progressed) {
      this.state.lastProgressFingerprint = progress.fingerprint;
      this.state.noProgressCount = 0;
    } else {
      this.state.noProgressCount += 1;
    }
    this.state.remainingSteps = this.contract.completionCriteria.filter(
      (k) => !this.state.evidence.some((e) => e.key === k && e.status === 'ok'),
    );
  }

  /** Idempotent evidence merge: identical (type,key,status) is never re-added. */
  private mergeEvidence(items: Evidence[]): void {
    const seen = new Set(
      this.state.evidence.map((e) => `${e.type}:${e.key}:${e.status}`),
    );
    for (const item of items) {
      const id = `${item.type}:${item.key}:${item.status}`;
      if (!seen.has(id)) {
        seen.add(id);
        this.state.evidence.push(item);
      }
    }
  }

  /** Criteria already satisfied by ok evidence (current state). */
  private countSatisfiedCriteria(): number {
    return this.contract.completionCriteria.filter(
      (k) => this.state.evidence.some((e) => e.key === k && e.status === 'ok'),
    ).length;
  }

  /** GH-04A: deterministic classification + decision for the executed cycle. */
  private decideAfterCycle(
    result: AgentCycleResult,
    satisfiedBefore: number,
    cycleEvidence: Evidence[] = result.evidence,
  ): MissionDecision {
    return classifyMissionStep({
      cycleEvidence,
      cycleSteps: result.steps,
      satisfiedCriteriaBefore: satisfiedBefore,
      satisfiedCriteriaAfter: this.countSatisfiedCriteria(),
      noProgressCount: this.state.noProgressCount,
      transientRetries: this.state.transientRetries ?? 0,
      maxTransientRetries: this.contract.maxTransientRetries ?? 2,
      sameStrategyFailures: this.state.sameStrategyFailures ?? 0,
    });
  }

  /**
   * GH-04A checkpoint: where the mission is, which error occurred, its
   * classification, the chosen recovery and the attempt counts. Counters are
   * reset only on real progress (CONTINUE on newly satisfied criteria).
   */
  private recordDecisionCheckpoint(
    decision: MissionDecision,
    result: AgentCycleResult,
    cycleEvidence: Evidence[] = result.evidence,
  ): void {
    const state = this.state;
    const failItem = cycleEvidence.find((e) => e.status === 'fail');
    const sameStrategyAsBefore = result.strategy === state.lastStrategy;
    state.lastStrategy = result.strategy;
    state.lastClassification = decision.classification;
    state.lastDecision = decision;
    // GH-06 — bounded decision history for the compact mission context.
    state.decisionLog = [
      ...(state.decisionLog ?? []),
      {
        cycle: state.cycle,
        decision: decision.decision,
        classification: decision.classification,
        reason: decision.reason,
        at: state.updatedAt,
      },
    ].slice(-MAX_DECISION_LOG);

    if (decision.decision === 'CONTINUE') {
      state.transientRetries = 0;
      state.lastTransientFailKey = undefined;
      state.sameStrategyFailures = 0;
      return;
    }
    // Failure path: keep the auditable error + per-strategy continuity counters.
    state.lastError = failItem
      ? `${failItem.key}${failItem.value ? `:${failItem.value}` : ''}`
      : decision.reason;
    state.sameStrategyFailures = sameStrategyAsBefore ? (state.sameStrategyFailures ?? 0) + 1 : 0;

    if (decision.classification === 'TRANSIENT' && decision.decision === 'RECOVER') {
      const failKey = failItem ? failItem.key : '';
      state.transientRetries = failKey === state.lastTransientFailKey
        ? (state.transientRetries ?? 0) + 1
        : 1;
      state.lastTransientFailKey = failKey;
    }
  }

  /**
   * GH-04A permitted recovery: one read-only authoritative-source query
   * (same certified recovery seam as the single-attempt closure). It may
   * produce new evidence — completion is re-evaluated and a PASS still passes
   * through the same cost cap. The progress fingerprint is re-anchored so the
   * merged read-only evidence is never counted as progress on a later cycle.
   * Returns a finish outcome only when the mission is over (PASS or budget).
   */
  private async recoverViaAuthoritativeSource():
    Promise<{ status: MissionState['status']; reason?: string } | null> {
    this.mergeEvidence(await this.runtime.getEvidence(this.contract, this.state));
    this.state.updatedAt = this.now();
    this.state.remainingSteps = this.contract.completionCriteria.filter(
      (k) => !this.state.evidence.some((e) => e.key === k && e.status === 'ok'),
    );
    this.state.lastProgressFingerprint = fingerprintEvidence(
      this.state.evidence,
      this.state.completedSteps,
    );
    await this.persist();

    const costCap = this.costCapViolation();
    if (costCap) return costCap;
    const completion = evaluateCompletion(this.contract, this.state);
    if (completion.pass) return { status: 'PASS' };
    return null;
  }

  /**
   * GH-06A — authorized executor fallback. Runs BEFORE the certified decision
   * table and only when ALL of these hold:
   * 1. fallback executors were configured for this harness;
   * 2. the runtime REQUESTED pending actions (it never decides its fallback);
   * 3. the cycle's fail evidence is a RESOLVABLE primary-executor failure —
   *    any HARD policy marker (credential/unauthorized/forbidden/permission/
   *    security/budget) dominates and blocks every fallback.
   *
   * Then the Guardian re-validates the CURRENT contract verbatim: forbidden
   * action, action authorization, executor-channel authorization — an
   * unauthorized or forbidden pending action is a permission-expansion request
   * and the mission blocks fail-closed (nothing is executed). Attempts are
   * reconciled Guardian-owned: completed fallbacks are skipped (never
   * re-executed), in-flight ones are never assumed done, and the same failing
   * fallback is loop-blocked after MAX_CONSECUTIVE_FALLBACK_FAILURES.
   *
   * Returns a finish outcome only when the mission must terminate (BLOCKED);
   * on success the fallback evidence is merged and the resolved primary
   * failure is superseded for the certified decision that follows.
   */
  private async attemptAuthorizedExecutorFallback(
    result: AgentCycleResult,
  ): Promise<{ status: MissionState['status']; reason?: string } | null> {
    const executors = this.fallbackExecutors;
    if (executors.length === 0) return null;
    if (!result.pendingActions || result.pendingActions.length === 0) return null;
    const failure = primaryExecutorFailureOf(result.evidence, result.strategy);
    if (!failure) return null; // certified classification governs

    this.lastFallbackSummary = {
      requested: result.pendingActions.length,
      eligible: 0,
      executed: 0,
      skipped: 0,
      loopBlocked: 0,
    };

    const validation = validateFallback(result.pendingActions, this.contract, executors);
    if (validation.eligible.length === 0) {
      // Fail-closed: no authorized executor for this action — never execute,
      // never expand the contract. An unauthorized/forbidden pending action is
      // a permission-expansion request, answered with BLOCK.
      const first = validation.blocked[0];
      this.lastFallbackSummary.blockedReason = first?.reason;
      await this.persist();
      return {
        status: 'BLOCKED',
        reason: `fallback_not_authorized(${first?.action ?? 'unknown'}:${first?.reason ?? 'no_authorized_executor'})`,
      };
    }

    const currentOk = new Set(
      this.state.evidence.filter((e) => e.status === 'ok').map((e) => e.key),
    );
    const reconciliation = reconcileFallbackAttempts(
      validation.eligible,
      this.state.fallbackAttempts ?? [],
      currentOk,
    );
    if (reconciliation.skipped.length > 0) {
      // Resume safety (GH-06): a completed fallback is never re-executed.
      this.state.fallbackAttempts = [
        ...(this.state.fallbackAttempts ?? []),
        ...reconciliation.skipped,
      ].slice(-MAX_FALLBACK_ATTEMPT_LOG);
      this.lastFallbackSummary.skipped = reconciliation.skipped.length;
      this.fallbackResolvedFailure = failure.failure;
    }
    if (reconciliation.loopBlocked.length > 0) {
      this.lastFallbackSummary.loopBlocked = reconciliation.loopBlocked.length;
      this.lastFallbackSummary.blockedReason = reconciliation.loopBlocked[0]?.reason;
      await this.persist();
      return {
        status: 'BLOCKED',
        reason: `fallback_loop_detected(${reconciliation.loopBlocked[0]?.action})`,
      };
    }
    if (reconciliation.runnable.length === 0) {
      await this.persist();
      return null; // all conclusive: certified flow continues, completion re-checked
    }

    this.lastFallbackSummary.eligible = reconciliation.runnable.length;
    const execution = await executeFallbacks({
      eligible: reconciliation.runnable,
      contract: this.contract,
      primaryExecutor: failure.primaryExecutor,
      priorAttempts: this.state.fallbackAttempts ?? [],
      initialSpentUsd: this.state.spentCostUsd ?? 0,
      now: this.now,
    });
    this.state.fallbackAttempts = [
      ...(this.state.fallbackAttempts ?? []),
      ...execution.records,
    ].slice(-MAX_FALLBACK_ATTEMPT_LOG);
    this.mergeEvidence(execution.evidence);
    this.state.updatedAt = this.now();
    this.state.remainingSteps = this.contract.completionCriteria.filter(
      (k) => !this.state.evidence.some((e) => e.key === k && e.status === 'ok'),
    );
    this.lastFallbackSummary.executed = execution.records.length;
    await this.persist();

    const resolved = execution.records.some((r) => r.result === 'ok');
    if (resolved) this.fallbackResolvedFailure = failure.failure;
    return null;
  }

  /**
   * Single-attempt closure. No second LLM inference and no second mission is
   * ever started: the one cycle is classified, and only HARD_BLOCKER or
   * absence of real progress terminates immediately. Otherwise the permitted
   * in-attempt recovery runs once: a read-only authoritative-source query via
   * runtime.getEvidence, then completion is re-evaluated.
   */
  private async finishSingleAttempt(
    result: AgentCycleResult,
    satisfiedCriteriaBefore: number,
  ): Promise<HarnessResult> {
    const costCap = this.costCapViolation();
    if (costCap) return await this.finish(costCap);

    const completion = evaluateCompletion(this.contract, this.state);
    if (completion.pass) return await this.finish({ status: 'PASS' });

    const satisfiedAfter = this.contract.completionCriteria.filter(
      (k) => this.state.evidence.some((e) => e.key === k && e.status === 'ok'),
    ).length;
    const classification = classifySingleAttemptOutcome({
      cycleEvidence: result.evidence,
      satisfiedCriteriaBefore,
      satisfiedCriteriaAfter: satisfiedAfter,
    });

    if (classification.terminateImmediately) {
      return await this.finish({
        status: classification.failureClass === 'HARD_BLOCKER' ? 'BLOCKED' : 'FAIL',
        reason: `single_attempt_terminated(${classification.failureClass}:${classification.detail})`,
      });
    }

    // Permitted within the same attempt: read-only authoritative-source query.
    this.mergeEvidence(await this.runtime.getEvidence(this.contract, this.state));
    this.state.updatedAt = this.now();
    this.state.remainingSteps = this.contract.completionCriteria.filter(
      (k) => !this.state.evidence.some((e) => e.key === k && e.status === 'ok'),
    );

    const costCapAfterRecovery = this.costCapViolation();
    if (costCapAfterRecovery) return await this.finish(costCapAfterRecovery);
    const completionAfterRecovery = evaluateCompletion(this.contract, this.state);
    if (completionAfterRecovery.pass) return await this.finish({ status: 'PASS' });
    return await this.finish({
      status: 'FAIL',
      reason: `single_attempt_incomplete(${classification.failureClass}:${classification.detail})`,
    });
  }

  /**
   * GH-06 — persist a versioned checkpoint (state + compact context + wave
   * state) through the configured store. The store guarantees atomicity.
   */
  async saveCheckpoint(): Promise<MissionCheckpoint | undefined> {
    if (!this.checkpointStore || !this.state) return undefined;
    const checkpoint = createCheckpoint({
      contract: this.contract,
      state: this.state,
      waveState: extractWaveState(this.runtime),
      now: this.now(),
    });
    await this.checkpointStore.save(checkpoint);
    return checkpoint;
  }

  /**
   * GH-06 — advisory memory consultation. A known error's allowlisted
   * recovery is adopted as nextAction for RECOVER decisions ONLY. Kind,
   * classification, budget, permissions and PASS are never touched.
   */
  private async applyMemoryAdvice(decision: MissionDecision): Promise<MissionDecision> {
    if (!this.memory) {
      this.lastMemoryAdvice = undefined;
      return decision;
    }
    const failureText = this.state.lastError ?? decision.reason;
    const advice = await consultMissionMemory(this.memory, failureText, decision.decision);
    this.lastMemoryAdvice = advice;
    if (advice.adoptedAction) {
      return { ...decision, nextAction: advice.adoptedAction };
    }
    return decision;
  }

  /**
   * GH-06 — record structured memory facts from the certified decision:
   * failures become known-error records; a CONTINUE after a recorded failure
   * (recovery worked) becomes a success experience for equivalent situations.
   */
  private async recordMemoryFacts(decision: MissionDecision): Promise<void> {
    const memory = this.memory;
    if (!memory) return;
    const state = this.state;
    const now = this.now();
    if (decision.decision === 'CONTINUE') {
      const priorError = state.lastError;
      if (priorError) {
        await memory.recordExperience({
          signature: errorSignatureOf(priorError),
          situation: priorError,
          classification: state.lastClassification,
          actionTaken: state.lastDecision?.nextAction ?? state.lastStrategy ?? 'continue',
          outcome: 'success',
          evidenceRefs: state.evidence.filter((e) => e.status === 'ok').map((e) => `${e.type}:${e.key}`),
          createdAt: now,
        });
      }
      return;
    }
    if (state.lastError) {
      const existing = await memory.findError(state.lastError);
      await memory.recordError({
        errorSignature: errorSignatureOf(state.lastError),
        classification: decision.classification,
        knownCause: undefined,
        safeRecovery: decision.nextAction,
        lastOutcome: decision.decision,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    }
  }

  /** Cost hard cap: over-budget can never PASS, before or after a cycle. */
  private costCapViolation(): { status: MissionState['status']; reason?: string } | null {
    if (
      this.contract.maxCostUsd !== undefined &&
      (this.state.spentCostUsd ?? 0) > this.contract.maxCostUsd
    ) {
      return {
        status: 'BLOCKED',
        reason: `max_cost_exceeded(${this.state.spentCostUsd}>${this.contract.maxCostUsd})`,
      };
    }
    return null;
  }

  private checkBudgetBeforeCycle():
    | { status: MissionState['status']; reason?: string }
    | null {
    if (this.state.cycle >= this.contract.maxCycles) {
      return { status: 'BLOCKED', reason: `max_cycles_exhausted(${this.state.cycle}/${this.contract.maxCycles})` };
    }
    const elapsed = this.now() - this.state.startedAt;
    if (elapsed > this.contract.maxDurationMs) {
      return { status: 'BLOCKED', reason: `max_duration_exceeded(${elapsed}ms>${this.contract.maxDurationMs}ms)` };
    }
    return this.costCapViolation();
  }

  /**
   * HARDENING-05 — start the deterministic MISSION ALIVE heartbeat. setInterval
   * only: no LLM is ever consulted (HEARTBEAT_EXTRA_LLM_CALLS=0), and .unref()
   * keeps the timer from holding the process open. The heartbeat reports —
   * it never decides: Guardian authority is byte-identical with or without it.
   */
  private startHeartbeat(): void {
    if (!this.heartbeat || this.heartbeatTimer) return;
    const intervalMs = Math.max(1000, this.heartbeat.intervalMs ?? 30_000);
    const startedAtMs = this.now();
    this.heartbeatTimer = setInterval(() => {
      const runtime = this.runtime as HeartbeatRuntimeHints | undefined;
      const phase = typeof runtime?.currentPhase === 'string' ? runtime.currentPhase : 'RUNTIME';
      const progress = runtime?.currentProgress;
      const elapsedTotalSec = Math.max(0, Math.floor((this.now() - startedAtMs) / 1000));
      const hh = String(Math.floor(elapsedTotalSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((elapsedTotalSec % 3600) / 60)).padStart(2, '0');
      const ss = String(elapsedTotalSec % 60).padStart(2, '0');
      const lineParts = [
        `[${new Date().toISOString().slice(11, 19)}] MISSION ALIVE missionId=${this.contract.missionId}`,
        `phase=${phase}`,
        `elapsed=${hh}:${mm}:${ss}`,
      ];
      if (progress) {
        if (typeof progress.actionsTotal === 'number') {
          lineParts.push(`workers_active=${progress.workersActive ?? 0}`);
          lineParts.push(
            `workers_completed=${progress.workersCompleted ?? 0}/${progress.actionsTotal}`,
          );
        }
        lineParts.push(`last_event=${progress.lastEvent ?? 'none'}`);
        lineParts.push(`last_event_age=${Math.round((progress.lastEventAgeMs ?? 0) / 1000)}s`);
      }
      lineParts.push(`next_expected=+${Math.round(intervalMs / 1000)}s`);
      this.heartbeat?.emit(lineParts.join(' '));
    }, intervalMs);
    // A heartbeat must never keep the process alive on its own.
    (this.heartbeatTimer as unknown as { unref?: () => void }).unref?.();
  }

  /** HARDENING-05 — stop the heartbeat (single exit point: finish()). */
  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private async persist(): Promise<void> {
    if (this.store) await this.store.save(this.state);
    // GH-06 — checkpoint rides along with every persist: an interrupted
    // runtime never loses more than the in-flight cycle.
    if (this.checkpointStore) await this.saveCheckpoint();
  }

  // W0 — deterministic UCME mission auto-capture (MEMORY_IS_ADVISORY). The
  // capture memory is resolved once per harness and is NEVER consulted by
  // CompletionGuard, Evidence or budgets: it only records.
  private autoMemory?: MissionMemoryStore;
  private autoMemoryResolved = false;

  private missionMemoryForCapture(): MissionMemoryStore | undefined {
    if (this.memory) return this.memory;
    if (this.autoMemoryResolved) return this.autoMemory;
    this.autoMemoryResolved = true;
    // Opt-in by deployment configuration (never by prompt/model): harnesses
    // built without options.memory (e.g. the test suite) must not touch the
    // real UCME backend unless the deployment turns the auto-wire on.
    if (process.env.ENG_MCP_GUARDIAN_MEMORY_AUTO !== 'on') return undefined;
    try {
      this.autoMemory = createUcmeGuardianMemoryStore();
    } catch {
      this.autoMemory = undefined;
    }
    return this.autoMemory;
  }

  private async captureMissionMemory(status: MissionState['status']): Promise<void> {
    const memory = this.missionMemoryForCapture();
    if (!memory) return;
    const candidate = memory as MissionMemoryStore & {
      findMission?: (missionId: string) => Promise<GuardianMissionMemoryRecord | null>;
      recordMission?: (record: GuardianMissionMemoryRecord) => Promise<void>;
    };
    if (
      typeof candidate.findMission !== 'function' ||
      typeof candidate.recordMission !== 'function'
    ) {
      return;
    }
    const state = this.state;
    try {
      // Dedup: never rewrite an equivalent or more recent persisted record.
      const existing = await candidate.findMission(state.missionId);
      if (existing && existing.status === status && existing.updatedAt >= state.updatedAt) {
        return;
      }
      await candidate.recordMission({
        missionId: state.missionId,
        status,
        cycle: state.cycle,
        completedSteps: [...state.completedSteps],
        remainingSteps: [...state.remainingSteps],
        // Memory selection only: supervisor review evidence is Guardian-
        // legitimate audit telemetry in state, but it is not mission work —
        // the memory record carries only the work evidence keys.
        okEvidenceKeys: state.evidence.filter((e) => e.status === 'ok' && !e.key.startsWith('supervisor:')).map((e) => e.key),
        failedEvidenceKeys: state.evidence.filter((e) => e.status === 'fail').map((e) => e.key),
        ...(state.blocker !== undefined ? { blocker: state.blocker } : {}),
        createdAt: state.startedAt,
        updatedAt: state.updatedAt,
      });
    } catch {
      // MEMORY_IS_ADVISORY: capture must never block or falsify a mission.
    }
  }

  private async finish(
    outcome: { status: MissionState['status']; reason?: string },
  ): Promise<HarnessResult> {
    // HARDENING-05 — every run() exit goes through finish(): the heartbeat
    // stops exactly here (PASS/BLOCKED/FAILED/CANCELLED never emits again).
    this.stopHeartbeat();
    this.state.status = outcome.status;
    this.state.updatedAt = this.now();
    if (outcome.reason) this.state.blocker = outcome.reason;
    await this.persist();
    // W0 — advisory auto-capture AFTER the deterministic persist: it can
    // neither change nor block the mission result above.
    await this.captureMissionMemory(outcome.status);
    return {
      status: outcome.status,
      reason: outcome.reason,
      state: this.state,
      serializedState: serializeState(this.state),
    };
  }
}

/** In-memory store for tests/simple usage. */
export class MemoryStateStore implements MissionStateStore {
  private saved: MissionState | null = null;
  async save(state: MissionState): Promise<void> {
    this.saved = JSON.parse(JSON.stringify(state)) as MissionState;
  }
  async load(): Promise<MissionState | null> {
    return this.saved ? JSON.parse(JSON.stringify(this.saved)) : null;
  }
}

/** Minimal evidence helper for runtimes. */
export function okEvidence(
  type: Evidence['type'],
  key: string,
  source: string,
  now: number,
  value?: string,
): Evidence {
  return { type, key, status: 'ok', value, timestamp: now, source };
}
