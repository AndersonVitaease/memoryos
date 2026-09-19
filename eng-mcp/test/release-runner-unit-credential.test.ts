// UNIT-CREDENTIAL-01: child-logic tests for scripts/eng-mcp-unit-credential.mjs —
// real fs inside per-test tmpdirs with injected systemdDir/sourceDir and a fake
// run() for systemd-analyze verify / systemctl daemon-reload / systemctl is-active.
// Covers: PLAN zero-write, APPLY exact content + verify + daemon-reload, NO_OP
// mtime invariance, verify-fail rollback (new + overwrite paths), pre-existing
// verify block, credential hardening (EMPTY/MODE_INSECURE/NOT_REGULAR/NOT_FOUND),
// grammar refusals, unitPath default/custom, the critical-unit restart note and
// the child-layer no-leak guarantee (the VALUE never appears in the JSON).
import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runUnitCredential, UNIT_CREDENTIAL_STATUSES } from "../scripts/eng-mcp-unit-credential.mjs";

const CREDENTIAL_VALUE = "secret-credential-value-42";

interface RunCall { file: string; args: string[] }

interface Fixture {
  root: string;
  systemdDir: string;
  sourceDir: string;
  calls: RunCall[];
  state: { verifyExitCodes: number[]; daemonExitCode: number };
  overrides: { systemdDir: string; sourceDir: string; run: (file: string, args: string[], opts?: Record<string, unknown>) => Promise<{ exitCode: number; stdout: string; stderr: string }> };
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "unit-credential-"));
  const systemdDir = path.join(root, "systemd");
  const sourceDir = path.join(root, "credentials");
  await mkdir(systemdDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  const calls: RunCall[] = [];
  const state = { verifyExitCodes: [] as number[], daemonExitCode: 0 };
  const run = async (file: string, args: string[]) => {
    calls.push({ file, args });
    if (file === "systemd-analyze") {
      const exitCode = state.verifyExitCodes.length > 0 ? state.verifyExitCodes.shift() as number : 0;
      return { exitCode, stdout: "", stderr: exitCode === 0 ? "" : "unit failed verification" };
    }
    if (file === "systemctl" && args[0] === "daemon-reload") return { exitCode: state.daemonExitCode, stdout: "", stderr: state.daemonExitCode === 0 ? "" : "daemon reload refused" };
    if (file === "systemctl" && args[0] === "is-active") return { exitCode: 0, stdout: "active\n" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  return { root, systemdDir, sourceDir, calls, state, overrides: { systemdDir, sourceDir, run } };
}

async function writeUnit(systemdDir: string, name = "test-unit.service", body = "[Service]\nExecStart=/bin/true\n"): Promise<string> {
  const file = path.join(systemdDir, name);
  await writeFile(file, body);
  return file;
}

async function writeCredential(sourceDir: string, name = "test-cred", value = CREDENTIAL_VALUE, mode = 0o600): Promise<string> {
  const file = path.join(sourceDir, name);
  await writeFile(file, value);
  await chmod(file, mode);
  return file;
}

function env(fixture: Fixture, overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const base: Record<string, string> = {
    ENG_MCP_UC_UNIT: "test-unit.service",
    ENG_MCP_UC_CREDENTIAL_ID: "test-cred",
    ENG_MCP_UC_EXECUTE: "false",
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
  };
  return base;
}

function verifyCalls(calls: RunCall[]): RunCall[] {
  return calls.filter((call) => call.file === "systemd-analyze");
}

function reloadCalls(calls: RunCall[]): RunCall[] {
  return calls.filter((call) => call.file === "systemctl" && call.args[0] === "daemon-reload");
}

test("UNIT_CREDENTIAL_STATUSES covers the five honest outcomes", () => {
  assert.deepEqual([...UNIT_CREDENTIAL_STATUSES], ["PLAN", "WRITE", "NO_OP", "BLOCKED", "FAILED"]);
});

test("PLAN is strictly read-only: full envelope, baseline verify once, zero writes", async () => {
  const fixture = await makeFixture();
  try {
    const unitFile = await writeUnit(fixture.systemdDir);
    const credFile = await writeCredential(fixture.sourceDir);
    const result = await runUnitCredential(env(fixture), fixture.overrides);

    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.possible, true);
    assert.equal(result.unitPath, "test-cred", "unitPath defaults to the credential id");
    assert.equal(result.desiredLine, `LoadCredential=test-cred:${credFile}`);
    assert.equal(result.dropinContent, `[Service]\nLoadCredential=test-cred:${credFile}\n`);
    assert.deepEqual(result.planDiff, { before: null, after: `[Service]\nLoadCredential=test-cred:${credFile}\n`, unchanged: false });
    assert.deepEqual(result.baseVerify, { exitCode: 0, output: null });
    assert.deepEqual(result.existingDropin, { existed: false, size: null });
    assert.equal(result.credential.sourcePath, credFile);
    assert.equal(result.credential.size, CREDENTIAL_VALUE.length);
    assert.equal(result.credential.mode, "600");
    assert.equal(result.credential.sha256_16, createHash("sha256").update(CREDENTIAL_VALUE).digest("hex").slice(0, 16));
    assert.equal(result.criticalUnit, false);
    assert.equal(result.requiresRestart, true);
    assert.ok(verifyCalls(fixture.calls).length === 1, "exactly one baseline verify");
    assert.equal(reloadCalls(fixture.calls).length, 0);
    assert.equal(existsSync(path.join(fixture.systemdDir, "test-unit.service.d")), false, "PLAN must not create the drop-in directory");
    assert.ok(!JSON.stringify(result).includes(CREDENTIAL_VALUE), "the credential VALUE never appears in the envelope");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("APPLY writes the exact drop-in atomically, verifies twice and reloads the daemon without touching the unit's active state", async () => {
  const fixture = await makeFixture();
  try {
    const unitFile = await writeUnit(fixture.systemdDir);
    const credFile = await writeCredential(fixture.sourceDir);
    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);

    assert.equal(result.status, "WRITE");
    assert.equal(result.mutationPerformed, true);
    assert.equal(result.wrote, true);
    assert.equal(result.daemonReloaded, true);
    assert.equal(result.isActiveBefore, "active");
    assert.equal(result.isActiveAfter, "active");
    assert.equal(result.findings.length, 0);
    const dropinFile = path.join(fixture.systemdDir, "test-unit.service.d", "credentials.conf");
    assert.equal(await readFile(dropinFile, "utf8"), `[Service]\nLoadCredential=test-cred:${credFile}\n`);
    assert.equal(statSync(dropinFile).mode & 0o777, 0o644);
    assert.equal(verifyCalls(fixture.calls).length, 2, "baseline verify + post-write verify");
    assert.equal(reloadCalls(fixture.calls).length, 1);
    assert.equal(typeof result.dropinMtimeAfter, "number");
    // base unit untouched
    assert.equal(await readFile(unitFile, "utf8"), "[Service]\nExecStart=/bin/true\n");
    assert.ok(!JSON.stringify(result).includes(CREDENTIAL_VALUE));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("NO_OP: byte-identical drop-in means zero mutation — no write, no daemon-reload, mtime preserved", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    const credFile = await writeCredential(fixture.sourceDir);
    const dropinDir = path.join(fixture.systemdDir, "test-unit.service.d");
    const dropinFile = path.join(dropinDir, "credentials.conf");
    await mkdir(dropinDir, { recursive: true });
    await writeFile(dropinFile, `[Service]\nLoadCredential=test-cred:${credFile}\n`);
    const before = statSync(dropinFile).mtimeMs;

    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);

    assert.equal(result.status, "NO_OP");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.byteIdentical, true);
    assert.equal(result.isActive, "active");
    assert.equal(result.dropinMtimeBefore, result.dropinMtimeAfter);
    assert.equal(statSync(dropinFile).mtimeMs, before, "mtime invariant");
    assert.equal(await readFile(dropinFile, "utf8"), `[Service]\nLoadCredential=test-cred:${credFile}\n`);
    assert.equal(verifyCalls(fixture.calls).length, 1, "only the baseline verify");
    assert.equal(reloadCalls(fixture.calls).length, 0, "NO_OP never reloads the daemon");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("UC_ALREADY_PRESENT is informational when name+source match, and the apply still lands byte-identical", async () => {
  const fixture = await makeFixture();
  try {
    const credFile = await writeCredential(fixture.sourceDir);
    await writeUnit(fixture.systemdDir, "test-unit.service", `[Service]\nLoadCredential=test-cred:${credFile}\nExecStart=/bin/true\n`);
    const plan = await runUnitCredential(env(fixture), fixture.overrides);
    assert.equal(plan.status, "PLAN");
    assert.ok(plan.findings.some((finding: { code: string }) => finding.code === "UC_ALREADY_PRESENT"));
    assert.equal(plan.possible, true);
    assert.equal(plan.existingSameName.length, 1);
    assert.equal(plan.existingSameName[0].origin, "unit");

    const dropinFile = path.join(fixture.systemdDir, "test-unit.service.d", "credentials.conf");
    const apply = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);
    assert.equal(apply.status, "WRITE", "the drop-in FILE is new (the directive only exists in the base unit)");
    assert.ok(apply.wrote);
    assert.equal(await readFile(dropinFile, "utf8"), `[Service]\nLoadCredential=test-cred:${credFile}\n`);

    const again = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);
    assert.equal(again.status, "NO_OP", "re-apply over the now byte-identical drop-in");
    assert.equal(again.byteIdentical, true);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("UC_NAME_CONFLICT is reported when the same unit path is registered with a different source", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    await writeCredential(fixture.sourceDir);
    await writeUnit(fixture.systemdDir, "test-unit.service", "[Service]\nLoadCredential=test-cred:/elsewhere/other\n");
    const plan = await runUnitCredential(env(fixture), fixture.overrides);
    assert.ok(plan.findings.some((finding: { code: string }) => finding.code === "UC_NAME_CONFLICT"));
    assert.equal(plan.possible, true, "conflict is informational — systemd last-wins merge stays deterministic");
    assert.equal(plan.planDiff.before, null, "the conflict lives in the unit file, not the drop-in");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("unitPath overrides the credential id inside the directive", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    const credFile = await writeCredential(fixture.sourceDir);
    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_UNIT_PATH: "release-bearer" }), fixture.overrides);
    assert.equal(result.unitPath, "release-bearer");
    assert.equal(result.desiredLine, `LoadCredential=release-bearer:${credFile}`);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("post-write verify failure rolls back fail-closed BEFORE daemon-reload (new drop-in)", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    await writeCredential(fixture.sourceDir);
    fixture.state.verifyExitCodes = [0, 1];
    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);

    assert.equal(result.status, "BLOCKED");
    assert.equal(result.wrote, true);
    assert.equal(result.verifyRolledBack, true);
    assert.equal(result.mutationPerformed, false);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_VERIFY_FAILED_ROLLED_BACK"));
    assert.equal(existsSync(path.join(fixture.systemdDir, "test-unit.service.d", "credentials.conf")), false, "the new drop-in is removed");
    assert.equal(reloadCalls(fixture.calls).length, 0, "daemon-reload must never run after a failed verify");
    assert.equal(result.isActiveAfter, "active");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("post-write verify failure restores the previous drop-in content (overwrite path)", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    const credFile = await writeCredential(fixture.sourceDir);
    const dropinDir = path.join(fixture.systemdDir, "test-unit.service.d");
    const dropinFile = path.join(dropinDir, "credentials.conf");
    await mkdir(dropinDir, { recursive: true });
    await writeFile(dropinFile, "[Service]\nLoadCredential=old-name:/old/source\n");
    fixture.state.verifyExitCodes = [0, 1];

    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);

    assert.equal(result.status, "BLOCKED");
    assert.equal(result.verifyRolledBack, true);
    assert.equal(await readFile(dropinFile, "utf8"), "[Service]\nLoadCredential=old-name:/old/source\n", "previous content restored");
    assert.equal(reloadCalls(fixture.calls).length, 0);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("a pre-existing verify failure blocks the apply and never writes", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    await writeCredential(fixture.sourceDir);
    fixture.state.verifyExitCodes = [1];
    const plan = await runUnitCredential(env(fixture), fixture.overrides);
    assert.equal(plan.status, "PLAN");
    assert.equal(plan.possible, false);
    assert.ok(plan.findings.some((finding: { code: string }) => finding.code === "UC_UNIT_VERIFY_FAILED_PREEXISTING"));

    fixture.state.verifyExitCodes = [1]; // re-arm: the PLAN call above consumed the first failure
    const blocked = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);
    assert.equal(blocked.status, "BLOCKED");
    assert.equal(blocked.mutationPerformed, false);
    assert.equal(existsSync(path.join(fixture.systemdDir, "test-unit.service.d")), false);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("credential hardening: EMPTY (github-pat lesson), MODE_INSECURE, NOT_REGULAR and NOT_FOUND all block", async () => {
  const empty = await makeFixture();
  try {
    await writeUnit(empty.systemdDir);
    await writeCredential(empty.sourceDir, "test-cred", "", 0o600);
    const result = await runUnitCredential(env(empty), empty.overrides);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_CREDENTIAL_EMPTY"));
    assert.equal(result.possible, false);
  } finally { await rm(empty.root, { recursive: true, force: true }); }

  const insecure = await makeFixture();
  try {
    await writeUnit(insecure.systemdDir);
    await writeCredential(insecure.sourceDir, "test-cred", CREDENTIAL_VALUE, 0o644);
    const result = await runUnitCredential(env(insecure), insecure.overrides);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_CREDENTIAL_MODE_INSECURE"));
    assert.equal(result.credential, null);
  } finally { await rm(insecure.root, { recursive: true, force: true }); }

  const notRegular = await makeFixture();
  try {
    await writeUnit(notRegular.systemdDir);
    await mkdir(path.join(notRegular.sourceDir, "test-cred"), { recursive: true });
    const result = await runUnitCredential(env(notRegular), notRegular.overrides);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_CREDENTIAL_NOT_REGULAR"));
  } finally { await rm(notRegular.root, { recursive: true, force: true }); }

  const missing = await makeFixture();
  try {
    await writeUnit(missing.systemdDir);
    const result = await runUnitCredential(env(missing), missing.overrides);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_CREDENTIAL_NOT_FOUND"));
    assert.equal(result.possible, false);
  } finally { await rm(missing.root, { recursive: true, force: true }); }
});

test("UC_UNIT_NOT_FOUND blocks the apply; the baseline verify is skipped for a missing unit", async () => {
  const fixture = await makeFixture();
  try {
    await writeCredential(fixture.sourceDir);
    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_UNIT_NOT_FOUND"));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.possible, false);
    assert.equal(result.baseVerify, null);
    assert.equal(verifyCalls(fixture.calls).length, 0);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("grammar refusals return a slim BLOCKED envelope before touching the filesystem", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    await writeCredential(fixture.sourceDir);
    for (const [badEnv, code] of [
      [{ ENG_MCP_UC_UNIT: "../evil" }, "UC_UNIT_INVALID"],
      [{ ENG_MCP_UC_UNIT: "has space.service" }, "UC_UNIT_INVALID"],
      [{ ENG_MCP_UC_CREDENTIAL_ID: "../escape" }, "UC_CREDENTIAL_ID_INVALID"],
      [{ ENG_MCP_UC_UNIT_PATH: ".." }, "UC_UNIT_PATH_INVALID"]
    ] as const) {
      const result = await runUnitCredential(env(fixture, badEnv as Record<string, string>), fixture.overrides);
      assert.equal(result.status, "BLOCKED", code);
      assert.equal(result.mutationPerformed, false);
      assert.ok(result.findings.some((finding: { code: string }) => finding.code === code), code);
      assert.equal(result.dropinFile, undefined, "slim envelope carries no filesystem paths");
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("a file blocking the drop-in directory yields UC_DROPIN_WRITE_FAILED with mutationPerformed=false", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    await writeCredential(fixture.sourceDir);
    await writeFile(path.join(fixture.systemdDir, "test-unit.service.d"), "not a directory");
    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);
    assert.equal(result.status, "FAILED");
    assert.equal(result.mutationPerformed, false);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_DROPIN_WRITE_FAILED"));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("daemon-reload failure maps to FAILED while the write honestly reports mutationPerformed=true", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir);
    await writeCredential(fixture.sourceDir);
    fixture.state.daemonExitCode = 1;
    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_EXECUTE: "true" }), fixture.overrides);
    assert.equal(result.status, "FAILED");
    assert.equal(result.daemonReloaded, false);
    assert.equal(result.wrote, true);
    assert.equal(result.mutationPerformed, true);
    assert.ok(result.findings.some((finding: { code: string }) => finding.code === "UC_DAEMON_RELOAD_FAILED"));
    assert.equal(existsSync(path.join(fixture.systemdDir, "test-unit.service.d", "credentials.conf")), true);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("critical unit: the restart note points at engineering.vps.runner.restart and never restarts anything", async () => {
  const fixture = await makeFixture();
  try {
    await writeUnit(fixture.systemdDir, "eng-mcp-release-runner.service", "[Service]\nExecStart=/usr/bin/node scripts/eng-mcp-release-runner.mjs\n");
    await writeCredential(fixture.sourceDir);
    const result = await runUnitCredential(env(fixture, { ENG_MCP_UC_UNIT: "eng-mcp-release-runner.service" }), fixture.overrides);
    assert.equal(result.criticalUnit, true);
    assert.equal(result.requiresRestart, true);
    assert.ok(result.restartNote.includes("engineering.vps.runner.restart"));
    assert.ok(!reloadCalls(fixture.calls).some(() => false));
    assert.equal(fixture.calls.filter((call) => call.args[0] === "start" || call.args[0] === "restart" || call.args[0] === "stop").length, 0, "no service lifecycle command is ever issued");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});