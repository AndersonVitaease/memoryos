/**
 * GH-06 — Mission Context + Checkpoint/Resume + Experience/Error Memory.
 * MINIMAL evolution: a mission can carry a compact operational context,
 * persist an atomic versioned checkpoint, RESUME in a NEW runtime without any
 * transcript reconstruction, and consult structured experience/error memory.
 *
 * INVARIANTS (GH-06):
 * - The checkpoint NEVER resets budget (spentCostUsd), recoveryAttempts,
 *   transientRetries, noProgressCount, evidence or completedSteps: the
 *   sovereign MissionState travels verbatim inside the checkpoint.
 * - The checkpoint NEVER expands permissions or channels: the stored contract
 *   is a REFERENCE SNAPSHOT only — the resuming runtime always governs with
 *   its own contract.
 * - Memory is ADVISORY: it never alters a contract, never grants permission,
 *   never declares PASS, never expands budget and never replaces current
 *   Evidence. Current state + current evidence stay sovereign.
 * - Checkpoint persistence is ATOMIC (temp file -> fsync -> rename) and
 *   VERSIONED (schemaVersion); corrupt or incompatible checkpoints FAIL
 *   CLOSED (throw) — state is never reconstructed by guessing.
 * - A duplicate-work guarantee: actions already completed with conclusive
 *   evidence are filtered out of re-proposed plans by the runtime itself.
 */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AgentRuntime,
  Evidence,
  MissionContract,
  MissionDecisionRecord,
  MissionState,
} from './missionTypes.js';
import { SINGLE_ATTEMPT_RECOVERY_POLICY, SWITCH_TO_ALTERNATIVE_SAFE_STRATEGY } from './guards.js';
import {
  ActionStatus,
  ParallelExecutionReport,
  PlanAction,
  PlanProposal,
} from './multiAgentTypes.js';

export const MISSION_CONTEXT_SCHEMA_VERSION = 1;
export const CHECKPOINT_SCHEMA_VERSION = 1;
export const MISSION_MEMORY_SCHEMA_VERSION = 1;

/** Decision history is bounded: a compact context never grows unbounded. */
export const MAX_DECISION_LOG = 20;

/**
 * GH-06 — compact, deterministic, structured mission context. Contains ONLY
 * what is needed to continue the work. No transcript, no free-form history,
 * no conversation copy: evidence travels as REFERENCES (type:key:status), the
 * full Evidence stays in the sovereign MissionState.
 */
export interface MissionContext {
  schemaVersion: number;
  missionId: string;
  objective: string;
  /** Strategy of the last executed cycle. */
  currentStrategy?: string;
  /** Bounded decision history (most recent last, max MAX_DECISION_LOG). */
  decisions: MissionDecisionRecord[];
  completedSteps: string[];
  pendingSteps: string[];
  /** Resources/files the contract authorizes (from the contract, verbatim). */
  relevantResources: string[];
  /** Evidence references, never raw values: `type:key:status`. */
  evidenceRefs: string[];
  /** Known blockers (blocker + lastError, deduplicated). */
  knownBlockers: string[];
  /** Distinct recovery strategies/actions already tried. */
  recoveryTried: string[];
  updatedAt: number;
}

/** Build the compact context from the current contract + sovereign state. */
export function buildMissionContext(
  contract: MissionContract,
  state: MissionState,
  now: number,
): MissionContext {
  const decisions = [...(state.decisionLog ?? [])].slice(-MAX_DECISION_LOG);
  const recoveryTried = [
    ...new Set(
      [
        state.lastStrategy,
        state.lastDecision?.nextAction,
        ...(state.decisionLog ?? []).map((d) => d.decision),
      ].filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  ];
  const blockers = [
    ...new Set([state.blocker, state.lastError].filter((v): v is string => typeof v === 'string' && v.length > 0)),
  ];
  return {
    schemaVersion: MISSION_CONTEXT_SCHEMA_VERSION,
    missionId: state.missionId,
    objective: contract.objective,
    // key ausente (nunca undefined): checkpoint roundtrip é fiel sem normalização
    ...(state.lastStrategy !== undefined ? { currentStrategy: state.lastStrategy } : {}),
    decisions,
    completedSteps: [...state.completedSteps],
    pendingSteps: [...state.remainingSteps],
    relevantResources: [...(contract.allowedFiles ?? [])],
    evidenceRefs: state.evidence.map((e) => `${e.type}:${e.key}:${e.status}`),
    knownBlockers: blockers,
    recoveryTried,
    updatedAt: now,
  };
}

// ===== Checkpoint =====

/** Terminal/in-flight state of one planned action at checkpoint time. */
export interface CheckpointActionState {
  actionId: string;
  wave: number;
  /** Terminal status recorded for the action ('ok' = conclusively done). */
  status: ActionStatus;
  /** false when the action never started (cancelled/budget/dependency). */
  started: boolean;
  /** Conclusive ok evidence keys the action produced. */
  okEvidenceKeys: string[];
  costUsd: number;
}

/**
 * GH-06 — versioned mission checkpoint. `contract` is a REFERENCE SNAPSHOT
 * for auditability only; a resuming runtime always uses its own contract, so
 * a checkpoint can never expand permissions, channels or budget. `state` is
 * the sovereign MissionState verbatim — budget/recovery/no-progress/evidence
 * continuity is structural, not re-derived.
 */
export interface MissionCheckpoint {
  schemaVersion: number;
  /** Deterministic content id (sha256_16 of missionId+cycle+timestamps). */
  checkpointId: string;
  savedAt: number;
  contract: MissionContract;
  state: MissionState;
  context: MissionContext;
  /** GH-05 wave reconciliation: per-action terminal state of the last plan. */
  waveState?: {
    planId: string;
    actions: CheckpointActionState[];
  };
}

/** Runtime that can expose its last parallel execution report (GH-05). */
export interface ExecutionReportProvider {
  lastExecutionReport?: ParallelExecutionReport;
}

/** Serialize the last execution report into checkpoint action states. */
export function checkpointActionStates(report: ParallelExecutionReport): CheckpointActionState[] {
  const ids = new Set<string>([
    ...report.results.keys(),
    ...report.records.map((r) => r.actionId),
  ]);
  const out: CheckpointActionState[] = [];
  for (const actionId of ids) {
    const result = report.results.get(actionId);
    const record = report.records.find((r) => r.actionId === actionId);
    out.push({
      actionId,
      wave: record?.wave ?? 0,
      status: (result?.status ?? record?.status ?? 'fail') as ActionStatus,
      started: result ? result.started : record?.startMs !== undefined,
      okEvidenceKeys: (result?.evidence ?? [])
        .filter((e) => e.status === 'ok')
        .map((e) => e.key),
      costUsd: result?.costUsd ?? record?.costUsd ?? 0,
    });
  }
  // Deterministic order: the checkpoint must be byte-stable for a given state.
  return out.sort((a, b) => a.actionId.localeCompare(b.actionId));
}

/** Extract the wave state from an AgentRuntime when it provides one. */
export function extractWaveState(runtime: AgentRuntime): MissionCheckpoint['waveState'] {
  const report = (runtime as Partial<ExecutionReportProvider>).lastExecutionReport;
  if (!report) return undefined;
  return { planId: report.planId, actions: checkpointActionStates(report) };
}

/** Build a versioned checkpoint (atomic persistence is the store's duty). */
export function createCheckpoint(input: {
  contract: MissionContract;
  state: MissionState;
  waveState?: MissionCheckpoint['waveState'];
  now: number;
}): MissionCheckpoint {
  const { contract, state, waveState, now } = input;
  const context = buildMissionContext(contract, state, now);
  const checkpointId = createHash('sha256')
    .update(JSON.stringify({ missionId: state.missionId, cycle: state.cycle, updatedAt: state.updatedAt, savedAt: now }))
    .digest('hex')
    .slice(0, 16);
  const checkpoint: MissionCheckpoint = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    checkpointId,
    savedAt: now,
    contract,
    state,
    context,
  };
  if (waveState) checkpoint.waveState = waveState;
  return checkpoint;
}

function isRecordArray(value: unknown, itemCheck: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v) && itemCheck(v as Record<string, unknown>));
}

/**
 * Fail-closed checkpoint validation. Corruption or an incompatible
 * schemaVersion THROWS — a checkpoint is never guessed into shape.
 */
export function validateCheckpoint(parsed: unknown): MissionCheckpoint {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CHECKPOINT_CORRUPT:not_an_object');
  }
  const cp = parsed as Record<string, unknown>;
  if (typeof cp.schemaVersion !== 'number' || !Number.isInteger(cp.schemaVersion)) {
    throw new Error('CHECKPOINT_CORRUPT:schema_version_missing');
  }
  if (cp.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new Error(`CHECKPOINT_SCHEMA_VERSION_UNSUPPORTED:${String(cp.schemaVersion)}`);
  }
  if (typeof cp.checkpointId !== 'string' || cp.checkpointId.length === 0 || typeof cp.savedAt !== 'number') {
    throw new Error('CHECKPOINT_CORRUPT:missing_header');
  }
  const contract = cp.contract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('CHECKPOINT_CORRUPT:contract_missing');
  }
  const c = contract as Record<string, unknown>;
  if (typeof c.missionId !== 'string' || !Array.isArray(c.completionCriteria) || typeof c.maxCycles !== 'number') {
    throw new Error('CHECKPOINT_CORRUPT:contract_shape');
  }
  const state = cp.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('CHECKPOINT_CORRUPT:state_missing');
  }
  const s = state as Record<string, unknown>;
  if (
    typeof s.missionId !== 'string' ||
    typeof s.status !== 'string' ||
    typeof s.cycle !== 'number' ||
    typeof s.startedAt !== 'number' ||
    !Array.isArray(s.completedSteps) ||
    !Array.isArray(s.remainingSteps) ||
    !isRecordArray(s.evidence, (e) => typeof e.key === 'string' && typeof e.status === 'string' && typeof e.timestamp === 'number')
  ) {
    throw new Error('CHECKPOINT_CORRUPT:state_shape');
  }
  const context = cp.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('CHECKPOINT_CORRUPT:context_missing');
  }
  const x = context as Record<string, unknown>;
  if (
    x.schemaVersion !== MISSION_CONTEXT_SCHEMA_VERSION ||
    typeof x.missionId !== 'string' ||
    !Array.isArray(x.completedSteps) ||
    !Array.isArray(x.pendingSteps) ||
    !Array.isArray(x.evidenceRefs)
  ) {
    throw new Error('CHECKPOINT_CORRUPT:context_shape');
  }
  if (cp.waveState !== undefined) {
    const w = cp.waveState;
    if (!w || typeof w !== 'object' || Array.isArray(w) || typeof (w as Record<string, unknown>).planId !== 'string') {
      throw new Error('CHECKPOINT_CORRUPT:wave_state_shape');
    }
    const actions = (w as Record<string, unknown>).actions;
    if (!isRecordArray(actions, (a) => typeof a.actionId === 'string' && typeof a.status === 'string' && typeof a.started === 'boolean')) {
      throw new Error('CHECKPOINT_CORRUPT:wave_state_actions');
    }
  }
  return cp as unknown as MissionCheckpoint;
}

/** Checkpoint persistence seam (file-backed V1; swappable without Guardian changes). */
export interface MissionCheckpointStore {
  save(checkpoint: MissionCheckpoint): Promise<void>;
  /** null when absent; THROWS (fail-closed) on corruption/version mismatch. */
  load(): Promise<MissionCheckpoint | null>;
}

/**
 * File-backed JSON checkpoint store with ATOMIC persistence:
 * write temp -> fsync -> close -> atomic rename. A crash mid-write can never
 * leave a partially written checkpoint under the canonical path.
 */
export class FileCheckpointStore implements MissionCheckpointStore {
  constructor(private readonly filePath: string) {}

  async save(checkpoint: MissionCheckpoint): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify(checkpoint);
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, payload, 0, 'utf8');
      // fsync before rename: the bytes are on disk when the rename lands.
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.filePath);
  }

  async load(): Promise<MissionCheckpoint | null> {
    if (!existsSync(this.filePath)) return null;
    const raw = readFileSync(this.filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('CHECKPOINT_CORRUPT:unparseable_json');
    }
    return validateCheckpoint(parsed);
  }
}

/** In-memory checkpoint store for tests/simple usage. */
export class MemoryCheckpointStore implements MissionCheckpointStore {
  private saved: MissionCheckpoint | null = null;
  async save(checkpoint: MissionCheckpoint): Promise<void> {
    this.saved = JSON.parse(JSON.stringify(checkpoint)) as MissionCheckpoint;
  }
  async load(): Promise<MissionCheckpoint | null> {
    return this.saved ? (JSON.parse(JSON.stringify(this.saved)) as MissionCheckpoint) : null;
  }
}

// ===== Duplicate work prevention =====

export interface CompletedActionFilterResult {
  /** Executable actions with skipped dependencies resolved out of dependsOn. */
  executable: PlanAction[];
  skipped: string[];
}

/**
 * GH-06 structural duplicate-work prevention: an action ALREADY completed
 * (id in completedSteps) with still-conclusive evidence (every declared
 * expectedEvidence key present as ok evidence, or none declared) is NEVER
 * re-executed — the runtime filters it out of a re-proposed plan. Actions
 * pending, failed, transient or otherwise non-conclusive stay executable.
 * Dependencies of executable actions on skipped actions are RESOLVED (the
 * completed dependency's work is already proven) so the wave executor never
 * waits on — or fails — a dependency that will not run again.
 */
export function filterCompletedActions(
  proposal: PlanProposal,
  state: MissionState,
): CompletedActionFilterResult {
  const completed = new Set(state.completedSteps);
  const okKeys = new Set(state.evidence.filter((e) => e.status === 'ok').map((e) => e.key));
  const skipped = new Set<string>();
  for (const action of proposal.actions) {
    const stepDone = completed.has(action.id);
    const expected = action.expectedEvidence ?? [];
    const expectedAllOk = expected.length > 0 && expected.every((key) => okKeys.has(key));
    if (stepDone && (expected.length === 0 || expectedAllOk)) skipped.add(action.id);
  }
  const executable = proposal.actions
    .filter((action) => !skipped.has(action.id))
    .map((action) => ({
      ...action,
      dependsOn: (action.dependsOn ?? []).filter((dep) => !skipped.has(dep)),
    }));
  return { executable, skipped: [...skipped] };
}

/**
 * Resume-time reconciliation of checkpointed wave actions: only 'ok' actions
 * WITH conclusive expected evidence are 'completed'; anything started without
 * conclusive proof is 'reconcile' (never assumed done — it must produce fresh
 * evidence or be re-executed); actions never started are 'pending'.
 */
export type ResumeActionDisposal = 'completed' | 'reconcile' | 'pending';

export function classifyCheckpointActions(
  checkpoint: MissionCheckpoint,
  plan?: PlanProposal,
): Map<string, ResumeActionDisposal> {
  const map = new Map<string, ResumeActionDisposal>();
  const expectedByAction = new Map<string, string[]>(
    (plan?.actions ?? []).map((a) => [a.id, a.expectedEvidence ?? []]),
  );
  for (const action of checkpoint.waveState?.actions ?? []) {
    if (action.status === 'ok') {
      const expected = expectedByAction.get(action.actionId) ?? [];
      const conclusive = expected.every((key) => action.okEvidenceKeys.includes(key));
      map.set(action.actionId, conclusive ? 'completed' : 'reconcile');
    } else {
      map.set(action.actionId, action.started ? 'reconcile' : 'pending');
    }
  }
  for (const action of plan?.actions ?? []) {
    if (!map.has(action.id)) map.set(action.id, 'pending');
  }
  return map;
}

// ===== Experience / Error Memory (ADVISORY ONLY) =====

export interface ExperienceRecord {
  signature: string;
  situation: string;
  classification?: string;
  actionTaken: string;
  outcome: 'success' | 'failure' | 'partial';
  evidenceRefs: string[];
  createdAt: number;
}

export interface ErrorRecord {
  errorSignature: string;
  classification: string;
  knownCause?: string;
  safeRecovery?: string;
  lastOutcome?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Deterministic error signature: normalized (lowercase, collapsed
 * whitespace) key+value text. Equivalent errors map to the same signature.
 */
export function errorSignatureOf(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export interface MissionMemoryStore {
  recordError(record: ErrorRecord): Promise<void>;
  recordExperience(record: ExperienceRecord): Promise<void>;
  findError(signature: string): Promise<ErrorRecord | null>;
  findExperience(signature: string): Promise<ExperienceRecord | null>;
}

const MAX_MEMORY_ENTRIES = 200;

/** In-memory mission memory (last-write-wins, bounded). */
export class MemoryMissionMemoryStore implements MissionMemoryStore {
  protected readonly errors = new Map<string, ErrorRecord>();
  protected readonly experiences = new Map<string, ExperienceRecord>();

  async recordError(record: ErrorRecord): Promise<void> {
    this.errors.set(record.errorSignature, { ...record });
    this.evict(this.errors);
  }
  async recordExperience(record: ExperienceRecord): Promise<void> {
    this.experiences.set(record.signature, { ...record });
    this.evict(this.experiences);
  }
  async findError(signature: string): Promise<ErrorRecord | null> {
    return this.errors.get(errorSignatureOf(signature)) ?? null;
  }
  async findExperience(signature: string): Promise<ExperienceRecord | null> {
    return this.experiences.get(errorSignatureOf(signature)) ?? null;
  }
  private evict(map: Map<string, unknown>): void {
    while (map.size > MAX_MEMORY_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }
}

/**
 * File-backed mission memory (same atomic write discipline as checkpoints).
 * Memory is ADVISORY: a corrupt memory file degrades to an empty store
 * (observable via lastLoadDegraded) — it never blocks governance, because
 * absence of memory must never change Guardian decisions.
 */
export class FileMissionMemoryStore extends MemoryMissionMemoryStore {
  lastLoadDegraded = false;
  constructor(private readonly filePath: string) {
    super();
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as {
        schemaVersion?: number;
        errors?: Record<string, ErrorRecord>;
        experiences?: Record<string, ExperienceRecord>;
      };
      if (parsed.schemaVersion !== MISSION_MEMORY_SCHEMA_VERSION) {
        this.lastLoadDegraded = true;
        return;
      }
      for (const [signature, record] of Object.entries(parsed.errors ?? {})) {
        this.errors.set(signature, record);
      }
      for (const [signature, record] of Object.entries(parsed.experiences ?? {})) {
        this.experiences.set(signature, record);
      }
    } catch {
      // Advisory degrade: stale/corrupt memory is discarded, never trusted.
      this.errors.clear();
      this.experiences.clear();
      this.lastLoadDegraded = true;
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({
      schemaVersion: MISSION_MEMORY_SCHEMA_VERSION,
      errors: Object.fromEntries(this.errors),
      experiences: Object.fromEntries(this.experiences),
    });
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, payload, 0, 'utf8');
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.filePath);
  }

  async recordError(record: ErrorRecord): Promise<void> {
    await super.recordError(record);
    this.persist();
  }
  async recordExperience(record: ExperienceRecord): Promise<void> {
    await super.recordExperience(record);
    this.persist();
  }
}

/**
 * Recovery actions memory may ADOPT: only the certified recovery policy
 * actions (plus the GH-05 alternative-strategy switch and the GH-06A
 * authorized-executor-fallback). Memory can never adopt anything outside
 * this allowlist (no permission/budget/model moves). Adoption is candidate
 * guidance: the Guardian re-validates the CURRENT contract before any
 * fallback executes (an authorized action executes; an unauthorized one does
 * not, whatever memory suggested).
 */
export const MEMORY_RECOVERY_ALLOWLIST: readonly string[] = [
  ...SINGLE_ATTEMPT_RECOVERY_POLICY.allowed,
  SWITCH_TO_ALTERNATIVE_SAFE_STRATEGY,
  'authorized_executor_fallback',
];

/** Certified alias: the spec's `retry_with_backoff` maps to the certified bounded transient retry. */
const MEMORY_ACTION_ALIASES: Record<string, string> = {
  retry_with_backoff: 'transient_non_llm_retry',
};

/** What the Guardian learned from memory before deciding (auditable). */
export interface MemoryAdvice {
  consulted: boolean;
  knownError?: ErrorRecord;
  experience?: ExperienceRecord;
  /** nextAction actually adopted (allowlisted), when memory was reused. */
  adoptedAction?: string;
}

/**
 * Consult error/experience memory for a failure. Returns candidate guidance
 * ONLY: the adopted action (if any) is allowlisted and the caller keeps the
 * certified decision kind/classification untouched. Anti-staleness: memory
 * is candidate guidance — current evidence and current state stay sovereign,
 * and no memory channel can ever produce PASS.
 */
export async function consultMissionMemory(
  memory: MissionMemoryStore,
  failureText: string,
  decisionKind: 'CONTINUE' | 'RECOVER' | 'BLOCK' | 'PASS',
): Promise<MemoryAdvice> {
  const signature = errorSignatureOf(failureText);
  const knownError = await memory.findError(signature);
  const experience = await memory.findExperience(signature);
  let adoptedAction: string | undefined;
  if (decisionKind === 'RECOVER' && knownError?.safeRecovery) {
    const mapped = MEMORY_ACTION_ALIASES[knownError.safeRecovery] ?? knownError.safeRecovery;
    if (MEMORY_RECOVERY_ALLOWLIST.includes(mapped)) adoptedAction = mapped;
  }
  const advice: MemoryAdvice = {
    consulted: true,
    knownError: knownError ?? undefined,
    experience: experience ?? undefined,
  };
  if (adoptedAction) advice.adoptedAction = adoptedAction;
  return advice;
}
