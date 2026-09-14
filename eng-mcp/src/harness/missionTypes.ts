/**
 * GH-01 — Guardian Harness Core v0.1
 * Minimal types: MissionContract, MissionState, Evidence, AgentRuntime.
 * States: PENDING | RUNNING | BLOCKED | PASS | FAIL
 * No provider knowledge (Claude/Goose/OpenRouter) lives here.
 */
import { WorkerSpecialization } from './workerSpecialization.js';
import type { ProviderModelUsage, ProviderUsageSnapshot } from './providerUsage.js';

export type MissionStatus = 'PENDING' | 'RUNNING' | 'BLOCKED' | 'PASS' | 'FAIL';

export type EvidenceType =
  | 'file_read'
  | 'file_hash'
  | 'file_changed'
  | 'syntax_check'
  | 'test_result'
  | 'command_result'
  | 'tool_result';

export type EvidenceStatus = 'ok' | 'fail' | 'unknown';

export interface Evidence {
  type: EvidenceType;
  key: string;
  status: EvidenceStatus;
  value?: string;
  timestamp: number;
  source: string;
  /**
   * SP-01 — provenance metadata: the specialization of the originating
   * action, transported verbatim by the harness. OPTIONAL: evidence without
   * it (all pre-SP-01 evidence) stays valid and loads unchanged.
   * SPECIALIZATION IS METADATA, NOT EVIDENCE OF COMPLETION: satisfaction is
   * decided ONLY by status 'ok' + criterion key (CompletionGuard semantics
   * unchanged) — a specialization value never proves any work happened.
   */
  specialization?: WorkerSpecialization;
}

export interface MissionContract {
  missionId: string;
  objective: string;
  allowedFiles?: string[];
  allowedActions?: string[];
  forbiddenActions?: string[];
  /** Keys of evidence required (each with status 'ok') for PASS. */
  completionCriteria: string[];
  maxCycles: number;
  maxDurationMs: number;
  maxCostUsd?: number;
  /** Cycles without relevant progress before BLOCKED. Default 2. */
  maxNoProgressCycles?: number;

  /** SDK tool names this mission authorizes; passed verbatim as query() allowedTools. */
  allowedTools?: string[];

  /** Single-attempt policy: exactly one LLM inference; never a second mission. */
  singleAttempt?: boolean;

  /**
   * GH-04A — intermediate-failure control, Guardian-owned (recovery never
   * expands these): max consecutive retries of the same transient failure and
   * the backoff (ms, scaled by the retry attempt) before a transient retry.
   */
  maxTransientRetries?: number;
  transientRetryBackoffMs?: number;

  /**
   * GH-05 — max parallelism: maximum simultaneous in-flight plan actions
   * (Advisor/Worker wave execution). Guardian-enforced; effective concurrency
   * is always min(this, ready and independent actions, available budget,
   * conflict-free resources). PRÉ-GH-07 default: 10 (wide waves, dynamic slot
   * refill); still configurable per mission.
   */
  maxParallelActions?: number;
}

export interface MissionState {
  missionId: string;
  status: MissionStatus;
  cycle: number;
  startedAt: number;
  updatedAt: number;
  completedSteps: string[];
  remainingSteps: string[];
  evidence: Evidence[];
  lastProgressFingerprint: string | null;
  noProgressCount: number;
  spentCostUsd?: number;
  blocker?: string;

  /**
   * GH-04A — mission-control checkpoint: where the mission is, which error
   * occurred, its classification, the chosen recovery, attempt counts and the
   * last useful evidence. Optional fields keep old persisted states loadable.
   */
  lastError?: string;
  lastClassification?: MissionFailureClass;
  lastDecision?: MissionDecision;
  /** Recovery cycles actually executed after a RECOVER decision. */
  recoveryAttempts?: number;
  /** Consecutive retries of the same transient failure (same key + strategy). */
  transientRetries?: number;
  lastTransientFailKey?: string;
  lastStrategy?: string;
  /** Consecutive non-progress failures with the same strategy. */
  sameStrategyFailures?: number;

  /**
   * GH-06 — bounded decision history (max MAX_DECISION_LOG, most recent
   * last) for the compact mission context. Optional: old persisted states
   * load unchanged.
   */
  decisionLog?: MissionDecisionRecord[];

  /**
   * GH-06A — bounded authorized-executor-fallback attempt log (max
   * MAX_FALLBACK_ATTEMPT_LOG, most recent last). Rides in the checkpoint so
   * resume never re-executes a completed fallback and never assumes an
   * in-flight one. Optional: old persisted states load unchanged.
   */
  fallbackAttempts?: FallbackAttemptRecord[];
}

/** Result of one executed cycle delivered by the AgentRuntime. */
export interface AgentCycleResult {
  strategy: string;
  steps: string[];
  evidence: Evidence[];
  /** Agent may claim completion — the Guardian never trusts this alone. */
  claimsComplete?: boolean;
  costUsd?: number;

  /**
   * GUARDIAN-COST-ROUTE-01 — usage the PROVIDER returned per request
   * (Anthropic-compatible usage blocks), accumulated over the cycle. Data
   * only: no decision path reads it. Optional: old results load unchanged.
   */
  providerUsage?: ProviderUsageSnapshot;
  /**
   * GUARDIAN-COST-ROUTE-01 — per-model provider-returned usage totals
   * (result.modelUsage, verbatim subset). On OpenRouter routes the
   * per-assistant usage blocks arrive zeroed, so this is the reliable
   * real-usage capture. Optional: old results load unchanged.
   */
  providerModelUsage?: ProviderModelUsage;
  /**
   * GUARDIAN-COST-ROUTE-01 — catalog-priced cost of the provider-returned
   * usage for the ACTUAL model keys (OpenRouter catalog), deliberately
   * SEPARATE from costUsd (which the SDK prices from Anthropic's table).
   * Undefined when any observed model has no catalog entry — a price is
   * never invented.
   */
  providerCostUsd?: number;

  /**
   * GH-06A — actions the runtime could NOT execute through its primary
   * channel (tool unavailable, no shell, primary permission gate). Data only:
   * the Guardian classifies, re-validates the contract and — only when the
   * action and an alternative executor are ALREADY authorized — hands the
   * SAME action to that executor. The runtime never picks the fallback.
   */
  pendingActions?: PendingAction[];
}

/**
 * GH-04A — mission control: classification and deterministic decision after
 * one executed step. An intermediate failure is not automatically a mission
 * failure: the Guardian classifies the observed problem and decides CONTINUE,
 * RECOVER, BLOCK or PASS. The decision never depends on the agent claiming
 * completion.
 */
export type MissionFailureClass =
  | 'TRANSIENT'
  | 'RESOLVABLE'
  | 'EXPECTATION_MISMATCH'
  | 'HARD_BLOCKER';

/** Deterministic Guardian decisions after a step/cycle. */
export type MissionDecisionKind = 'CONTINUE' | 'RECOVER' | 'BLOCK' | 'PASS';

export interface MissionDecision {
  classification: MissionFailureClass;
  decision: MissionDecisionKind;
  reason: string;
  /** Explicit, auditable recovery action; stays inside the certified recovery policy. */
  nextAction?: string;
}

/** GH-06 — bounded decision-history record for the compact mission context. */
export interface MissionDecisionRecord {
  cycle: number;
  decision: MissionDecisionKind;
  classification: MissionFailureClass;
  reason: string;
  at: number;
}

/** GH-06 — decision history is bounded: context never grows unbounded. */
export const MAX_DECISION_LOG = 20;

/**
 * GH-06A — an action the primary runtime could not execute, requested for
 * Guardian-owned fallback. The request carries data only: no executor choice,
 * no permission claim and no completion claim.
 */
export interface PendingAction {
  /** Contract-literal action (e.g. 'shell:node --version'). */
  action: string;
  /** Deterministic failure detail reported by the primary runtime. */
  primaryFailure: string;
  /** Evidence keys that, once ok, conclude this fallback (resume-safe). */
  expectedEvidence?: string[];
  /** Resource keys to serialize conflicting fallbacks (GH-05 lock table). */
  resourceKeys?: string[];
}

/**
 * GH-06A — one auditable authorized-executor-fallback attempt. Status is
 * recorded by the harness (worker outcome + evidence), never claimed by the
 * executor: an executor cannot declare PASS. Bounded by MAX_FALLBACK_ATTEMPT_LOG.
 */
export interface FallbackAttemptRecord {
  requestedAction: string;
  primaryFailure: string;
  classification: MissionFailureClass;
  primaryExecutor: string;
  fallbackExecutor: string;
  executionChannel: string;
  attempt: number;
  result: 'ok' | 'fail' | 'unknown' | 'skipped' | 'blocked';
  reason?: string;
  okEvidenceKeys: string[];
  startedAt: number;
  endedAt: number;
}

/** GH-06A — fallback attempt log is bounded: state never grows unbounded. */
export const MAX_FALLBACK_ATTEMPT_LOG = 50;

/** Abstract runtime contract. Knows nothing about any concrete provider. */
export interface AgentRuntime {
  runMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult>;
  continueMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult>;
  cancelMission(contract: MissionContract, state: MissionState): Promise<void>;
  getEvidence(contract: MissionContract, state: MissionState): Promise<Evidence[]>;
}

/** Minimal persistence seam (JSON file store is provided in GuardianHarness). */
export interface MissionStateStore {
  save(state: MissionState): Promise<void>;
  load(): Promise<MissionState | null>;
}

export function createInitialState(contract: MissionContract, now: number): MissionState {
  return {
    missionId: contract.missionId,
    status: 'RUNNING',
    cycle: 0,
    startedAt: now,
    updatedAt: now,
    completedSteps: [],
    remainingSteps: [...contract.completionCriteria],
    evidence: [],
    lastProgressFingerprint: null,
    noProgressCount: 0,
    spentCostUsd: 0,
    recoveryAttempts: 0,
    transientRetries: 0,
    sameStrategyFailures: 0,
  };
}

/** Deterministic JSON serialization (survives resume). */
export function serializeState(state: MissionState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): MissionState {
  const parsed = JSON.parse(json) as MissionState;
  if (!parsed || typeof parsed.missionId !== 'string' || typeof parsed.status !== 'string') {
    throw new Error('INVALID_MISSION_STATE');
  }
  return parsed;
}

export function fingerprintEvidence(evidence: Evidence[], completedSteps: string[]): string {
  const keys = evidence
    .filter((e) => e.status === 'ok')
    .map((e) => `${e.type}:${e.key}`)
    .sort();
  const steps = [...completedSteps].sort();
  return JSON.stringify({ s: steps, e: keys });
}
