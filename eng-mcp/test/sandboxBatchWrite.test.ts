// SBW-01 batched writes — deterministic unit proofs (no network, no E2B).
// The sandbox side is exercised through the REAL SandboxService over a
// FakeSandboxProvider whose exec simulates the shell side of the chunked
// gzip+base64 transport (printf appends + base64 -d | gunzip + sha256sum),
// so the transport protocol is proven end-to-end without a real provider.
// The repository side is a plain fake mirroring the real repository contract:
// policy.readUtf8 (path policy + exact text) and patch (baseHash optimistic
// concurrency + patchLines-style reassembly).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { EngineeringError } from "../src/policy.ts";
import { DEFAULT_TTL_MS, MissionRecordStore, SandboxError, SandboxService, type SandboxExecHooks, type SandboxExecResult, type SandboxInspectInfo, type SandboxProvider, type SandboxProviderCreateInput, type SandboxProviderCreateResult, type SandboxProviderDestroyResult, type SandboxProviderExecInput } from "../src/sandbox.ts";
import { makeExecTransport, replaceTotalHunk, runSandboxBatchWrite, SBW_B64_CHUNK_CHARS, SBW_MAX_OPS, sandboxBatchWriteInputSchema, type SbwRepositoryDeps } from "../src/sandboxBatchWrite.ts";

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const rejectsCode = (code: string) => (error: unknown) => error instanceof SandboxError && error.code === code;
const engineeringCode = (code: string) => (error: unknown) => error instanceof EngineeringError && error.code === code;

// ---- shell simulation for the chunked transport (fake provider exec) ----

class FakeSandboxProvider implements SandboxProvider {
  readonly name = "fake";
  readonly alive = new Map<string, { missionId: string; alive: boolean }>();
  createCalls = 0;
  readonly destroyCalls: string[] = [];
  // In-memory filesystem of the fake sandbox + buffers of in-flight b64 files.
  readonly files = new Map<string, Buffer>();
  private readonly b64Buffers = new Map<string, string>();
  execMode: "normal" | "failExec" | "corruptLast" = "normal";

  async create({ missionId }: SandboxProviderCreateInput): Promise<SandboxProviderCreateResult> {
    this.createCalls += 1;
    const sandboxId = `fake-sbx-${this.createCalls}`;
    this.alive.set(sandboxId, { missionId, alive: true });
    return { sandboxId, expiresAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString() };
  }
  async exists(sandboxId: string): Promise<boolean> {
    return this.alive.get(sandboxId)?.alive === true;
  }
  async destroy(sandboxId: string): Promise<SandboxProviderDestroyResult> {
    this.destroyCalls.push(sandboxId);
    const entry = this.alive.get(sandboxId);
    if (!entry) return { verified: true, alreadyGone: true };
    entry.alive = false;
    return { verified: true, alreadyGone: false };
  }
  async listByMission(missionId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const [sandboxId, entry] of this.alive) if (entry.alive && entry.missionId === missionId) ids.push(sandboxId);
    return ids;
  }
  async inspect(sandboxId: string): Promise<SandboxInspectInfo | null> {
    const entry = this.alive.get(sandboxId);
    if (!entry || !entry.alive) return null;
    return { sandboxId, missionId: entry.missionId, state: "running", startedAt: new Date().toISOString(), endAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString() };
  }
  async exec(input: SandboxProviderExecInput, hooks?: SandboxExecHooks): Promise<SandboxExecResult> {
    const control = { pid: 4242, kill: async () => true };
    hooks?.onRunning?.(control);
    if (this.execMode === "failExec") return { executionId: input.executionId, exitCode: 1, stdout: "", stderr: "fake shell failure", timedOut: false, cancelled: false };
    // Simulate every `printf '%s' '<b64>' >> '<file>'` chunk append in the command.
    const chunkPattern = /printf '%s' '([A-Za-z0-9+/=]*)' >> '([^']+)'/g;
    let match: RegExpExecArray | null;
    let appended = false;
    while ((match = chunkPattern.exec(input.command)) !== null) {
      const [, chunk, b64File] = match;
      this.b64Buffers.set(b64File, `${this.b64Buffers.get(b64File) ?? ""}${chunk}`);
      appended = true;
    }
    if (!appended) return { executionId: input.executionId, exitCode: 0, stdout: "", stderr: "", timedOut: false, cancelled: false };
    const finalize = /base64 -d '([^']+)' \| gunzip > '([^']+)' && rm -f '[^']+' && sha256sum '([^']+)'/.exec(input.command);
    if (finalize) {
      const [, b64File, target, sumTarget] = finalize;
      const bytes = gunzipSync(Buffer.from(this.b64Buffers.get(b64File) ?? "", "base64"));
      this.b64Buffers.delete(b64File);
      if (this.execMode === "corruptLast") bytes[0] = bytes[0] ^ 0xff;
      this.files.set(target, bytes);
      return { executionId: input.executionId, exitCode: 0, stdout: `${sha256(bytes)}  ${sumTarget}\n`, stderr: "", timedOut: false, cancelled: false };
    }
    return { executionId: input.executionId, exitCode: 0, stdout: "", stderr: "", timedOut: false, cancelled: false };
  }
}

// ---- fake repository mirroring policy.readUtf8 + repository.patch ----

type FakeFile = { text: string };
class FakeRepository implements SbwRepositoryDeps {
  readonly files = new Map<string, FakeFile>();
  readCalls = 0;
  readonly patchCalls: Array<{ path: string; baseHash: string; hunks: unknown[] }> = [];
  patchError: Error | null = null;

  addFile(relativePath: string, text: string): void { this.files.set(relativePath, { text }); }

  // The real repository exposes its policy as a public field; the fake nests
  // readUtf8 the same way so the structural type matches the production shape.
  readonly policy = { readUtf8: (relativePath: string, maxBytes: number) => this.readUtf8Inner(relativePath, maxBytes) };

  private async readUtf8Inner(relativePath: string, maxBytes: number): Promise<{ text: string; relativePath: string }> {
    this.readCalls += 1;
    const file = this.files.get(relativePath);
    if (!file) throw new EngineeringError("PATH_NOT_FOUND");
    const bytes = Buffer.from(file.text, "utf8");
    if (bytes.length > maxBytes) throw new EngineeringError("FILE_LIMIT_EXCEEDED");
    return { text: file.text, relativePath };
  }

  // Mirrors the real patch gates that matter here: baseHash optimistic
  // concurrency + full-replace hunk application with patchLines reassembly
  // (bom/eol/finalNewline preserved), returning real hashes of written bytes.
  async patch(input: { path: string; baseHash: string; hunks: Array<{ startLine: number; deleteLines: string[]; insertLines: string[] }>; expectedChangeCount?: number; acknowledgeWrite: boolean }) {
    this.patchCalls.push({ path: input.path, baseHash: input.baseHash, hunks: input.hunks });
    if (!input.acknowledgeWrite) throw new EngineeringError("WRITE_ACKNOWLEDGEMENT_REQUIRED");
    if (this.patchError) throw this.patchError;
    const file = this.files.get(input.path);
    if (!file) throw new EngineeringError("PATH_NOT_FOUND");
    const before = Buffer.from(file.text, "utf8");
    const oldHash = sha256(before);
    if (oldHash !== input.baseHash) throw new EngineeringError("FILE_VERSION_CONFLICT");
    const text = file.text;
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const finalNewline = text.endsWith(eol);
    const bom = text.startsWith(String.fromCharCode(0xfeff));
    const body = bom ? text.slice(1) : text;
    const lines = body === "" ? [] : body.slice(0, finalNewline ? -eol.length : undefined).split(eol);
    if (input.expectedChangeCount !== undefined && input.expectedChangeCount !== input.hunks.length) throw new EngineeringError("PATCH_CHANGE_COUNT_MISMATCH");
    for (const hunk of input.hunks) {
      const index = hunk.startLine - 1;
      if (hunk.deleteLines.some((line, offset) => lines[index + offset] !== line)) throw new EngineeringError("PATCH_CONTEXT_MISMATCH");
      lines.splice(index, hunk.deleteLines.length, ...hunk.insertLines);
    }
    const nextText = `${bom ? String.fromCharCode(0xfeff) : ""}${lines.join(eol)}${finalNewline ? eol : ""}`;
    const next = Buffer.from(nextText, "utf8");
    if (next.length > 131_072) throw new EngineeringError("FILE_LIMIT_EXCEEDED");
    file.text = nextText;
    return { filesChanged: [input.path], oldHash, newHash: sha256(next), diff: "", truncated: false, warnings: [] };
  }
}

// ---- harness ----

async function harness() {
  const dir = await mkdtemp(path.join(tmpdir(), "sbw-"));
  const provider = new FakeSandboxProvider();
  const service = new SandboxService(provider, new MissionRecordStore(path.join(dir, "missions.json")));
  const repository = new FakeRepository();
  const deps = { service, transport: makeExecTransport(service), repository };
  return { dir, provider, service, repository, deps, missionId: `sbw-unit-${Date.now()}-${Math.floor(Math.random() * 1e6)}` };
}
const close = async (dir: string) => { await rm(dir, { recursive: true, force: true }); };
const call = (deps: unknown, input: unknown) => runSandboxBatchWrite(input as never, deps as never);

const A_TXT = "export const alpha = 1;\nexport const join = (a: number, b: number) => a + b;\n";
const B_TXT = "export const beta = \"two\";\n";

// ---- pure hunk construction (mirrors repository.patchLines decomposition) ----

test("replaceTotalHunk: LF file with final newline", () => {
  const base = "one\ntwo\n";
  const hunk = replaceTotalHunk(base, "ONE\nTWO\nTHREE\n");
  assert.deepEqual(hunk, { startLine: 1, deleteLines: ["one", "two"], insertLines: ["ONE", "TWO", "THREE"] });
  // Reassembly the way repository.patchLines does it must return exactly the
  // intended new content (eol + final newline preserved from the BASE).
  const eol = "\n";
  const rebuilt = `${hunk.insertLines.join(eol)}${eol}`;
  assert.equal(rebuilt, "ONE\nTWO\nTHREE\n");
});

test("replaceTotalHunk: LF file without final newline keeps the base's no-final-newline layout", () => {
  const base = "one\ntwo";
  const hunk = replaceTotalHunk(base, "ONE\nTWO");
  assert.deepEqual(hunk, { startLine: 1, deleteLines: ["one", "two"], insertLines: ["ONE", "TWO"] });
  // patchLines reassembles with finalNewline=false → no trailing eol.
  const rebuilt = hunk.insertLines.join("\n");
  assert.equal(rebuilt, "ONE\nTWO");
});

test("replaceTotalHunk: CRLF file keeps CRLF join semantics (lines are eol-free)", () => {
  const base = "one\r\ntwo\r\n";
  const hunk = replaceTotalHunk(base, "ONE\r\nTWO\r\n");
  assert.deepEqual(hunk, { startLine: 1, deleteLines: ["one", "two"], insertLines: ["ONE", "TWO"] });
  const rebuilt = `${hunk.insertLines.join("\r\n")}\r\n`;
  assert.equal(rebuilt, "ONE\r\nTWO\r\n");
});

test("replaceTotalHunk: BOM base keeps the BOM decision with patchLines (bom stripped from baseLines)", () => {
  const bom = String.fromCharCode(0xfeff);
  const base = `${bom}one\ntwo\n`;
  const hunk = replaceTotalHunk(base, "ONE\nTWO\n");
  assert.deepEqual(hunk, { startLine: 1, deleteLines: ["one", "two"], insertLines: ["ONE", "TWO"] });
  // patchLines would rebuild with the base's bom flag → BOM preserved.
  const rebuilt = `${bom}${hunk.insertLines.join("\n")}\n`;
  assert.equal(rebuilt, `${bom}ONE\nTWO\n`);
});

test("replaceTotalHunk: empty base line set and single-line replacement", () => {
  const hunk = replaceTotalHunk("only\n", "solo");
  assert.deepEqual(hunk, { startLine: 1, deleteLines: ["only"], insertLines: ["solo"] });
});

test("replaceTotalHunk: trailing empty line from split is not fed into deleteLines", () => {
  const base = "a\nb\n";
  const hunk = replaceTotalHunk(base, "x\ny\n");
  assert.equal(hunk.deleteLines[hunk.deleteLines.length - 1], "b");
  assert.equal(hunk.insertLines[hunk.insertLines.length - 1], "y");
  assert.ok(!hunk.deleteLines.includes(""));
});

test("replaceTotalHunk: rejects BOM inside target content", () => {
  const bom = String.fromCharCode(0xfeff);
  assert.throws(() => replaceTotalHunk("a\n", `${bom}x\n`), rejectsCode("SBW_INVALID_CONTENT"));
});

// ---- schema gates ----

test("schema: enforces the SBW_MAX_OPS ceiling and content cap", () => {
  const six = Array.from({ length: SBW_MAX_OPS + 1 }, (_, i) => ({ path: `f${i}.ts`, content: "x" }));
  assert.equal(sandboxBatchWriteInputSchema.safeParse({ action: "write", missionId: "sbw-unit-0001", sandboxId: "fake-sbx-1", ops: six }).success, false);
  assert.equal(sandboxBatchWriteInputSchema.safeParse({ action: "write", missionId: "sbw-unit-0001", sandboxId: "fake-sbx-1", ops: [{ path: "f.ts", content: "x".repeat(131_073) }] }).success, false);
  assert.equal(sandboxBatchWriteInputSchema.safeParse({ action: "write", missionId: "sbw-unit-0001", sandboxId: "fake-sbx-1", ops: [{ path: "f.ts", content: "x" }] }).success, true);
});

test("schema: rejects mission ids outside the SB missionId pattern", () => {
  assert.equal(sandboxBatchWriteInputSchema.safeParse({ action: "materialize", missionId: "sb w", paths: ["a.ts"] }).success, false);
  assert.equal(sandboxBatchWriteInputSchema.safeParse({ action: "materialize", missionId: "sbw-unit-0001", paths: ["a.ts"] }).success, true);
});

test("dispatcher: rejects fields that do not belong to the action (zero side effects)", async () => {
  const h = await harness();
  try {
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "a.ts", content: "x" }], paths: ["a.ts"] }), engineeringCode("INPUT_INVALID"));
    await assert.rejects(call(h.deps, { action: "validate", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "a.ts", content: "x" }] }), engineeringCode("INPUT_INVALID"));
    assert.equal(h.provider.createCalls, 0);
  } finally { await close(h.dir); }
});

test("dispatcher: materialize requires paths; write requires sandboxId+ops; sync requires acknowledgeWrite", async () => {
  const h = await harness();
  try {
    await assert.rejects(call(h.deps, { action: "materialize", missionId: h.missionId }), engineeringCode("INPUT_INVALID"));
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId }), engineeringCode("INPUT_INVALID"));
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1" }), engineeringCode("WRITE_ACKNOWLEDGEMENT_REQUIRED"));
  } finally { await close(h.dir); }
});

// ---- materialize ----

test("materialize: registers base hashes at copy time and proves byte-identical copies", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    h.repository.addFile("src/b.ts", B_TXT);
    const result = await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts", "src/b.ts"] }) as { action: string; sandboxId: string; files: Array<{ path: string; baseHash: string; copyVerified: boolean; execs: number }>; allCopiesVerified: boolean };
    assert.equal(result.action, "materialize");
    assert.equal(result.sandboxId, "fake-sbx-1");
    assert.equal(result.allCopiesVerified, true);
    assert.deepEqual(result.files.map((f) => f.path).sort(), ["src/a.ts", "src/b.ts"]);
    for (const file of result.files) {
      assert.equal(file.baseHash, sha256(Buffer.from(h.repository.files.get(file.path)!.text, "utf8")));
      assert.equal(file.copyVerified, true);
      assert.ok(file.execs >= 1);
    }
    // The sandbox holds the exact bytes.
    assert.equal(h.provider.files.get(`/tmp/sbw-${h.missionId}/base/src/a.ts`)?.toString("utf8"), A_TXT);
  } finally { await close(h.dir); }
});

test("materialize: duplicate paths are rejected BEFORE any side effect", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await assert.rejects(call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts", "src/a.ts"] }), rejectsCode("SBW_DUPLICATE_PATH"));
    assert.equal(h.provider.createCalls, 0);
  } finally { await close(h.dir); }
});

test("materialize: a failed read happens before sandbox creation (zero side effects)", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await assert.rejects(call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts", "src/missing.ts"] }), engineeringCode("PATH_NOT_FOUND"));
    assert.equal(h.provider.createCalls, 0);
  } finally { await close(h.dir); }
});

test("materialize: integrity mismatch destroys the sandbox and drops the batch", async () => {
  const h = await harness();
  try {
    h.provider.execMode = "corruptLast";
    h.repository.addFile("src/a.ts", A_TXT);
    await assert.rejects(call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] }), rejectsCode("SBW_INTEGRITY_MISMATCH"));
    assert.deepEqual(h.provider.destroyCalls, ["fake-sbx-1"]);
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/a.ts", content: "x" }] }), rejectsCode("SBW_BATCH_NOT_FOUND"));
  } finally { await close(h.dir); }
});

test("materialize: transport exec failure is a typed error and destroys the sandbox", async () => {
  const h = await harness();
  try {
    h.provider.execMode = "failExec";
    h.repository.addFile("src/a.ts", A_TXT);
    await assert.rejects(call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] }), rejectsCode("SBW_EXEC_FAILED"));
    assert.deepEqual(h.provider.destroyCalls, ["fake-sbx-1"]);
  } finally { await close(h.dir); }
});

// ---- write ----

test("write: applies ops inside the sandbox and verifies sha equality per op", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    h.repository.addFile("src/b.ts", B_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts", "src/b.ts"] });
    const result = await call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/a.ts", content: "export const alpha = 2;\n" }, { path: "src/b.ts", content: "export const beta = \"three\";\n" }] }) as { applied: Array<{ path: string; writeVerified: boolean }>; allWriteVerified: boolean };
    assert.equal(result.allWriteVerified, true);
    assert.equal(h.provider.files.get(`/tmp/sbw-${h.missionId}/base/src/a.ts`)?.toString("utf8"), "export const alpha = 2;\n");
    assert.equal(h.provider.files.get(`/tmp/sbw-${h.missionId}/base/src/b.ts`)?.toString("utf8"), "export const beta = \"three\";\n");
  } finally { await close(h.dir); }
});

test("write: duplicate path in the SAME call is rejected with zero side effects", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] });
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/a.ts", content: "one" }, { path: "src/a.ts", content: "two" }] }), rejectsCode("SBW_DUPLICATE_PATH"));
    assert.equal(h.provider.files.get(`/tmp/sbw-${h.missionId}/base/src/a.ts`)?.toString("utf8"), A_TXT);
  } finally { await close(h.dir); }
});

test("write: refuses paths that were never materialized", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] });
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/other.ts", content: "x" }] }), rejectsCode("SBW_TARGET_NOT_MATERIALIZED"));
  } finally { await close(h.dir); }
});

test("write: BOM in target content is refused; sandboxId mismatch is refused", async () => {
  const h = await harness();
  const bom = String.fromCharCode(0xfeff);
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] });
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/a.ts", content: `${bom}x` }] }), rejectsCode("SBW_INVALID_CONTENT"));
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-99", ops: [{ path: "src/a.ts", content: "x" }] }), rejectsCode("MISSION_SANDBOX_MISMATCH"));
  } finally { await close(h.dir); }
});

test("write: integrity mismatch destroys the sandbox and drops the batch (fail-closed)", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    h.repository.addFile("src/b.ts", B_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts", "src/b.ts"] });
    h.provider.execMode = "corruptLast";
    await assert.rejects(call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/a.ts", content: "x" }, { path: "src/b.ts", content: "y" }] }), rejectsCode("SBW_INTEGRITY_MISMATCH"));
    assert.ok(h.provider.destroyCalls.includes("fake-sbx-1"));
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }), rejectsCode("SBW_BATCH_NOT_FOUND"));
  } finally { await close(h.dir); }
});

// ---- validate ----

test("validate: refuses without writes and refuses without the batch sandbox", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] });
    await assert.rejects(call(h.deps, { action: "validate", missionId: h.missionId, sandboxId: "fake-sbx-1" }), rejectsCode("SBW_NOTHING_TO_VALIDATE"));
  } finally { await close(h.dir); }
});

// Validation failure path: drive a REAL tsc check inside the fake sandbox by
// making the fake exec mode return a failing exit code for the validate
// command (the check itself is a live production concern, proven separately).
test("validate: failure destroys the sandbox and blocks sync with VALIDATION_REQUIRED", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] });
    await call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/a.ts", content: "export const a: number = 'not-a-number';\n" }] });
    // Simulate a failing in-sandbox check.
    h.provider.execMode = "failExec";
    await assert.rejects(call(h.deps, { action: "validate", missionId: h.missionId, sandboxId: "fake-sbx-1" }), (error: unknown) => {
      if (!(error instanceof SandboxError) || error.code !== "SBW_VALIDATION_FAILED") return false;
      assert.ok(error.message.includes("was destroyed"));
      return true;
    });
    assert.deepEqual(h.provider.destroyCalls, ["fake-sbx-1"]);
    // Nothing reaches the real repository: zero patch calls, content unchanged.
    // The batch state survives (dead sandbox) so sync refuses with
    // SBW_VALIDATION_REQUIRED rather than BATCH_NOT_FOUND.
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }), rejectsCode("SBW_VALIDATION_REQUIRED"));
    assert.equal(h.repository.patchCalls.length, 0);
    assert.equal(h.repository.files.get("src/a.ts")!.text, A_TXT);
  } finally { await close(h.dir); }
});

// ---- sync ----

test("sync: refuses before a PASS validation and refuses a second sync", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/a.ts"] });
    await call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops: [{ path: "src/a.ts", content: A_TXT }] });
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }), rejectsCode("SBW_VALIDATION_REQUIRED"));
  } finally { await close(h.dir); }
});

// For sync proofs the fake validate must PASS: the check command runs in
// "normal" exec mode (exit 0). Kept as a helper because every sync test needs
// the full materialize → write → validate PASS ladder.
async function materializeWriteValidate(h: Awaited<ReturnType<typeof harness>>, ops: Array<{ path: string; content: string }>): Promise<void> {
  h.provider.execMode = "normal";
  const paths = [...new Set(ops.map((op) => op.path))];
  await call(h.deps, { action: "materialize", missionId: h.missionId, paths });
  await call(h.deps, { action: "write", missionId: h.missionId, sandboxId: "fake-sbx-1", ops });
  await call(h.deps, { action: "validate", missionId: h.missionId, sandboxId: "fake-sbx-1" });
}

test("sync: happy path — one approval, per-file REPLACE TOTAL hunks through repository.patch, real hashes reported", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    h.repository.addFile("src/b.ts", B_TXT);
    const newA = "export const alpha = 10;\n";
    const newB = "export const beta = \"twenty\";\n";
    await materializeWriteValidate(h, [{ path: "src/a.ts", content: newA }, { path: "src/b.ts", content: newB }]);
    const result = await call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }) as { action: string; driftChecked: number; synced: number; applied: Array<{ path: string; oldHash: string; newHash: string; changed: boolean }> };
    assert.equal(result.action, "sync");
    assert.equal(result.driftChecked, 2);
    assert.equal(result.synced, 2);
    assert.deepEqual(result.applied.map((entry) => entry.path).sort(), ["src/a.ts", "src/b.ts"]);
    for (const entry of result.applied) {
      assert.equal(entry.changed, true);
      assert.equal(entry.newHash, sha256(Buffer.from(h.repository.files.get(entry.path)!.text, "utf8")));
    }
    assert.equal(h.repository.files.get("src/a.ts")!.text, newA);
    assert.equal(h.repository.files.get("src/b.ts")!.text, newB);
    // REPLACE TOTAL shape: one hunk per patch call, startLine 1.
    for (const callRecord of h.repository.patchCalls) {
      assert.equal((callRecord.hunks as Array<{ startLine: number }>).length, 1);
      assert.equal((callRecord.hunks as Array<{ startLine: number }>)[0].startLine, 1);
    }
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }), rejectsCode("SBW_ALREADY_SYNCED"));
  } finally { await close(h.dir); }
});

test("sync: drift — repository changed since materialization refuses with zero patch calls", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    h.repository.addFile("src/b.ts", B_TXT);
    await materializeWriteValidate(h, [{ path: "src/a.ts", content: "export const alpha = 10;\n" }, { path: "src/b.ts", content: "export const beta = \"twenty\";\n" }]);
    // Drift ONLY on src/a.ts after validation.
    h.repository.addFile("src/a.ts", "export const alpha = 999;\n");
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }), (error: unknown) => {
      if (!(error instanceof SandboxError) || error.code !== "SBW_DRIFT_DETECTED") return false;
      // The refusal names the drifted file and carries both hashes, never content.
      const detail = error.message;
      assert.ok(detail.includes("src/a.ts"));
      assert.ok(detail.includes("expectedHash"));
      assert.ok(detail.includes("actualHash"));
      return true;
    });
    // ZERO mutation: the drifted set syncs NOTHING, the untouched file keeps its bytes.
    assert.equal(h.repository.patchCalls.length, 0);
    assert.equal(h.repository.files.get("src/b.ts")!.text, B_TXT);
  } finally { await close(h.dir); }
});

test("sync: bind/apply race — patch revalidates baseHash and the conflict propagates honestly", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await materializeWriteValidate(h, [{ path: "src/a.ts", content: "export const alpha = 10;\n" }]);
    // The file changes BETWEEN bind and apply: patch (not bind) must catch it.
    h.repository.patchError = new EngineeringError("FILE_VERSION_CONFLICT");
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }), engineeringCode("FILE_VERSION_CONFLICT"));
  } finally { await close(h.dir); }
});

test("sync: a vanished target (path gone since materialization) is drift, not a crash", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    await materializeWriteValidate(h, [{ path: "src/a.ts", content: "export const alpha = 10;\n" }]);
    h.repository.files.delete("src/a.ts");
    await assert.rejects(call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }), rejectsCode("SBW_DRIFT_DETECTED"));
    assert.equal(h.repository.patchCalls.length, 0);
  } finally { await close(h.dir); }
});

test("sync: content-identical batch is a real governed no-op (oldHash == newHash, changed=false)", async () => {
  const h = await harness();
  try {
    h.repository.addFile("src/a.ts", A_TXT);
    h.repository.addFile("src/b.ts", B_TXT);
    await materializeWriteValidate(h, [{ path: "src/a.ts", content: A_TXT }, { path: "src/b.ts", content: B_TXT }]);
    const result = await call(h.deps, { action: "sync", missionId: h.missionId, sandboxId: "fake-sbx-1", acknowledgeWrite: true }) as { applied: Array<{ path: string; changed: boolean; oldHash: string; newHash: string }> };
    for (const entry of result.applied) {
      assert.equal(entry.changed, false);
      assert.equal(entry.oldHash, entry.newHash);
    }
    assert.equal(h.repository.files.get("src/a.ts")!.text, A_TXT);
    assert.equal(h.repository.files.get("src/b.ts")!.text, B_TXT);
  } finally { await close(h.dir); }
});

// ---- transport protocol ----

test("transport: chunked gzip+base64 appends through exec land byte-exact files with the exact expected exec count", async () => {
  const h = await harness();
  try {
    // High-entropy content (17-digit decimals) so gzip cannot collapse it
    // into a single 48k-char base64 chunk.
    const content = `${Array.from({ length: 3500 }, (_, i) => `const v${i} = ${Math.sin(i).toFixed(17)};`).join("\n")}\n`;
    assert.ok(Buffer.byteLength(content, "utf8") <= 131_072);
    h.repository.addFile("src/big.ts", content);
    const result = await call(h.deps, { action: "materialize", missionId: h.missionId, paths: ["src/big.ts"] }) as { files: Array<{ baseHash: string; copyVerified: boolean; execs: number }> };
    const expectedChunks = Math.ceil(gzipSync(Buffer.from(content, "utf8"), { level: 6 }).toString("base64").length / SBW_B64_CHUNK_CHARS);
    assert.equal(result.files[0].execs, expectedChunks, "one printf exec per chunk");
    assert.ok(expectedChunks >= 2, "content is sized to span multiple chunks");
    assert.equal(result.files[0].copyVerified, true);
    const stored = h.provider.files.get(`/tmp/sbw-${h.missionId}/base/src/big.ts`);
    assert.ok(stored && stored.toString("utf8") === content);
  } finally { await close(h.dir); }
});

// ---- helper wiring for the sync tests (materialize → write → validate PASS) ----
