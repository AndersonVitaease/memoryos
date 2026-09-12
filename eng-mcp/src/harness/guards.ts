/**
 * GH-01 — Guards: EvidenceVerifier, CompletionGuard, ProgressGuard/NoProgress.
 * All deterministic, pure functions over MissionState/Evidence.
 */
import {
  Evidence,
  MissionContract,
  MissionDecision,
  MissionState,
  fingerprintEvidence,
} from './missionTypes.js';

/** EvidenceVerifier: a criterion is satisfied ONLY by evidence with status 'ok'. */
export interface CriterionCheck {
  key: string;
  satisfied: boolean;
  evidenceType?: Evidence['type'];
  source?: string;
  timestamp?: number;
}

export function verifyEvidence(
  requiredCriteria: string[],
  evidence: Evidence[],
): CriterionCheck[] {
  return requiredCriteria.map((key) => {
    const match = evidence.find((e) => e.key === key && e.status === 'ok');
    return match
      ? { key, satisfied: true, evidenceType: match.type, source: match.source, timestamp: match.timestamp }
      : { key, satisfied: false };
  });
}

export interface CompletionVerdict {
  pass: boolean;
  missing: string[];
  checks: CriterionCheck[];
}

/** CompletionGuard: PASS only when EVERY required criterion has valid evidence. */
export function evaluateCompletion(
  contract: Pick<MissionContract, 'completionCriteria'>,
  state: MissionState,
): CompletionVerdict {
  const checks = verifyEvidence(contract.completionCriteria, state.evidence);
  const missing = checks.filter((c) => !c.satisfied).map((c) => c.key);
  return { pass: missing.length === 0, missing, checks };
}

export interface ProgressReport {
  progressed: boolean;
  fingerprint: string;
  previousFingerprint: string | null;
  newSteps: string[];
  newEvidence: number;
}

/** ProgressGuard: relevant change = new completed step OR new valid evidence. */
export function evaluateProgress(state: MissionState): ProgressReport {
  const fingerprint = fingerprintEvidence(state.evidence, state.completedSteps);
  const previousFingerprint = state.lastProgressFingerprint;
  return {
    progressed: previousFingerprint === null || previousFingerprint !== fingerprint,
    fingerprint,
    previousFingerprint,
    newSteps: state.completedSteps,
    newEvidence: state.evidence.filter((e) => e.status === 'ok').length,
  };
}

export interface NoProgressVerdict {
  blocked: boolean;
  noProgressCount: number;
  limit: number;
}

/** No-Progress Guard: same failing strategy repeatedly without new evidence must stop. */
export function evaluateNoProgress(
  state: MissionState,
  limit: number,
): NoProgressVerdict {
  return {
    blocked: state.noProgressCount >= limit,
    noProgressCount: state.noProgressCount,
    limit,
  };
}

/**
 * GH-03A.4 — Single-attempt policy: what one attempt may do without a second
 * LLM inference. Local, read-only recovery inside the SAME attempt is allowed;
 * escalation (new inference, new mission, model/provider swap, more budget or
 * permissions) is never allowed under singleAttempt.
 */
export type SingleAttemptFailureClass =
  | 'TRANSIENT'
  | 'RESOLVABLE'
  | 'EXPECTATION_MISMATCH'
  | 'HARD_BLOCKER';

export interface SingleAttemptRecoveryPolicy {
  allowed: readonly string[];
  denied: readonly string[];
}

export const SINGLE_ATTEMPT_RECOVERY_POLICY: SingleAttemptRecoveryPolicy = {
  allowed: [
    'read_only_recovery',
    'transient_non_llm_retry',
    'namespace_schema_path_reconciliation',
    'authoritative_source_query',
    'safe_adaptation_within_permissions',
  ],
  denied: [
    'second_llm_inference',
    'second_mission',
    'model_swap',
    'provider_swap',
    'budget_increase',
    'permission_expansion',
  ],
};

export interface SingleAttemptClassification {
  failureClass: SingleAttemptFailureClass;
  /** Only HARD_BLOCKER or absence of real progress ends the attempt at once. */
  terminateImmediately: boolean;
  detail: string;
}

export interface SingleAttemptOutcomeInput {
  cycleEvidence: Evidence[];
  satisfiedCriteriaBefore: number;
  satisfiedCriteriaAfter: number;
}

/**
 * Deterministic classification of the one single-attempt cycle. An
 * intermediate failure is never automatically BLOCKED:
 * - criteria newly satisfied  -> RESOLVABLE (progress; in-attempt recovery allowed)
 * - ok evidence, no criteria  -> EXPECTATION_MISMATCH (work done, gap remains)
 * - fail evidence only        -> TRANSIENT (no real progress; ends the attempt)
 * - no evidence at all        -> HARD_BLOCKER (ends the attempt)
 */
export function classifySingleAttemptOutcome(
  input: SingleAttemptOutcomeInput,
): SingleAttemptClassification {
  const { cycleEvidence, satisfiedCriteriaBefore, satisfiedCriteriaAfter } = input;
  const okCount = cycleEvidence.filter((e) => e.status === 'ok').length;
  const failCount = cycleEvidence.filter((e) => e.status === 'fail').length;
  if (satisfiedCriteriaAfter > satisfiedCriteriaBefore) {
    return {
      failureClass: 'RESOLVABLE',
      terminateImmediately: false,
      detail: `criteria_satisfied(${satisfiedCriteriaBefore}->${satisfiedCriteriaAfter})`,
    };
  }
  if (okCount > 0) {
    return {
      failureClass: 'EXPECTATION_MISMATCH',
      terminateImmediately: false,
      detail: `ok_evidence_without_criteria(${okCount})`,
    };
  }
  if (failCount > 0) {
    return {
      failureClass: 'TRANSIENT',
      terminateImmediately: true,
      detail: `fail_evidence_only(${failCount})`,
    };
  }
  return {
    failureClass: 'HARD_BLOCKER',
    terminateImmediately: true,
    detail: 'no_evidence_at_all',
  };
}

/**
 * GH-04A — deterministic error markers used to classify an intermediate
 * failure from the cycle's fail evidence (key + value, case-insensitive).
 * Order matters: a HARD marker always dominates.
 */
export const HARD_ERROR_PATTERNS: readonly string[] = [
  'credential',
  'unauthorized',
  'forbidden',
  'permission',
  'security',
  'budget',
];
export const RESOLVABLE_ERROR_PATTERNS: readonly string[] = [
  'alias',
  'path_moved',
  'path_changed',
  'format',
  'canonical',
  'equivalent_tool',
  'sanitized',
];
export const TRANSIENT_ERROR_PATTERNS: readonly string[] = [
  'timeout',
  'timedout',
  'unavailable',
  '502',
  '503',
  'busy',
  'stream_error',
  'connection',
  'rate_limit',
  'aborted',
];

function evidenceErrorText(item: Evidence): string {
  return `${item.key} ${item.value ?? ''}`.toLowerCase();
}

/** Recovery action that only applies to continuing missions (not single-attempt). */
export const SWITCH_TO_ALTERNATIVE_SAFE_STRATEGY = 'switch_to_alternative_safe_strategy';

export interface MissionStepDecisionInput {
  cycleEvidence: Evidence[];
  cycleSteps: string[];
  satisfiedCriteriaBefore: number;
  satisfiedCriteriaAfter: number;
  /** noProgressCount AFTER the cycle was applied (0 = this cycle progressed). */
  noProgressCount: number;
  /** Transient retries already consumed for the same failure. */
  transientRetries: number;
  maxTransientRetries: number;
  /** Consecutive non-progress failures with the same strategy BEFORE this cycle. */
  sameStrategyFailures: number;
}

/**
 * GH-04A — deterministic Guardian decision after one executed cycle.
 * A HARD marker blocks at once; new satisfied criteria continue; an
 * expectation gap — including a silent cycle with no claims and no proof —
 * is reconciled against the authoritative source (the certified no-progress
 * guard stays sovereign over repeated empty cycles); a known resolvable
 * failure gets the minimal safe adaptation; anything else transient gets a
 * bounded retry. Recovery never expands permissions, budget or model — only
 * HARD_BLOCKER or exhausted retries stop the mission here.
 */
export function classifyMissionStep(
  input: MissionStepDecisionInput,
): MissionDecision {
  const {
    cycleEvidence,
    cycleSteps,
    satisfiedCriteriaBefore,
    satisfiedCriteriaAfter,
    noProgressCount,
    transientRetries,
    maxTransientRetries,
    sameStrategyFailures,
  } = input;
  const okCount = cycleEvidence.filter((e) => e.status === 'ok').length;
  const failItems = cycleEvidence.filter((e) => e.status === 'fail');

  const hard = failItems.find((e) => HARD_ERROR_PATTERNS.some((p) => evidenceErrorText(e).includes(p)));
  if (hard) {
    return {
      classification: 'HARD_BLOCKER',
      decision: 'BLOCK',
      reason: `hard_blocker:${hard.key}`,
    };
  }
  if (satisfiedCriteriaAfter > satisfiedCriteriaBefore) {
    return {
      classification: 'RESOLVABLE',
      decision: 'CONTINUE',
      reason: `criteria_satisfied(${satisfiedCriteriaBefore}->${satisfiedCriteriaAfter})`,
    };
  }
  if (okCount > 0) {
    // Work happened but no criterion moved: expectation × reality diverged.
    const switchAction = sameStrategyFailures >= 1;
    return {
      classification: 'EXPECTATION_MISMATCH',
      decision: 'RECOVER',
      reason: 'expectation_mismatch:authoritative_source_query',
      nextAction: switchAction ? SWITCH_TO_ALTERNATIVE_SAFE_STRATEGY : 'authoritative_source_query',
    };
  }
  if (failItems.length === 0) {
    // Steps claimed without any evidence — or a fully silent cycle:
    // reconciliation against the authoritative source decides what is real,
    // and the no-progress guard stays sovereign over repeated empty cycles.
    return {
      classification: 'EXPECTATION_MISMATCH',
      decision: 'RECOVER',
      reason: 'expectation_mismatch:claims_without_evidence',
      nextAction: 'authoritative_source_query',
    };
  }
  const resolvable = failItems.find((e) => RESOLVABLE_ERROR_PATTERNS.some((p) => evidenceErrorText(e).includes(p)));
  if (resolvable) {
    return {
      classification: 'RESOLVABLE',
      decision: 'RECOVER',
      reason: `resolvable_failure:${resolvable.key}`,
      nextAction: 'safe_adaptation_within_permissions',
    };
  }
  if (transientRetries >= maxTransientRetries) {
    return {
      classification: 'TRANSIENT',
      decision: 'BLOCK',
      reason: `transient_retries_exhausted(${transientRetries}/${maxTransientRetries})`,
    };
  }
  return {
    classification: 'TRANSIENT',
    decision: 'RECOVER',
    reason: `transient_retry(${transientRetries + 1}/${maxTransientRetries})`,
    nextAction: 'transient_non_llm_retry',
  };
}
