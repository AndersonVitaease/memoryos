// REGISTRY-LIFECYCLE-01 — engineering.registry.entry.create / .revoke
//
// Governed lifecycle for token registry entries, composed from the certified
// pieces untouched: the boot-grade validator (validateTokenRegistry, shared
// with loadOperationalConfig), the atomic mutation discipline of
// engineering.registry.scope.grant (PLAN -> backup 0600 -> tmp+fsync+rename ->
// TOCTOU re-check -> postvalidation -> RESTORED on post-failure) and the
// credential-file mechanics of engineering.vps.secret.write (0600, atomic,
// allowlisted path, no secret in any observable channel).
//
// invariants (both tools):
// 1. PLAN is a read-only exact preview. For create it carries everything EXCEPT
//    the credential value: subject, scopes, allowedRepositoryIds, expiry,
//    append position, predicted tokenHash16 and the credential file path.
// 2. credentialValue enters ONCE as the call input and NEVER appears in any
//    output field, audit line or error message — sha256 16-hex prefixes only.
//    A justification that embeds the value is redacted before it is echoed.
// 3. Guards: EVERY creation requires an operator-* authorizer (generalized
//    OPERATOR-PAIR-01); an operator-* target additionally requires the
//    authorizer's hash16 to match an EXISTING operator-* registry entry (the
//    A/B pair). Revocation refuses self-revocation by subject AND by hash16
//    (the authenticating entry of the current call), and an operator-* victim
//    requires an operator-* authorizer distinct from the victim.
// 4. Execution is atomic and self-verifying: planned bytes pass the SAME boot
//    validator before anything touches the disk; automatic backup
//    tokens.json.bak-registry-entry-<op>-<timestamp> (0600); same-directory
//    temp + fsync + rename with source mode/owner preserved; TOCTOU drift
//    re-check immediately before the rename; postvalidation proves the entry
//    landed and every other entry is byte-identical; ANY post-rename failure
//    restores the backup bytes and reports RESTORED.
// 5. The create path writes the 0600 credential file under
//    /data/credentials/<subject> atomically and verifies file-sha16 ==
//    registry tokenHash16 (the operator-2026-09-20 pattern). The revoke path
//    neutralizes that file (regular files only; symlinks are reported, never
//    followed) AFTER the registry mutation is proven.
// 6. Zero LLM; no shell; audit at /data/audit/registry-lifecycle.jsonl carries
//    hashes and subject names only. NOTE: the :8787 server reads the registry
//    ONCE at boot — the change takes effect on the next container boot (one
//    engineering.release.pipeline deploy reload), a declared separate step.
import * as z from "zod/v4";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, chownSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import * as pathModule from "node:path";
import { EngineeringError, type TokenRecord } from "./policy.ts";
import { KNOWN_REGISTRY_SCOPES, isOperatorSubject, validateTokenRegistry } from "./registryScopeGrant.ts";

export const REGISTRY_LIFECYCLE_AUDIT_FILE_DEFAULT = "/data/audit/registry-lifecycle.jsonl";
export const REGISTRY_LIFECYCLE_CREDENTIAL_DIR_DEFAULT = "/data/credentials";
const REGISTRY_BYTES_LIMIT = 2 * 1024 * 1024;
const TARGET_SCOPES_LIMIT = 32;
const ACTIVATION_NOTE_ENTRY = "the :8787 server reads the registry ONCE at boot — the change takes effect on the next container boot (one engineering.release.pipeline deploy reload), a declared separate step";
const ACTIVATION = { effectiveImmediately: false, note: ACTIVATION_NOTE_ENTRY };

export const registryEntryCreateInputSchema = z.object({
  subject: z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase letters, digits and dashes, starting and ending alphanumeric"),
  credentialValue: z.string().min(24).max(512),
  scopes: z.array(z.string().min(1).max(128)).min(1).max(16),
  allowedRepositoryIds: z.array(z.string().min(1).max(64)).min(1).max(4),
  expiresAt: z.string().min(10).max(40),
  justification: z.string().min(3).max(500),
  acknowledgeCreate: z.literal(true),
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional()
}).strict();
export type RegistryEntryCreateInput = z.infer<typeof registryEntryCreateInputSchema>;

export const registryEntryRevokeInputSchema = z.object({
  subject: z.string().min(3).max(64),
  reason: z.string().min(3).max(500),
  acknowledgeRevoke: z.literal(true),
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional()
}).strict();
export type RegistryEntryRevokeInput = z.infer<typeof registryEntryRevokeInputSchema>;

export interface RegistryEntryLifecycleDeps {
  registryFile?: string;
  auditFile?: string;
  credentialDir?: string;
  callerSubject?: string | null;
  authorizerHash16?: string | null;
  now?: () => Date;
  readBytes?: (path: string) => Buffer;
  writeBytes?: (path: string, bytes: Buffer, mode: number) => void;
  removeFile?: (path: string) => void;
}

export interface RegistryEntryCreateResult {
  tool: "engineering.registry.entry.create";
  status: "PLAN" | "CREATED" | "BLOCKED" | "RESTORED";
  mutationPerformed: boolean;
  changed: boolean;
  subject: string;
  scopes: string[];
  allowedRepositoryIds: string[];
  expiresAt: string;
  justification: string;
  entryIndex: number | null;
  tokenHash16: string;
  credentialPath: string;
  credentialFileExisted: boolean | null;
  credentialFileWritten: boolean | null;
  credentialSha16: string;
  registrySha16Before: string;
  registrySha16After: string;
  blockers: string[];
  findings: string[];
  code?: string;
  detail?: string;
  backupPath?: string;
  restored?: boolean;
  audit?: string | null;
  requires?: string[];
  activation: { effectiveImmediately: boolean; note: string };
}

export interface RegistryEntryRevokeResult {
  tool: "engineering.registry.entry.revoke";
  status: "PLAN" | "REVOKED" | "NO_OP" | "BLOCKED" | "RESTORED";
  mutationPerformed: boolean;
  changed: boolean;
  subject: string;
  reason: string;
  entryIndex: number | null;
  revokedAtPlanned: string | null;
  revokedAt: string | null;
  tokenHash16: string | null;
  scopesBefore: string[] | null;
  registrySha16Before: string;
  registrySha16After: string;
  credentialPath: string;
  credentialFileExisted: boolean | null;
  credentialFileRemoved: boolean | null;
  blockers: string[];
  findings: string[];
  code?: string;
  detail?: string;
  backupPath?: string;
  restored?: boolean;
  audit?: string | null;
  requires?: string[];
  activation: { effectiveImmediately: boolean; note: string };
}

const sha256hex = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const sha16 = (bytes: Buffer): string => sha256hex(bytes).slice(0, 16);
const sha16OfText = (text: string): string => sha16(Buffer.from(text, "utf8"));
const toStamp = (date: Date): string => date.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");

function writeAudit(deps: RegistryEntryLifecycleDeps, entry: Record<string, unknown>): string | null {
  const auditFile = deps.auditFile ?? process.env.ENG_MCP_REGISTRY_LIFECYCLE_AUDIT_FILE ?? REGISTRY_LIFECYCLE_AUDIT_FILE_DEFAULT;
  try {
    mkdirSync(pathModule.dirname(auditFile), { recursive: true });
    appendFileSync(auditFile, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", { mode: 0o600 });
    return auditFile;
  } catch { return null; }
}

function atomicWrite(file: string, bytes: Buffer, mode: number): void {
  const tmp = `${file}.tmp-${randomBytes(4).toString("hex")}`;
  let fd = -1;
  try {
    fd = openSync(tmp, "w", mode);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally { if (fd >= 0) closeSync(fd); }
  try { renameSync(tmp, file); } catch (error) { try { unlinkSync(tmp); } catch { /* already gone */ } throw error; }
}

function parseRegistryBytes(bytes: Buffer): { tokens: TokenRecord[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new EngineeringError("REGISTRY_JSON_INVALID", "registry is not valid JSON"); }
  const tokens = (parsed as { tokens?: unknown } | null)?.tokens;
  try { return { tokens: validateTokenRegistry(tokens) }; } catch (error) {
    if (error instanceof EngineeringError && error.code === "ENG_MCP_TOKEN_REGISTRY_INVALID") throw new EngineeringError("REGISTRY_RECORD_INVALID", "registry records fail the boot validation rules");
    throw error;
  }
}

// A justification is caller-controlled free text; redact the credential value
// from it before it can reach an output or an audit line (defense in depth —
// the operator controls the field, the tool guarantees the invariant).
function redactJustification(justification: string, credentialValue: string): string {
  const safe = justification.includes(credentialValue) ? justification.split(credentialValue).join("[REDACTED]") : justification;
  return safe.slice(0, 300);
}

interface ReadReg { (path: string): Buffer }
interface WriteOut { (path: string, bytes: Buffer, mode: number): void }

function makeIo(deps: RegistryEntryLifecycleDeps): { readReg: ReadReg; writeOut: WriteOut } {
  const readReg: ReadReg = (path) => (deps.readBytes ? deps.readBytes(path) : readFileSync(path));
  const writeOut: WriteOut = (path, bytes, mode) => { if (deps.writeBytes) { deps.writeBytes(path, bytes, mode); return; } atomicWrite(path, bytes, mode); };
  return { readReg, writeOut };
}

// vps.secret.write mechanics for the credential file: regular files only,
// symlinks refused, byte-exact NO_OP on an identical rewrite, atomic
// same-directory temp + fsync + rename with the directory's owner preserved.
function credentialFileState(path: string, readReg: ReadReg): { existed: boolean; bytes: Buffer | null } {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink() || !st.isFile()) throw new EngineeringError("REGISTRY_CREDENTIAL_FILE_CONFLICT", "credential path exists and is not a regular file (symlinks and special files refused)");
    return { existed: true, bytes: readReg(path) };
  } catch (error) {
    if (error instanceof EngineeringError) throw error;
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { existed: false, bytes: null };
    throw error;
  }
}

function writeCredentialFile(path: string, bytes: Buffer, readReg: ReadReg, writeOut: WriteOut): { existed: boolean; written: boolean } {
  const state = credentialFileState(path, readReg);
  if (state.existed && state.bytes && state.bytes.equals(bytes)) return { existed: true, written: false };
  if (state.existed) throw new EngineeringError("REGISTRY_CREDENTIAL_FILE_CONFLICT", "pre-existing credential file holds different bytes — reconcile it outside this tool first");
  try {
    mkdirSync(pathModule.dirname(path), { recursive: true });
    const dirStat = statSync(pathModule.dirname(path));
    writeOut(path, bytes, 0o600);
    try { chmodSync(path, 0o600); } catch { /* best effort */ }
    try { chownSync(path, dirStat.uid, dirStat.gid); } catch { /* best effort */ }
  } catch (error) {
    if (error instanceof EngineeringError) throw error;
    throw new EngineeringError("REGISTRY_CREDENTIAL_WRITE_FAILED", `credential file write failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { existed: false, written: true };
}

function resolveRegistryFile(deps: RegistryEntryLifecycleDeps): string | null {
  return deps.registryFile ?? process.env.ENG_MCP_TOKEN_REGISTRY_FILE ?? null;
}

function readRegistryOrBlock(registryFile: string, readReg: ReadReg): { bytes: Buffer; registry: { tokens: TokenRecord[] } } | { blocked: RegistryEntryCreateResult["code"] & string; detail: string } {
  let bytes: Buffer;
  try { bytes = readReg(registryFile); } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { blocked: "REGISTRY_FILE_MISSING", detail: `registry file not found: ${registryFile}` };
    return { blocked: "REGISTRY_READ_FAILED", detail: `registry unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (bytes.length > REGISTRY_BYTES_LIMIT) return { blocked: "REGISTRY_TOO_LARGE", detail: `registry exceeds ${REGISTRY_BYTES_LIMIT} bytes` };
  try { return { bytes, registry: parseRegistryBytes(bytes) }; } catch (error) {
    return { blocked: error instanceof EngineeringError ? error.code : "REGISTRY_JSON_INVALID", detail: error instanceof Error ? error.message : String(error) };
  }
}

// ---------------------------------------------------------------------------
// engineering.registry.entry.create
// ---------------------------------------------------------------------------

export async function runRegistryEntryCreate(rawInput: unknown, deps: RegistryEntryLifecycleDeps = {}): Promise<RegistryEntryCreateResult> {
  const parsed = registryEntryCreateInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new EngineeringError("REGISTRY_ENTRY_CREATE_INPUT_INVALID", `input fails the strict schema: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const input = parsed.data;

  if (new Set(input.scopes).size !== input.scopes.length) throw new EngineeringError("REGISTRY_ENTRY_CREATE_INPUT_INVALID", "duplicate scopes in the request");
  if (/\s/.test(input.credentialValue)) throw new EngineeringError("REGISTRY_CREDENTIAL_VALUE_INVALID", "the credential must be a single whitespace-free string of 24-512 characters");
  const expiresMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresMs)) throw new EngineeringError("REGISTRY_EXPIRY_INVALID", "expiresAt is not a parseable ISO timestamp");
  if (expiresMs <= (deps.now ? deps.now() : new Date()).getTime()) throw new EngineeringError("REGISTRY_EXPIRY_INVALID", "expiresAt must be in the future");

  const blockers: string[] = [];
  const findings: string[] = [];
  const credentialValueBytes = Buffer.from(input.credentialValue, "utf8");
  const tokenHash = sha256hex(credentialValueBytes);
  const tokenHash16 = tokenHash.slice(0, 16);
  const justificationSafe = redactJustification(input.justification, input.credentialValue);
  const credentialDir = deps.credentialDir ?? REGISTRY_LIFECYCLE_CREDENTIAL_DIR_DEFAULT;
  const credentialPath = `${credentialDir}/${input.subject}`;

  const blocked = (code: string, detail: string, extra?: Partial<RegistryEntryCreateResult>): RegistryEntryCreateResult => {
    blockers.push(code);
    return { tool: "engineering.registry.entry.create", status: "BLOCKED", mutationPerformed: false, changed: false, subject: input.subject, scopes: input.scopes, allowedRepositoryIds: input.allowedRepositoryIds, expiresAt: input.expiresAt, justification: justificationSafe, entryIndex: null, tokenHash16, credentialPath, credentialFileExisted: null, credentialFileWritten: null, credentialSha16: tokenHash16, registrySha16Before: "", registrySha16After: "", blockers, findings, code, detail, activation: ACTIVATION, ...extra };
  };

  const writeAuditRefused = (result: string, code: string) => writeAudit(deps, { action: "entry-create", result, subject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before: null, registrySha16After: null, credentialSha16: tokenHash16, code });

  // Identity guards BEFORE any registry read: only an operator-* authorizer may
  // ever create an entry (generalized OPERATOR-PAIR-01), and the caller can
  // never create an entry that holds its own bearer.
  if (deps.callerSubject == null || !isOperatorSubject(deps.callerSubject)) {
    const audit = writeAuditRefused("refused-authorizer", "REGISTRY_ENTRY_CREATE_AUTHORIZER_REQUIRED");
    return blocked("REGISTRY_ENTRY_CREATE_AUTHORIZER_REQUIRED", `entry creation requires an operator-* authorizer (authorizer "${deps.callerSubject ?? "unknown"}")`, { audit });
  }
  if (deps.authorizerHash16 != null && tokenHash16 === deps.authorizerHash16.toLowerCase()) {
    const audit = writeAuditRefused("refused-self", "REGISTRY_SELF_ENTRY_REFUSED");
    return blocked("REGISTRY_SELF_ENTRY_REFUSED", "the credential hashes to the caller's own bearer — refused", { audit });
  }
  const unknownScopes = input.scopes.filter((scope) => !KNOWN_REGISTRY_SCOPES.includes(scope));
  if (unknownScopes.length > 0) {
    const audit = writeAuditRefused("refused-scope", "REGISTRY_SCOPE_UNKNOWN");
    return blocked("REGISTRY_SCOPE_UNKNOWN", `scopes not in the catalog: ${unknownScopes.join(", ")}`, { audit });
  }

  const registryFile = resolveRegistryFile(deps);
  if (!registryFile) return blocked("REGISTRY_FILE_MISSING", "no registry file: pass deps.registryFile or set ENG_MCP_TOKEN_REGISTRY_FILE");
  const { readReg, writeOut } = makeIo(deps);
  const before = readRegistryOrBlock(registryFile, readReg);
  if ("blocked" in before) return blocked(before.blocked, before.detail);
  const beforeBytes = before.bytes;
  const beforeRegistry = before.registry;

  if (beforeRegistry.tokens.some((entry) => entry.subject === input.subject)) {
    const audit = writeAuditRefused("refused-subject", "REGISTRY_SUBJECT_EXISTS");
    return blocked("REGISTRY_SUBJECT_EXISTS", `a registry entry with subject "${input.subject}" already exists — entries are never overwritten`, { audit });
  }
  if (beforeRegistry.tokens.some((entry) => entry.tokenHash.toLowerCase() === tokenHash)) {
    const audit = writeAuditRefused("refused-credential", "REGISTRY_TOKENHASH_EXISTS");
    return blocked("REGISTRY_TOKENHASH_EXISTS", "this credential's hash is already present in the registry — credential reuse is refused", { audit });
  }
  // OPERATOR-PAIR-01 (entry-create form): an operator-* target additionally
  // requires the authorizer's own hash16 to match an EXISTING operator-*
  // registry entry — the established A/B pair governs its own kind, and no
  // fresh subject can mint operator entries.
  if (isOperatorSubject(input.subject)) {
    const pairMember = beforeRegistry.tokens.some((entry) => isOperatorSubject(entry.subject) && entry.tokenHash.slice(0, 16).toLowerCase() === (deps.authorizerHash16 ?? "").toLowerCase());
    if (!pairMember) {
      const audit = writeAuditRefused("refused-pair", "OPERATOR_PAIR_MEMBERSHIP_REQUIRED");
      return blocked("OPERATOR_PAIR_MEMBERSHIP_REQUIRED", `creating an operator-* entry requires the authorizer's hash16 to match an existing operator-* entry (the A/B pair); authorizer "${deps.callerSubject}" is not a pair member`, { audit });
    }
  }

  const registrySha16Before = sha16(beforeBytes);
  const newEntry: TokenRecord = { tokenHash, subject: input.subject, scopes: [...input.scopes], allowedRepositoryIds: [...input.allowedRepositoryIds], expiresAt: input.expiresAt, revokedAt: null };
  const newRegistry: { tokens: TokenRecord[] } = { tokens: [...beforeRegistry.tokens, newEntry] };
  if (newEntry.scopes.length > TARGET_SCOPES_LIMIT) return blocked("REGISTRY_SCOPE_LIMIT", `an entry would hold more than ${TARGET_SCOPES_LIMIT} scopes`);
  const newBytes = Buffer.from(JSON.stringify(newRegistry, null, 2) + "\n", "utf8");
  const registrySha16After = sha16(newBytes);
  const entryIndex = beforeRegistry.tokens.length;

  let credentialFileExisted: boolean;
  try {
    const credentialState = credentialFileState(credentialPath, readReg);
    credentialFileExisted = credentialState.existed;
    if (credentialState.existed && credentialState.bytes && !credentialState.bytes.equals(credentialValueBytes)) return blocked("REGISTRY_CREDENTIAL_FILE_CONFLICT", "pre-existing credential file holds different bytes — reconcile it outside this tool first");
    if (credentialState.existed) findings.push("CREDENTIAL_FILE_ALREADY_MATCHES: an identical 0600 credential file already exists — the write will be a NO_OP");
  } catch (error) {
    return blocked(error instanceof EngineeringError ? error.code : "REGISTRY_CREDENTIAL_FILE_CONFLICT", error instanceof Error ? error.message : String(error));
  }
  if (Date.parse(input.expiresAt) - (deps.now ? deps.now() : new Date()).getTime() < 86_400_000) findings.push("SHORT_EXPIRY: the entry expires in less than 24h");

  const mutationApproved = input.execute === true && input.approval?.approved === true;
  if (!mutationApproved) {
    return { tool: "engineering.registry.entry.create", status: "PLAN", mutationPerformed: false, changed: false, subject: input.subject, scopes: input.scopes, allowedRepositoryIds: input.allowedRepositoryIds, expiresAt: input.expiresAt, justification: justificationSafe, entryIndex, tokenHash16, credentialPath, credentialFileExisted, credentialFileWritten: null, credentialSha16: tokenHash16, registrySha16Before, registrySha16After, blockers, findings, activation: ACTIVATION, requires: ["execute=true", "approval.approved=true", "acknowledgeCreate=true"] };
  }

  // Pre-write validation of the PLANNED bytes: nothing invalid ever reaches the disk.
  try { parseRegistryBytes(newBytes); } catch (error) {
    return blocked(error instanceof EngineeringError ? error.code : "REGISTRY_JSON_INVALID", `planned bytes fail validation (nothing written): ${error instanceof Error ? error.message : String(error)}`);
  }

  const nowDate = deps.now ? deps.now() : new Date();
  const backupPath = `${registryFile}.bak-registry-entry-create-${toStamp(nowDate)}`;
  try { writeOut(backupPath, beforeBytes, 0o600); } catch (error) {
    const audit = writeAudit(deps, { action: "entry-create", result: "failed", subject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, credentialSha16: tokenHash16, code: "REGISTRY_BACKUP_FAILED" });
    return blocked("REGISTRY_BACKUP_FAILED", `backup write failed, registry untouched: ${error instanceof Error ? error.message : String(error)}`, { audit });
  }

  const tmpPath = `${registryFile}.tmp-registry-entry-create-${toStamp(nowDate)}-${randomBytes(4).toString("hex")}`;
  let renamed = false;
  let credentialWritten = false;
  try {
    writeOut(tmpPath, newBytes, 0o600);
    // TOCTOU drift check: the registry must still be the bytes PLAN saw, right before the rename.
    if (sha256hex(readReg(registryFile)) !== sha256hex(beforeBytes)) throw new EngineeringError("REGISTRY_DRIFT_DETECTED", "the registry changed underneath since PLAN — refusing to overwrite");
    const beforeStat = statSync(registryFile);
    try { chmodSync(tmpPath, 0o600); } catch { /* best effort */ }
    try { chownSync(tmpPath, beforeStat.uid, beforeStat.gid); } catch { /* best effort */ }
    renameSync(tmpPath, registryFile);
    renamed = true;
    // Post-write revalidation: bytes, parse, boot rules, the entry landed at the
    // end, and every pre-existing entry byte-identical.
    const afterBytes = readReg(registryFile);
    if (sha256hex(afterBytes) !== sha256hex(newBytes)) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "bytes on disk differ from the planned bytes");
    const afterRegistry = parseRegistryBytes(afterBytes);
    if (afterRegistry.tokens.length !== beforeRegistry.tokens.length + 1) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "entry count did not grow by exactly one");
    const landed = afterRegistry.tokens[entryIndex];
    if (!landed || landed.subject !== input.subject || JSON.stringify(landed) !== JSON.stringify(newEntry)) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "the new entry did not land as planned");
    const othersBefore = JSON.stringify(beforeRegistry.tokens);
    const othersAfter = JSON.stringify(afterRegistry.tokens.slice(0, beforeRegistry.tokens.length));
    if (othersBefore !== othersAfter) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "pre-existing entries changed");

    // Credential file AFTER the registry mutation is proven: file-sha16 == tokenHash16 by
    // construction (both are sha256 over the same bytes) and verified below.
    const credential = writeCredentialFile(credentialPath, credentialValueBytes, readReg, writeOut);
    credentialWritten = credential.written;
    const fileBytes = readReg(credentialPath);
    if (sha16(fileBytes) !== tokenHash16) throw new EngineeringError("REGISTRY_CREDENTIAL_HASH_MISMATCH", "credential file bytes do not hash to the registry tokenHash");
    const audit = writeAudit(deps, { action: "entry-create", result: "created", subject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, justification: justificationSafe.slice(0, 200), entryIndex, registrySha16Before, registrySha16After, credentialPath, credentialSha16: tokenHash16, backupPath });
    return { tool: "engineering.registry.entry.create", status: "CREATED", mutationPerformed: true, changed: true, subject: input.subject, scopes: input.scopes, allowedRepositoryIds: input.allowedRepositoryIds, expiresAt: input.expiresAt, justification: justificationSafe, entryIndex, tokenHash16, credentialPath, credentialFileExisted: credential.existed, credentialFileWritten: credential.written, credentialSha16: tokenHash16, registrySha16Before, registrySha16After, blockers, findings, backupPath, audit, activation: ACTIVATION };
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* already gone */ }
    const code = error instanceof EngineeringError ? error.code : "REGISTRY_WRITE_FAILED";
    const detail = error instanceof Error ? error.message : String(error);
    if (!renamed) {
      const audit = writeAudit(deps, { action: "entry-create", result: "failed", subject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, credentialSha16: tokenHash16, code, backupPath });
      return blocked(code, `failed before rename, registry untouched: ${detail}`, { backupPath, audit });
    }
    // RESTORE from the backup and verify byte-equality with PLAN's baseline;
    // neutralize a credential file this call created (the registry is the
    // source of truth — an entry that did not land must not leave a usable
    // credential behind).
    let credentialRemoved = false;
    if (credentialWritten) { try { if (deps.removeFile) deps.removeFile(credentialPath); else unlinkSync(credentialPath); credentialRemoved = true; } catch { /* best effort, reported in findings */ } }
    let restored = false;
    let restoreDetail = "";
    try {
      const backupBytes = readReg(backupPath);
      writeOut(registryFile, backupBytes, 0o600);
      restored = sha16(readReg(registryFile)) === registrySha16Before;
    } catch (restoreError) { restoreDetail = restoreError instanceof Error ? restoreError.message : String(restoreError); }
    const audit = writeAudit(deps, { action: "entry-create", result: restored ? "restored" : "restore-failed", subject: input.subject, scopes: input.scopes, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, credentialSha16: tokenHash16, code, backupPath });
    if (!restored) {
      findings.push(`RESTORE_FAILED: ${restoreDetail || "unknown"} — MANUAL RECOVERY REQUIRED from ${backupPath}`);
      return { tool: "engineering.registry.entry.create", status: "BLOCKED", mutationPerformed: true, changed: true, subject: input.subject, scopes: input.scopes, allowedRepositoryIds: input.allowedRepositoryIds, expiresAt: input.expiresAt, justification: justificationSafe, entryIndex, tokenHash16, credentialPath, credentialFileExisted: null, credentialFileWritten: credentialWritten, credentialSha16: tokenHash16, registrySha16Before, registrySha16After: "", blockers, findings, code: "REGISTRY_RESTORE_FAILED", detail: `post-write failure (${code}: ${detail}) and the restore from ${backupPath} also failed: ${restoreDetail}`, backupPath, audit, activation: ACTIVATION };
    }
    const postFindings = [...findings];
    if (credentialWritten && !credentialRemoved) postFindings.push("CREDENTIAL_FILE_UNLINK_FAILED: the registry was restored but the credential file this call created could not be removed — remove it manually");
    return { tool: "engineering.registry.entry.create", status: "RESTORED", mutationPerformed: false, changed: false, subject: input.subject, scopes: input.scopes, allowedRepositoryIds: input.allowedRepositoryIds, expiresAt: input.expiresAt, justification: justificationSafe, entryIndex, tokenHash16, credentialPath, credentialFileExisted: null, credentialFileWritten: credentialWritten, credentialSha16: tokenHash16, registrySha16Before, registrySha16After: registrySha16Before, blockers, findings: postFindings, code, detail: `post-write failure restored from backup: ${detail}`, backupPath, restored: true, audit, activation: ACTIVATION };
  }
}

// ---------------------------------------------------------------------------
// engineering.registry.entry.revoke
// ---------------------------------------------------------------------------

export async function runRegistryEntryRevoke(rawInput: unknown, deps: RegistryEntryLifecycleDeps = {}): Promise<RegistryEntryRevokeResult> {
  const parsed = registryEntryRevokeInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new EngineeringError("REGISTRY_ENTRY_REVOKE_INPUT_INVALID", `input fails the strict schema: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const input = parsed.data;

  const blockers: string[] = [];
  const findings: string[] = [];
  const credentialDir = deps.credentialDir ?? REGISTRY_LIFECYCLE_CREDENTIAL_DIR_DEFAULT;
  const credentialPath = `${credentialDir}/${input.subject}`;

  const blocked = (code: string, detail: string, extra?: Partial<RegistryEntryRevokeResult>): RegistryEntryRevokeResult => {
    blockers.push(code);
    return { tool: "engineering.registry.entry.revoke", status: "BLOCKED", mutationPerformed: false, changed: false, subject: input.subject, reason: input.reason.slice(0, 300), entryIndex: null, revokedAtPlanned: null, revokedAt: null, tokenHash16: null, scopesBefore: null, registrySha16Before: "", registrySha16After: "", credentialPath, credentialFileExisted: null, credentialFileRemoved: null, blockers, findings, code, detail, activation: ACTIVATION, ...extra };
  };

  const writeAuditRefused = (result: string, code: string) => writeAudit(deps, { action: "entry-revoke", result, subject: input.subject, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before: null, registrySha16After: null, code });

  const registryFile = resolveRegistryFile(deps);
  if (!registryFile) return blocked("REGISTRY_FILE_MISSING", "no registry file: pass deps.registryFile or set ENG_MCP_TOKEN_REGISTRY_FILE");
  const { readReg, writeOut } = makeIo(deps);
  const before = readRegistryOrBlock(registryFile, readReg);
  if ("blocked" in before) return blocked(before.blocked, before.detail);
  const beforeBytes = before.bytes;
  const beforeRegistry = before.registry;

  const matches = beforeRegistry.tokens.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.subject === input.subject);
  if (matches.length === 0) {
    const audit = writeAuditRefused("refused-subject", "REGISTRY_SUBJECT_NOT_FOUND");
    return blocked("REGISTRY_SUBJECT_NOT_FOUND", `no registry entry with subject "${input.subject}"`, { audit });
  }
  if (matches.length > 1) {
    const audit = writeAuditRefused("refused-subject", "REGISTRY_SUBJECT_AMBIGUOUS");
    return blocked("REGISTRY_SUBJECT_AMBIGUOUS", `${matches.length} entries share subject "${input.subject}" — one entry per call; disambiguate the registry first`, { audit });
  }
  const target = matches[0]!;
  // Self-guard (scope.grant pattern): the calling identity can never revoke
  // its own entry — neither by subject nor by holding the same bearer.
  if (deps.callerSubject != null && deps.callerSubject === input.subject) {
    const audit = writeAuditRefused("refused-self", "REGISTRY_SELF_REVOKE_REFUSED");
    return blocked("REGISTRY_SELF_REVOKE_REFUSED", "revoking the calling identity itself is refused — operators revoke their own entries outside this tool", { audit });
  }
  if (deps.authorizerHash16 != null && target.entry.tokenHash.slice(0, 16).toLowerCase() === deps.authorizerHash16.toLowerCase()) {
    const audit = writeAuditRefused("refused-self", "REGISTRY_SELF_REVOKE_REFUSED");
    return blocked("REGISTRY_SELF_REVOKE_REFUSED", "the target entry holds the caller's own bearer (tokenHash16 match) — refused", { audit });
  }
  // OPERATOR-PAIR-01 (entry-revoke form): an operator-* victim requires an
  // operator-* authorizer distinct from the victim (distinctness already
  // guaranteed by the self-guards above).
  if (isOperatorSubject(input.subject) && (deps.callerSubject == null || !isOperatorSubject(deps.callerSubject))) {
    const audit = writeAuditRefused("refused-operator-authorizer", "OPERATOR_ENTRY_OPERATOR_AUTHORIZER_REQUIRED");
    return blocked("OPERATOR_ENTRY_OPERATOR_AUTHORIZER_REQUIRED", `revoking an operator-* entry requires an operator-* authorizer (target "${input.subject}", authorizer "${deps.callerSubject ?? "unknown"}")`, { audit });
  }

  const entry = target.entry;
  const registrySha16Before = sha16(beforeBytes);
  if (typeof entry.revokedAt === "string" && entry.revokedAt.length > 0) {
    const audit = writeAudit(deps, { action: "entry-revoke", result: "noop", subject: input.subject, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code: "REGISTRY_REVOKE_NO_OP" });
    return { tool: "engineering.registry.entry.revoke", status: "NO_OP", mutationPerformed: false, changed: false, subject: input.subject, reason: input.reason.slice(0, 300), entryIndex: target.index, revokedAtPlanned: entry.revokedAt, revokedAt: entry.revokedAt, tokenHash16: entry.tokenHash.slice(0, 16), scopesBefore: [...entry.scopes], registrySha16Before, registrySha16After: registrySha16Before, credentialPath, credentialFileExisted: null, credentialFileRemoved: null, blockers, findings, code: "REGISTRY_REVOKE_NO_OP", detail: "the entry is already revoked — zero writes, no backup", audit, activation: ACTIVATION };
  }

  const nowDate = deps.now ? deps.now() : new Date();
  const revokedAtPlanned = nowDate.toISOString();
  if (Date.parse(entry.expiresAt) <= nowDate.getTime()) findings.push("TARGET_TOKEN_EXPIRED: the token could no longer authenticate — the revocation is recorded for the audit trail");

  const newEntry: TokenRecord = { ...entry, revokedAt: revokedAtPlanned };
  const newRegistry: { tokens: TokenRecord[] } = { tokens: beforeRegistry.tokens.map((candidate, candidateIndex) => candidateIndex === target.index ? newEntry : candidate) };
  const newBytes = Buffer.from(JSON.stringify(newRegistry, null, 2) + "\n", "utf8");
  const registrySha16After = sha16(newBytes);

  const mutationApproved = input.execute === true && input.approval?.approved === true;
  if (!mutationApproved) {
    return { tool: "engineering.registry.entry.revoke", status: "PLAN", mutationPerformed: false, changed: false, subject: input.subject, reason: input.reason.slice(0, 300), entryIndex: target.index, revokedAtPlanned, revokedAt: null, tokenHash16: entry.tokenHash.slice(0, 16), scopesBefore: [...entry.scopes], registrySha16Before, registrySha16After, credentialPath, credentialFileExisted: null, credentialFileRemoved: null, blockers, findings, activation: ACTIVATION, requires: ["execute=true", "approval.approved=true", "acknowledgeRevoke=true"] };
  }

  // Pre-write validation of the PLANNED bytes: nothing invalid ever reaches the disk.
  try { parseRegistryBytes(newBytes); } catch (error) {
    return blocked(error instanceof EngineeringError ? error.code : "REGISTRY_JSON_INVALID", `planned bytes fail validation (nothing written): ${error instanceof Error ? error.message : String(error)}`);
  }

  const backupPath = `${registryFile}.bak-registry-entry-revoke-${toStamp(nowDate)}`;
  try { writeOut(backupPath, beforeBytes, 0o600); } catch (error) {
    const audit = writeAudit(deps, { action: "entry-revoke", result: "failed", subject: input.subject, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code: "REGISTRY_BACKUP_FAILED" });
    return blocked("REGISTRY_BACKUP_FAILED", `backup write failed, registry untouched: ${error instanceof Error ? error.message : String(error)}`, { audit });
  }

  const tmpPath = `${registryFile}.tmp-registry-entry-revoke-${toStamp(nowDate)}-${randomBytes(4).toString("hex")}`;
  let renamed = false;
  try {
    writeOut(tmpPath, newBytes, 0o600);
    // TOCTOU drift check: the registry must still be the bytes PLAN saw, right before the rename.
    if (sha256hex(readReg(registryFile)) !== sha256hex(beforeBytes)) throw new EngineeringError("REGISTRY_DRIFT_DETECTED", "the registry changed underneath since PLAN — refusing to overwrite");
    const beforeStat = statSync(registryFile);
    try { chmodSync(tmpPath, 0o600); } catch { /* best effort */ }
    try { chownSync(tmpPath, beforeStat.uid, beforeStat.gid); } catch { /* best effort */ }
    renameSync(tmpPath, registryFile);
    renamed = true;
    // Post-write revalidation: bytes, parse, boot rules, the revocation landed,
    // every other field of the target is unchanged and every other entry is
    // byte-identical.
    const afterBytes = readReg(registryFile);
    if (sha256hex(afterBytes) !== sha256hex(newBytes)) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "bytes on disk differ from the planned bytes");
    const afterRegistry = parseRegistryBytes(afterBytes);
    const afterEntry = afterRegistry.tokens[target.index];
    if (!afterEntry || afterEntry.revokedAt !== revokedAtPlanned) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "the revocation did not land as planned");
    const { revokedAt: _beforeRevoked, ...targetBeforeRest } = entry;
    const { revokedAt: _afterRevoked, ...targetAfterRest } = afterEntry;
    if (JSON.stringify(targetBeforeRest) !== JSON.stringify(targetAfterRest)) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "fields other than revokedAt changed on the target");
    const othersBefore = JSON.stringify(beforeRegistry.tokens.filter((_, index) => index !== target.index));
    const othersAfter = JSON.stringify(afterRegistry.tokens.filter((_, index) => index !== target.index));
    if (othersBefore !== othersAfter) throw new EngineeringError("REGISTRY_POSTVALIDATION_FAILED", "unrelated entries changed");

    // Credential neutralization AFTER the registry mutation is proven: regular
    // files only — symlinks are reported and never followed.
    let credentialFileExisted = false;
    let credentialFileRemoved: boolean | null = null;
    try {
      const st = lstatSync(credentialPath);
      if (st.isSymbolicLink()) findings.push("CREDENTIAL_FILE_SYMLINK_SKIPPED: the credential path is a symlink — remove it manually (never followed)");
      else if (st.isFile()) { credentialFileExisted = true; if (deps.removeFile) deps.removeFile(credentialPath); else unlinkSync(credentialPath); credentialFileRemoved = true; }
      else findings.push("CREDENTIAL_FILE_SPECIAL_SKIPPED: the credential path exists and is not a regular file — inspect manually");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") { credentialFileExisted = false; credentialFileRemoved = false; findings.push("CREDENTIAL_FILE_ABSENT: no credential file at the derived path — the value may live in an env var or another mount; the revokedAt marker still refuses authentication at next boot"); }
      else { findings.push(`CREDENTIAL_FILE_UNLINK_FAILED: ${error instanceof Error ? error.message : String(error)} — remove it manually`); }
    }
    const audit = writeAudit(deps, { action: "entry-revoke", result: "revoked", subject: input.subject, reason: input.reason.slice(0, 200), authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, revokedAt: revokedAtPlanned, registrySha16Before, registrySha16After, credentialPath, credentialFileRemoved, backupPath });
    return { tool: "engineering.registry.entry.revoke", status: "REVOKED", mutationPerformed: true, changed: true, subject: input.subject, reason: input.reason.slice(0, 300), entryIndex: target.index, revokedAtPlanned, revokedAt: revokedAtPlanned, tokenHash16: entry.tokenHash.slice(0, 16), scopesBefore: [...entry.scopes], registrySha16Before, registrySha16After, credentialPath, credentialFileExisted, credentialFileRemoved, blockers, findings, backupPath, audit, activation: ACTIVATION };
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* already gone */ }
    const code = error instanceof EngineeringError ? error.code : "REGISTRY_WRITE_FAILED";
    const detail = error instanceof Error ? error.message : String(error);
    if (!renamed) {
      const audit = writeAudit(deps, { action: "entry-revoke", result: "failed", subject: input.subject, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code, backupPath });
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
    const audit = writeAudit(deps, { action: "entry-revoke", result: restored ? "restored" : "restore-failed", subject: input.subject, authorizerSubject: deps.callerSubject ?? null, authorizerHash16: deps.authorizerHash16 ?? null, registrySha16Before, code, backupPath });
    if (!restored) {
      findings.push(`RESTORE_FAILED: ${restoreDetail || "unknown"} — MANUAL RECOVERY REQUIRED from ${backupPath}`);
      return { tool: "engineering.registry.entry.revoke", status: "BLOCKED", mutationPerformed: true, changed: true, subject: input.subject, reason: input.reason.slice(0, 300), entryIndex: target.index, revokedAtPlanned, revokedAt: null, tokenHash16: entry.tokenHash.slice(0, 16), scopesBefore: [...entry.scopes], registrySha16Before, registrySha16After: "", credentialPath, credentialFileExisted: null, credentialFileRemoved: null, blockers, findings, code: "REGISTRY_RESTORE_FAILED", detail: `post-write failure (${code}: ${detail}) and the restore from ${backupPath} also failed: ${restoreDetail}`, backupPath, audit, activation: ACTIVATION };
    }
    return { tool: "engineering.registry.entry.revoke", status: "RESTORED", mutationPerformed: false, changed: false, subject: input.subject, reason: input.reason.slice(0, 300), entryIndex: target.index, revokedAtPlanned, revokedAt: null, tokenHash16: entry.tokenHash.slice(0, 16), scopesBefore: [...entry.scopes], registrySha16Before, registrySha16After: registrySha16Before, credentialPath, credentialFileExisted: null, credentialFileRemoved: null, blockers, findings, code, detail: `post-write failure restored from backup: ${detail}`, backupPath, restored: true, audit, activation: ACTIVATION };
  }
}
