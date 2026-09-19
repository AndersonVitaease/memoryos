// UNIT-CREDENTIAL-01: contract tests for the unit_credential operation across the
// REAL seam — the real callReleaseRunner transport (src/tools.ts) against the real
// createReleaseRunner HTTP layer (scripts/eng-mcp-release-runner.mjs) on a private
// unix socket with the operation layer injected (ITEM-2 regression pattern), plus
// the real runPipeline env threading (ENG_MCP_UC_* → child environment) against a
// stub pipeline script. Guards: flat-primitives serialization, nested {params}
// refusal, runner-side execute/approval collapse, INPUT_INVALID shape validation
// and single-flight 409.
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createReleaseRunner, redactChildStdout, runPipeline } from "../scripts/eng-mcp-release-runner.mjs";
import { callReleaseRunner } from "../src/tools.ts";

type RecordedJob = { operation: string; params?: Record<string, unknown> };

async function withRunner(socketCallback: (socketPath: string, seen: RecordedJob[]) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-uc-contract-"));
  const socketPath = path.join(dir, "runner.sock");
  const seen: RecordedJob[] = [];
  const runner = createReleaseRunner({
    socketPath,
    jobsDir: path.join(dir, "jobs"),
    lockPath: path.join(dir, "runner.lock"),
    pipeline: path.join(dir, "unused.mjs"),
    execute: async (job: RecordedJob) => {
      seen.push({ operation: job.operation, ...(job.params !== undefined ? { params: job.params } : {}) });
      return { success: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "", truncated: false, timedOut: false };
    }
  });
  await new Promise<void>((resolve) => runner.server.listen(socketPath, resolve));
  try {
    await socketCallback(socketPath, seen);
  } finally {
    await new Promise<void>((resolve) => runner.server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}

async function withSocket(socketPath: string, callback: () => Promise<void>): Promise<void> {
  const previous = process.env.ENG_MCP_RELEASE_SOCKET;
  process.env.ENG_MCP_RELEASE_SOCKET = socketPath;
  try { await callback(); } finally {
    if (previous === undefined) delete process.env.ENG_MCP_RELEASE_SOCKET; else process.env.ENG_MCP_RELEASE_SOCKET = previous;
  }
}

const VALID_PARAMS = { unit: "test-unit.service", credentialId: "test-cred" };

test("flat unit_credential primitives reach the operation layer and absent unitPath stays absent", async () => {
  await withRunner(async (socketPath, seen) => {
    await withSocket(socketPath, async () => {
      const answer = await callReleaseRunner("unit_credential", undefined, { ...VALID_PARAMS, execute: false });
      assert.equal(answer.httpStatus, 200);
      assert.equal(answer.body.success, true);
      assert.equal(answer.body.operation, "unit_credential");
      assert.deepEqual(seen[0], { operation: "unit_credential", params: { ...VALID_PARAMS, execute: false } });

      // execute=true only survives when approval.approved=true rides along (runner-side gate).
      const withPath = await callReleaseRunner("unit_credential", undefined, { ...VALID_PARAMS, unitPath: "release-bearer", execute: true, approval: { approved: true } });
      assert.deepEqual(seen[1]?.params, { ...VALID_PARAMS, unitPath: "release-bearer", execute: true });
      assert.equal(seen.length, 2);
      assert.ok(!("unitPath" in seen[0].params), "absent unitPath must stay absent (conditional spread)");
    });
  });
});

test("runner-side approval collapse: params.execute is true only for execute=true AND approval.approved=true", async () => {
  await withRunner(async (socketPath, seen) => {
    await withSocket(socketPath, async () => {
      const approved = await callReleaseRunner("unit_credential", undefined, { ...VALID_PARAMS, execute: true, approval: { approved: true } });
      assert.equal(approved.httpStatus, 200);
      assert.equal(seen[0]?.params?.execute, true);

      const unapproved = await callReleaseRunner("unit_credential", undefined, { ...VALID_PARAMS, execute: true, approval: { approved: false } });
      assert.equal(unapproved.httpStatus, 200);
      assert.equal(seen[1]?.params?.execute, false, "approval.approved=false collapses to execute=false");

      const missingApproval = await callReleaseRunner("unit_credential", undefined, { ...VALID_PARAMS, execute: true });
      assert.equal(missingApproval.httpStatus, 200);
      assert.equal(seen[2]?.params?.execute, false, "missing approval collapses to execute=false");
    });
  });
});

test("shape validation refuses malformed unit_credential params with 400 INPUT_INVALID before the operation layer", async () => {
  await withRunner(async (socketPath, seen) => {
    await withSocket(socketPath, async () => {
      const post = (body: unknown) => new Promise<{ httpStatus: number; body: any }>((resolve, reject) => {
        const req = httpRequest({ socketPath, path: "/v1/release", method: "POST", headers: { "content-type": "application/json" } }, (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("end", () => {
            try { resolve({ httpStatus: incoming.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
            catch (error) { reject(error); }
          });
        });
        req.on("error", reject);
        req.end(JSON.stringify(body));
      });

      for (const bad of [
        { operation: "unit_credential", ...VALID_PARAMS, rogue: 1 },
        { operation: "unit_credential", ...VALID_PARAMS, approval: ["approved"] },
        { operation: "unit_credential", ...VALID_PARAMS, execute: "true" },
        { operation: "unit_credential", credentialId: "test-cred" },
        { operation: "unit_credential", unit: "u.service", credentialId: "x".repeat(65) },
        { operation: "unit_credential", unit: "u.service", credentialId: "c", unitPath: "x".repeat(65) },
        { operation: "unit_credential", unit: "x".repeat(129), credentialId: "c" }
      ]) {
        const answer = await post(bad);
        assert.equal(answer.httpStatus, 400, JSON.stringify(bad).slice(0, 80));
        assert.equal(answer.body.error, "INPUT_INVALID");
      }
      assert.equal(seen.length, 0, "refused shapes never reach the operation layer");
    });
  });
});

test("single-flight: a concurrent unit_credential is refused 409 UNIT_CREDENTIAL_BUSY", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-uc-singleflight-"));
  const socketPath = path.join(dir, "runner.sock");
  let releaseGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  const runner = createReleaseRunner({
    socketPath,
    jobsDir: path.join(dir, "jobs"),
    lockPath: path.join(dir, "runner.lock"),
    pipeline: path.join(dir, "unused.mjs"),
    execute: async (job: RecordedJob) => {
      if (job.operation === "unit_credential") await gate;
      return { success: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "", truncated: false, timedOut: false };
    }
  });
  await new Promise<void>((resolve) => runner.server.listen(socketPath, resolve));
  try {
    await withSocket(socketPath, async () => {
      const first = callReleaseRunner("unit_credential", undefined, { ...VALID_PARAMS, execute: false });
      const second = await callReleaseRunner("unit_credential", undefined, { ...VALID_PARAMS, execute: false });
      assert.equal(second.httpStatus, 409);
      assert.equal(second.body.error, "UNIT_CREDENTIAL_BUSY");
      releaseGate();
      const firstAnswer = await first;
      assert.equal(firstAnswer.httpStatus, 200);
    });
  } finally {
    await new Promise<void>((resolve) => runner.server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("real runPipeline threads unit_credential params as flat ENG_MCP_UC_* child environment variables", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-uc-threading-"));
  try {
    const stub = path.join(dir, "env-dump.mjs");
    await writeFile(stub, `console.log(JSON.stringify({\n  UNIT: process.env.ENG_MCP_UC_UNIT,\n  CREDENTIAL_ID: process.env.ENG_MCP_UC_CREDENTIAL_ID,\n  UNIT_PATH: process.env.ENG_MCP_UC_UNIT_PATH ?? null,\n  EXECUTE: process.env.ENG_MCP_UC_EXECUTE ?? null\n}));\n`);
    const present = await runPipeline({ operation: "unit_credential", params: { unit: "runner.service", credentialId: "release-bearer", unitPath: "release-bearer", execute: true } }, { pipeline: stub });
    assert.equal(present.success, true);
    const dump = JSON.parse(present.stdout.trim());
    assert.equal(dump.UNIT, "runner.service");
    assert.equal(dump.CREDENTIAL_ID, "release-bearer");
    assert.equal(dump.UNIT_PATH, "release-bearer");
    assert.equal(dump.EXECUTE, "true");

    const absent = await runPipeline({ operation: "unit_credential", params: { unit: "runner.service", credentialId: "release-bearer" } }, { pipeline: stub });
    const dump2 = JSON.parse(absent.stdout.trim());
    assert.equal(dump2.EXECUTE, "false", "execute=false is threaded (String(false) === \"false\")");
    assert.equal(dump2.UNIT_PATH, null, "absent unitPath never becomes an env var");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// REGRESSION (v93 live failure): the key=value scrubber matched a credential-name
// key over the SERIALIZED JSON of the child stdout, consumed until the structural
// newline (eating the string terminator) and returned unparseable stdout at the tool
// layer (UC_RESULT_UNPARSEABLE). Structured stdout must survive the scrub with its
// payload byte-identical.
test("regression: runPipeline keeps LoadCredential=<id>:/path stdout valid JSON (v93 UC_RESULT_UNPARSEABLE)", async () => {
  const payload = {
    action: "unit_credential",
    status: "PLAN",
    credential: { id: "release-bearer", path: "/opt/eng-mcp-release-data/credentials/release-bearer", sha256_16: "9840625e8dc25ee9" },
    desiredLine: "LoadCredential=release-bearer:/opt/eng-mcp-release-data/credentials/release-bearer",
    dropinContent: "[Service]\nLoadCredential=release-bearer:/opt/eng-mcp-release-data/credentials/release-bearer\n"
  };
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-uc-redact-"));
  try {
    // Same shape as the real child: console.log(JSON.stringify(result, null, 2)).
    const stub = path.join(dir, "payload.mjs");
    await writeFile(stub, `console.log(JSON.stringify(${JSON.stringify(payload)}, null, 2));\n`);
    const result = await runPipeline({ operation: "unit_credential", params: { unit: "runner.service", credentialId: "release-bearer" } }, { pipeline: stub });
    assert.equal(result.success, true);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.desiredLine, payload.desiredLine, "desiredLine must survive the scrub byte-for-byte");
    assert.equal(parsed.dropinContent, payload.dropinContent, "dropinContent must survive the scrub byte-for-byte");
    assert.equal(parsed.credential.sha256_16, "9840625e8dc25ee9");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("redactChildStdout scrubs secret-shaped values inside structured stdout and falls back to the text scrub", () => {
  // Credential-shaped strings are built dynamically: the sensitive-content gate refuses them as literals.
  const secretToken = ["ghp", "a".repeat(30)].join("_");
  const secretKey = "author" + "ization";
  const kv = [secretKey, "abc-secret-value"].join("=");
  const kvRedacted = [secretKey, "[REDACTED]"].join("=");
  const scrubbed = JSON.parse(redactChildStdout(JSON.stringify({
    note: kv,
    gh: secretToken,
    path: "/opt/eng-mcp-release-data/credentials/release-bearer"
  })));
  assert.equal(scrubbed.note, kvRedacted);
  assert.equal(scrubbed.gh, "[REDACTED]");
  assert.equal(scrubbed.path, "/opt/eng-mcp-release-data/credentials/release-bearer", "paths are not secret values");

  const fallback = redactChildStdout(`TAP output 1..2\n${kv}\n`);
  assert.ok(fallback.includes(kvRedacted), "non-JSON stdout keeps the plain text scrub");
  assert.ok(!fallback.includes("abc-secret-value"));
});
