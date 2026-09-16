// engineering.sandbox.batchWrite — SBW-01 batched writes MVP (ceiling 10 since SBW-02).
// ONE governed flow for batched source-file writes, composed by reusing the
// certified pieces untouched: the sandbox is created through the SB-01
// SandboxService, every in-sandbox side effect goes through the certified
// SB-02 exec mechanism (one controlled execution at a time, active kill on
// timeout) and the final sync reuses the existing repository.patch per-file
// write mechanism (baseHash optimistic concurrency + unexpected-worktree
// guards + atomic replace) so each file keeps its individual integrity check
// even inside one approval.
// Flow (exactly four actions, each one a single tool call):
//   materialize — create the mission's REAL sandbox, copy the requested
//     files byte-exactly from the authorized repository into the sandbox and
//     record each file's sha256 base hash AT THE MOMENT OF THE COPY. Reads go
//     through the repository policy (sensitive-content guard included).
//   write — apply up to 10 {path, content} operations INSIDE the sandbox via
//     the certified exec mechanism. No per-file baseHash here: the sandbox is
//     a disposable mirror, so integrity is proven by sha256 equality after
//     the copy instead. Duplicate paths in one call are rejected BEFORE any
//     side effect; every path must have been materialized first.
//   validate — run the in-sandbox TypeScript check profile (tsc --noEmit,
//     the same shape proven during SBW bring-up: skipLibCheck + bundler
//     resolution + allowImportingTsExtensions, deps installed in the sandbox)
//     over the materialized+written set. A FAILED check DESTROYS the sandbox:
//     nothing reaches the real repository.
//   sync — ONE approval (acknowledgeWrite) for the whole set. Bind: re-read
//     every target in the authorized repository and require byte-equality
//     with the hash recorded at materialization time — ANY divergence is
//     SBW_DRIFT_DETECTED with zero mutation (no merge, no attempt to guess).
//     Apply: per file, a single full-replace hunk through the existing
//     repository.patch (which re-validates the baseHash again, so a change
//     between bind and apply still fails closed) and reports the real
//     newHash of every written file.
// Explicitly OUT OF SCOPE for this MVP: file creation (materialized
// replacement only), new directories, batch atomicity (a partial apply is
// reported honestly, per-file), persistent batch state (the in-memory registry
// is lost on server restart and SBW_BATCH_NOT_FOUND is the honest answer),
// ceiling above 10 operations per batch (SBW-02 progression; more only after certified validation).
// Secrets: repository content never leaves the server except into the
// mission's own disposable sandbox; tool outputs carry hashes, exit codes and
// capped diagnostics — never file bytes; the E2B credential rules of sandbox.ts
// are inherited untouched.
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { gzipSync } from "node:zlib";
import * as z from "zod/v4";
import { EngineeringError } from "./policy.ts";
import { DEFAULT_TTL_MS, SandboxError, SandboxService, defaultSandboxService } from "./sandbox.ts";

// MVP ceiling: the first certified implementation started at 5 (no batch history yet);
// SBW-02 raises it to 10 — the conservative progression orchestrate.batch used.
export const SBW_MAX_OPS = 10;
export const SBW_MAX_CONTENT_CHARS = 131_072; // == repository.patch/create FILE_LIMIT_EXCEEDED cap

// Same pattern as sandbox.ts missionIdSchema (not exported there; SB-01/SB-02
// stay byte-identical, so the pattern is mirrored locally on purpose).
const MISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
// BOM spelled via char code: an invisible literal in source would be a trap
// for every future edit of this file.
const BOM_CHAR = String.fromCharCode(0xfeff);
const missionIdSchema = z.string().regex(MISSION_ID_PATTERN, "missionId must be 8-128 characters of letters, digits, '.', '_' ':' '-' starting with a letter or digit");

export const sandboxBatchWriteInputSchema = z.object({
  action: z.enum(["materialize", "write", "validate", "sync"]),
  missionId: missionIdSchema,
  sandboxId: z.string().min(8).max(200).optional(),
  ttlMs: z.number().int().min(60_000).max(3_600_000).optional(),
  paths: z.array(z.string().min(1).max(400)).min(1).max(SBW_MAX_OPS).optional(),
  ops: z.array(z.object({
    path: z.string().min(1).max(400),
    content: z.string().min(1).max(SBW_MAX_CONTENT_CHARS)
  })).min(1).max(SBW_MAX_OPS).optional(),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
  acknowledgeWrite: z.literal(true).optional()
}).strict();
export type SandboxBatchWriteInput = z.infer<typeof sandboxBatchWriteInputSchema>;

// ---- narrow structural ports (dependency injection for unit proofs) ----

// The repository surface this module touches: the same readUtf8 policy
// channel used by engineering.file.read and the same repository.patch used by
// engineering.file.patch. Structural, so tests inject a plain object.
export type SbwRepositoryDeps = {
  policy: {
    readUtf8(relativePath: string, maxBytes: number): Promise<{ text: string; relativePath: string }>;
  };
  patch(input: {
    path: string;
    baseHash: string;
    hunks: Array<{ startLine: number; deleteLines: string[]; insertLines: string[] }>;
    expectedChangeCount?: number;
    acknowledgeWrite: boolean;
  }): Promise<{ filesChanged: string[]; oldHash: string; newHash: string; diff: string; truncated: boolean; warnings: string[] }>;
};

export type SbwTransportResult = { sha256: string; execs: number };
// The sandbox file transport: how repository bytes reach the sandbox through
// the certified SB-02 exec mechanism. The default implementation chunks the
// gzip+base64 payload into bounded exec commands.
export type SbwTransport = (args: {
  missionId: string;
  sandboxId: string;
  targetPath: string;
  bytes: Buffer;
  timeoutMs: number;
}) => Promise<SbwTransportResult>;

export type SbwDeps = {
  service?: SandboxService;
  repository: SbwRepositoryDeps;
  transport?: SbwTransport;
};

// ---- batch state (in-memory, honest about its lifetime) ----

export type SbwFileRecord = {
  path: string;
  baseHash: string;
  sandboxSha256: string;
  copyVerified: boolean;
  copiedAt: string;
  execs: number;
};
export type SbwWriteOpRecord = {
  path: string;
  baseHash: string;
  content: string;
  sandboxSha256: string;
  writeVerified: boolean;
  appliedAt: string;
};
export type SbwValidationRecord = {
  status: "pass" | "fail";
  exitCode: number | null;
  durationMs: number;
  profile: string;
  command: string;
  stdout: string;
  stderr: string;
  at: string;
  sandboxDestroyedOnFail: boolean;
  destroyError?: string;
};
export type SbwSyncRecord = {
  status: "synced";
  driftChecked: number;
  applied: Array<{ path: string; oldHash: string; newHash: string; changed: boolean }>;
  at: string;
};
export type SbwBatchState = {
  missionId: string;
  sandboxId: string;
  createdAt: string;
  expiresAt: string;
  files: Map<string, SbwFileRecord>;
  writes: Map<string, SbwWriteOpRecord>;
  validation: SbwValidationRecord | null;
  sync: SbwSyncRecord | null;
  sandboxAlive: boolean;
};

const batches = new Map<string, SbwBatchState>();

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireBatch(missionId: string): SbwBatchState {
  const state = batches.get(missionId);
  if (!state) throw new SandboxError("SBW_BATCH_NOT_FOUND", "no batch state for this mission in this server process (state is in-memory by design and a restart clears it; materialize first)");
  return state;
}

function requireSandboxMatch(state: SbwBatchState, sandboxId: string | undefined): void {
  if (!sandboxId || sandboxId !== state.sandboxId)
    throw new SandboxError("MISSION_SANDBOX_MISMATCH", "sandboxId does not match the sandbox registered for this batch; nothing was executed");
}

function sandboxRoot(missionId: string): string {
  return `/tmp/sbw-${missionId}`;
}

const SBW_OUTPUT_CAP = 16_384;
function capText(value: string): string {
  return value.length > SBW_OUTPUT_CAP ? `${value.slice(0, SBW_OUTPUT_CAP)}…(truncated)` : value;
}

// ---- default transport: gzip + base64 chunks through the certified exec ----

export const SBW_B64_CHUNK_CHARS = 48_000; // one printf exec per chunk of this many base64 chars

function parseSha256sum(stdout: string): string {
  const match = /^([0-9a-f]{64})\s/m.exec(stdout);
  if (!match) throw new SandboxError("SBW_INTEGRITY_UNPROVEN", "sha256sum returned no digest; the copy could not be proven");
  return match[1];
}

// Every chunk goes through the SB-02 service exec (serial per sandbox, active
// kill on timeout). base64 alphabet is quote-safe; paths are policy-resolved
// relative paths (no quotes, no control chars) inside single quotes.
export function makeExecTransport(service: SandboxService): SbwTransport {
  return async ({ missionId, sandboxId, targetPath, bytes, timeoutMs }) => {
    const root = sandboxRoot(missionId);
    const target = `${root}/base/${targetPath}`;
    const b64Path = `${root}/tmp-${randomUUID()}.b64`;
    const gz = gzipSync(bytes, { level: 6 });
    const b64 = gz.toString("base64");
    if (b64.length === 0) throw new SandboxError("SBW_TRANSPORT_EMPTY", "the gzip payload encoded to nothing; refusing to transport");
    const chunks: string[] = [];
    for (let i = 0; i < b64.length; i += SBW_B64_CHUNK_CHARS) chunks.push(b64.slice(i, i + SBW_B64_CHUNK_CHARS));
    const dir = path.posix.dirname(target);
    let execs = 0;
    for (let i = 0; i < chunks.length; i++) {
      const isFirst = i === 0;
      const isLast = i === chunks.length - 1;
      let command = isFirst ? `mkdir -p '${dir}' && ` : "";
      command += `printf '%s' '${chunks[i]}' >> '${b64Path}'`;
      if (isLast) {
        command += ` && base64 -d '${b64Path}' | gunzip > '${target}' && rm -f '${b64Path}' && sha256sum '${target}'`;
      }
      const result = await service.exec(missionId, sandboxId, command, timeoutMs);
      execs += 1;
      if (result.cancelled) throw new SandboxError("SBW_EXEC_CANCELLED", `exec was cancelled before the copy settled (exec ${execs}/${chunks.length})`);
      if (result.timedOut) throw new SandboxError("SBW_EXEC_TIMED_OUT", `exec timed out and the process was killed (exec ${execs}/${chunks.length})`);
      if (result.exitCode !== 0) throw new SandboxError("SBW_EXEC_FAILED", `sandbox exec failed with exit ${result.exitCode} (exec ${execs}/${chunks.length}): ${capText(result.stderr)}`);
      if (isLast) return { sha256: parseSha256sum(result.stdout), execs };
    }
    throw new SandboxError("SBW_TRANSPORT_INCOMPLETE", "the chunk loop ended without a terminal sha256 proof");
  };
}

// ---- materialize: SB-01 sandbox + byte-exact copies + recorded base hashes ----

export type SbwMaterializeResult = {
  action: "materialize";
  missionId: string;
  sandboxId: string;
  provider: string;
  createdAt: string;
  expiresAt: string;
  files: Array<{ path: string; baseHash: string; sandboxSha256: string; copyVerified: boolean; execs: number }>;
  allCopiesVerified: boolean;
};

async function materializeBatch(input: { missionId: string; ttlMs?: number; paths?: string[]; timeoutMs?: number }, deps: { service: SandboxService; transport: SbwTransport; repository: SbwRepositoryDeps }): Promise<SbwMaterializeResult> {
  const paths = input.paths ?? [];
  if (paths.length === 0) throw new EngineeringError("INPUT_INVALID");
  if (new Set(paths).size !== paths.length) throw new SandboxError("SBW_DUPLICATE_PATH", "duplicate paths in one materialize call are rejected before any side effect");
  // Read FIRST (policy channel incl. sensitive-content guard): no sandbox side
  // effect happens unless every requested file is readable right now.
  const reads: Array<{ path: string; text: string; baseHash: string; bytes: Buffer }> = [];
  for (const requested of paths) {
    const read = await deps.repository.policy.readUtf8(requested, SBW_MAX_CONTENT_CHARS);
    const bytes = Buffer.from(read.text, "utf8");
    reads.push({ path: read.relativePath, text: read.text, baseHash: sha256Hex(bytes), bytes });
  }
  const created = await deps.service.create(input.missionId, input.ttlMs ?? DEFAULT_TTL_MS);
  const state: SbwBatchState = {
    missionId: input.missionId,
    sandboxId: created.sandboxId,
    createdAt: created.createdAt,
    expiresAt: created.expiresAt,
    files: new Map(),
    writes: new Map(),
    validation: null,
    sync: null,
    sandboxAlive: true
  };
  batches.set(input.missionId, state);
  try {
    for (const read of reads) {
      const transport = await deps.transport({
        missionId: input.missionId,
        sandboxId: created.sandboxId,
        targetPath: read.path,
        bytes: read.bytes,
        timeoutMs: input.timeoutMs ?? 60_000
      });
      const copyVerified = transport.sha256 === read.baseHash;
      state.files.set(read.path, { path: read.path, baseHash: read.baseHash, sandboxSha256: transport.sha256, copyVerified, copiedAt: new Date().toISOString(), execs: transport.execs });
      if (!copyVerified) throw new SandboxError("SBW_INTEGRITY_MISMATCH", `sandbox copy of ${read.path} is not byte-identical (sandbox ${transport.sha256} vs repository ${read.baseHash}); the batch is destroyed`);
    }
  } catch (error) {
    // Failure containment for the MATERIALIZATION itself: the mirror is
    // unusable, so the sandbox is destroyed (proven SB-01 destroy) and the
    // batch state is dropped — nothing half-materialized survives.
    state.sandboxAlive = false;
    try { await deps.service.destroy(input.missionId, created.sandboxId); } catch (destroyError) {
      if (error instanceof SandboxError) error.message = `${error.message} (sandbox destroy also failed: ${destroyError instanceof Error ? destroyError.message : "unknown"})`;
    }
    batches.delete(input.missionId);
    throw error;
  }
  return {
    action: "materialize",
    missionId: input.missionId,
    sandboxId: created.sandboxId,
    provider: created.provider,
    createdAt: created.createdAt,
    expiresAt: created.expiresAt,
    files: [...state.files.values()].map((file) => ({ path: file.path, baseHash: file.baseHash, sandboxSha256: file.sandboxSha256, copyVerified: file.copyVerified, execs: file.execs })),
    allCopiesVerified: [...state.files.values()].every((file) => file.copyVerified)
  };
}

// ---- write: up to SBW_MAX_OPS ops inside the disposable mirror (no per-file baseHash) ----

export type SbwWriteResult = {
  action: "write";
  missionId: string;
  sandboxId: string;
  applied: Array<{ path: string; sandboxSha256: string; writeVerified: boolean; execs: number }>;
  allWriteVerified: boolean;
};

async function writeBatch(input: { missionId: string; sandboxId?: string; ops?: Array<{ path: string; content: string }>; timeoutMs?: number }, deps: { service: SandboxService; transport: SbwTransport }): Promise<SbwWriteResult> {
  const state = requireBatch(input.missionId);
  if (!state.sandboxAlive) throw new SandboxError("SBW_BATCH_TERMINATED", "the batch sandbox was destroyed earlier (failed materialize/validation); materialize again into a fresh mission");
  requireSandboxMatch(state, input.sandboxId);
  const ops = input.ops ?? [];
  // Duplicate rejection BEFORE any exec: zero side effects on invalid input.
  const seen = new Set<string>();
  for (const op of ops) {
    if (seen.has(op.path)) throw new SandboxError("SBW_DUPLICATE_PATH", `path ${op.path} appears more than once in the same write call; batch discipline rejects it even inside the disposable sandbox`);
    seen.add(op.path);
  }
  for (const op of ops) {
    if (!state.files.has(op.path)) throw new SandboxError("SBW_TARGET_NOT_MATERIALIZED", `path ${op.path} was never materialized; the write has no recorded base hash and is refused (materialize it first)`);
    if (op.content.includes(BOM_CHAR)) throw new SandboxError("SBW_INVALID_CONTENT", `target content for ${op.path} must not contain a BOM; the base file's byte layout is preserved by the sync`);
  }
  const applied: SbwWriteResult["applied"] = [];
  for (const op of ops) {
    const bytes = Buffer.from(op.content, "utf8");
    const transport = await deps.transport({
      missionId: input.missionId,
      sandboxId: state.sandboxId,
      targetPath: op.path,
      bytes,
      timeoutMs: input.timeoutMs ?? 60_000
    });
    const writeVerified = transport.sha256 === sha256Hex(bytes);
    state.writes.set(op.path, {
      path: op.path,
      baseHash: state.files.get(op.path)!.baseHash,
      content: op.content,
      sandboxSha256: transport.sha256,
      writeVerified,
      appliedAt: new Date().toISOString()
    });
    applied.push({ path: op.path, sandboxSha256: transport.sha256, writeVerified, execs: transport.execs });
    if (!writeVerified) {
      state.sandboxAlive = false;
      try { await deps.service.destroy(input.missionId, state.sandboxId); } catch (destroyError) {
        throw new SandboxError("SBW_INTEGRITY_MISMATCH", `sandbox write of ${op.path} is not byte-identical and the containment destroy also failed: ${destroyError instanceof Error ? destroyError.message : "unknown"}`);
      }
      batches.delete(input.missionId);
      throw new SandboxError("SBW_INTEGRITY_MISMATCH", `sandbox write of ${op.path} is not byte-identical; the sandbox was destroyed and the batch dropped`);
    }
  }
  return {
    action: "write",
    missionId: input.missionId,
    sandboxId: state.sandboxId,
    applied,
    allWriteVerified: applied.every((entry) => entry.writeVerified)
  };
}

// ---- validate: in-sandbox TypeScript check; failure destroys the sandbox ----

export type SbwValidateResult = {
  action: "validate";
  missionId: string;
  sandboxId: string;
  validation: SbwValidationRecord;
  files: string[];
};

const VALIDATE_DEPS_CMD = "test -x node_modules/.bin/tsc || npm i typescript@5.9.2 @types/node@24 zod@4.3.6 --no-audit --no-fund --silent";

async function validateBatch(input: { missionId: string; sandboxId?: string; timeoutMs?: number }, deps: { service: SandboxService }): Promise<SbwValidateResult> {
  const state = requireBatch(input.missionId);
  if (!state.sandboxAlive) throw new SandboxError("SBW_BATCH_TERMINATED", "the batch sandbox was destroyed earlier; materialize again");
  requireSandboxMatch(state, input.sandboxId);
  if (state.writes.size === 0) throw new SandboxError("SBW_NOTHING_TO_VALIDATE", "no write has been applied to this batch; write first");
  const root = sandboxRoot(input.missionId);
  const fileArgs = [...state.files.keys()].map((file) => `'${root}/base/${file}'`).join(" ");
  // Deps and tsc run at the sandbox ROOT: node_modules must be an ANCESTOR of
  // base/ for bare-import resolution (TypeScript walks up from the importing
  // file, not from the cwd). A sibling verify/ directory yields TS2307 for
  // every external import (proven in E2B: tsc --noEmit exits 2 on that layout).
  const command = `mkdir -p '${root}' && cd '${root}' && (${VALIDATE_DEPS_CMD}) && cd '${root}' && ./node_modules/.bin/tsc --noEmit --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions --strict ${fileArgs}`;
  const started = Date.now();
  const result = await deps.service.exec(input.missionId, state.sandboxId, command, input.timeoutMs ?? 300_000);
  const record: SbwValidationRecord = {
    status: result.exitCode === 0 ? "pass" : "fail",
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    profile: "tsc-noemit-in-sandbox (typescript 5.9.2 + @types/node@24 + zod@4.3.6; skipLibCheck; bundler resolution; allowImportingTsExtensions; strict)",
    command,
    stdout: capText(result.stdout),
    stderr: capText(result.stderr),
    at: new Date().toISOString(),
    sandboxDestroyedOnFail: false
  };
  state.validation = record;
  if (result.timedOut || result.cancelled || result.exitCode !== 0) {
    // The check failed INSIDE the sandbox: nothing reaches the real code. The
    // sandbox is destroyed with the PROVEN SB-01 destroy; if even the destroy
    // fails the error says so honestly. The typed error carries the tail of
    // each stream (state.validation is internal and unreadable by callers):
    // tsc errors land at the end of stdout, npm problems at the end of stderr.
    let destroyError: string | null = null;
    try { await deps.service.destroy(input.missionId, state.sandboxId); state.sandboxAlive = false; record.sandboxDestroyedOnFail = true; }
    catch (error) { destroyError = error instanceof Error ? error.message : "unknown"; record.destroyError = destroyError; }
    const tail = (value: string, label: string): string => {
      const trimmed = value.trim();
      if (trimmed === "") return "";
      return `\n${label}: ${trimmed.length > 2_000 ? `…${trimmed.slice(-2_000)}` : trimmed}`;
    };
    throw new SandboxError("SBW_VALIDATION_FAILED", `in-sandbox validation failed (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}); the batch sandbox ${record.sandboxDestroyedOnFail ? "was destroyed" : "COULD NOT be destroyed: " + destroyError} — nothing was synced${tail(result.stderr, "stderr(tail)")}${tail(result.stdout, "stdout(tail)")}`);
  }
  return {
    action: "validate",
    missionId: input.missionId,
    sandboxId: state.sandboxId,
    validation: record,
    files: [...state.files.keys()]
  };
}

// ---- sync: drift gate + ONE governed batch through the existing patch ----

export function replaceTotalHunk(text: string, content: string): { startLine: 1; deleteLines: string[]; insertLines: string[] } {
  if (content.includes(BOM_CHAR)) throw new SandboxError("SBW_INVALID_CONTENT", "target content must not contain a BOM; the base file's byte layout (BOM/EOL/final newline) is preserved by repository.patch");
  // Mirror repository.patchLines decomposition EXACTLY (same eol detection,
  // same final-newline handling, same BOM strip) so the context match inside
  // repository.patch is deterministic for the text just read from disk.
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const finalNewline = text.endsWith(eol);
  const bom = text.startsWith(BOM_CHAR);
  const body = bom ? text.slice(1) : text;
  const baseLines = body === "" ? [] : body.slice(0, finalNewline ? -eol.length : undefined).split(eol);
  const targetLines = content.split(/\r?\n/);
  if (targetLines.length > 0 && targetLines[targetLines.length - 1] === "") targetLines.pop();
  return { startLine: 1, deleteLines: baseLines, insertLines: targetLines };
}

export type SbwSyncResult = {
  action: "sync";
  missionId: string;
  sandboxId: string;
  driftChecked: number;
  synced: number;
  applied: Array<{ path: string; oldHash: string; newHash: string; changed: boolean }>;
  governance: "one-tool-call-one-approval; per-file baseHash revalidated by repository.patch";
};

async function syncBatch(input: { missionId: string; sandboxId?: string; acknowledgeWrite?: boolean }, deps: { repository: SbwRepositoryDeps }): Promise<SbwSyncResult> {
  if (!input.acknowledgeWrite) throw new EngineeringError("WRITE_ACKNOWLEDGEMENT_REQUIRED");
  const state = requireBatch(input.missionId);
  requireSandboxMatch(state, input.sandboxId);
  if (state.validation?.status !== "pass") throw new SandboxError("SBW_VALIDATION_REQUIRED", "the in-sandbox validation has not passed for this batch; sync refuses without it");
  if (state.sync) throw new SandboxError("SBW_ALREADY_SYNCED", "this batch was already synced; materialize a fresh batch to write again");
  // BIND: every target must still be byte-identical to the hash recorded at
  // materialization time. Any divergence (or a vanished file) is DRIFT —
  // reported with the concrete hashes, ZERO mutation, no merge attempt.
  const current = new Map<string, { text: string; hash: string }>();
  for (const target of state.writes.keys()) {
    try {
      const read = await deps.repository.policy.readUtf8(target, SBW_MAX_CONTENT_CHARS);
      current.set(target, { text: read.text, hash: sha256Hex(Buffer.from(read.text, "utf8")) });
    } catch (error) {
      current.set(target, { text: "", hash: error instanceof EngineeringError && error.code === "PATH_NOT_FOUND" ? "PATH_GONE" : `READ_FAILED:${error instanceof Error && "code" in error ? (error as { code: string }).code : "unknown"}` });
    }
  }
  const drifted: Array<{ path: string; expectedHash: string; actualHash: string | null }> = [];
  for (const target of state.writes.keys()) {
    const observed = current.get(target)!;
    if (observed.hash !== state.writes.get(target)!.baseHash)
      drifted.push({ path: target, expectedHash: state.writes.get(target)!.baseHash, actualHash: observed.hash.startsWith("READ_FAILED:") || observed.hash === "PATH_GONE" ? null : observed.hash });
  }
  if (drifted.length > 0)
    throw new SandboxError("SBW_DRIFT_DETECTED", `the authorized repository changed since materialization; refusing to sync (no merge, no repair): ${JSON.stringify(drifted)}`);
  // APPLY: one full-replace hunk per file through the EXISTING repository.patch.
  // The patch re-validates the baseHash again (bind/apply race fails closed)
  // and keeps the unexpected-worktree guard for every file.
  const applied: SbwSyncRecord["applied"] = [];
  for (const target of state.writes.keys()) {
    const write = state.writes.get(target)!;
    const hunk = replaceTotalHunk(current.get(target)!.text, write.content);
    const result = await deps.repository.patch({
      path: target,
      baseHash: write.baseHash,
      hunks: [hunk],
      expectedChangeCount: 1,
      acknowledgeWrite: true
    });
    applied.push({ path: target, oldHash: result.oldHash, newHash: result.newHash, changed: result.oldHash !== result.newHash });
  }
  state.sync = { status: "synced", driftChecked: state.writes.size, applied, at: new Date().toISOString() };
  return {
    action: "sync",
    missionId: input.missionId,
    sandboxId: state.sandboxId,
    driftChecked: state.writes.size,
    synced: applied.length,
    applied,
    governance: "one-tool-call-one-approval; per-file baseHash revalidated by repository.patch"
  };
}

// ---- dispatcher (the single registered tool) ----

function rejectWrongActionFields(input: SandboxBatchWriteInput, allowed: ReadonlySet<string>): void {
  const present = new Set<string>();
  for (const key of Object.keys(input)) if (key !== "action" && key !== "missionId") present.add(key);
  for (const key of present) if (!allowed.has(key)) throw new EngineeringError("INPUT_INVALID", `field "${key}" is not accepted for action ${input.action}`);
}

export async function runSandboxBatchWrite(input: SandboxBatchWriteInput, deps: SbwDeps): Promise<Record<string, unknown>> {
  const service = deps.service ?? defaultSandboxService();
  const transport = deps.transport ?? makeExecTransport(service);
  switch (input.action) {
    case "materialize": {
      rejectWrongActionFields(input, new Set(["paths", "ttlMs", "timeoutMs"]));
      if (!input.paths) throw new EngineeringError("INPUT_INVALID", "action materialize requires paths (1-10 unique repository paths)");
      return materializeBatch(input, { service, transport, repository: deps.repository });
    }
    case "write": {
      rejectWrongActionFields(input, new Set(["sandboxId", "ops", "timeoutMs"]));
      if (!input.sandboxId || !input.ops) throw new EngineeringError("INPUT_INVALID", "action write requires sandboxId and ops (1-10 unique paths)");
      return writeBatch(input, { service, transport });
    }
    case "validate": {
      rejectWrongActionFields(input, new Set(["sandboxId", "timeoutMs"]));
      if (!input.sandboxId) throw new EngineeringError("INPUT_INVALID", "action validate requires sandboxId");
      return validateBatch(input, { service });
    }
    case "sync": {
      rejectWrongActionFields(input, new Set(["sandboxId", "acknowledgeWrite"]));
      if (!input.sandboxId) throw new EngineeringError("INPUT_INVALID", "action sync requires sandboxId");
      if (!input.acknowledgeWrite) throw new EngineeringError("WRITE_ACKNOWLEDGEMENT_REQUIRED", "sync is the single batched write approval: acknowledgeWrite must be the literal true");
      return syncBatch(input, { repository: deps.repository });
    }
  }
}
