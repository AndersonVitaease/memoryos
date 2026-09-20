// REGISTRY-GRANT-01: engineering.registry.scope.grant — governed, GRANT-ONLY scope
// edit of the token registry (the anchor of trust; /data/tokens.json in production),
// ending manual JSON edits by the operator. The registry is only read ONCE at boot by
// loadOperationalConfig, so every mutation here must go through a governed, audited,
// atomic path instead of an SSH editor — this module is that path (mirrors
// engineering.vps.secret.write and the REGISTRY-EDIT-01 host discipline):
//
// 1. PLAN/execute/approval: a call without execute=true AND approval.approved=true
//    returns the EXACT diff of the affected entry (scopesBefore -> scopesAfter, entry
//    index, registry sha16 before/after, planned backup path) with ZERO mutation.
// 2. Grant-only by construction: requested scopes are APPENDED, never removed; the
//    writer replaces ONLY the scopes array of the matched entry — tokenHash,
//    expiresAt, revokedAt and every other entry are structurally unreachable.
// 3. One entry per call; the subject must exist and be UNAMBIGUOUS (duplicate
//    subjects in the registry are refused, never merged or guessed).
// 4. Self-grant refusal: the caller can never grant to its own identity — both the
//    caller subject string and the caller's own tokenHash16 are compared, so even a
//    differently-named registry entry holding the caller's bearer is refused.
// 5. Scope validity: every requested scope must exist in the scope catalog
//    (KNOWN_REGISTRY_SCOPES). The drift-guard test in test/registryScopeGrant.test.ts
//    scans the scope gates of src/tools.ts and fails if the catalog ever diverges.
// 6. Idempotence: requesting only already-present scopes is a NO_OP with zero writes
//    (no backup, no rewrite), reported and audited.
// 7. Atomic mutation (fail-closed at every step): the planned bytes are parsed and
//    validated with the SAME rules the boot loader enforces BEFORE anything touches
//    the disk; an automatic backup tokens.json.bak-registry-grant-<timestamp> is
//    written first (same-directory temp + fsync + rename, 0600); the new registry is
//    written through a same-directory temp (0600, source mode/chown preserved) and a
//    TOCTOU drift re-check immediately BEFORE the rename refuses if the file changed
//    underneath; after the rename the file is revalidated (parse + boot rules + entry
//    landed as planned + every other entry unchanged) and ANY post-rename failure
//    restores the backup bytes and reports status RESTORED.
// 8. Audit: one JSONL line per terminal outcome in /data/audit/registry-grant.jsonl
//    (target subject, scopes, authorizer subject + sha16, registry sha16s, backup
//    path, result). No token VALUE can ever appear: the tool only ever sees hashes —
//    the caller's sha16 arrives through the authenticated subject, and registry
//    entries hold tokenHash digests, never bearers.
//
// NOTE (activation): the :8787 server reads the registry ONCE at boot — a grant takes
// effect on the NEXT container boot only. The reload is one engineering.release.pipeline
// deploy: a declared, separate step, reported in every result's `activation`.

import { appendFileSync, chmodSync, chownSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import * as z from "zod/v4";
import { EngineeringError, type TokenRecord } from "./policy.ts";

export const REGISTRY_SCOPE_GRANT_AUDIT_FILE_DEFAULT = "/data/audit/registry-grant.jsonl";

// The single scope catalog. Every scope a bearer can hold is listed here; the grant
// tool refuses requested scopes outside it. The drift-guard test keeps this list in
// lockstep with the scope gates of src/tools.ts (and the registry's own history).
export const KNOWN_REGISTRY_SCOPES: readonly string[] = [
  "engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release",
  "engineering:distribution:publish", "engineering:notify:hermes",
  "engineering:github:read", "engineering:git:push", "engineering:git:fetch", "engineering:git:merge",
  "engineering:vps:application:redeploy", "engineering:vps:runner:restart", "engineering:vps:diagnostics:read",
  "engineering:vps:container:probe", "engineering:vps:secret:write", "engineering:vps:systemd:credential",
  "engineering:registry:scope:grant"
];

const REGISTRY_BYTES_LIMIT = 2 * 1024 * 1024;
const TARGET_SCOPES_LIMIT = 32;

export const registryScopeGrantInputSchema = z.object({
  subject: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1).max(128)).min(1).max(16),
  justification: z.string().min(1).max(500),
  acknowledgeGrant: z.literal(true),
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional()
}).strict();

export interface RegistryScopeGrantDeps {
  registryFile?: string | null;
  auditFile?: string | null;
  callerSubject?: string | null;
  authorizerHash16?: string | null;
  now?: () => Date;
  readBytes?: (path: string) => Buffer;
  writeBytes?: (path: string, bytes: Buffer, mode: number) => void;
}

export type RegistryScopeGrantStatus = "PLAN" | "GRANTED" | "NO_OP" | "BLOCKED" | "RESTORED";

const ACTIVATION_NOTE = {
  registryReload: "the :8787 server reads the token registry ONCE at boot (loadOperationalConfig); a runner restart does NOT reload it",
  reloadPath: "one engineering.release.pipeline deploy reboots the container and reloads the registry (declared, separate step)",
  effectiveImmediately: false
} as const;

export interface RegistryScopeGrantResult {
  tool: "engineering.registry.scope.grant";
  status: RegistryScopeGrantStatus;
  mutationPerformed: boolean;
  changed: boolean;
  subject: string;
  scopes: string[];
  justification: string;
  entryIndex: number | null;
  scopesBefore?: string[];
  scopesAdded?: string[];
  scopesAfter?: string[];
  registrySha16Before?: string;
  registrySha16After?: string;
  backupPath?: string;
  blockers: string[];
  findings: string[];
  code?: string;
  detail?: string;
  restored?: boolean;
  audit?: string;
  activation: typeof ACTIVATION_NOTE;
  requires?: string[];
}

const sha256hex = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const sha16 = (bytes: Buffer): string => sha256hex(bytes).slice(0, 16);

// Boot-grade registry validation, shared with loadOperationalConfig (single source of
// truth): a file written here is guaranteed to boot. Throws EngineeringError with the
// boot code so main.ts keeps its exact historical failure signature.
export function validateTokenRegistry(tokens: unknown): TokenRecord[] {
  if (!Array.isArray(tokens) || tokens.length === 0) throw new EngineeringError("ENG_MCP_TOKEN_REGISTRY_INVALID", "tokens must be a non-empty array");
  for (const candidate of tokens) {
    const token = candidate as Partial<TokenRecord>;
    if (typeof token.tokenHash !== "string" || !/^[a-f0-9]{64}$/i.test(token.tokenHash) || typeof token.subject !== "string" || !Array.isArray(token.scopes) || !Array.isArray(token.allowedRepositoryIds) || !Number.isFinite(Date.parse(token.expiresAt ?? ""))) {
      throw new EngineeringError("ENG_MCP_TOKEN_REGISTRY_INVALID", "token record fails the boot validation rules");
    }
  }
  return tokens as TokenRecord[];
}

function atomicWrite(file: string, bytes: Buffer, mode: number): void {
  const tmp = `${file}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    const fd = openSync(tmp, "wx", mode);
    try { writeSyncAll(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, file);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw error;
  }
}

function writeSyncAll(fd: number, bytes: Buffer): void {
  let written = 0;
  while (written < bytes.length) written += writeSync(fd, bytes.subarray(written));
}

function toStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function writeAudit(deps: RegistryScopeGrantDeps, entry: Record<string, unknown>): string {
  const file = deps.auditFile ?? process.env.REGISTRY_GRANT_AUDIT_FILE ?? REGISTRY_SCOPE_GRANT_AUDIT_FILE_DEFAULT;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

function parseRegistryBytes(bytes: Buffer): { tokens: TokenRecord[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch (error) {
    throw new EngineeringError("REGISTRY_JSON_INVALID", `registry is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const tokens = (parsed as { tokens?: unknown } | null)?.tokens;
  try { return { tokens: validateTokenRegistry(tokens) }; } catch (error) {
    if (error instanceof EngineeringError && error.code === "ENG_MCP_TOKEN_REGISTRY_INVALID") throw new EngineeringError("REGISTRY_RECORD_INVALID", "registry records fail the boot validation rules");
    throw error;
  }
}

export async function runRegistryScopeGrant(rawInput: unknown, deps: RegistryScopeGrantDeps = {}): Promise<RegistryScopeGrantResult> {
  const parsed = registryScopeGrantInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new EngineeringError("REGISTRY_GRANT_INPUT_INVALID", `input fails the strict schema: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const input = parsed.data;

  if (new Set(input.scopes).size !== input.scopes.length) throw new EngineeringError("REGISTRY_GRANT_INPUT_INVALID", "duplicate scopes in the request");
  const unknownScopes = input.scopes.filter((scope) => !KNOWN_REGISTRY_SCOPES.includes(scope));
  const blockers: string[] = [];
  const findings: string[] = [];

  const blocked = (code: string, detail: string, extra?: Partial<RegistryScopeGrantResult>): RegistryScopeGrantResult => {
    blockers.push(code);
    return { tool: "engineering.registry.scope.grant", status: "BLOCKED", mutationPerformed: false, changed: false, subject: input.subject, scopes: input.scopes, justification: input.justification.slice(0, 300), entryIndex: null, blockers, findings, code, detail, activation: ACTIVATION_NOTE, ...extra };
  };

  // Identity guards run BEFORE any registry read: the caller can never target itself,
  // and only catalog-valid scopes are ever considered.
  if (deps.callerSubject != null && deps.callerSubject === input.subject) {
    const audit = writeAudit(deps, { result: "refused-self", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, code: "REGISTRY_SELF_GRANT_REFUSED" });
    return blocked("REGISTRY_SELF_GRANT_REFUSED", "granting to the calling identity itself is refused — the operator grants scopes to the operator channel outside this tool", { audit });
  }
  if (unknownScopes.length > 0) {
    const audit = writeAudit(deps, { result: "refused-scope", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, code: "REGISTRY_SCOPE_UNKNOWN" });
    return blocked("REGISTRY_SCOPE_UNKNOWN", `scopes not in the catalog: ${unknownScopes.join(", ")}`, { audit });
  }

  const registryFile = deps.registryFile ?? process.env.ENG_MCP_TOKEN_REGISTRY_FILE ?? null;
  if (!registryFile) return blocked("REGISTRY_FILE_MISSING", "no registry file: pass deps.registryFile or set ENG_MCP_TOKEN_REGISTRY_FILE");

  const readReg = (path: string): Buffer => (deps.readBytes ? deps.readBytes(path) : readFileSync(path));
  const writeOut = (path: string, bytes: Buffer, mode: number): void => {
    if (deps.writeBytes) { deps.writeBytes(path, bytes, mode); return; }
    atomicWrite(path, bytes, mode);
  };

  let beforeBytes: Buffer;
  try { beforeBytes = readReg(registryFile); } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return blocked("REGISTRY_FILE_MISSING", `registry file not found: ${registryFile}`);
    return blocked("REGISTRY_READ_FAILED", `registry unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (beforeBytes.length > REGISTRY_BYTES_LIMIT) return blocked("REGISTRY_TOO_LARGE", `registry exceeds ${REGISTRY_BYTES_LIMIT} bytes`);

  let beforeRegistry: { tokens: TokenRecord[] };
  try { beforeRegistry = parseRegistryBytes(beforeBytes); } catch (error) {
    return blocked(error instanceof EngineeringError ? error.code : "REGISTRY_JSON_INVALID", error instanceof Error ? error.message : String(error));
  }

  const matches = beforeRegistry.tokens.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.subject === input.subject);
  if (matches.length === 0) {
    const audit = writeAudit(deps, { result: "refused-subject", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, code: "REGISTRY_SUBJECT_NOT_FOUND" });
    return blocked("REGISTRY_SUBJECT_NOT_FOUND", `no registry entry with subject "${input.subject}"`, { audit });
  }
  if (matches.length > 1) {
    const audit = writeAudit(deps, { result: "refused-subject", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, code: "REGISTRY_SUBJECT_AMBIGUOUS" });
    return blocked("REGISTRY_SUBJECT_AMBIGUOUS", `${matches.length} entries share subject "${input.subject}" — one entry per call; disambiguate the registry first`, { audit });
  }
  const target = matches[0]!;
  // The real self-grant guarantee: even an entry with a DIFFERENT subject holding the
  // caller's own bearer is refused.
  if (deps.authorizerHash16 != null && target.entry.tokenHash.slice(0, 16) === deps.authorizerHash16) {
    const audit = writeAudit(deps, { result: "refused-self", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, code: "REGISTRY_SELF_GRANT_REFUSED" });
    return blocked("REGISTRY_SELF_GRANT_REFUSED", "the target entry holds the caller's own bearer (tokenHash16 match)", { audit });
  }

  const entry = target.entry;
  const scopesBefore = [...entry.scopes];
  const scopesAdded = input.scopes.filter((scope) => !entry.scopes.includes(scope));
  const registrySha16Before = sha16(beforeBytes);

  if (scopesAdded.length === 0) {
    const audit = writeAudit(deps, { result: "noop", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code: "REGISTRY_GRANT_NO_OP" });
    return { tool: "engineering.registry.scope.grant", status: "NO_OP", mutationPerformed: false, changed: false, subject: input.subject, scopes: input.scopes, justification: input.justification.slice(0, 300), entryIndex: target.index, scopesBefore, scopesAdded: [], scopesAfter: scopesBefore, registrySha16Before, registrySha16After: registrySha16Before, blockers, findings, code: "REGISTRY_GRANT_NO_OP", detail: "every requested scope is already present — zero writes, no backup", audit, activation: ACTIVATION_NOTE };
  }

  const scopesAfter = [...entry.scopes, ...scopesAdded];
  if (scopesAfter.length > TARGET_SCOPES_LIMIT) return blocked("REGISTRY_SCOPE_LIMIT", `target would hold ${scopesAfter.length} scopes (limit ${TARGET_SCOPES_LIMIT})`);

  const nowDate = deps.now ? deps.now() : new Date();
  if (entry.revokedAt) findings.push("TARGET_TOKEN_REVOKED: the token can never authenticate — the grant is stored but inert");
  else if (Date.parse(entry.expiresAt) <= nowDate.getTime()) findings.push("TARGET_TOKEN_EXPIRED: the token can never authenticate — the grant is stored but inert");

  const newRegistry = { tokens: beforeRegistry.tokens.map((candidate, candidateIndex) => candidateIndex === target.index ? { ...candidate, scopes: scopesAfter } : candidate) };
  const newBytes = Buffer.from(JSON.stringify(newRegistry, null, 2) + "\n", "utf8");
  const registrySha16After = sha16(newBytes);

  const mutationApproved = input.execute === true && input.approval?.approved === true;
  if (!mutationApproved) {
    return { tool: "engineering.registry.scope.grant", status: "PLAN", mutationPerformed: false, changed: false, subject: input.subject, scopes: input.scopes, justification: input.justification.slice(0, 300), entryIndex: target.index, scopesBefore, scopesAdded, scopesAfter, registrySha16Before, registrySha16After: sha16(newBytes), blockers, findings, activation: ACTIVATION_NOTE, requires: ["execute=true", "approval.approved=true", "acknowledgeGrant=true"] };
  }

  // Pre-write validation of the PLANNED bytes: nothing invalid ever reaches the disk.
  try { parseRegistryBytes(newBytes); } catch (error) {
    return blocked(error instanceof EngineeringError ? error.code : "REGISTRY_JSON_INVALID", `planned bytes fail validation (nothing written): ${error instanceof Error ? error.message : String(error)}`);
  }

  const backupPath = `${registryFile}.bak-registry-grant-${toStamp(nowDate)}`;
  try { writeOut(backupPath, beforeBytes, 0o600); } catch (error) {
    const audit = writeAudit(deps, { result: "failed", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code: "REGISTRY_BACKUP_FAILED" });
    return blocked("REGISTRY_BACKUP_FAILED", `backup write failed, registry untouched: ${error instanceof Error ? error.message : String(error)}`, { audit });
  }

  const tmpPath = `${registryFile}.tmp-registry-grant-${toStamp(nowDate)}-${randomBytes(4).toString("hex")}`;
  let renamed = false;
  try {
    writeOut(tmpPath, newBytes, 0o600);
    // TOCTOU drift check: the registry must still be the bytes PLAN saw, right before
    // the rename.
    const currentBytes = readReg(registryFile);
    if (sha256hex(currentBytes) !== sha256hex(beforeBytes)) throw new EngineeringError("REGISTRY_DRIFT_DETECTED", "the registry changed underneath since PLAN — refusing to overwrite");
    const beforeStat = statSync(registryFile);
    try { chmodSync(tmpPath, 0o600); } catch { /* best effort */ }
    try { chownSync(tmpPath, beforeStat.uid, beforeStat.gid); } catch { /* best effort */ }
    renameSync(tmpPath, registryFile);
    renamed = true;
    // Post-write revalidation: bytes, parse, boot rules, the target landed, and every
    // other entry byte-identical.
    const afterBytes = readReg(registryFile);
    if (sha256hex(afterBytes) !== sha256hex(newBytes)) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "bytes on disk differ from the planned bytes");
    const afterRegistry = parseRegistryBytes(afterBytes);
    const afterEntry = afterRegistry.tokens[target.index];
    if (!afterEntry || afterEntry.subject !== input.subject || JSON.stringify(afterEntry.scopes) !== JSON.stringify(scopesAfter)) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "the target entry did not land as planned");
    const othersBefore = JSON.stringify(beforeRegistry.tokens.filter((_, index) => index !== target.index));
    const othersAfter = JSON.stringify(afterRegistry.tokens.filter((_, index) => index !== target.index));
    if (othersBefore !== othersAfter) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "unrelated entries changed");
    const audit = writeAudit(deps, { result: "granted", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, justification: input.justification.slice(0, 200), registrySha16Before, registrySha16After: sha16(newBytes), backupPath });
    return { tool: "engineering.registry.scope.grant", status: "GRANTED", mutationPerformed: true, changed: true, subject: input.subject, scopes: input.scopes, justification: input.justification.slice(0, 300), entryIndex: target.index, scopesBefore, scopesAdded, scopesAfter, registrySha16Before, registrySha16After: sha16(newBytes), backupPath, blockers, findings, audit, activation: ACTIVATION_NOTE };
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* already gone */ }
    const code = error instanceof EngineeringError ? error.code : "REGISTRY_WRITE_FAILED";
    const detail = error instanceof Error ? error.message : String(error);
    if (!renamed) {
      // The registry was never touched: no restore needed (and restoring would clobber
      // a concurrent writer). The backup stays as evidence.
      const audit = writeAudit(deps, { result: "failed", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code, backupPath });
      return blocked(code, `failed before rename, registry untouched: ${detail}`, { backupPath, audit });
    }
    // RESTORE from the backup and verify byte-equality with PLAN's baseline.
    let restored = false;
    let restoreDetail = "";
    try {
      const backupBytes = readReg(backupPath);
      writeOut(registryFile, backupBytes, 0o600);
      restored = sha16(readReg(registryFile)) === registrySha16Before;
    } catch (restoreError) { restoreDetail = restoreError instanceof Error ? restoreError.message : String(restoreError); }
    const audit = writeAudit(deps, { result: restored ? "restored" : "restore-failed", targetSubject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code, backupPath });
    if (!restored) {
      findings.push(`RESTORE_FAILED: ${restoreDetail || "unknown"} — MANUAL RECOVERY REQUIRED from ${backupPath}`);
      return { tool: "engineering.registry.scope.grant", status: "BLOCKED", mutationPerformed: true, changed: true, subject: input.subject, scopes: input.scopes, justification: input.justification.slice(0, 300), entryIndex: target.index, scopesBefore, registrySha16Before, backupPath, blockers, findings, code: "REGISTRY_RESTORE_FAILED", detail: `post-write failure (${code}: ${detail}) and the restore from ${backupPath} also failed: ${restoreDetail}`, audit, activation: ACTIVATION_NOTE };
    }
    return { tool: "engineering.registry.scope.grant", status: "RESTORED", mutationPerformed: false, changed: false, subject: input.subject, scopes: input.scopes, justification: input.justification.slice(0, 300), entryIndex: target.index, scopesBefore, scopesAdded, scopesAfter, registrySha16Before, registrySha16After: registrySha16Before, backupPath, blockers, findings, code, detail: `post-write failure restored from backup: ${detail}`, restored: true, audit, activation: ACTIVATION_NOTE };
  }
}