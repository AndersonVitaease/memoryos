/**
 * GUARDIAN-UCME-INTEGRATION-01 — UCME-backed MissionMemoryStore adapter.
 *
 * Connects the certified GH-06 experience/error memory seam (MissionMemoryStore)
 * to the OFFICIAL MemoryOS UCME backend: the agentMemoryBridge operations
 * context/search/capture served by the eng-mcp AgentMemoryClient
 * (eng-mcp src/memory.ts) and exposed as engineering.memory.context/search/capture.
 * The transport is injected — the store never constructs endpoints, never reads
 * credentials and never logs them (credential handling stays server-side, same
 * channel as engineering.memory.*).
 *
 * Protocol (matches the real backend, proven live on 2026-09-12):
 * - write  = capture { summary, projectId, agent? } — the canonical record is a
 *            whitelist-serialized JSON embedded in the summary line; the bridge
 *            stores the message and derives semantic records (decisions/topics).
 * - lookup = search  { query, projectId, limit } — results[].text carries the
 *            formatted message; the record JSON is extracted and revalidated
 *            against the requested signature (semantic search is never trusted
 *            blindly: a hit is accepted only when the embedded record matches).
 *
 * Record model (FASE 5): every record carries schemaVersion, recordType
 * (guardian:mission|error|experience), projectId (namespace), missionId when
 * applicable, createdAt/updatedAt and source. Fields are copied EXPLICITLY from
 * the closed GH-06 types — no free-form field can smuggle secrets into UCME,
 * and nothing that looks like a credential is ever serialized.
 *
 * Memory stays ADVISORY (MEMORY_IS_ADVISORY=YES): every failure of the backend
 * degrades to "no memory" (writes swallowed with a failure count, reads return
 * null) — a UCME outage can never corrupt, block or satisfy a mission, and no
 * memory channel can ever produce Evidence or PASS (CompletionGuard remains the
 * final deterministic authority).
 */
import {
  errorSignatureOf,
  ErrorRecord,
  ExperienceRecord,
  MissionMemoryStore,
} from './missionMemory.js';

/** Operation set of the official bridge (mirrors AgentMemoryClient.call). */
export type UcmeAgentMemoryOperation = 'context' | 'search' | 'capture';

/** Payload shape of the official bridge (mirrors the server AgentMemoryPayload). */
export interface UcmeAgentMemoryPayload {
  projectId?: string;
  agent?: string;
  limit?: number;
  query?: string;
  summary?: string;
  userPrompt?: string;
  outcome?: string;
  decisions?: string[];
  problems?: string[];
  solutions?: string[];
  tests?: string[];
  files?: string[];
  nextSteps?: string[];
}

/** Minimal transport seam — injectable, no endpoint/credential knowledge here. */
export interface UcmeTransport {
  call(operation: UcmeAgentMemoryOperation, payload?: UcmeAgentMemoryPayload): Promise<unknown>;
}

/** Minimal observability (FASE 13): counters only, never record content. */
export interface UcmeMemoryTelemetry {
  readonly reads: number;
  readonly writes: number;
  readonly readHits: number;
  readonly readMisses: number;
  readonly readFailures: number;
  readonly writeFailures: number;
  readonly backend: string;
}

export class UcmeMemoryTelemetryCounter implements UcmeMemoryTelemetry {
  reads = 0;
  writes = 0;
  readHits = 0;
  readMisses = 0;
  readFailures = 0;
  writeFailures = 0;
  readonly backend = 'ucme-agent-memory';
}

export const UCME_MEMORY_SCHEMA_VERSION = 1;

/** UCME capture `summary` limit (server schema: z.string().max(3000)). */
const MAX_SUMMARY_CHARS = 3000;
/** UCME search limit (server schema: z.number().max(50)). */
const SEARCH_LIMIT = 50;
/** Signatures may be long failure texts; search matches by head. */
const QUERY_HEAD_CHARS = 180;

const RECORD_TAG = {
  mission: '[GUARDIAN:mission]',
  error: '[GUARDIAN:error]',
  experience: '[GUARDIAN:experience]',
} as const;

type GuardianRecordType = keyof typeof RECORD_TAG;

/** FASE 5 — mission memory record (compact, closed whitelist). */
export interface GuardianMissionMemoryRecord {
  missionId: string;
  status: string;
  cycle?: number;
  completedSteps?: string[];
  remainingSteps?: string[];
  okEvidenceKeys?: string[];
  failedEvidenceKeys?: string[];
  blocker?: string;
  createdAt: number;
  updatedAt: number;
}

/** Explicit whitelist copy — the ONLY serialization path (no secrets by construction). */
function errorRecordJson(record: ErrorRecord, projectId: string): string {
  return JSON.stringify({
    schemaVersion: UCME_MEMORY_SCHEMA_VERSION,
    recordType: 'guardian:error',
    projectId,
    errorSignature: record.errorSignature,
    classification: record.classification,
    knownCause: record.knownCause,
    safeRecovery: record.safeRecovery,
    lastOutcome: record.lastOutcome,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function experienceRecordJson(record: ExperienceRecord, projectId: string): string {
  return JSON.stringify({
    schemaVersion: UCME_MEMORY_SCHEMA_VERSION,
    recordType: 'guardian:experience',
    projectId,
    signature: record.signature,
    situation: record.situation,
    classification: record.classification,
    actionTaken: record.actionTaken,
    outcome: record.outcome,
    evidenceRefs: record.evidenceRefs,
    createdAt: record.createdAt,
  });
}

function missionRecordJson(record: GuardianMissionMemoryRecord, projectId: string): string {
  return JSON.stringify({
    schemaVersion: UCME_MEMORY_SCHEMA_VERSION,
    recordType: 'guardian:mission',
    projectId,
    missionId: record.missionId,
    status: record.status,
    cycle: record.cycle,
    completedSteps: record.completedSteps,
    remainingSteps: record.remainingSteps,
    okEvidenceKeys: record.okEvidenceKeys,
    failedEvidenceKeys: record.failedEvidenceKeys,
    blocker: record.blocker,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function head(signature: string): string {
  return errorSignatureOf(signature).slice(0, QUERY_HEAD_CHARS);
}

function recordSummary(tag: string, keyHead: string, json: string): string {
  return `${tag} key=${keyHead} record=${json}`;
}

/** Extract the embedded canonical record from a bridge-formatted message text. */
function parseRecordLine(text: string, tag: string): unknown | undefined {
  if (typeof text !== 'string' || !text.includes(tag)) return undefined;
  const match = text.match(/record=(\{[^\n]*\})/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return undefined;
  }
}

function recordMatchesType(parsed: Record<string, unknown>, type: GuardianRecordType): boolean {
  return (
    parsed.schemaVersion === UCME_MEMORY_SCHEMA_VERSION &&
    parsed.recordType === `guardian:${type}` &&
    typeof parsed.projectId === 'string'
  );
}

function isFiniteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toErrorRecord(parsed: unknown, projectId: string): ErrorRecord | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (!recordMatchesType(p, 'error') || p.projectId !== projectId) return null;
  if (typeof p.errorSignature !== 'string' || typeof p.classification !== 'string') return null;
  if (!isFiniteInt(p.createdAt) || !isFiniteInt(p.updatedAt)) return null;
  return {
    errorSignature: p.errorSignature,
    classification: p.classification,
    knownCause: typeof p.knownCause === 'string' ? p.knownCause : undefined,
    safeRecovery: typeof p.safeRecovery === 'string' ? p.safeRecovery : undefined,
    lastOutcome: typeof p.lastOutcome === 'string' ? p.lastOutcome : undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toExperienceRecord(parsed: unknown, projectId: string): ExperienceRecord | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (!recordMatchesType(p, 'experience') || p.projectId !== projectId) return null;
  if (typeof p.signature !== 'string' || typeof p.situation !== 'string') return null;
  if (typeof p.actionTaken !== 'string' || !isFiniteInt(p.createdAt)) return null;
  if (p.outcome !== 'success' && p.outcome !== 'failure' && p.outcome !== 'partial') return null;
  if (!isStringArray(p.evidenceRefs)) return null;
  return {
    signature: p.signature,
    situation: p.situation,
    classification: typeof p.classification === 'string' ? p.classification : undefined,
    actionTaken: p.actionTaken,
    outcome: p.outcome,
    evidenceRefs: p.evidenceRefs,
    createdAt: p.createdAt,
  };
}

function toMissionRecord(parsed: unknown, projectId: string): GuardianMissionMemoryRecord | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (!recordMatchesType(p, 'mission') || p.projectId !== projectId) return null;
  if (typeof p.missionId !== 'string' || typeof p.status !== 'string') return null;
  if (!isFiniteInt(p.createdAt) || !isFiniteInt(p.updatedAt)) return null;
  return {
    missionId: p.missionId,
    status: p.status,
    cycle: typeof p.cycle === 'number' ? p.cycle : undefined,
    completedSteps: isStringArray(p.completedSteps) ? p.completedSteps : undefined,
    remainingSteps: isStringArray(p.remainingSteps) ? p.remainingSteps : undefined,
    okEvidenceKeys: isStringArray(p.okEvidenceKeys) ? p.okEvidenceKeys : undefined,
    failedEvidenceKeys: isStringArray(p.failedEvidenceKeys) ? p.failedEvidenceKeys : undefined,
    blocker: typeof p.blocker === 'string' ? p.blocker : undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface UcmeSearchResponseLike {
  results?: unknown;
}

/**
 * UCME-backed MissionMemoryStore (FASE 4). Advisory-only like every GH-06
 * memory channel: backend failures degrade to absence of memory (fail-open
 * for mission/error/experience), never to guessed state or Evidence.
 */
export class UcmeGuardianMemoryStore implements MissionMemoryStore {
  private readonly projectId: string;
  private readonly agent: string | undefined;
  private readonly tel: UcmeMemoryTelemetryCounter;

  constructor(
    private readonly transport: UcmeTransport,
    options: { projectId: string; agent?: string; telemetry?: UcmeMemoryTelemetryCounter },
  ) {
    // Fail-closed configuration: an ambiguous namespace must never open writes.
    if (typeof options.projectId !== 'string' || options.projectId.trim().length === 0) {
      throw new Error('UCME_MEMORY_PROJECT_ID_REQUIRED');
    }
    this.projectId = options.projectId;
    this.agent = options.agent;
    this.tel = options.telemetry ?? new UcmeMemoryTelemetryCounter();
  }

  get telemetry(): UcmeMemoryTelemetry {
    return this.tel;
  }

  async recordError(record: ErrorRecord): Promise<void> {
    await this.capture(
      RECORD_TAG.error,
      head(record.errorSignature),
      errorRecordJson(record, this.projectId),
    );
  }

  async recordExperience(record: ExperienceRecord): Promise<void> {
    await this.capture(
      RECORD_TAG.experience,
      head(record.signature),
      experienceRecordJson(record, this.projectId),
    );
  }

  /** FASE 6 — mission memory write path (host/harness-driven, advisory). */
  async recordMission(record: GuardianMissionMemoryRecord): Promise<void> {
    await this.capture(
      RECORD_TAG.mission,
      head(record.missionId),
      missionRecordJson(record, this.projectId),
    );
  }

  async findError(signature: string): Promise<ErrorRecord | null> {
    this.tel.reads += 1;
    const normalized = errorSignatureOf(signature);
    const wanted = (record: ErrorRecord): boolean =>
      errorSignatureOf(record.errorSignature) === normalized;
    const parsed = await this.searchTyped(RECORD_TAG.error, normalized);
    let best: ErrorRecord | null = null;
    for (const candidate of parsed ?? []) {
      const record = toErrorRecord(candidate, this.projectId);
      if (record && wanted(record) && (best === null || record.updatedAt > best.updatedAt)) {
        best = record;
      }
    }
    if (best === null) {
      this.tel.readMisses += 1;
      return null;
    }
    this.tel.readHits += 1;
    return best;
  }

  async findExperience(signature: string): Promise<ExperienceRecord | null> {
    this.tel.reads += 1;
    const normalized = errorSignatureOf(signature);
    const wanted = (record: ExperienceRecord): boolean =>
      errorSignatureOf(record.signature) === normalized;
    const parsed = await this.searchTyped(RECORD_TAG.experience, normalized);
    let best: ExperienceRecord | null = null;
    for (const candidate of parsed ?? []) {
      const record = toExperienceRecord(candidate, this.projectId);
      if (record && wanted(record) && (best === null || record.createdAt > best.createdAt)) {
        best = record;
      }
    }
    if (best === null) {
      this.tel.readMisses += 1;
      return null;
    }
    this.tel.readHits += 1;
    return best;
  }

  /** FASE 6 — mission memory read path. */
  async findMission(missionId: string): Promise<GuardianMissionMemoryRecord | null> {
    this.tel.reads += 1;
    const normalized = errorSignatureOf(missionId);
    const parsed = await this.searchTyped(RECORD_TAG.mission, normalized);
    let best: GuardianMissionMemoryRecord | null = null;
    for (const candidate of parsed ?? []) {
      const record = toMissionRecord(candidate, this.projectId);
      if (
        record &&
        record.missionId === missionId &&
        (best === null || record.updatedAt > best.updatedAt)
      ) {
        best = record;
      }
    }
    if (best === null) {
      this.tel.readMisses += 1;
      return null;
    }
    this.tel.readHits += 1;
    return best;
  }

  /** Advisory write: capture failures are swallowed and counted, never thrown. */
  private async capture(tag: string, keyHead: string, json: string): Promise<void> {
    this.tel.writes += 1;
    const summary = recordSummary(tag, keyHead, json);
    if (summary.length > MAX_SUMMARY_CHARS) {
      // Advisory drop: an oversized record is never stored partially.
      this.tel.writeFailures += 1;
      return;
    }
    try {
      await this.transport.call('capture', {
        summary,
        projectId: this.projectId,
        ...(this.agent !== undefined ? { agent: this.agent } : {}),
      });
    } catch {
      // MEMORY_IS_ADVISORY: a UCME outage must not corrupt or block the mission.
      this.tel.writeFailures += 1;
    }
  }

  /** Advisory read: transport failures degrade to "no candidates" (null path). */
  private async searchTyped(
    tag: string,
    normalizedKey: string,
  ): Promise<unknown[] | null> {
    let data: unknown;
    try {
      data = await this.transport.call('search', {
        query: normalizedKey.slice(0, QUERY_HEAD_CHARS),
        projectId: this.projectId,
        limit: SEARCH_LIMIT,
      });
    } catch {
      this.tel.readFailures += 1;
      return null;
    }
    const results = (data as UcmeSearchResponseLike | undefined)?.results;
    if (!Array.isArray(results)) {
      return null;
    }
    const parsed: unknown[] = [];
    for (const result of results) {
      const text = (result as { text?: unknown } | undefined)?.text;
      if (typeof text !== 'string') continue;
      const candidate = parseRecordLine(text, tag);
      if (candidate !== undefined) parsed.push(candidate);
    }
    // Revalidation (signature match, schema, namespace) happens in the find*
    // callers — a semantic hit is never trusted blindly.
    return parsed;
  }
}
