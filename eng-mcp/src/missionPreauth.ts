/**
 * AUTO-RUN-01A — engineering.mission.preauth: pre-authorization by MANIFEST
 * (mission-OAuth model). The operator approves ONE plan; the judge gate's
 * manifestCheck seam then matches each real command against it at apply-time.
 *
 * Actions:
 *   create (default) — PLAN (execute absent/false, ZERO mutation): deterministic
 *     classification of every proposed operation (band 1/2/3, no LLM) and the
 *     manifest that WOULD be written. Any class-3 operation refuses the WHOLE
 *     manifest (REFUSED). execute=true + approval.approved=true re-classifies
 *     (TOCTOU) and writes {dir}/{mission}.json 0600 atomically.
 *   status — read-only view of active/rejected manifests (metadata only).
 *   revoke — PLAN by default; execute+approval stamps revokedAt (fail-closed
 *     from that instant on).
 * The preauth NEVER substitutes tier 3: consequences are refused at admission
 * and band 3 is evaluated before the manifest at apply-time.
 * Audit: {auditFile} metadata-only (mission, hash16, counts, ids, reasons —
 * never command patterns).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isTrivialCommand, matchDenylist } from './harness/judgeGate.js';
import { EngineeringError } from './policy.js';
import { isOperatorSubject } from './registryScopeGrant.js';
import {
  MANIFEST_MAX_OPERATIONS,
  MANIFEST_MAX_WINDOW_MINUTES,
  MANIFEST_VERSION,
  MISSION_NAME_RE,
  classifyOperation,
  loadActiveManifests,
  manifestHash16,
  sha16,
  validateManifest,
  type ManifestOperation,
  type MissionManifest,
  type OperationClassification,
} from './missionManifest.js';

export interface MissionPreauthInput {
  action?: 'create' | 'status' | 'revoke';
  mission?: string;
  windowMinutes?: number;
  operations?: ManifestOperation[];
  approvedBy?: string;
  execute?: boolean;
  approval?: { approved: boolean };
}

/** PREAUTH-SCOPE-01: dedicated operator scope required for CREATE (PLAN and execute). */
export const MISSION_PREAUTH_SCOPE = 'engineering:mission:preauth';

export interface MissionPreauthCaller {
  subject: string;
  scopes: readonly string[];
}

export interface MissionPreauthDeps {
  /** The authenticated caller. Absent = fail-closed for create/revoke. */
  caller?: MissionPreauthCaller;
  manifestDir?: string;
  auditFile?: string;
  now?: () => number;
}

export function defaultManifestDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ENG_MCP_MANIFEST_DIR || '/data/manifests';
}

export function defaultManifestAudit(env: NodeJS.ProcessEnv = process.env): string {
  return env.ENG_MCP_MANIFEST_AUDIT || '/data/audit/manifests.jsonl';
}

function audit(file: string, entry: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), tool: 'engineering.mission.preauth', ...entry }) + '\n');
  } catch {
    /* audit failure never changes the result */
  }
}

function writeAtomic0600(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, path);
}

function fail(code: string, detail?: string) {
  return { tool: 'engineering.mission.preauth', status: 'INVALID', mutationPerformed: false, code, detail: detail ?? null };
}

export function runMissionPreauth(input: MissionPreauthInput, deps: MissionPreauthDeps = {}) {
  const dir = deps.manifestDir ?? defaultManifestDir();
  const auditFile = deps.auditFile ?? defaultManifestAudit();
  const now = (deps.now ?? Date.now)();
  const action = input.action ?? 'create';

  if (action === 'status') {
    const loaded = loadActiveManifests(dir, now);
    return {
      tool: 'engineering.mission.preauth',
      status: 'STATUS',
      mutationPerformed: false,
      active: loaded.active.map((m) => ({ mission: m.mission, hash16: m.hash16, expiresAt: m.expiresAt, operations: m.operations.map((o) => o.id) })),
      rejected: loaded.rejected,
    };
  }

  const mission = input.mission ?? '';
  if (!MISSION_NAME_RE.test(mission)) return fail('MISSION_NAME_INVALID');
  const path = join(dir, `${mission}.json`);

  if (action === 'revoke') {
    let current: MissionManifest | null = null;
    try {
      current = JSON.parse(readFileSync(path, 'utf8')) as MissionManifest;
    } catch {
      current = null;
    }
    if (!current) return { tool: 'engineering.mission.preauth', status: 'NOT_FOUND', mutationPerformed: false, mission, path };
    // Revoke: the creator (subject hash match) OR any operator-* subject — rollback never breaks for operators.
    const caller = deps.caller;
    const isCreator = caller !== undefined && typeof current.createdBySubjectHash16 === 'string' && current.createdBySubjectHash16 === sha16(caller.subject);
    if (!caller || (!isCreator && !isOperatorSubject(caller.subject))) {
      audit(auditFile, { event: 'revoke_refused', mission, hash16: current.hash16, subjectHash16: caller ? sha16(caller.subject) : null, reason: 'REVOKE_NOT_AUTHORIZED' });
      throw new EngineeringError('AUTHORIZATION_SCOPE_REQUIRED', 'REVOKE_NOT_AUTHORIZED: only the manifest creator or an operator-* subject may revoke');
    }
    const plan = { tool: 'engineering.mission.preauth', mission, path, hash16: current.hash16, alreadyRevoked: Boolean(current.revokedAt) };
    if (current.revokedAt) return { ...plan, status: 'NO_OP', mutationPerformed: false };
    if (input.execute !== true) return { ...plan, status: 'PLAN', mutationPerformed: false, requires: ['execute=true + approval.approved=true'] };
    if (input.approval?.approved !== true) return { ...plan, status: 'APPROVAL_REQUIRED', mutationPerformed: false };
    const revokedAt = new Date(now).toISOString();
    writeAtomic0600(path, JSON.stringify({ ...current, revokedAt }, null, 2) + '\n');
    audit(auditFile, { event: 'revoke', mission, hash16: current.hash16, subjectHash16: sha16(caller.subject), byCreator: isCreator });
    return { ...plan, status: 'REVOKED', mutationPerformed: true, revokedAt };
  }

  if (action !== 'create') return fail('ACTION_INVALID');
  // PREAUTH-SCOPE-01: server-side, fail-closed — engineering:write alone never creates a manifest.
  const caller = deps.caller;
  if (!caller || !caller.scopes.includes(MISSION_PREAUTH_SCOPE)) {
    audit(auditFile, { event: 'create_refused', mission, subjectHash16: caller ? sha16(caller.subject) : null, reason: 'AUTHORIZATION_SCOPE_REQUIRED', requiredScope: MISSION_PREAUTH_SCOPE });
    throw new EngineeringError('AUTHORIZATION_SCOPE_REQUIRED', `AUTHORIZATION_SCOPE_REQUIRED: mission.preauth create requires ${MISSION_PREAUTH_SCOPE} (operator-issued)`);
  }
  const subjectHash16 = sha16(caller.subject);
  const windowMinutes = input.windowMinutes ?? 60;
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > MANIFEST_MAX_WINDOW_MINUTES) return fail('WINDOW_INVALID', `1..${MANIFEST_MAX_WINDOW_MINUTES} minutes`);
  const operations = input.operations ?? [];
  if (operations.length === 0 || operations.length > MANIFEST_MAX_OPERATIONS) return fail('OPERATIONS_INVALID', `1..${MANIFEST_MAX_OPERATIONS} operations`);
  const ids = new Set<string>();
  for (const op of operations) {
    if (ids.has(op.id)) return fail('OPERATION_ID_DUPLICATE', op.id);
    ids.add(op.id);
  }

  const classify = (): OperationClassification[] => operations.map((op) => classifyOperation(op, { gateDenylist: matchDenylist, isTrivial: isTrivialCommand }));
  const classifications = classify();
  const refused = classifications.filter((c) => !c.admissible);
  const approvedBy = (input.approvedBy ?? 'operator').slice(0, 200);
  const normalized: ManifestOperation[] = operations.map((op) => ({ id: op.id, pattern: op.pattern.trim(), ...(op.fileScope && op.fileScope.length > 0 ? { fileScope: [...op.fileScope] } : {}) }));
  const draftBody = {
    version: MANIFEST_VERSION,
    mission,
    holder: mission,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + windowMinutes * 60_000).toISOString(),
    operations: normalized,
    approvedBy,
    createdBySubjectHash16: subjectHash16,
  };
  const manifest: MissionManifest = { ...draftBody, hash16: manifestHash16(draftBody) };
  const report = {
    tool: 'engineering.mission.preauth',
    mission,
    path,
    windowMinutes,
    classifications,
    refused: refused.map((r) => ({ id: r.id, reason: r.reason })),
    manifest,
  };

  if (refused.length > 0) {
    audit(auditFile, { event: input.execute === true ? 'refused' : 'plan_refused', mission, subjectHash16, approvedByHash16: sha16(approvedBy), operations: operations.length, refused: refused.map((r) => ({ id: r.id, reason: r.reason })) });
    return { ...report, status: 'REFUSED', mutationPerformed: false, note: 'class-3 operations never enter a manifest; the whole manifest is refused — consequences stay with the operator' };
  }
  if (input.execute !== true) {
    return { ...report, status: 'PLAN', mutationPerformed: false, requires: ['execute=true + approval.approved=true (operator approves the WHOLE plan once)'] };
  }
  if (input.approval?.approved !== true) return { ...report, status: 'APPROVAL_REQUIRED', mutationPerformed: false };

  // TOCTOU: re-classify immediately before the write.
  if (classify().some((c) => !c.admissible)) return { ...report, status: 'REFUSED', mutationPerformed: false };
  if (existsSync(path)) {
    try {
      const reason = validateManifest(JSON.parse(readFileSync(path, 'utf8')), now);
      if (reason === null) return { ...report, status: 'MANIFEST_ACTIVE', mutationPerformed: false, note: 'an active manifest already exists for this mission — revoke it first' };
    } catch {
      /* corrupt existing file is replaced */
    }
  }
  writeAtomic0600(path, JSON.stringify(manifest, null, 2) + '\n');
  audit(auditFile, { event: 'create', mission, hash16: manifest.hash16, subjectHash16, approvedByHash16: sha16(approvedBy), operations: operations.length, operationIds: normalized.map((o) => o.id), bands: classifications.map((c) => c.band), expiresAt: manifest.expiresAt });
  return { ...report, status: 'CREATED', mutationPerformed: true, hash16: manifest.hash16, expiresAt: manifest.expiresAt };
}
