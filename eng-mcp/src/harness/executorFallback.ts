/**
 * GH-06A — ExecutorFallback: when an ALREADY-AUTHORIZED action cannot be
 * executed by the primary runtime (tool unavailable, no shell, runtime
 * permission gate, execution-channel failure), the Guardian classifies the
 * failure, re-validates the CURRENT contract and hands the SAME action to an
 * ALREADY-AUTHORIZED alternative executor.
 *
 * NOT A SECURITY BYPASS — the fallback can never:
 * - execute an action the contract does not authorize;
 * - use an executor or execution channel the contract does not authorize;
 * - expand permissions, channels, budget, maxCycles or maxDurationMs;
 * - modify the contract (it validates against it, verbatim).
 *
 * DETERMINISTIC: fallback is NOT a second LLM inference — GH-03A.4
 * single-attempt stays intact (one inference -> authorized deterministic
 * fallback -> evidence -> CompletionGuard).
 *
 * ANTI-LOOP: the same fallback failing twice without new conclusive evidence
 * is blocked (fallback_loop_detected). Every attempt is recorded in the
 * mission state (auditable; checkpoint/resume-safe).
 *
 * PARALLELISM: independent fallbacks run through the certified GH-05
 * ParallelWaveExecutor (resource locks + global budget + maxParallelActions).
 * GH-05 stays sovereign — no special path disables Max Safe Parallelism.
 */
import { createHash } from 'node:crypto';
import {
  Evidence,
  FallbackAttemptRecord,
  MissionContract,
  PendingAction,
} from './missionTypes.js';
import {
  GlobalBudgetGuard,
  ParallelExecutionReport,
  PlanAction,
  PlanProposal,
} from './multiAgentTypes.js';
import { DEFAULT_MAX_PARALLEL_ACTIONS, ParallelWaveExecutor } from './parallelWaveExecutor.js';
import { AuthorizedExecutor } from './authorizedExecutors.js';
import { HARD_ERROR_PATTERNS } from './guards.js';

/**
 * GH-06A — deterministic markers of a RESOLVABLE primary-executor failure.
 * A primary failure carrying a HARD policy marker (credential/unauthorized/
 * forbidden/permission/security/budget) always dominates and NEVER falls back.
 * Note: the primary runtime's own permission gate is reported through
 * 'primary_execution_gate' (a channel/capability limitation, not a policy
 * expansion request) — a policy denial keeps the HARD markers.
 */
export const EXECUTOR_FAILURE_MARKERS: readonly string[] = [
  'tool_unavailable',
  'tool_missing',
  'executor_unavailable',
  'shell_unavailable',
  'execution_channel_failure',
  'channel_unavailable',
  'representation_mismatch',
  'capability_mismatch',
  'primary_execution_gate',
  'primary_runtime_refused',
  'primary_execution_failed',
];

function failureText(item: Evidence): string {
  return `${item.key} ${item.value ?? ''}`.toLowerCase();
}

export interface PrimaryExecutorFailure {
  /** The primary executor strategy that failed (result.strategy). */
  primaryExecutor: string;
  /** The first resolvable executor-failure evidence item. */
  failure: Evidence;
  /** Matched deterministic marker. */
  marker: string;
}

/**
 * Classify a cycle's fail evidence as a resolvable primary-executor failure.
 * null when there is no fail evidence, when ANY fail carries a HARD policy
 * marker (hard always dominates), or when no marker matches.
 */
export function primaryExecutorFailureOf(
  cycleEvidence: Evidence[],
  primaryExecutor: string,
): PrimaryExecutorFailure | null {
  const failItems = cycleEvidence.filter((e) => e.status === 'fail');
  if (failItems.length === 0) return null;
  const hard = failItems.find((e) => HARD_ERROR_PATTERNS.some((p) => failureText(e).includes(p)));
  if (hard) return null;
  const failure = failItems.find((e) => EXECUTOR_FAILURE_MARKERS.some((p) => failureText(e).includes(p)));
  if (!failure) return null;
  const marker = EXECUTOR_FAILURE_MARKERS.find((p) => failureText(failure).includes(p)) as string;
  return { primaryExecutor, failure, marker };
}

/** Deterministic short fingerprint for evidence keys (16 hex chars). */
export function actionFingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

export interface FallbackEligibility {
  requested: PendingAction;
  executor: AuthorizedExecutor;
  resourceKeys: string[];
}

export interface FallbackBlock {
  action: string;
  reason: string;
}

export interface FallbackValidation {
  eligible: FallbackEligibility[];
  blocked: FallbackBlock[];
}

/**
 * Validate requested pending actions against the contract, VERBATIM: the
 * action must already be in allowedActions, the executor's channel must
 * already be in allowedActions ('channel:<channel>'), the action must not be
 * forbidden, and the executor must be able to execute it. Nothing is ever
 * added to the contract to make a fallback pass.
 */
export function validateFallback(
  requested: readonly PendingAction[],
  contract: MissionContract,
  executors: readonly AuthorizedExecutor[],
): FallbackValidation {
  const allowed = new Set(contract.allowedActions ?? []);
  const forbidden = new Set(contract.forbiddenActions ?? []);
  const eligible: FallbackEligibility[] = [];
  const blocked: FallbackBlock[] = [];
  for (const requestedAction of requested) {
    if (forbidden.has(requestedAction.action)) {
      blocked.push({ action: requestedAction.action, reason: 'action_forbidden' });
      continue;
    }
    if (!allowed.has(requestedAction.action)) {
      blocked.push({ action: requestedAction.action, reason: 'action_not_authorized' });
      continue;
    }
    const executor = executors.find(
      (candidate) => allowed.has(`channel:${candidate.channel}`) && candidate.canExecute(requestedAction.action),
    );
    if (!executor) {
      const channelAuthorized = executors.some((candidate) => allowed.has(`channel:${candidate.channel}`));
      blocked.push({
        action: requestedAction.action,
        reason: channelAuthorized ? 'executor_capability_mismatch' : 'channel_not_authorized',
      });
      continue;
    }
    eligible.push({
      requested: requestedAction,
      executor,
      resourceKeys: requestedAction.resourceKeys ?? [`fallback:${actionFingerprint(requestedAction.action)}`],
    });
  }
  return { eligible, blocked };
}

/**
 * GH-06A Guardian-owned reconciliation over attempt records: skip
 * already-conclusive fallbacks (T13), treat in-flight/unknown results as
 * NOT success (T14 — never assumed done), and block the same failing
 * fallback after MAX_CONSECUTIVE_FALLBACK_FAILURES without new evidence (T10).
 */
export const MAX_CONSECUTIVE_FALLBACK_FAILURES = 2;

function isUnconclusive(record: FallbackAttemptRecord): boolean {
  return record.result === 'fail' || record.result === 'unknown';
}

export interface FallbackReconciliation {
  runnable: FallbackEligibility[];
  skipped: FallbackAttemptRecord[];
  loopBlocked: FallbackBlock[];
}

export function reconcileFallbackAttempts(
  eligible: readonly FallbackEligibility[],
  priorAttempts: readonly FallbackAttemptRecord[],
  currentOkEvidenceKeys: ReadonlySet<string>,
): FallbackReconciliation {
  const runnable: FallbackEligibility[] = [];
  const skipped: FallbackAttemptRecord[] = [];
  const loopBlocked: FallbackBlock[] = [];
  for (const eligibility of eligible) {
    const action = eligibility.requested.action;
    const expected = eligibility.requested.expectedEvidence ?? [];
    const prior = priorAttempts.filter((a) => a.requestedAction === action);
    const conclusive =
      prior.some((a) => a.result === 'ok') ||
      (expected.length > 0 && expected.every((key) => currentOkEvidenceKeys.has(key)));
    if (conclusive) {
      const last = prior.find((a) => a.result === 'ok') ?? prior[prior.length - 1];
      skipped.push({
        requestedAction: action,
        primaryFailure: eligibility.requested.primaryFailure,
        classification: 'RESOLVABLE',
        primaryExecutor: last?.primaryExecutor ?? 'primary-agent-runtime',
        fallbackExecutor: last?.fallbackExecutor ?? 'unknown',
        executionChannel: last?.executionChannel ?? 'unknown',
        attempt: prior.length,
        result: 'skipped',
        reason: 'fallback_already_completed',
        okEvidenceKeys: expected,
        startedAt: last?.startedAt ?? 0,
        endedAt: last?.endedAt ?? 0,
      });
      continue;
    }
    if (prior.filter(isUnconclusive).length >= MAX_CONSECUTIVE_FALLBACK_FAILURES) {
      loopBlocked.push({ action, reason: 'fallback_loop_detected' });
      continue;
    }
    runnable.push(eligibility);
  }
  return { runnable, skipped, loopBlocked };
}

export interface FallbackExecutionInput {
  /** Eligible fallbacks to execute (already contract-validated). */
  readonly eligible: readonly FallbackEligibility[];
  readonly contract: MissionContract;
  /** Primary executor of the cycle (for auditable attempt records). */
  readonly primaryExecutor: string;
  /** Prior attempt records — attempt numbering reads them. */
  readonly priorAttempts: readonly FallbackAttemptRecord[];
  /** Already-committed mission cost (budget guard starts from it). */
  readonly initialSpentUsd?: number;
  /** Injectable clock for deterministic timestamps. Default Date.now. */
  readonly now?: () => number;
}

export interface FallbackExecutionResult {
  evidence: Evidence[];
  records: FallbackAttemptRecord[];
  report: ParallelExecutionReport;
}

/**
 * Build + execute the fallback plan. Every executed action produces auditable
 * Evidence carrying requestedAction, primaryFailure, fallbackExecutor,
 * executionChannel, result/status and timestamps; every attempt is recorded
 * for anti-loop and checkpoint/resume. Cost is 0 (local execution has no
 * monetary cost); the mission budget is never reset or expanded.
 */
export async function executeFallbacks(input: FallbackExecutionInput): Promise<FallbackExecutionResult> {
  const { eligible, contract, primaryExecutor, priorAttempts } = input;
  const now = input.now ?? (() => Date.now());
  const budgetGuard = new GlobalBudgetGuard({
    capUsd: contract.maxCostUsd,
    initialSpentUsd: input.initialSpentUsd ?? 0,
  });
  const waveExecutor = new ParallelWaveExecutor({
    maxParallelActions: contract.maxParallelActions ?? DEFAULT_MAX_PARALLEL_ACTIONS,
    budgetGuard,
    now,
  });
  const actions: PlanAction[] = [];
  const eligibilityByActionId = new Map<string, FallbackEligibility>();
  for (const eligibility of eligible) {
    const attempt = priorAttempts.filter((a) => a.requestedAction === eligibility.requested.action).length + 1;
    const actionId = `fallback:${attempt}:${actionFingerprint(eligibility.requested.action)}`;
    eligibilityByActionId.set(actionId, eligibility);
    actions.push({
      id: actionId,
      description: eligibility.requested.action,
      dependsOn: [],
      resourceKeys: eligibility.resourceKeys,
      mode: 'write',
      estimatedCostUsd: 0,
      expectedEvidence: eligibility.requested.expectedEvidence ?? [],
      run: async (ctx) => {
        const outcome = await eligibility.executor.execute(eligibility.requested.action, { now: ctx.now });
        const evidence: Evidence[] = [
          {
            type: 'command_result',
            key: `fallback:${outcome.executorId}:${actionFingerprint(eligibility.requested.action)}`,
            status: outcome.ok ? 'ok' : 'fail',
            value: JSON.stringify({
              requestedAction: eligibility.requested.action,
              primaryFailure: eligibility.requested.primaryFailure,
              fallbackExecutor: outcome.executorId,
              executionChannel: outcome.channel,
              attempt,
              result: outcome.ok ? 'ok' : 'fail',
              exitCode: outcome.exitCode,
              output: outcome.output.slice(0, 160),
              error: outcome.error.slice(0, 160),
              durationMs: outcome.durationMs,
              startedAt: outcome.startedAt,
              endedAt: outcome.endedAt,
            }),
            timestamp: outcome.endedAt,
            source: `executor-fallback:${outcome.executorId}@${outcome.channel}`,
          },
        ];
        for (const key of eligibility.requested.expectedEvidence ?? []) {
          evidence.push({
            type: 'command_result',
            key,
            status: outcome.ok ? 'ok' : 'fail',
            value: outcome.ok ? outcome.output.slice(0, 160) : (outcome.error || 'fallback_failed').slice(0, 160),
            timestamp: outcome.endedAt,
            source: `executor-fallback:${outcome.executorId}@${outcome.channel}`,
          });
        }
        return { evidence, costUsd: 0 };
      },
    });
  }
  const proposal: PlanProposal = {
    planId: `fallback:${contract.missionId}:${actionFingerprint(JSON.stringify(eligible.map((e) => e.requested.action)))}`,
    advisorId: 'guardian-executor-fallback',
    actions,
  };
  const report = await waveExecutor.executePlan(proposal);
  const records: FallbackAttemptRecord[] = [];
  for (const action of proposal.actions) {
    const result = report.results.get(action.id);
    if (!result) continue;
    const eligibility = eligibilityByActionId.get(action.id);
    const outcomeEvidence = result.evidence.find((e) => e.key.startsWith('fallback:'));
    let fallbackExecutor = 'unknown';
    let executionChannel = 'unknown';
    try {
      const parsed = JSON.parse(outcomeEvidence?.value ?? '{}') as {
        fallbackExecutor?: string;
        executionChannel?: string;
      };
      if (typeof parsed.fallbackExecutor === 'string') fallbackExecutor = parsed.fallbackExecutor;
      if (typeof parsed.executionChannel === 'string') executionChannel = parsed.executionChannel;
    } catch {
      /* keep unknown defaults */
    }
    records.push({
      requestedAction: eligibility?.requested.action ?? action.description ?? action.id,
      primaryFailure: eligibility?.requested.primaryFailure ?? 'primary_execution_failed',
      classification: 'RESOLVABLE',
      primaryExecutor,
      fallbackExecutor,
      executionChannel,
      attempt: Number(action.id.split(':')[1]),
      result: result.status === 'ok'
        ? 'ok'
        : result.status === 'fail' || result.status === 'transient' || result.status === 'hard'
          ? 'fail'
          : 'blocked',
      reason: result.error ?? outcomeEvidence?.value,
      okEvidenceKeys: result.evidence
        .filter((e) => e.status === 'ok' && !e.key.startsWith('fallback:'))
        .map((e) => e.key),
      startedAt: result.startMs ?? 0,
      endedAt: result.endMs ?? 0,
    });
  }
  return { evidence: report.evidence, records, report };
}
