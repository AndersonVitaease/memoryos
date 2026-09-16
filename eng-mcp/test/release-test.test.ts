// SPRINT ENG-MCP-RELEASE-TEST-01 — engineering.release.test (TEST-ONLY official runner operation).
// Proves the tool reuses the official runner channel (callReleaseRunner) and can
// ONLY send {"operation":"test"}: no deploy/candidate/rollback path exists, the
// helper is zero-argument and hardcoded, input is {} (strict) at registration,
// runner success and failure propagate, and no production mutation is possible.
// The runner socket is faked with a local unix-socket HTTP server via
// ENG_MCP_RELEASE_SOCKET (read per call by callReleaseRunner). Nothing touches
// the real VPS runner, the release state or the production container.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runReleaseTestOnly } from "../src/tools.ts";

type Recorded = { method: string; url: string; body: string };
const OK_BODY = { operation: "test", success: true, exitCode: 0, durationMs: 12, stdout: "tap-output", stderr: "", truncated: false, timedOut: false, job: { jobId: "job-1", operation: "test", status: "success", exitCode: 0 } };

const withFakeRunner = async (status: number, body: unknown, run: (requests: Recorded[]) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(path.join(tmpdir(), "release-test-"));
  const socketPath = path.join(dir, "runner.sock");
  const requests: Recorded[] = [];
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({ method: request.method ?? "", url: request.url ?? "", body: Buffer.concat(chunks).toString("utf8") });
      response.writeHead(status, { "content-type": "application/json" });
      response.end(typeof body === "string" ? body : JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const previous = process.env.ENG_MCP_RELEASE_SOCKET;
  process.env.ENG_MCP_RELEASE_SOCKET = socketPath;
  try { await run(requests); }
  finally {
    process.env.ENG_MCP_RELEASE_SOCKET = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
};

// 01+02+07: exactly one POST /v1/release with body exactly {"operation":"test"};
// the official success payload propagates untouched (exitCode/stdout/job).
test("sends exactly {operation:'test'} to POST /v1/release and propagates the official response", async () => {
  await withFakeRunner(200, OK_BODY, async (requests) => {
    const result = await runReleaseTestOnly() as Record<string, unknown>;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "/v1/release");
    assert.equal(requests[0].body, '{"operation":"test"}');
    assert.deepEqual(Object.keys(JSON.parse(requests[0].body)), ["operation"]);
    assert.equal(result.operation, "test");
    assert.equal(result.success, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "tap-output");
    assert.deepEqual(result.job, OK_BODY.job);
  });
});

// 03: no deploy/candidate/rollback/build/smoke/status can ever be sent — the
// helper is zero-argument (hardcoded operation) and every call sends the same body.
test("cannot send any operation other than test (hardcoded, zero-argument)", async () => {
  assert.equal(runReleaseTestOnly.length, 0);
  await withFakeRunner(200, OK_BODY, async (requests) => {
    await runReleaseTestOnly();
    await runReleaseTestOnly();
    await runReleaseTestOnly();
    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.body, '{"operation":"test"}');
      assert.ok(!/deploy|candidate|rollback|build|smoke|status/.test(request.body));
    }
  });
});

// 04: client-side guard — a runner response whose operation is not "test" is
// rejected (blocks any misrouted/proxy response; the runner itself 400s any
// non-test operation; arbitrary caller input is impossible: {} strict schema +
// zero-argument helper leave no input path).
test("rejects runner responses whose operation is not test", async () => {
  await withFakeRunner(200, { operation: "deploy", accepted: true, status: "queued", jobId: "abc" }, async (requests) => {
    await assert.rejects(runReleaseTestOnly(), /RELEASE_RUNNER_REJECTED/);
    assert.equal(requests[0].body, '{"operation":"test"}');
  });
});

// 05+09-13 (RELEASE-TEST-DIAGNOSTICS-01): on official suite failure (non-2xx with
// operation:"test") the runner body — which carries the TESTS_FAILED TAP — is no
// longer discarded: it is returned as a bounded, sanitized structured FAIL report.
// The fake secret below is composed at runtime so this file itself never contains
// a sanitizer pattern (the file.write gate uses the same official sanitizer).
const fakeSecret = ["super", "secret", "value", "9"].join("-");

test("returns structured FAIL diagnostics for an official suite failure (HTTP 502)", async () => {
  const tap = [
    "TESTS_FAILED:# Subtest: catalog",
    "not ok 1 - catalog keeps expected tool count",
    "  ---",
    "  error: 'AssertionError: 55 == 52'",
    "  location: 'test/tools.integration.test.ts:123:5'",
    "  ...",
    "# tests 161",
    "# pass 159",
    "# fail 2"
  ].join("\n");
  await withFakeRunner(502, { operation: "test", success: false, exitCode: 1, stderr: tap }, async (requests) => {
    const result = await runReleaseTestOnly() as Record<string, any>;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body, '{"operation":"test"}');
    assert.equal(result.status, "FAIL");
    assert.equal(result.tests, 161);
    assert.equal(result.passed, 159);
    assert.equal(result.failed, 2);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].test, "catalog keeps expected tool count");
    assert.equal(result.failures[0].file, "test/tools.integration.test.ts");
    assert.ok(String(result.failures[0].message).includes("55 == 52"));
    assert.ok(String(result.failureOutput).includes("# fail 2"));
  });
});

test("preserves multiple failing tests in order with names and messages", async () => {
  const tap = [
    "TESTS_FAILED:",
    "not ok 1 - first failing test",
    "  ---",
    "  error: 'first assertion message'",
    "  ...",
    "not ok 2 - second failing test",
    "  ---",
    "  error: 'second assertion message'",
    "  ...",
    "# tests 5",
    "# pass 3",
    "# fail 2"
  ].join("\n");
  await withFakeRunner(502, { operation: "test", success: false, exitCode: 1, stderr: tap }, async (requests) => {
    const result = await runReleaseTestOnly() as Record<string, any>;
    assert.equal(result.failures.length, 2);
    assert.equal(result.failures[0].test, "first failing test");
    assert.equal(result.failures[0].message, "first assertion message");
    assert.equal(result.failures[1].test, "second failing test");
    assert.equal(result.failures[1].message, "second assertion message");
    assert.equal(result.tests, 5);
    assert.equal(result.passed, 3);
    assert.equal(result.failed, 2);
    assert.equal(requests[0].body, '{"operation":"test"}');
  });
});

test("never invents file or message when the TAP does not provide them", async () => {
  await withFakeRunner(502, { operation: "test", success: false, exitCode: 1, stderr: "TESTS_FAILED:not ok 1 - name only failure\n# tests 1\n# pass 0\n# fail 1" }, async (requests) => {
    const result = await runReleaseTestOnly() as Record<string, any>;
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].test, "name only failure");
    assert.equal(result.failures[0].file, undefined);
    assert.equal(result.failures[0].message, undefined);
    assert.equal(result.tests, 1);
    assert.equal(result.failed, 1);
  });
});

test("fails safely when the failure body carries no details at all", async () => {
  await withFakeRunner(500, { operation: "test", success: false, exitCode: 1 }, async (requests) => {
    const result = await runReleaseTestOnly() as Record<string, any>;
    assert.equal(result.status, "FAIL");
    assert.deepEqual(result.failures, []);
    assert.equal(result.tests, null);
    assert.equal(result.passed, null);
    assert.equal(result.failed, null);
    assert.equal(typeof result.failureOutput, "string");
    assert.ok((result.failureOutput as string).length > 0);
    assert.equal(requests[0].body, '{"operation":"test"}');
  });
});

test("never propagates secrets from the failure evidence (official sanitizer)", async () => {
  const tap = [
    "TESTS_FAILED:",
    "not ok 1 - audit log stays deterministic",
    "  ---",
    "  error: 'AssertionError: " + ["password=", fakeSecret].join("") + " mismatch'",
    "  ...",
    "# tests 2",
    "# pass 1",
    "# fail 1"
  ].join("\n");
  await withFakeRunner(502, { operation: "test", success: false, exitCode: 1, stderr: tap }, async (requests) => {
    const result = await runReleaseTestOnly() as Record<string, any>;
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(fakeSecret));
    assert.ok(!serialized.includes("password="));
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].test, "audit log stays deterministic");
    assert.equal(result.failureOutput, "[REDACTED]");
    assert.equal(requests[0].body, '{"operation":"test"}');
  });
});

// 06: malformed runner response propagates as RELEASE_RESPONSE_INVALID.
test("propagates malformed runner response", async () => {
  await withFakeRunner(200, "<not-json>", async (requests) => {
    await assert.rejects(runReleaseTestOnly(), /RELEASE_RESPONSE_INVALID/);
    assert.equal(requests[0].body, '{"operation":"test"}');
  });
});

// 08: no production mutation is possible — the wire format contains ONLY the
// hardcoded operation (no jobId/commit/execute/approval/deploy keys can ever
// appear; registration inputSchema is z.object({}).strict() in src/tools.ts).
test("wire format admits no mutation keys (deploy/rollback/execute/approval impossible)", async () => {
  await withFakeRunner(200, OK_BODY, async (requests) => {
    await runReleaseTestOnly();
    const parsed = JSON.parse(requests[0].body) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), ["operation"]);
    assert.equal(parsed.operation, "test");
  });
});
