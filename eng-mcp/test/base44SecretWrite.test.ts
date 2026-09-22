// BASE44-CLI-01 — unit tests for the governed Base44 secret writer
// (src/base44SecretWrite.ts). Coverage: PLAN/execute gating, the allowlist,
// fail-closed source resolution (env unset, staging outside prefix / missing /
// symlink / permissive mode / empty), the temporary 0600 env-file destroyed
// after use, canonical CLI failure propagation, the WRITE-only audit carrying
// hash16 only (zero value material anywhere), honest postcheck reporting, and
// the by-design absence of NO_OP idempotency for confirmed writes.
// Deterministic: no network, no LLM, no SSH/shell; zero mutation. The CLI is
// always answered by an injected fake runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as pathModule from "node:path";
import { createHash } from "node:crypto";
import { runBase44SecretWrite } from "../src/base44SecretWrite.ts";
import type { Base44CliOperation, Base44CliRun } from "../src/base44Cli.ts";

const SECRET = "AGENT_MEMORY_MCP_SECRET";
const VALUE = "b44k_TESTTOKEN_value_0123456789abcdef";
const AUTHORIZER = "a1b2c3d4e5f60718";
const AUDIT_NAME = "base44-secret.jsonl";

const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

const okRun = (stdout = ""): Base44CliRun => ({ ok: true, exitCode: 0, timedOut: false, authRejected: false, stdout, stderr: "", durationMs: 1 });
const authFailRun = (): Base44CliRun => ({ ok: false, exitCode: 1, timedOut: false, authRejected: true, stdout: "", stderr: "Error: invalid api key", durationMs: 1 });

type RecordedCall = { kind: string; name?: string; envFile?: string; projectDir?: string };

function makeRunner(opts: {
  probeNames?: string[];
  postcheckNames?: string[];
  failProbe?: boolean;
  failOnSet?: boolean;
  onSet?: (envFile: string) => void;
} = {}) {
  const calls: RecordedCall[] = [];
  let listCalls = 0;
  let lastEnvFile: string | null = null;
  const runner = async (operation: Base44CliOperation, callDeps: { projectDir?: string } = {}): Promise<Base44CliRun> => {
    calls.push({
      kind: operation.kind,
      ...(operation.kind === "functionPull" || operation.kind === "functionsDeploy" ? { name: operation.name } : {}),
      ...(operation.kind === "secretsSet" ? { envFile: operation.envFile } : {}),
      projectDir: callDeps.projectDir,
    });
    if (operation.kind === "secretsList") {
      listCalls += 1;
      if (listCalls === 1 && opts.failProbe) return authFailRun();
      const names = listCalls === 1 ? (opts.probeNames ?? []) : (opts.postcheckNames ?? opts.probeNames ?? []);
      return okRun(JSON.stringify(names));
    }
    if (operation.kind === "secretsSet") {
      lastEnvFile = operation.envFile;
      opts.onSet?.(operation.envFile);
      if (opts.failOnSet) return authFailRun();
      return okRun("updated");
    }
    return okRun("{}");
  };
  return { calls, runner, get lastEnvFile() { return lastEnvFile; } };
}

function makeDeps(root: string, runner: unknown, env: Record<string, string> = {}): Record<string, unknown> {
  mkdirSync(pathModule.join(root, "audit"), { recursive: true });
  return {
    runner,
    secretNames: [SECRET],
    stagingPrefix: pathModule.join(root, "staging-"),
    auditFile: pathModule.join(root, "audit", AUDIT_NAME),
    authorizerHash16: AUTHORIZER,
    env: env as unknown as NodeJS.ProcessEnv,
  };
}

const auditPathOf = (root: string): string => pathModule.join(root, "audit", AUDIT_NAME);

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync("b44secret-");
  try { await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const planInput = { secretName: SECRET, source: { kind: "env" as const, name: "MY_TOKEN" }, acknowledgeWrite: true } as const;
const execInput = { ...planInput, execute: true, approval: { approved: true } };

test("secret.write PLAN: live names list, target present, never audits", async () => {
  await withRoot(async (root) => {
    const { calls, runner } = makeRunner({ probeNames: [SECRET, "OTHER"] });
    const result = await runBase44SecretWrite(planInput, makeDeps(root, runner, { MY_TOKEN: VALUE }));
    assert.equal(result.tool, "engineering.base44.secret.write");
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(result.listedNames, [SECRET, "OTHER"]);
    assert.equal(result.targetListed, true);
    assert.equal(result.source?.kind, "env");
    assert.equal(result.source?.reference, "env:MY_TOKEN");
    assert.equal(result.source?.bytes, Buffer.byteLength(VALUE));
    assert.equal(result.valueSha16, sha16(VALUE));
    assert.equal(result.redeployWarning, true);
    assert.deepEqual(result.plan, { action: "set_secret", possible: true, requires: ["execute=true", "approval.approved=true"] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.kind, "secretsList");
    const audit = auditPathOf(root);
    assert.ok(!existsSync(audit) || readFileSync(audit, "utf8").trim() === "", "PLAN must not audit");
  });
});

test("secret.write allowlist: a non-allowlisted secret is refused before anything", async () => {
  await withRoot(async (root) => {
    const { calls, runner } = makeRunner();
    await assert.rejects(
      runBase44SecretWrite({ ...planInput, secretName: "SOME_OTHER_SECRET" }, makeDeps(root, runner, { MY_TOKEN: VALUE })),
      /BASE44_SECRET_NOT_ALLOWED/,
    );
    assert.equal(calls.length, 0);
  });
});

test("secret.write: unset env source blocks with BASE44_SOURCE_EMPTY and no CLI call", async () => {
  await withRoot(async (root) => {
    const { calls, runner } = makeRunner();
    const result = await runBase44SecretWrite(planInput, makeDeps(root, runner, {}));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(result.blockers, ["BASE44_SOURCE_EMPTY"]);
    assert.equal(result.source, null);
    assert.equal(calls.length, 0);
  });
});

test("secret.write staging: every unsafe source shape fails closed", async () => {
  await withRoot(async (root) => {
    const staging = pathModule.join(root, "staging-");
    mkdirSync(staging, { recursive: true });
    const outside = pathModule.join(root, "outside-token");
    writeFileSync(outside, VALUE);
    const missing = `${staging}missing`;
    const target = `${staging}target`;
    writeFileSync(target, VALUE);
    const link = `${staging}link`;
    symlinkSync(target, link);
    const permissive = `${staging}permissive`;
    writeFileSync(permissive, VALUE);
    chmodSync(permissive, 0o644);
    const empty = `${staging}empty`;
    writeFileSync(empty, "");
    chmodSync(empty, 0o600);
    const scenarios = [
      { path: outside, code: "BASE44_SOURCE_NOT_ALLOWED" },
      { path: missing, code: "BASE44_SOURCE_NOT_FOUND" },
      { path: link, code: "BASE44_SOURCE_NOT_REGULAR_FILE" },
      { path: permissive, code: "BASE44_SOURCE_PERMS_REFUSED" },
      { path: empty, code: "BASE44_SOURCE_EMPTY" },
    ];
    for (const scenario of scenarios) {
      const { calls, runner } = makeRunner();
      const result = await runBase44SecretWrite(
        { secretName: SECRET, source: { kind: "staging", path: scenario.path }, acknowledgeWrite: true },
        makeDeps(root, runner),
      );
      assert.equal(result.status, "BLOCKED", scenario.code);
      assert.deepEqual(result.blockers, [scenario.code], scenario.code);
      assert.equal(calls.length, 0, scenario.code);
    }
  });
});

test("secret.write staging: a valid 0600 file plans with a staging reference", async () => {
  await withRoot(async (root) => {
    const staging = pathModule.join(root, "staging-");
    mkdirSync(staging, { recursive: true });
    const file = `${staging}token`;
    writeFileSync(file, VALUE);
    chmodSync(file, 0o600);
    const { calls, runner } = makeRunner({ probeNames: [SECRET] });
    const result = await runBase44SecretWrite(
      { secretName: SECRET, source: { kind: "staging", path: file }, acknowledgeWrite: true },
      makeDeps(root, runner),
    );
    assert.equal(result.status, "PLAN");
    assert.equal(result.source?.kind, "staging");
    assert.equal(result.source?.reference, `staging:${file}`);
    assert.equal(result.targetListed, true);
    assert.equal(calls.length, 1);
  });
});

test("secret.write execute: temporary 0600 env-file, destroyed after use, audit carries hash16 only", async () => {
  await withRoot(async (root) => {
    let atSetContent = "";
    let atSetMode = 0;
    let atSetParent = "";
    const b44 = makeRunner({
      probeNames: [SECRET],
      onSet: (file) => {
        atSetContent = readFileSync(file, "utf8");
        atSetMode = statSync(file).mode & 0o777;
        atSetParent = pathModule.dirname(file);
      },
    });
    const result = await runBase44SecretWrite(execInput, makeDeps(root, b44.runner, { MY_TOKEN: VALUE }));
    assert.equal(result.status, "WRITE");
    assert.equal(result.mutationPerformed, true);
    assert.deepEqual(b44.calls.map((call) => call.kind), ["secretsList", "secretsSet", "secretsList"]);
    assert.equal(atSetContent, `${SECRET}=${VALUE}\n`);
    assert.equal(atSetMode & 0o777, 0o600, "the temporary env-file is 0600");
    assert.ok(b44.lastEnvFile!.startsWith(atSetParent));
    assert.equal(existsSync(atSetParent), false, "the temporary env-file directory is destroyed after use");
    assert.equal(result.cliRun?.exitCode, 0);
    assert.equal(result.postcheck?.listed, true);
    assert.equal(result.redeployWarning, true);
    assert.ok(!JSON.stringify(result).includes(VALUE), "the result carries zero value material");
    const audit = JSON.parse(readFileSync(auditPathOf(root), "utf8").trim()) as Record<string, unknown>;
    assert.equal(audit.result, "WRITE");
    assert.equal(audit.secret_name, SECRET);
    assert.equal(audit.value_sha16, sha16(VALUE));
    assert.equal(audit.redeploy_warning, true);
    assert.equal(audit.authorizerHash16, AUTHORIZER);
    assert.ok(!JSON.stringify(audit).includes(VALUE), "the audit line carries zero value material");
  });
});

test("secret.write postcheck: a target that vanished still reports WRITE honestly", async () => {
  await withRoot(async (root) => {
    const { runner } = makeRunner({ probeNames: [SECRET], postcheckNames: ["SOMETHING_ELSE"] });
    const result = await runBase44SecretWrite(execInput, makeDeps(root, runner, { MY_TOKEN: VALUE }));
    assert.equal(result.status, "WRITE");
    assert.equal(result.mutationPerformed, true);
    assert.equal(result.postcheck?.listed, false);
    assert.ok(result.findings.some((finding) => finding.code === "BASE44_POSTCHECK_INCOMPLETE" && finding.severity === "warning"));
  });
});

test("secret.write: CLI failure during set rejects canonically, destroys the temp, never audits", async () => {
  await withRoot(async (root) => {
    let atSetParent = "";
    const { runner } = makeRunner({
      probeNames: [SECRET],
      failOnSet: true,
      onSet: (file) => { atSetParent = pathModule.dirname(file); },
    });
    await assert.rejects(runBase44SecretWrite(execInput, makeDeps(root, runner, { MY_TOKEN: VALUE })), /BASE44_AUTH_REJECTED/);
    assert.equal(existsSync(atSetParent), false);
    const audit = auditPathOf(root);
    assert.ok(!existsSync(audit) || readFileSync(audit, "utf8").trim() === "");
  });
});

test("secret.write idempotency is honest: two confirmed writes both report WRITE", async () => {
  await withRoot(async (root) => {
    const { runner } = makeRunner({ probeNames: [SECRET] });
    const deps = makeDeps(root, runner, { MY_TOKEN: VALUE });
    const first = await runBase44SecretWrite(execInput, deps);
    const second = await runBase44SecretWrite(execInput, deps);
    assert.equal(first.status, "WRITE");
    assert.equal(first.mutationPerformed, true);
    assert.equal(second.status, "WRITE");
    assert.equal(second.mutationPerformed, true);
    const lines = readFileSync(auditPathOf(root), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    for (const line of lines) assert.equal((JSON.parse(line) as Record<string, unknown>).result, "WRITE");
  });
});

test("secret.write PLAN: a failed listing probe records a critical finding and stays PLAN", async () => {
  await withRoot(async (root) => {
    const { calls, runner } = makeRunner({ failProbe: true });
    const result = await runBase44SecretWrite(planInput, makeDeps(root, runner, { MY_TOKEN: VALUE }));
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.listedNames, undefined);
    const critical = result.findings.find((finding) => finding.severity === "critical");
    assert.equal(critical?.code, "BASE44_AUTH_REJECTED");
    assert.equal(critical?.detail, "secrets list probe failed");
    assert.equal(calls.length, 1);
  });
});

test("secret.write: execute without approval stays PLAN and does not write", async () => {
  await withRoot(async (root) => {
    const { calls, runner } = makeRunner({ probeNames: [SECRET] });
    const result = await runBase44SecretWrite({ ...planInput, execute: true, approval: { approved: false } }, makeDeps(root, runner, { MY_TOKEN: VALUE }));
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.equal(calls.length, 1);
  });
});