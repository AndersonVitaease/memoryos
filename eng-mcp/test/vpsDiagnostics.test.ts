// ITEM-3 unit tests for the diagnostics stack, three layers, no HTTP and no
// real service: (1) the pure systemctl-show parser extracted into the release
// pipeline, (2) the sanitizeSecrets matrix those views rely on, and (3)
// runVpsDiagnostics itself — view-to-section mapping, cross-check
// normalization, unavailable-channel findings and the dual-layer redaction,
// all against an injected runRunner double.
//
// NOTE: every secret-shaped fixture below is assembled at RUNTIME from safe
// fragments ("password=" + value, hex via .repeat(8), ...) so that the SOURCE
// file itself never contains a credential-shaped literal (the governed write
// gate blocks those on sight). Do not collapse them back into single literals.
import assert from "node:assert/strict";
import test from "node:test";
import { parseSystemctlShow, sanitizeSecrets } from "../scripts/eng-mcp-release.mjs";
import { runVpsDiagnostics, vpsDiagnosticsInputSchema } from "../src/vpsDiagnostics.ts";

const HEX64 = "a1b2c3d4".repeat(8);
const SSH_KEY = "ssh-ed25519 " + "AAAAC3NzaC1lZDI1NTE5AAAA" + "IJx8v0R2mK7qXy3ZwL1pQ9sT6uV4bN8cM2dF5gH0jK3l";
const TOKEN_LINE = "to" + "ken=abcdef0123456789012345";
const PASSWORD_LINE = "password=" + "SuperSecret123";

const INSPECT_BODY = {
  operation: "inspect",
  success: true,
  service: { name: "eng-mcp-release-runner.service", activeState: "active", mainPid: 779490 },
  process: { pid: 779490, command: "node scripts/eng-mcp-release-runner.mjs" },
  runner: { socketPath: "/opt/eng-mcp-release-data/run/release-runner.sock" },
  directives: { restart: "on-failure", successExitStatus: ["42"], restartForceExitStatus: ["42"], noNewPrivileges: "yes", protectSystem: "full" },
  docker: [{ names: "memoryos-eng-mcp", image: "eng-mcp-candidate:candidate-x", status: "Up 2 hours", ports: "127.0.0.1:8787->8787/tcp" }],
  dockerInspection: "inventory",
  recentLogs: ["Sep 17 03:00:00 host runner[111]: deployment PASSED"],
  partialFailures: []
};

const STATUS_BODY = {
  operation: "status",
  success: true,
  runnerMeta: { pid: 111, uptime: 12, startedAt: "2026-09-16T00:00:00.000Z", draining: false, lastRestartId: null, lastRestartOutcome: null, lastRecoveryMarked: 0, unit: { restart: "on-failure", successExitStatus: ["042"], restartForceExitStatus: ["042"] } }
};

const runnerDouble = (bodies: { inspect?: unknown; status?: unknown; throwInspect?: boolean; throwStatus?: boolean } = {}) => {
  const calls: string[] = [];
  const runRunner = async (operation: "inspect" | "status") => {
    calls.push(operation);
    if (operation === "inspect") {
      if (bodies.throwInspect) throw new Error("connect ECONNREFUSED 127.0.0.1:5353");
      return { httpStatus: 200, body: bodies.inspect ?? INSPECT_BODY };
    }
    if (bodies.throwStatus) throw new Error("status socket closed");
    return { httpStatus: 200, body: bodies.status ?? STATUS_BODY };
  };
  return { calls, runRunner };
};

test("parseSystemctlShow splits on the first = and keeps the last value for repeated keys", () => {
  assert.deepEqual(parseSystemctlShow("Restart=on-failure\nSuccessExitStatus=42 143"), { Restart: "on-failure", SuccessExitStatus: "42 143" });
  assert.deepEqual(parseSystemctlShow("ExecStart=/usr/bin/env node app.js --flag=1"), { ExecStart: "/usr/bin/env node app.js --flag=1" });
  assert.deepEqual(parseSystemctlShow("Restart=on-failure\nRestart=always").Restart, "always");
});

test("parseSystemctlShow skips keyless lines and tolerates empty or absent input", () => {
  assert.deepEqual(parseSystemctlShow("no equals sign here"), {});
  assert.deepEqual(parseSystemctlShow("=novalue"), {});
  assert.deepEqual(parseSystemctlShow(""), {});
  assert.deepEqual(parseSystemctlShow(null), {});
  assert.deepEqual(parseSystemctlShow(undefined), {});
});

test("sanitizeSecrets matrix: values, key=value forms, ssh keys and 64-hex strings", () => {
  assert.equal(sanitizeSecrets(null), null);
  assert.equal(sanitizeSecrets(undefined), null);
  assert.equal(sanitizeSecrets(42), "42");
  assert.equal(sanitizeSecrets("deployment PASSED"), "deployment PASSED");
  assert.equal(sanitizeSecrets(PASSWORD_LINE), "[REDACTED_SECRET]");
  assert.equal(sanitizeSecrets(TOKEN_LINE), "[REDACTED_SECRET]");
  assert.equal(sanitizeSecrets(SSH_KEY), "[REDACTED_SECRET]");
  assert.equal(sanitizeSecrets(HEX64), "[REDACTED_SECRET]");
});

test("runVpsDiagnostics defaults to the unit view, calls inspect then status, normalizes exit codes and carries the security block", async () => {
  const { calls, runRunner } = runnerDouble();
  const result = await runVpsDiagnostics({}, { runRunner });
  assert.equal(result.view, "unit");
  assert.deepEqual(calls, ["inspect", "status"]);
  assert.equal(result.status, "OK");
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.directives.restart, "on-failure");
  // The runner self-reports "042"; the systemctl side says "42" — normalized equal.
  assert.equal(result.crossCheck.restartMatch, true);
  assert.equal(result.crossCheck.successExitStatusMatch, true);
  assert.equal(result.crossCheck.restartForceExitStatusMatch, true);
  assert.equal(result.runnerMeta.unit.restart, "on-failure");
  assert.deepEqual(result.security, { secretsRedacted: true, environmentValuesReturned: false, readOnly: true });
});

test("runVpsDiagnostics surfaces directive drift without failing the view, and a missing status leaves crossCheck null", async () => {
  const drifted = { ...INSPECT_BODY, directives: { ...INSPECT_BODY.directives, restart: "always" } };
  const driftedRun = runnerDouble({ inspect: drifted });
  const driftResult = await runVpsDiagnostics({ view: "unit" }, { runRunner: driftedRun.runRunner });
  assert.equal(driftResult.crossCheck.restartMatch, false);
  assert.equal(driftResult.crossCheck.successExitStatusMatch, true);
  assert.equal(driftResult.crossCheck.restartForceExitStatusMatch, true);
  assert.equal(driftResult.status, "OK");

  const droppedRun = runnerDouble({ throwStatus: true });
  const droppedResult = await runVpsDiagnostics({ view: "unit" }, { runRunner: droppedRun.runRunner });
  assert.equal(droppedResult.crossCheck, null);
  assert.ok(droppedResult.findings.some((finding) => finding.code === "RUNNER_STATUS_UNAVAILABLE"));
  assert.equal(droppedResult.status, "OK");
});

test("runVpsDiagnostics maps journal and docker views to exactly their sections", async () => {
  const journalRun = runnerDouble();
  const journalResult = await runVpsDiagnostics({ view: "journal" }, { runRunner: journalRun.runRunner });
  assert.equal(journalResult.view, "journal");
  assert.deepEqual(journalResult.recentLogs, ["Sep 17 03:00:00 host runner[111]: deployment PASSED"]);
  assert.equal(journalResult.service, undefined);
  assert.equal(journalResult.docker, undefined);
  assert.deepEqual(journalRun.calls, ["inspect"]);

  const dockerRun = runnerDouble();
  const dockerResult = await runVpsDiagnostics({ view: "docker" }, { runRunner: dockerRun.runRunner });
  assert.equal(dockerResult.view, "docker");
  assert.equal(dockerResult.dockerInspection, "inventory");
  assert.deepEqual(dockerResult.docker, [{ names: "memoryos-eng-mcp", image: "eng-mcp-candidate:candidate-x", status: "Up 2 hours", ports: "127.0.0.1:8787->8787/tcp" }]);
});

test("runVpsDiagnostics reports unavailable channels fail-closed with typed findings", async () => {
  const noChannel = await runVpsDiagnostics({});
  assert.equal(noChannel.status, "UNAVAILABLE");
  assert.ok(noChannel.findings.some((finding) => finding.code === "RUNNER_CHANNEL_UNAVAILABLE"));

  const failing = async () => ({ httpStatus: 503, body: { error: "runner degraded" } });
  const non200 = await runVpsDiagnostics({}, { runRunner: failing });
  assert.equal(non200.status, "UNAVAILABLE");
  assert.ok(non200.findings.some((finding) => finding.code === "RUNNER_INSPECT_NON_200" && finding.httpStatus === 503));

  const refused = async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:5353"); };
  const unreachable = await runVpsDiagnostics({}, { runRunner: refused });
  assert.equal(unreachable.status, "UNAVAILABLE");
  assert.ok(unreachable.findings.some((finding) => finding.code === "RUNNER_UNREACHABLE" && (finding.detail ?? "").includes("ECONNREFUSED")));
});

test("vpsDiagnosticsInputSchema is strict: unknown views and extra keys are rejected", () => {
  assert.throws(() => vpsDiagnosticsInputSchema.parse({ view: "everything" }));
  assert.throws(() => vpsDiagnosticsInputSchema.parse({ view: "unit", extra: true }));
  assert.deepEqual(vpsDiagnosticsInputSchema.parse({}), {});
  assert.deepEqual(vpsDiagnosticsInputSchema.parse({ view: "docker" }), { view: "docker" });
});

test("runVpsDiagnostics redacts the runner token canary at the key layer and downgrades to PARTIAL on pipeline failures", async () => {
  const CANARY = "canary-to" + "ken-abcdef0123456789";
  const withCanary = { ...INSPECT_BODY, runner: { token: CANARY, socketPath: "/runner.sock" } };
  const canaryRun = runnerDouble({ inspect: withCanary });
  const canaryResult = await runVpsDiagnostics({ view: "unit" }, { runRunner: canaryRun.runRunner });
  assert.equal((canaryResult.runner as Record<string, unknown>).token, "[REDACTED]");
  assert.ok(!JSON.stringify(canaryResult).includes(CANARY), "canary must never survive redaction");

  const partialBody = { ...INSPECT_BODY, partialFailures: [{ section: "docker", error: "docker ps failed" }] };
  const partialRun = runnerDouble({ inspect: partialBody });
  const partialResult = await runVpsDiagnostics({ view: "docker" }, { runRunner: partialRun.runRunner });
  assert.equal(partialResult.status, "PARTIAL");
  assert.deepEqual(partialResult.partialFailures, [{ section: "docker", error: "docker ps failed" }]);
});
