// ITEM-1: unit tests for the release runner's controlled restart protocol
// (self-exit code 42 + systemd drop-in directives). Everything here runs against
// createReleaseRunner with INJECTED exit hooks (exitNow/scheduleExit) —
// process.exit is never invoked and no real service is touched. Unit directives
// are served from synthetic files or injected readers; the HTTP path uses a
// private unix socket inside a tempdir.
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createReleaseRunner, readUnitDirectives, evaluateRestartPrecheck, CONTROLLED_RESTART_EXIT_CODE } from "../scripts/eng-mcp-release-runner.mjs";

const VALID_DIRECTIVES = { restart: "on-failure", successExitStatus: ["42"], restartForceExitStatus: ["42"] };

function postRunner(socketPath: string, payload: unknown): Promise<{ httpStatus: number; body: any }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const req = httpRequest({ socketPath, path: "/v1/release", method: "POST", headers: { "content-type": "application/json" } }, (incoming) => {
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        try { resolve({ httpStatus: incoming.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(JSON.stringify(payload));
  });
}

async function runnerConfig(extra: Record<string, unknown> = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-runner-restart-"));
  const config: Record<string, unknown> = { socketPath: path.join(dir, "runner.sock"), jobsDir: path.join(dir, "jobs"), lockPath: path.join(dir, "release.lock"), pipeline: "/bin/true", ...extra };
  return { dir, config };
}

test("readUnitDirectives merges the main unit and drop-ins (last occurrence wins) and fails closed on a missing unit", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-unit-"));
  try {
    const unitFile = path.join(dir, "eng-mcp-release-runner.service");
    const dropinDir = path.join(dir, "eng-mcp-release-runner.service.d");
    await mkdir(dropinDir, { recursive: true });
    await writeFile(unitFile, "[Unit]\nDescription=x\n\n[Service]\nRestart=on-failure\nSuccessExitStatus=143\n", "utf8");
    await writeFile(path.join(dropinDir, "10-base.conf"), "[Service]\nSuccessExitStatus=42\nRestartForceExitStatus=42\n", "utf8");
    await writeFile(path.join(dropinDir, "20-override.conf"), "[Service]\nSuccessExitStatus=42 143\n", "utf8");
    const directives = await readUnitDirectives(unitFile, dropinDir);
    assert.deepEqual(directives, { restart: "on-failure", successExitStatus: ["42", "143"], restartForceExitStatus: ["42"] });
    assert.equal(await readUnitDirectives(path.join(dir, "missing.service"), dropinDir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("evaluateRestartPrecheck is fail-closed on busy state, lock, in-flight jobs, missing directives, pending intent and cooldown", () => {
  const inFlight = [{ jobId: "job-1", operation: "deploy" }];
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: [], directives: VALID_DIRECTIVES, lastIntent: null }), []);
  assert.deepEqual(evaluateRestartPrecheck({ active: true, lockExists: false, inFlightJobs: [], directives: VALID_DIRECTIVES, lastIntent: null }), ["RUNNER_BUSY"]);
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: true, inFlightJobs: [], directives: VALID_DIRECTIVES, lastIntent: null }), ["LOCK_PRESENT"]);
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: inFlight, directives: VALID_DIRECTIVES, lastIntent: null }), ["JOBS_IN_FLIGHT:job-1:deploy"]);
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: [], directives: null, lastIntent: null }), ["UNIT_DIRECTIVES_UNVERIFIABLE"]);
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: [], directives: { restart: "no", successExitStatus: [], restartForceExitStatus: [] }, lastIntent: null }), ["UNIT_RESTART_UNSUPPORTED:no", "UNIT_SUCCESS_EXIT_STATUS_MISSING:42", "UNIT_RESTART_FORCE_EXIT_STATUS_MISSING:42"]);
  assert.ok(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: [], directives: { restart: "always", successExitStatus: ["42"], restartForceExitStatus: ["42"] }, lastIntent: null }).length === 0);
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: [], directives: VALID_DIRECTIVES, lastIntent: { status: "pending" } }), ["INTENT_UNCOMPLETED_PRESENT"]);
  const completedIntent = { status: "completed", completedAt: new Date(Date.now() - 10_000).toISOString() };
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: [], directives: VALID_DIRECTIVES, lastIntent: completedIntent }), ["RESTART_COOLDOWN"]);
  const oldIntent = { status: "completed", completedAt: new Date(Date.now() - 400_000).toISOString() };
  assert.deepEqual(evaluateRestartPrecheck({ active: false, lockExists: false, inFlightJobs: [], directives: VALID_DIRECTIVES, lastIntent: oldIntent }), []);
});

test("restart is refused over HTTP with JOBS_IN_FLIGHT and draining is reset", async () => {
  const { dir, config } = await runnerConfig({ unitReader: async () => VALID_DIRECTIVES });
  const runner = createReleaseRunner(config);
  await runner.recover();
  await writeFile(path.join(config.jobsDir as string, "11111111-2222-3333-4444-555555555555.json"), JSON.stringify({ jobId: "11111111-2222-3333-4444-555555555555", operation: "deploy", status: "queued" }), "utf8");
  await new Promise<void>((resolve) => runner.server.listen(config.socketPath as string, resolve));
  try {
    const outcome = await postRunner(config.socketPath as string, { operation: "restart" });
    assert.equal(outcome.httpStatus, 409);
    assert.equal(outcome.body.accepted, false);
    assert.equal(outcome.body.refused, true);
    assert.deepEqual(outcome.body.blockers, ["JOBS_IN_FLIGHT:11111111-2222-3333-4444-555555555555:deploy"]);
    assert.equal(outcome.body.error, "RUNNER_RESTART_REFUSED:JOBS_IN_FLIGHT:11111111-2222-3333-4444-555555555555:deploy");
    assert.equal(runner.maintenance.draining, false);
  } finally {
    await new Promise<void>((resolve) => runner.server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("accepted restart persists the intent, drains, blocks new jobs, is idempotent and self-exits with the protocol code via the injected hooks", async () => {
  const exitCalls: number[] = [];
  let scheduled: (() => void) | null = null;
  const { dir, config } = await runnerConfig({
    unitReader: async () => VALID_DIRECTIVES,
    // status executes through the injected execute (never the real pipeline spawn)
    execute: async () => ({ success: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "", truncated: false }),
    exitNow: (code: number) => { exitCalls.push(code); },
    scheduleExit: (fn: () => void) => { scheduled = fn; }
  });
  const runner = createReleaseRunner(config);
  await runner.recover();
  await new Promise<void>((resolve) => runner.server.listen(config.socketPath as string, resolve));
  try {
    const outcome = await postRunner(config.socketPath as string, { operation: "restart" });
    assert.equal(outcome.httpStatus, 202);
    assert.equal(outcome.body.accepted, true);
    assert.equal(outcome.body.status, "pending");
    const restartId: string = outcome.body.restartId;
    assert.match(restartId, /^[a-f0-9-]{16,64}$/i);
    assert.equal(runner.maintenance.draining, true);
    const intent = JSON.parse(await readFile(path.join(path.dirname(config.jobsDir as string), "restart-intent.json"), "utf8"));
    assert.equal(intent.restartId, restartId);
    assert.equal(intent.status, "pending");
    assert.equal(intent.exitCode, CONTROLLED_RESTART_EXIT_CODE);
    assert.equal(intent.oldPid, process.pid);
    assert.deepEqual(intent.directives, VALID_DIRECTIVES);
    const blocked = await postRunner(config.socketPath as string, { operation: "test" });
    assert.equal(blocked.httpStatus, 400);
    assert.equal(blocked.body.error, "RELEASE_DRAINING");
    const again = await postRunner(config.socketPath as string, { operation: "restart" });
    assert.equal(again.httpStatus, 202);
    assert.equal(again.body.idempotent, true);
    assert.equal(again.body.restartId, restartId);
    const status = await postRunner(config.socketPath as string, { operation: "status" });
    assert.equal(status.httpStatus, 200);
    assert.equal(status.body.runnerMeta.draining, true);
    assert.equal(status.body.runnerMeta.unit.restart, "on-failure");
    scheduled?.();
    assert.deepEqual(exitCalls, [CONTROLLED_RESTART_EXIT_CODE]);
  } finally {
    await new Promise<void>((resolve) => runner.server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("restart is refused during the cooldown of a completed intent", async () => {
  const { dir, config } = await runnerConfig({ unitReader: async () => VALID_DIRECTIVES });
  const runner = createReleaseRunner(config);
  await runner.recover();
  const intentPath = path.join(path.dirname(config.jobsDir as string), "restart-intent.json");
  await writeFile(intentPath, JSON.stringify({ restartId: "cooldown-probe", status: "completed", completedAt: new Date(Date.now() - 10_000).toISOString(), oldPid: 424242 }), "utf8");
  await new Promise<void>((resolve) => runner.server.listen(config.socketPath as string, resolve));
  try {
    const outcome = await postRunner(config.socketPath as string, { operation: "restart" });
    assert.equal(outcome.httpStatus, 409);
    assert.deepEqual(outcome.body.blockers, ["RESTART_COOLDOWN"]);
  } finally {
    await new Promise<void>((resolve) => runner.server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("the next generation's recover() completes a pending intent left by the previous pid", async () => {
  const { dir, config } = await runnerConfig();
  const intentPath = path.join(path.dirname(config.jobsDir as string), "restart-intent.json");
  await writeFile(intentPath, JSON.stringify({ restartId: "intent-prev-gen", status: "pending", oldPid: 999999 }), "utf8");
  const runner = createReleaseRunner(config);
  await runner.recover();
  const intent = JSON.parse(await readFile(intentPath, "utf8"));
  assert.equal(intent.status, "completed");
  assert.equal(intent.newPid, process.pid);
  assert.equal(runner.maintenance.lastRestartId, "intent-prev-gen");
  assert.equal(runner.maintenance.lastRestartOutcome, "completed");
  await rm(dir, { recursive: true, force: true });
});
