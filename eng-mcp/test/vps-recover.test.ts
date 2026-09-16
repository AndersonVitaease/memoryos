// SPRINT VPS-RECOVER-01 — engineering.vps.recover (controlled official-rollback MVP).
// Every test uses FAKE deps: the release runner is mocked (scriptable in-process
// mock, plus one wire-level fake unix-socket runner mirroring release-test.test.ts).
// Nothing touches the real VPS runner, release-state.json, the production container
// or performs any real rollback. Core invariants under test:
//   - {} / execute=false -> PLAN, zero mutation, runner never called;
//   - IN_SYNC -> BLOCKED (NOTHING_TO_RECOVER); reconcile UNKNOWN -> UNKNOWN;
//   - last-known-good absence, missing/false approval -> BLOCKED;
//   - the runner request is EXACTLY {"operation":"rollback"} (caller never chooses);
//   - 202/queued is NEVER RECOVERED; job failure -> NOT_RECOVERED;
//   - post-validation: official smoke (which re-syncs the release-state production
//     fields left stale by rollbackAction) + live catalog + fresh reconcile;
//     RECOVERED only with full evidence, insufficient evidence -> UNKNOWN,
//     stale/incoherent expected state after rollback -> NOT_RECOVERED;
//   - mutationPerformed is exact on every path; arbitrary input is rejected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runVpsRecover, vpsRecoverInputSchema, type VpsRecoverDeps, type VpsRecoverResult } from "../src/vpsRecover.ts";
import { callReleaseRunner } from "../src/tools.ts";

const ROLLBACK_JOB_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000";

// Synthetic drifted scenario: expected state describes the NEW release catalog,
// live production still reports the OLD (rolled-back / previous) catalog.
const EXPECTED_CATALOG_HASH = "hash-expected-new-release";
const EXPECTED_CATALOG_VERSION = "eng-mcp-tools-v51";
const EXPECTED_TOOL_COUNT = 51;
const LIVE_CATALOG_HASH = "hash-live-previous-release";
const LIVE_CATALOG_VERSION = "eng-mcp-tools-v50";
const LIVE_TOOL_COUNT = 50;

const state = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  currentRelease: "eng-mcp-candidate:candidate-new-release",
  productionImageId: "sha256:new-release-fake",
  sourceHash: "new-release-fake-source",
  productionCatalogHash: EXPECTED_CATALOG_HASH,
  toolCount: EXPECTED_TOOL_COUNT,
  catalogVersion: EXPECTED_CATALOG_VERSION,
  deployStatus: "PASS",
  smokeStatus: "PASS",
  previousContainer: "memoryos-eng-mcp-rollback-1788196214580",
  previousImage: "eng-mcp:previous-known-good",
  ...over
});

// The state the official smoke writes back after a successful rollback: expected
// fields re-synced to the live (rolled-back) catalog.
const syncedState = (): Record<string, unknown> => state({
  currentRelease: "eng-mcp:previous-known-good",
  productionImageId: "sha256:previous-known-good-fake",
  productionCatalogHash: LIVE_CATALOG_HASH,
  toolCount: LIVE_TOOL_COUNT,
  catalogVersion: LIVE_CATALOG_VERSION
});

const liveCatalog = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  catalogHash: LIVE_CATALOG_HASH,
  catalogVersion: LIVE_CATALOG_VERSION,
  toolCount: LIVE_TOOL_COUNT,
  ...over
});

type Call = { operation: string; jobId?: string };
type RunnerScript = (call: Call, calls: Call[]) => { httpStatus: number; body: unknown };

const deps = (over: Partial<VpsRecoverDeps> = {}): VpsRecoverDeps => ({
  readReleaseState: over.readReleaseState ?? (async () => state()),
  readCatalog: over.readCatalog ?? (async () => liveCatalog() as never),
  pollAttempts: over.pollAttempts ?? 3,
  pollDelayMs: over.pollDelayMs ?? 0,
  sleep: over.sleep ?? (async () => {}),
  ...over
});

// Scriptable fake runner: rollback -> 202 accepted; status -> queued twice then
// rolled_back; smoke -> success (script can override any response).
const happyScript = (): { runRunner: NonNullable<VpsRecoverDeps["runRunner"]>; calls: Call[]; flags: { smoke: boolean } } => {
  const calls: Call[] = [];
  const flags = { smoke: false };
  let statusCalls = 0;
  const runRunner: NonNullable<VpsRecoverDeps["runRunner"]> = async (operation, jobId) => {
    calls.push({ operation, jobId });
    if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
    if (operation === "status") {
      statusCalls += 1;
      return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: statusCalls >= 2 ? "rolled_back" : "queued" } } };
    }
    flags.smoke = true;
    return { httpStatus: 200, body: { operation: "smoke", success: true, exitCode: 0 } };
  };
  return { runRunner, calls, flags };
};

const blockersOf = (result: VpsRecoverResult): string[] => result.precheck.blockers;
const codesOf = (result: VpsRecoverResult): string[] => result.findings.map((finding) => finding.code);

test("01 {} -> PLAN, zero mutation, runner never called", async () => {
  const { runRunner, calls } = happyScript();
  const result = await runVpsRecover({}, deps({ runRunner }));
  assert.equal(result.status, "PLAN");
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.plan.action, "rollback");
  assert.equal(result.plan.possible, true);
  assert.deepEqual(result.plan.requires, ["execute=true", "approval.approved=true"]);
  assert.equal(result.precheck.reconcile.status, "DRIFTED");
  assert.equal(result.precheck.lkgPresent, true);
  assert.deepEqual(calls, []);
});

test("02 execute=false -> PLAN, runner never called", async () => {
  const { runRunner, calls } = happyScript();
  const result = await runVpsRecover({ execute: false }, deps({ runRunner }));
  assert.equal(result.status, "PLAN");
  assert.equal(result.mutationPerformed, false);
  assert.deepEqual(calls, []);
});

test("03 reconcile IN_SYNC -> BLOCKED / NOTHING_TO_RECOVER", async () => {
  const { runRunner, calls } = happyScript();
  const result = await runVpsRecover({}, deps({
    runRunner,
    readReleaseState: async () => syncedState(),
    readCatalog: async () => liveCatalog() as never
  }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(blockersOf(result).includes("NOTHING_TO_RECOVER"));
  assert.ok(codesOf(result).includes("NOTHING_TO_RECOVER"));
  assert.equal(result.mutationPerformed, false);
  assert.deepEqual(calls, []);
});

test("04 reconcile UNKNOWN -> UNKNOWN, recovery refused", async () => {
  const { runRunner } = happyScript();
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({ runRunner, readCatalog: async () => null }));
  assert.equal(result.status, "UNKNOWN");
  assert.ok(blockersOf(result).includes("RECONCILE_UNKNOWN"));
  assert.equal(result.plan.possible, false);
  assert.equal(result.mutationPerformed, false);
});

test("05 last-known-good missing -> BLOCKED / LKG_MISSING", async () => {
  const { runRunner, calls } = happyScript();
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner,
    readReleaseState: async () => state({ previousContainer: undefined, previousImage: undefined })
  }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(blockersOf(result).includes("LKG_MISSING"));
  assert.equal(result.mutationPerformed, false);
  assert.deepEqual(calls, []);
});

test("06 execute=true without approval -> BLOCKED / APPROVAL_REQUIRED, no mutation", async () => {
  const { runRunner, calls } = happyScript();
  const result = await runVpsRecover({ execute: true }, deps({ runRunner }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(blockersOf(result).includes("APPROVAL_REQUIRED"));
  assert.equal(result.mutationPerformed, false);
  assert.deepEqual(calls, []);
});

test("07 approval.approved=false -> BLOCKED, no mutation", async () => {
  const { runRunner, calls } = happyScript();
  const result = await runVpsRecover({ execute: true, approval: { approved: false } }, deps({ runRunner }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(blockersOf(result).includes("APPROVAL_REQUIRED"));
  assert.equal(result.mutationPerformed, false);
  assert.deepEqual(calls, []);
});

test("08 execute=true + approval -> runner called for rollback, real happy path", async () => {
  const { runRunner, calls, flags } = happyScript();
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({ runRunner, readReleaseState: async () => (flags.smoke ? syncedState() : state()) }));
  assert.deepEqual(calls.map((call) => call.operation), ["rollback", "status", "status", "smoke"]);
  assert.equal(calls[0].jobId, undefined);
  assert.equal(result.status, "RECOVERED");
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.jobId, ROLLBACK_JOB_ID);
  assert.equal(result.execution?.jobId, ROLLBACK_JOB_ID);
  assert.equal(flags.smoke, true);
});

test("09 wire-level: official runner receives exactly POST /v1/release {\"operation\":\"rollback\"}", async () => {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  const dir = await mkdtemp(path.join(tmpdir(), "vps-recover-"));
  const socketPath = path.join(dir, "runner.sock");
  let smokeDone = false;
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ method: request.method ?? "", url: request.url ?? "", body });
      const parsed = JSON.parse(body) as { operation?: string; jobId?: string };
      if (parsed.operation === "rollback") {
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" }));
        return;
      }
      if (parsed.operation === "status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ operation: "status", success: true, job: { jobId: parsed.jobId, operation: "rollback", status: "rolled_back" } }));
        return;
      }
      smokeDone = true;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ operation: "smoke", success: true, exitCode: 0 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const previousSocket = process.env.ENG_MCP_RELEASE_SOCKET;
  process.env.ENG_MCP_RELEASE_SOCKET = socketPath;
  try {
    const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
      runRunner: callReleaseRunner,
      readReleaseState: async () => (smokeDone ? syncedState() : state()),
      readCatalog: async () => (smokeDone ? liveCatalog() as never : liveCatalog() as never)
    }));
    assert.equal(result.status, "RECOVERED");
    assert.deepEqual(requests.map((request) => request.url), ["/v1/release", "/v1/release", "/v1/release"]);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].body, '{"operation":"rollback"}');
    assert.equal(requests[1].body, `{"operation":"status","jobId":"${ROLLBACK_JOB_ID}"}`);
    assert.equal(requests[2].body, '{"operation":"smoke"}');
  } finally {
    process.env.ENG_MCP_RELEASE_SOCKET = previousSocket;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("10 202/queued is NEVER RECOVERED: bounded polling -> UNKNOWN pending", async () => {
  const calls: Call[] = [];
  const runRunner: NonNullable<VpsRecoverDeps["runRunner"]> = async (operation, jobId) => {
    calls.push({ operation, jobId });
    if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
    return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "queued" } } };
  };
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({ runRunner, pollAttempts: 2 }));
  assert.notEqual(result.status, "RECOVERED");
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.pending, true);
  assert.equal(result.jobId, ROLLBACK_JOB_ID);
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.execution?.status, "queued");
  assert.ok(codesOf(result).includes("JOB_STILL_PENDING"));
});

test("11 official rollback job failure -> NOT_RECOVERED", async () => {
  const calls: Call[] = [];
  const runRunner: NonNullable<VpsRecoverDeps["runRunner"]> = async (operation, jobId) => {
    calls.push({ operation, jobId });
    if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
    return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "failed", error: "ROLLBACK_FAILED:boom" } } };
  };
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({ runRunner, pollAttempts: 1 }));
  assert.equal(result.status, "NOT_RECOVERED");
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.execution?.status, "failed");
  assert.ok(codesOf(result).includes("ROLLBACK_JOB_FAILED"));
});

test("12 post-validation insufficient (no live catalog evidence after rolled_back) -> UNKNOWN", async () => {
  let smokeDone = false;
  const runRunner: NonNullable<VpsRecoverDeps["runRunner"]> = async (operation, jobId) => {
    if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
    if (operation === "status") return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "rolled_back" } } };
    smokeDone = true;
    return { httpStatus: 200, body: { operation: "smoke", success: true, exitCode: 0 } };
  };
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner,
    pollAttempts: 1,
    readCatalog: async () => (smokeDone ? null : liveCatalog() as never)
  }));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.validation?.smoke, "PASS");
  assert.equal(result.validation?.catalog, null);
  assert.ok(codesOf(result).includes("VALIDATION_INSUFFICIENT"));
});

test("13 valid post-validation (smoke PASS + live catalog + reconcile IN_SYNC) -> RECOVERED", async () => {
  const { runRunner, calls, flags } = happyScript();
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({ runRunner, readReleaseState: async () => (flags.smoke ? syncedState() : state()) }));
  assert.equal(result.status, "RECOVERED");
  assert.equal(result.mutationPerformed, true);
  assert.deepEqual(result.validation, {
    smoke: "PASS",
    reconcile: "IN_SYNC",
    catalog: { catalogHash: LIVE_CATALOG_HASH, catalogVersion: LIVE_CATALOG_VERSION, toolCount: LIVE_TOOL_COUNT }
  });
  assert.equal(result.precheck.reconcile.status, "DRIFTED");
  assert.equal(flags.smoke, true);
  assert.equal(calls[calls.length - 1].operation, "smoke");
});

test("14 arbitrary input is rejected before any runner interaction", async () => {
  const { runRunner, calls } = happyScript();
  assert.throws(() => vpsRecoverInputSchema.parse({ target: "eng-mcp" }));
  assert.throws(() => vpsRecoverInputSchema.parse({ operation: "build" }));
  assert.throws(() => vpsRecoverInputSchema.parse({ execute: true, approval: { approved: true, extra: true } }));
  assert.throws(() => vpsRecoverInputSchema.parse({ jobId: ROLLBACK_JOB_ID }));
  await assert.rejects(() => runVpsRecover({ execute: true, approval: { approved: true }, container: "x" } as never, deps({ runRunner })));
  assert.deepEqual(calls, []);
});

test("15 mutationPerformed is exact on every path", async () => {
  const { runRunner, flags } = happyScript();
  const planResult = await runVpsRecover({}, deps({ runRunner }));
  assert.equal(planResult.mutationPerformed, false);

  const inSyncResult = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner,
    readReleaseState: async () => syncedState(),
    readCatalog: async () => liveCatalog() as never
  }));
  assert.equal(inSyncResult.mutationPerformed, false);

  const unknownPlanResult = await runVpsRecover({}, deps({ runRunner, readCatalog: async () => null }));
  assert.equal(unknownPlanResult.mutationPerformed, false);

  const approvalResult = await runVpsRecover({ execute: true }, deps({ runRunner }));
  assert.equal(approvalResult.mutationPerformed, false);

  const rejectedResult = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner: async () => ({ httpStatus: 400, body: { error: "RELEASE_CONFLICT" } })
  }));
  assert.equal(rejectedResult.status, "NOT_RECOVERED");
  assert.equal(rejectedResult.mutationPerformed, false);

  const queuedResult = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner: async (operation, jobId) => {
      if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
      return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "queued" } } };
    },
    pollAttempts: 1
  }));
  assert.equal(queuedResult.mutationPerformed, true);

  const failedResult = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner: async (operation, jobId) => {
      if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
      return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "failed" } } };
    },
    pollAttempts: 1
  }));
  assert.equal(failedResult.mutationPerformed, true);

  const smokeFailResult = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner: async (operation, jobId) => {
      if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
      if (operation === "status") return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "rolled_back" } } };
      return { httpStatus: 502, body: { operation: "smoke", success: false, exitCode: 1 } };
    },
    pollAttempts: 1
  }));
  assert.equal(smokeFailResult.status, "NOT_RECOVERED");
  assert.equal(smokeFailResult.mutationPerformed, true);

  const recoveredResult = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({ runRunner, readReleaseState: async () => (flags.smoke ? syncedState() : state()) }));
  assert.equal(recoveredResult.mutationPerformed, true);
});

test("16 rolled_back but expected state left stale by rollbackAction -> reconcile DRIFTED -> NOT_RECOVERED", async () => {
  // rollbackAction only updates rollbackStatus/currentRelease; productionCatalogHash,
  // toolCount, catalogVersion and productionImageId keep referring to the previous
  // (failed) release until the official smoke re-syncs them. If the smoke did not
  // converge the expected state, recovery must NOT be reported as RECOVERED.
  const calls: Call[] = [];
  const runRunner: NonNullable<VpsRecoverDeps["runRunner"]> = async (operation, jobId) => {
    calls.push({ operation, jobId });
    if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
    if (operation === "status") return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "rolled_back" } } };
    return { httpStatus: 200, body: { operation: "smoke", success: true, exitCode: 0 } };
  };
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({ runRunner, pollAttempts: 1 }));
  assert.equal(result.status, "NOT_RECOVERED");
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.validation?.smoke, "PASS");
  assert.equal(result.validation?.reconcile, "DRIFTED");
  assert.ok(codesOf(result).includes("RECONCILE_DRIFTED_AFTER_ROLLBACK"));
});

test("17 runner rejects the rollback request -> NOT_RECOVERED without mutation", async () => {
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner: async () => ({ httpStatus: 400, body: { error: "RELEASE_CONFLICT" } })
  }));
  assert.equal(result.status, "NOT_RECOVERED");
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.jobId, undefined);
  const finding = result.findings.find((item) => item.code === "ROLLBACK_NOT_ACCEPTED");
  assert.equal(finding?.httpStatus, 400);
});

test("18 rolled_back but official smoke fails -> NOT_RECOVERED", async () => {
  const result = await runVpsRecover({ execute: true, approval: { approved: true } }, deps({
    runRunner: async (operation, jobId) => {
      if (operation === "rollback") return { httpStatus: 202, body: { operation: "rollback", accepted: true, jobId: ROLLBACK_JOB_ID, status: "queued" } };
      if (operation === "status") return { httpStatus: 200, body: { operation: "status", success: true, job: { jobId, operation: "rollback", status: "rolled_back" } } };
      return { httpStatus: 502, body: { operation: "smoke", success: false, exitCode: 1, stderr: "SMOKE_FAILED:boom" } };
    },
    pollAttempts: 1
  }));
  assert.equal(result.status, "NOT_RECOVERED");
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.validation?.smoke, "FAIL");
  assert.ok(codesOf(result).includes("SMOKE_FAILED"));
});
