/**
 * AUTO-RUN-01A — mission manifest core (pure, deterministic, NO LLM).
 *
 * One module shared by BOTH ends of the manifest lifecycle so admission and
 * apply-time can never drift:
 *   - admission (engineering.mission.preauth PLAN/execute): classify every
 *     proposed operation into band 1/2/3 and REFUSE anything of class 3;
 *   - apply-time (the judge gate's manifestCheck seam, via the portable hook):
 *     match the REAL command against the ACTIVE manifests right before it runs.
 *
 * Invariants:
 *   - class 3 never enters a manifest: the fixed consequence denylist below AND
 *     the gate's own band-3 denylist are checked at admission; at apply-time the
 *     gate evaluates band 3 BEFORE the manifest (structural), and the fixed list
 *     is re-checked on the real command (defense in depth);
 *   - fail-closed: unreadable / corrupt / hash-mismatched / expired / revoked /
 *     group-or-world-writable manifests are treated as "no manifest";
 *   - patterns are anchored full-command matches; `*` matches exactly ONE
 *     shell-safe token; commands with shell metacharacters never match;
 *   - file scope: every path-like argument must resolve inside one of the
 *     operation's absolute globs (no fileScope = no path arguments allowed).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const MANIFEST_VERSION = 1;
export const MANIFEST_MAX_WINDOW_MINUTES = 1440;
export const MANIFEST_MAX_OPERATIONS = 20;
export const MISSION_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
export const OPERATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;

/** Fixed consequence verbs (roadmap §3): never admissible, never auto-approved. */
export const CONSEQUENCE_DENYLIST: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'rm', pattern: /(^|[^A-Za-z0-9_-])rm([^A-Za-z0-9_-]|$)/i },
  { label: 'dd', pattern: /(^|[^A-Za-z0-9_-])dd([^A-Za-z0-9_-]|$)/i },
  { label: 'push', pattern: /push/i },
  { label: 'deploy', pattern: /deploy/i },
  { label: 'pipeline', pattern: /pipeline/i },
  { label: 'credential', pattern: /credential/i },
  { label: 'registry', pattern: /registry/i },
  { label: 'Caddyfile', pattern: /caddyfile/i },
  { label: '.env', pattern: /\.env([^A-Za-z0-9_]|$)/i },
];

/** Shell metacharacters that could chain / substitute / redirect. */
const SHELL_META = /[;&|<>`$\n\r\\]/;
const TOKEN_CLASS = "[^\\s;&|<>`$\\\\'\"]+";

export interface ManifestOperation {
  id: string;
  pattern: string;
  fileScope?: string[];
}

export interface MissionManifest {
  version: number;
  mission: string;
  holder: string;
  createdAt: string;
  expiresAt: string;
  operations: ManifestOperation[];
  approvedBy: string;
  hash16: string;
  /** PREAUTH-SCOPE-01: sha16 of the creating subject — inside the hashed body (absent on pre-v109 manifests). */
  createdBySubjectHash16?: string;
  revokedAt?: string | null;
}

export type Band = 1 | 2 | 3;

export interface OperationClassification {
  id: string;
  pattern: string;
  band: Band;
  admissible: boolean;
  reason: string;
}

export interface ClassifyDeps {
  /** The gate's band-3 denylist (matchDenylist) — injected to keep this module fs/gate agnostic. */
  gateDenylist: (command: string) => string | null;
  /** The gate's band-1 allowlist (isTrivialCommand). */
  isTrivial: (command: string) => boolean;
}

export function consequenceLabel(text: string): string | null {
  for (const entry of CONSEQUENCE_DENYLIST) if (entry.pattern.test(text)) return entry.label;
  return null;
}

/** Deterministic admission classification of one proposed operation. */
export function classifyOperation(op: ManifestOperation, deps: ClassifyDeps): OperationClassification {
  const base = { id: op.id, pattern: op.pattern };
  if (!OPERATION_ID_RE.test(op.id)) return { ...base, band: 3, admissible: false, reason: 'INVALID_OPERATION_ID' };
  const pattern = op.pattern.trim();
  if (pattern.length === 0 || pattern.length > 300) return { ...base, band: 3, admissible: false, reason: 'INVALID_PATTERN_LENGTH' };
  const fixed = consequenceLabel(pattern);
  if (fixed) return { ...base, band: 3, admissible: false, reason: `CONSEQUENCE_DENYLIST:${fixed}` };
  const probe = pattern.replace(/\*/g, 'x');
  const gate = deps.gateDenylist(pattern) ?? deps.gateDenylist(probe);
  if (gate) return { ...base, band: 3, admissible: false, reason: `GATE_BAND3:${gate}` };
  if (SHELL_META.test(pattern)) return { ...base, band: 3, admissible: false, reason: 'SHELL_METACHARACTER' };
  for (const glob of op.fileScope ?? []) {
    if (!isAbsolute(glob) || glob.includes('..')) return { ...base, band: 3, admissible: false, reason: 'FILE_SCOPE_NOT_ABSOLUTE' };
    const fixedScope = consequenceLabel(glob);
    if (fixedScope) return { ...base, band: 3, admissible: false, reason: `CONSEQUENCE_DENYLIST:${fixedScope}` };
  }
  if (!pattern.includes('*') && deps.isTrivial(pattern)) {
    return { ...base, band: 1, admissible: true, reason: 'BAND1_ALREADY_TRIVIAL (admitted; the gate allows it without the manifest)' };
  }
  return { ...base, band: 2, admissible: true, reason: 'BAND2_GRAY_ADMISSIBLE' };
}

/** Canonical JSON (sorted keys) — the hash is over content, never over formatting. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function manifestHash16(m: Pick<MissionManifest, 'version' | 'mission' | 'holder' | 'createdAt' | 'expiresAt' | 'operations' | 'approvedBy' | 'createdBySubjectHash16'>): string {
  // createdBySubjectHash16 is undefined on pre-v109 manifests; canonical() drops
  // undefined keys, so their hash is byte-identical and they stay valid.
  const body = { version: m.version, mission: m.mission, holder: m.holder, createdAt: m.createdAt, expiresAt: m.expiresAt, operations: m.operations, approvedBy: m.approvedBy, createdBySubjectHash16: m.createdBySubjectHash16 };
  return createHash('sha256').update(canonical(body)).digest('hex').slice(0, 16);
}

export function sha16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Anchored matcher: literal text, whitespace-normalized, `*` = one shell-safe token. */
export function patternToRegex(pattern: string): RegExp {
  const parts = pattern.trim().split(/\s+/).map((word) => word.split('*').map(escapeRegex).join(TOKEN_CLASS));
  return new RegExp(`^${parts.join('\\s+')}$`);
}

export function globToRegex(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      out += '.*';
      i += 1;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += escapeRegex(c);
  }
  return new RegExp(`^${out}$`);
}

function tokens(command: string): string[] {
  return command.trim().split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, ''));
}

/** Path-like arguments: contain a slash or look like a file name; flags / program excluded. */
export function pathArguments(command: string): string[] {
  return tokens(command)
    .slice(1)
    .filter((t) => !t.startsWith('-') && (t.includes('/') || /^\.{1,2}$/.test(t) || /^[\w.-]+\.[A-Za-z0-9]{1,8}$/.test(t)));
}

export function withinScope(command: string, cwd: string, scope: string[] | undefined): boolean {
  const paths = pathArguments(command);
  if (paths.length === 0) return true;
  if (!scope || scope.length === 0) return false;
  const globs = scope.map(globToRegex);
  return paths.every((p) => {
    const abs = resolve(cwd, p);
    return globs.some((g) => g.test(abs));
  });
}

export interface ManifestMatch {
  mission: string;
  patternId: string;
  hash16: string;
  expiresAt: string;
}

export interface LoadedManifests {
  active: MissionManifest[];
  rejected: Array<{ file: string; reason: string }>;
}

/** Validate one parsed manifest; returns a rejection reason or null (fail-closed). */
export function validateManifest(value: unknown, now: number): string | null {
  const m = value as Partial<MissionManifest> | null;
  if (!m || typeof m !== 'object') return 'NOT_AN_OBJECT';
  if (m.version !== MANIFEST_VERSION) return 'VERSION_MISMATCH';
  if (typeof m.mission !== 'string' || !MISSION_NAME_RE.test(m.mission)) return 'INVALID_MISSION';
  if (m.holder !== m.mission) return 'HOLDER_MISMATCH';
  if (typeof m.createdAt !== 'string' || typeof m.expiresAt !== 'string' || typeof m.approvedBy !== 'string') return 'MISSING_FIELDS';
  if (!Array.isArray(m.operations) || m.operations.length === 0 || m.operations.length > MANIFEST_MAX_OPERATIONS) return 'INVALID_OPERATIONS';
  if (m.revokedAt) return 'REVOKED';
  const exp = Date.parse(m.expiresAt);
  if (!Number.isFinite(exp) || exp <= now) return 'EXPIRED';
  if (m.hash16 !== manifestHash16(m as MissionManifest)) return 'HASH_MISMATCH';
  for (const op of m.operations) {
    if (!op || typeof op.id !== 'string' || typeof op.pattern !== 'string') return 'INVALID_OPERATION';
    if (consequenceLabel(op.pattern) || SHELL_META.test(op.pattern)) return 'CONSEQUENCE_IN_MANIFEST';
  }
  return null;
}

export function loadActiveManifests(dir: string, now: number = Date.now(), onlyMission?: string): LoadedManifests {
  const out: LoadedManifests = { active: [], rejected: [] };
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return out;
  }
  for (const file of files) {
    const path = join(dir, file);
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      if ((st.mode & 0o022) !== 0) {
        out.rejected.push({ file, reason: 'INSECURE_MODE' });
        continue;
      }
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      const reason = validateManifest(parsed, now);
      if (reason) {
        out.rejected.push({ file, reason });
        continue;
      }
      const m = parsed as MissionManifest;
      if (`${m.mission}.json` !== file) {
        out.rejected.push({ file, reason: 'FILENAME_MISMATCH' });
        continue;
      }
      if (onlyMission && m.mission !== onlyMission) continue;
      out.active.push(m);
    } catch {
      out.rejected.push({ file, reason: 'UNREADABLE_OR_CORRUPT' });
    }
  }
  return out;
}

/** Apply-time check against the REAL command. Band 3 is re-refused here too. */
export function matchManifests(command: string, cwd: string, manifests: MissionManifest[]): ManifestMatch | null {
  const cmd = command.trim();
  if (cmd.length === 0 || SHELL_META.test(cmd) || consequenceLabel(cmd)) return null;
  for (const m of manifests) {
    for (const op of m.operations) {
      if (!patternToRegex(op.pattern).test(cmd)) continue;
      if (!withinScope(cmd, cwd, op.fileScope)) continue;
      return { mission: m.mission, patternId: op.id, hash16: m.hash16, expiresAt: m.expiresAt };
    }
  }
  return null;
}
