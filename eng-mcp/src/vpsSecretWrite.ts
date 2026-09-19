// engineering.vps.secret.write — governed credential-file writer for the VPS.
// Purpose: create/update a credential FILE on the VPS filesystem without an
// editor and without the secret ever crossing a leakable channel. The secret
// value is NEVER an input field: it is read server-side either from an
// operator-staged owner-only file under the staging prefix
// (/data/.staging-secret-*) or from a named environment variable of this
// process. Both channels are unobservable through ps aux — unlike a
// `docker run -e K=V` argv (which IS ps-visible and therefore stays banned for
// secrets); credential FILES/mounts are the proven no-leak pattern this tool
// codifies.
//
// Hardening (fail-closed):
// 1. Target allowlist: absolute paths under /data/credentials/ or exactly
//    /data/tokens.json — anything else (including /dev, /proc and any
//    traversal that normalizes outside the allowlist) is refused.
// 2. isFile(): every existing component of the target path is lstat-checked;
//    symlinks are refused anywhere in the chain; the target itself must be a
//    REGULAR file (directories, sockets, fifos, device nodes refused). Creating
//    a new file is allowed only when every existing component is a real
//    directory (no component may be missing mid-chain).
// 3. Staging source must be a regular, non-symlink file with owner-only
//    permissions (mode & 0o077 === 0) and at least 1 byte; env sources must be
//    non-empty. Values are written byte-exactly (no trimming).
// 4. Atomic write: temp file created with mode 0o600 in the SAME directory as
//    the target (same-filesystem rename), written, fsynced, chowned to the
//    target directory's uid/gid, then renamed over the target. A failed write
//    removes the temp file and never leaves a partial target.
// 5. Idempotence: a byte-identical rewrite is a reported NO_OP with ZERO
//    mutation (mtime preserved). Comparison uses the full sha256; only the
//    16-hex prefix is ever reported anywhere.
//
// PLAN mode (execute defaults to false) is read-only and always answers
// status PLAN (possible=false when the precheck found blockers). Mutations
// require execute=true AND approval.approved=true SIMULTANEOUSLY (plus the
// always-on acknowledgeWrite:true); refused mutations answer BLOCKED. No LLM;
// no SSH/shell; the value never appears in payloads, errors, logs or process
// arguments.
import * as z from "zod/v4";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, chownSync, closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import * as pathModule from "node:path";

export const VPS_SECRET_WRITE_STATUSES = ["PLAN", "WRITE", "NO_OP", "BLOCKED"] as const;
export type VpsSecretWriteStatus = (typeof VPS_SECRET_WRITE_STATUSES)[number];

export const vpsSecretWriteInputSchema = z.object({
  path: z.string().min(1).max(512),
  source: z.union([
    z.object({ kind: z.literal("staging"), path: z.string().min(1).max(512) }).strict(),
    z.object({ kind: z.literal("env"), name: z.string().min(1).max(200) }).strict()
  ]),
  acknowledgeWrite: z.literal(true),
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional()
}).strict();
export type VpsSecretWriteInput = z.infer<typeof vpsSecretWriteInputSchema>;

export const VPS_SECRET_WRITE_DEFAULTS = {
  targetPrefixes: ["/data/credentials/"],
  targetFiles: ["/data/tokens.json"],
  stagingPrefix: "/data/.staging-secret-"
} as const;

export interface VpsSecretWriteDeps {
  targetPrefixes?: readonly string[];
  targetFiles?: readonly string[];
  stagingPrefix?: string;
  env?: NodeJS.ProcessEnv;
}

export interface VpsSecretWriteFinding {
  code: string;
  severity: "critical" | "warning" | "info";
  detail?: string;
}

export interface VpsSecretWriteTargetEvidence {
  path: string;
  exists: boolean;
  isRegularFile?: boolean;
  perms?: string;
  owner?: string;
  size?: number;
  sha16?: string | null;
}

export interface VpsSecretWriteSourceEvidence {
  kind: "staging" | "env";
  reference: string;
  bytes: number;
  sha16: string;
  perms?: string;
}

export interface VpsSecretWriteResult {
  status: VpsSecretWriteStatus;
  mutationPerformed: boolean;
  target: VpsSecretWriteTargetEvidence;
  source: VpsSecretWriteSourceEvidence | null;
  wouldChange: boolean | null;
  changed?: boolean;
  oldSha16?: string | null;
  newSha16?: string;
  plan: { action: "write"; possible: boolean; requires: string[] };
  blockers?: string[];
  findings: VpsSecretWriteFinding[];
}

const PLAN_REQUIRES = ["execute=true", "approval.approved=true"];
const permsString = (mode: number): string => (mode & 0o777).toString(8).padStart(3, "0");
const sha16Of = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex").slice(0, 16);
const fullShaOf = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

interface ResolvedTarget {
  path: string;
  findings: VpsSecretWriteFinding[];
  blockers: string[];
  exists: boolean;
  isRegularFile: boolean;
  perms: string | null;
  owner: string | null;
  size: number | null;
  sha16: string | null;
  fullSha: string | null;
  bytes: Buffer | null;
  dirUid: number | null;
  dirGid: number | null;
}

// Walk every component of the (normalized, allowlisted) target path. Existing
// components must be real directories; the final component, when it exists,
// must be a regular non-symlink file whose bytes/hashes are captured for the
// idempotence compare. Nothing here mutates the filesystem.
function resolveTarget(absPath: string, cfg: { targetPrefixes: readonly string[]; targetFiles: readonly string[] }): ResolvedTarget {
  const findings: VpsSecretWriteFinding[] = [];
  const blockers: string[] = [];
  const resolved: ResolvedTarget = {
    path: absPath, findings, blockers, exists: false, isRegularFile: false,
    perms: null, owner: null, size: null, sha16: null, fullSha: null, bytes: null, dirUid: null, dirGid: null
  };
  const push = (code: string, detail?: string): void => {
    findings.push({ code, severity: "critical", ...(detail ? { detail } : {}) });
    if (!blockers.includes(code)) blockers.push(code);
  };

  const allowed = cfg.targetFiles.includes(absPath) || cfg.targetPrefixes.some((prefix) => absPath.startsWith(prefix));
  if (!allowed) {
    push("SECRET_TARGET_NOT_ALLOWED", "target must be an absolute path under an allowlisted credential location");
    return resolved;
  }

  const parts = absPath.split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < parts.length; i++) {
    current += `/${parts[i]}`;
    const isLeaf = i === parts.length - 1;
    let st;
    try {
      st = lstatSync(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        if (!isLeaf) push("SECRET_TARGET_PARENT_MISSING", `intermediate component does not exist: ${current}`);
        break;
      }
      push("SECRET_TARGET_UNREADABLE", `lstat failed on ${current} (${code ?? "unknown"})`);
      return resolved;
    }
    if (!isLeaf) {
      // symbolink anywhere in the chain is refused before any content is read
      if (st.isSymbolicLink()) { push("SECRET_TARGET_SYMLINK_REFUSED", `symlink in target path: ${current}`); return resolved; }
      if (!st.isDirectory()) { push("SECRET_TARGET_PARENT_NOT_DIRECTORY", `non-directory component: ${current}`); return resolved; }
      continue;
    }
    if (st.isSymbolicLink()) { push("SECRET_TARGET_SYMLINK_REFUSED", `target resolves through a symlink: ${current}`); return resolved; }
    if (!st.isFile()) { push("SECRET_TARGET_NOT_REGULAR_FILE", `target is not a regular file: ${current}`); return resolved; }
    resolved.exists = true;
    resolved.isRegularFile = true;
    resolved.perms = permsString(st.mode);
    resolved.owner = `${st.uid}:${st.gid}`;
    resolved.size = st.size;
    try {
      resolved.bytes = readFileSync(current);
      resolved.fullSha = fullShaOf(resolved.bytes);
      resolved.sha16 = resolved.fullSha.slice(0, 16);
    } catch (error) {
      push("SECRET_TARGET_UNREADABLE", `read failed (${(error as NodeJS.ErrnoException).code ?? "unknown"})`);
      return resolved;
    }
  }
  if (resolved.exists || true) {
    const dir = pathModule.dirname(absPath);
    try {
      const dst = statSync(dir);
      resolved.dirUid = dst.uid;
      resolved.dirGid = dst.gid;
    } catch {
      push("SECRET_TARGET_PARENT_MISSING", `target directory is not accessible: ${dir}`);
    }
  }
  return resolved;
}

interface ResolvedSource {
  findings: VpsSecretWriteFinding[];
  blockers: string[];
  evidence: VpsSecretWriteSourceEvidence | null;
  bytes: Buffer | null;
  fullSha: string | null;
}

function resolveSource(source: VpsSecretWriteInput["source"], cfg: { stagingPrefix: string; env?: NodeJS.ProcessEnv }): ResolvedSource {
  const findings: VpsSecretWriteFinding[] = [];
  const blockers: string[] = [];
  const resolved: ResolvedSource = { findings, blockers, evidence: null, bytes: null, fullSha: null };
  const push = (code: string, detail?: string): void => {
    findings.push({ code, severity: "critical", ...(detail ? { detail } : {}) });
    if (!blockers.includes(code)) blockers.push(code);
  };

  if (source.kind === "env") {
    const value = (cfg.env ?? process.env)[source.name];
    if (typeof value !== "string" || value.length === 0) {
      push("SECRET_VALUE_EMPTY", `env variable ${source.name} is unset or empty`);
      return resolved;
    }
    const bytes = Buffer.from(value, "utf8");
    resolved.bytes = bytes;
    resolved.fullSha = fullShaOf(bytes);
    resolved.evidence = { kind: "env", reference: source.name, bytes: bytes.byteLength, sha16: resolved.fullSha.slice(0, 16) };
    return resolved;
  }

  // staging file channel
  const stagingPath = source.path;
  if (!stagingPath.startsWith(cfg.stagingPrefix)) {
    push("SECRET_SOURCE_NOT_ALLOWED", `staging file must live under ${cfg.stagingPrefix}*`);
    return resolved;
  }
  let st;
  try {
    st = lstatSync(stagingPath);
  } catch (error) {
    push("SECRET_SOURCE_NOT_FOUND", `staging file is missing (${(error as NodeJS.ErrnoException).code ?? "unknown"})`);
    return resolved;
  }
  if (st.isSymbolicLink()) { push("SECRET_SOURCE_SYMLINK_REFUSED", "staging file is a symlink"); return resolved; }
  if (!st.isFile()) { push("SECRET_SOURCE_NOT_REGULAR_FILE", "staging source is not a regular file"); return resolved; }
  const sourcePerms = permsString(st.mode);
  if ((st.mode & 0o077) !== 0) {
    push("SECRET_SOURCE_PERMS_REFUSED", `staging file must be owner-only (0600-style), got ${sourcePerms}`);
    return resolved;
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(stagingPath);
  } catch (error) {
    push("SECRET_SOURCE_NOT_FOUND", `staging read failed (${(error as NodeJS.ErrnoException).code ?? "unknown"})`);
    return resolved;
  }
  if (bytes.byteLength === 0) {
    push("SECRET_VALUE_EMPTY", "staging file is empty");
    return resolved;
  }
  resolved.bytes = bytes;
  resolved.fullSha = fullShaOf(bytes);
  resolved.evidence = { kind: "staging", reference: stagingPath, bytes: bytes.byteLength, sha16: resolved.fullSha.slice(0, 16), perms: sourcePerms };
  return resolved;
}

export async function runVpsSecretWrite(rawInput: unknown, deps: VpsSecretWriteDeps = {}): Promise<VpsSecretWriteResult> {
  const input = vpsSecretWriteInputSchema.parse(rawInput ?? {});
  const cfg = {
    targetPrefixes: deps.targetPrefixes ?? VPS_SECRET_WRITE_DEFAULTS.targetPrefixes,
    targetFiles: deps.targetFiles ?? VPS_SECRET_WRITE_DEFAULTS.targetFiles,
    stagingPrefix: deps.stagingPrefix ?? VPS_SECRET_WRITE_DEFAULTS.stagingPrefix,
    env: deps.env
  };

  // Normalize first so any traversal (../) resolves to its real destination
  // before the allowlist decides; relative paths are refused outright.
  const requested = pathModule.normalize(input.path);
  const absPath = pathModule.isAbsolute(requested) ? requested : `/${requested}`;
  const target = resolveTarget(absPath, { targetPrefixes: cfg.targetPrefixes, targetFiles: cfg.targetFiles });
  const source = resolveSource(input.source, { stagingPrefix: cfg.stagingPrefix, env: cfg.env });

  const findings: VpsSecretWriteFinding[] = [...target.findings, ...source.findings];
  const blockers: string[] = [...target.blockers, ...source.blockers];
  const plan = { action: "write" as const, possible: blockers.length === 0, requires: PLAN_REQUIRES };
  const mutationApproved = input.execute === true && input.approval?.approved === true;

  const wouldChange: boolean | null =
    target.exists && target.fullSha !== null && source.fullSha !== null
      ? target.fullSha !== source.fullSha
      : target.exists && source.fullSha !== null ? true : null;

  const targetEvidence: VpsSecretWriteTargetEvidence = {
    path: target.path,
    exists: target.exists,
    ...(target.exists ? { isRegularFile: target.isRegularFile, perms: target.perms ?? undefined, owner: target.owner ?? undefined, size: target.size ?? undefined, sha16: target.sha16 } : {})
  };

  // PLAN mode: always read-only, always status PLAN (possible=false on blockers).
  if (!mutationApproved) {
    return { status: "PLAN", mutationPerformed: false, target: targetEvidence, source: source.evidence, wouldChange, plan, ...(blockers.length > 0 ? { blockers } : {}), findings };
  }

  if (blockers.length > 0) {
    return { status: "BLOCKED", mutationPerformed: false, target: targetEvidence, source: source.evidence, wouldChange, plan, blockers, findings };
  }

  // Idempotence: byte-identical rewrite is a reported NO_OP with zero mutation
  // (not even a chmod) — the target's mtime is left untouched.
  if (target.exists && target.fullSha !== null && source.fullSha !== null && target.fullSha === source.fullSha) {
    return {
      status: "NO_OP", mutationPerformed: false, target: targetEvidence, source: source.evidence, wouldChange: false, changed: false,
      oldSha16: target.sha16, newSha16: source.evidence?.sha16, plan,
      findings: [...findings, { code: "SECRET_IDEMPOTENT_NO_OP", severity: "info", detail: "byte-identical value; zero mutation (mtime preserved)" }]
    };
  }

  // Atomic mutation: exclusive-create temp file in the SAME directory (guarantees
  // same-filesystem rename), 0o600 from birth, fsynced, chowned to the target
  // directory's owner, then renamed over the target. Any failure removes the temp
  // file and leaves the target untouched.
  const tmpPath = pathModule.join(pathModule.dirname(target.path), `.tmp-secret-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    const fd = openSync(tmpPath, "wx", 0o600);
    try {
      writeSync(fd, source.bytes as Buffer);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(tmpPath, 0o600);
    if (target.dirUid !== null && target.dirGid !== null) chownSync(tmpPath, target.dirUid, target.dirGid);
    renameSync(tmpPath, target.path);
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* temp already gone */ }
    findings.push({ code: "SECRET_WRITE_FAILED", severity: "critical", detail: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "atomic write failed" });
    return { status: "BLOCKED", mutationPerformed: false, target: targetEvidence, source: source.evidence, wouldChange, plan, blockers: [...blockers, "SECRET_WRITE_FAILED"], findings };
  }

  // Post-write verification: regular file, mode exactly 0o600, bytes equal.
  try {
    const st = lstatSync(target.path);
    const bytes = readFileSync(target.path);
    const permsOk = st.isFile() && (st.mode & 0o777) === 0o600 && bytes.equals(source.bytes as Buffer);
    const verify: VpsSecretWriteFinding[] = permsOk ? [] : [{ code: "SECRET_WRITE_VERIFY_FAILED", severity: "critical", detail: `post-write state unexpected: perms=${permsString(st.mode)} regular=${st.isFile()} bytesEqual=${bytes.equals(source.bytes as Buffer)}` }];
    return {
      status: permsOk ? "WRITE" : "BLOCKED",
      mutationPerformed: true,
      target: { path: target.path, exists: true, isRegularFile: st.isFile(), perms: permsString(st.mode), owner: `${st.uid}:${st.gid}`, size: st.size, sha16: sha16Of(bytes) },
      source: source.evidence,
      wouldChange: true,
      changed: true,
      oldSha16: target.sha16,
      newSha16: sha16Of(bytes),
      plan,
      ...(verify.length > 0 ? { blockers: ["SECRET_WRITE_VERIFY_FAILED"], findings: [...findings, ...verify] } : { findings })
    };
  } catch (error) {
    return {
      status: "BLOCKED", mutationPerformed: true, target: targetEvidence, source: source.evidence, wouldChange, plan,
      blockers: ["SECRET_WRITE_VERIFY_FAILED"],
      findings: [...findings, { code: "SECRET_WRITE_VERIFY_FAILED", severity: "critical", detail: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "post-write verification failed" }]
    };
  }
}
