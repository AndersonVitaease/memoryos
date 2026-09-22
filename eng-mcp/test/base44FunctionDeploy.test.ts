// BASE44-CLI-01 — unit tests for the governed Base44 function deployer
// (src/base44FunctionDeploy.ts). Coverage: allowlist/name gates before any CLI
// call, the governed patch input (path policy, baseHash version pin, hunk
// validation, change-count assertion), PLAN = exact live-vs-repo diff through a
// throwaway pull (never the repo checkout), NO_OP on identical sources, BLOCKED
// honesty on pull failure/unknown layout, execute = ONE named deploy plus the
// post-probe truth (DEPLOYED vs DEPLOYED_PROBE_FAILED), the audit trail
// (PLAN/NO_OP/DEPLOYED/DEPLOY_FAILED) and the rollback documentation.
// Deterministic: no network, no LLM, no SSH/shell; zero mutation. The CLI is
// always answered by an injected fake runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as pathModule from "node:path";
import { createHash } from "node:crypto";
import { runBase44FunctionDeploy } from "../src/base44FunctionDeploy.ts";
import type { Base44CliOperation, Base44CliRun } from "../src/base44Cli.ts";

const FN = "agentMemoryBridge";
const AUTHORIZER = "a1b2c3d4e5f60718";
const AUDIT_NAME = "base44-function.jsonl";

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const sha16 = (text: string): string => sha256(text).slice(0, 16);

const REPO_SOURCE = [
  "export const meta = { name: 'agentMemoryBridge' };",
  "const x = 1;",
  "export default x;",
  "",
].join("\n");
const LIVE_DIFFERENT = REPO_SOURCE.replace("const x = 1;", "const x = 2;");

const okRun = (stdout = ""): Base44CliRun => ({ ok: true, exitCode: 0, timedOut: false, authRejected: false, stdout, stderr: "", durationMs: 1 });
const authFailRun = (stdout = "", stderr = "Error: invalid api key"): Base44CliRun => ({ ok: false, exitCode: 1, timedOut: false, authRejected: true, stdout, stderr, durationMs: 1 });

function makeRoot(): { root: string; entryPath: string; auditPath: string } {
  const root = mkdtempSync("b44fndeploy-");
  const entryPath = pathModule.join(root, "base44", "functions", FN, "entry.ts");
  mkdirSync(pathModule.dirname(entryPath), { recursive: true });
  writeFileSync(entryPath, REPO_SOURCE);
  mkdirSync(pathModule.join(root, "audit"), { recursive: true });
  const auditPath = pathModule.join(root, "audit", AUDIT_NAME);
  return { root, entryPath, auditPath };
}

function makeRunner(opts: {
  live?: string | null;
  pullStdout?: string;
  failPull?: boolean;
  deployRuns?: Base44CliRun[];
} = {}) {
  const calls: { kind: string; name?: string; projectDir?: string }[] = [];
  const runner = async (operation: Base44CliOperation, callDeps: { projectDir?: string } = {}): Promise<Base44CliRun> => {
    calls.push({
      kind: operation.kind,
      ...(operation.kind === "functionPull" || operation.kind === "functionsDeploy" ? { name: operation.name } : {}),
      projectDir: callDeps.projectDir,
    });
    if (operation.kind === "functionPull") {
      if (opts.failPull) return authFailRun();
      if (opts.live != null && callDeps.projectDir) {
        const dir = pathModule.join(callDeps.projectDir, "functions", operation.name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(pathModule.join(dir, "entry.ts"), opts.live);
        return okRun("pulled");
      }
      return okRun(opts.pullStdout ?? "pull completed with no files");
    }
    if (operation.kind === "functionsDeploy") {
      return (opts.deployRuns ?? [okRun("deployed")]).shift() ?? okRun("deployed");
    }
    return okRun("{}");
  };
  return { calls, runner };
}

function makeDeps(root: string, auditPath: string, runner: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runner,
    functionNames: [FN],
    auditFile: auditPath,
    authorizerHash16: AUTHORIZER,
    memoryOsRoot: root,
    ...extra,
  };
}

async function withRoot(fn: (ctx: { root: string; entryPath: string; auditPath: string }) => Promise<void>): Promise<void> {
  const ctx = makeRoot();
  try { await fn(ctx); } finally { rmSync(ctx.root, { recursive: true, force: true }); }
}

const planInput = { function: FN, acknowledgeWrite: true } as const;
const execInput = { function: FN, execute: true, approval: { approved: true }, acknowledgeWrite: true } as const;

test("function.deploy allowlist: a non-allowlisted function is refused before any CLI call", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { calls, runner } = makeRunner();
    await assert.rejects(
      runBase44FunctionDeploy({ function: "notTheBridge", acknowledgeWrite: true }, makeDeps(root, auditPath, runner)),
      /BASE44_FUNCTION_NOT_ALLOWED/,
    );
    assert.equal(calls.length, 0);
  });
});

test("function.deploy: invalid function names are refused before any CLI call", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { calls, runner } = makeRunner();
    await assert.rejects(
      runBase44FunctionDeploy({ function: "../evil", acknowledgeWrite: true }, makeDeps(root, auditPath, runner)),
      /BASE44_FUNCTION_NAME_INVALID/,
    );
    await assert.rejects(
      runBase44FunctionDeploy({ function: "bad-name", acknowledgeWrite: true }, makeDeps(root, auditPath, runner)),
      /BASE44_FUNCTION_NAME_INVALID/,
    );
    assert.equal(calls.length, 0);
  });
});

test("function.deploy PLAN: exact diff against a throwaway pull; audit records PLAN", async () => {
  await withRoot(async ({ root, entryPath, auditPath }) => {
    const { calls, runner } = makeRunner({ live: LIVE_DIFFERENT });
    const result = await runBase44FunctionDeploy(planInput, makeDeps(root, auditPath, runner));
    assert.equal(result.tool, "engineering.base44.function.deploy");
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(result.repoSourceFiles, ["entry.ts"]);
    assert.deepEqual(result.liveSourceFiles, ["entry.ts"]);
    assert.equal(result.diffs.length, 1);
    assert.equal(result.diffs[0]!.path, "entry.ts");
    assert.equal(result.diffs[0]!.same, false);
    assert.equal(result.diffs[0]!.added, 1);
    assert.equal(result.diffs[0]!.removed, 1);
    assert.ok(result.diffs[0]!.diff.length > 0);
    assert.equal(result.wouldChange, true);
    assert.ok(result.diffSha16 && /^[0-9a-f]{16}$/.test(result.diffSha16));
    assert.deepEqual(result.previousLiveSha16, { "entry.ts": sha16(LIVE_DIFFERENT) });
    assert.deepEqual(calls.map((call) => call.kind), ["functionPull"]);
    assert.ok(calls[0]!.projectDir && calls[0]!.projectDir !== pathModule.join(root, "base44"), "the pull lands in a throwaway dir, never the repo checkout");
    assert.ok(!calls[0]!.projectDir!.startsWith(root), "the PLAN pull never touches the governed repo root");
    assert.equal(result.rollback.reversal.length > 0, true, "the rollback path is documented");
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const audit = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(audit.result, "PLAN");
    assert.equal(audit.function, FN);
    assert.equal(audit.diff_hash16, result.diffSha16);
    assert.equal(audit.authorizerHash16, AUTHORIZER);
  });
});

test("function.deploy NO_OP: identical live sources report NO_OP and never deploy", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { calls, runner } = makeRunner({ live: REPO_SOURCE });
    const result = await runBase44FunctionDeploy(execInput, makeDeps(root, auditPath, runner));
    assert.equal(result.status, "NO_OP");
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.wouldChange, false);
    assert.ok(result.findings.some((finding) => finding.code === "BASE44_SOURCES_IDENTICAL"));
    assert.deepEqual(calls.map((call) => call.kind), ["functionPull"], "no deploy runs when sources are identical");
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    assert.equal((JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>).result, "NO_OP");
  });
});

test("function.deploy BLOCKED: a failed pull records the canonical blocker with no diff", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { calls, runner } = makeRunner({ failPull: true });
    const result = await runBase44FunctionDeploy(planInput, makeDeps(root, auditPath, runner));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(result.blockers, ["BASE44_AUTH_REJECTED"]);
    assert.deepEqual(result.diffs, []);
    assert.equal(result.diffSha16, null);
    assert.ok(result.findings.some((finding) => finding.code === "BASE44_AUTH_REJECTED" && finding.severity === "critical"));
    assert.deepEqual(calls.map((call) => call.kind), ["functionPull"]);
  });
});

test("function.deploy BLOCKED: a pull without the function source reports the layout honestly", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const marker = "PULL_LAYOUT_MARKER_9182";
    const { runner } = makeRunner({ live: null, pullStdout: marker });
    const result = await runBase44FunctionDeploy(planInput, makeDeps(root, auditPath, runner));
    assert.equal(result.status, "BLOCKED");
    assert.deepEqual(result.blockers, ["BASE44_PULL_LAYOUT_UNKNOWN"]);
    assert.ok(result.findings.some((finding) => finding.code === "BASE44_PULL_LAYOUT_UNKNOWN" && finding.severity === "critical"));
    const evidence = result.findings.find((finding) => finding.code === "BASE44_PULL_EVIDENCE");
    assert.ok(evidence, "the raw pull evidence is surfaced as a finding");
    assert.ok(evidence!.detail.includes(marker));
  });
});

test("function.deploy patch: the governed edit is applied and reported with old/new hashes", async () => {
  await withRoot(async ({ root, entryPath, auditPath }) => {
    const { calls, runner } = makeRunner({ live: REPO_SOURCE.replace("const x = 1;", "const x = 42;") });
    const input = {
      function: FN,
      patch: {
        path: `functions/${FN}/entry.ts`,
        baseHash: sha256(REPO_SOURCE),
        hunks: [{ startLine: 2, deleteLines: ["const x = 1;"], insertLines: ["const x = 2;"] }],
      },
      acknowledgeWrite: true,
    };
    const result = await runBase44FunctionDeploy(input, makeDeps(root, auditPath, runner));
    assert.equal(result.status, "PLAN");
    assert.ok(result.patch, "patch evidence is reported");
    assert.equal(result.patch!.oldHash, sha256(REPO_SOURCE));
    assert.equal(result.patch!.newHash, sha256(readFileSync(entryPath, "utf8")));
    assert.equal(readFileSync(entryPath, "utf8"), REPO_SOURCE.replace("const x = 1;", "const x = 2;"));
    assert.ok(result.findings.some((finding) => finding.code === "BASE44_PATCH_APPLIED"));
    assert.equal(result.wouldChange, true);
    assert.deepEqual(calls.map((call) => call.kind), ["functionPull"]);
  });
});

test("function.deploy patch: a stale baseHash is refused and the file is untouched", async () => {
  await withRoot(async ({ root, entryPath, auditPath }) => {
    const { calls, runner } = makeRunner();
    const input = {
      function: FN,
      patch: {
        path: `functions/${FN}/entry.ts`,
        baseHash: "0".repeat(64),
        hunks: [{ startLine: 2, deleteLines: ["const x = 1;"], insertLines: ["const x = 2;"] }],
      },
      acknowledgeWrite: true,
    };
    await assert.rejects(runBase44FunctionDeploy(input, makeDeps(root, auditPath, runner)), /FILE_VERSION_CONFLICT/);
    assert.equal(readFileSync(entryPath, "utf8"), REPO_SOURCE);
    assert.equal(calls.length, 0);
  });
});

test("function.deploy patch: paths outside the function directory are refused with no CLI call", async () => {
  await withRoot(async ({ root, auditPath }) => {
    for (const badPath of ["functions/otherFn/entry.ts", `functions/${FN}/../evil.ts`, `functions\\${FN}\\entry.ts`]) {
      const { calls, runner } = makeRunner();
      await assert.rejects(
        runBase44FunctionDeploy(
          { function: FN, patch: { path: badPath, baseHash: sha256(REPO_SOURCE), hunks: [{ startLine: 1, deleteLines: [], insertLines: ["x"] }] }, acknowledgeWrite: true },
          makeDeps(root, auditPath, runner),
        ),
        /BASE44_PATCH_PATH_NOT_ALLOWED/,
        badPath,
      );
      assert.equal(calls.length, 0, badPath);
    }
  });
});

test("function.deploy patch: expectedChangeCount must equal the hunk count", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { calls, runner } = makeRunner();
    await assert.rejects(
      runBase44FunctionDeploy(
        {
          function: FN,
          patch: {
            path: `functions/${FN}/entry.ts`,
            baseHash: sha256(REPO_SOURCE),
            hunks: [{ startLine: 2, deleteLines: ["const x = 1;"], insertLines: ["const x = 2;"] }],
            expectedChangeCount: 3,
          },
          acknowledgeWrite: true,
        },
        makeDeps(root, auditPath, runner),
      ),
      /PATCH_CHANGE_COUNT_MISMATCH/,
    );
    assert.equal(calls.length, 0);
  });
});

test("function.deploy execute: deploys exactly the named function and reports the probe", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { calls, runner } = makeRunner({ live: LIVE_DIFFERENT });
    const probeCalls: number[] = [];
    const deps = makeDeps(root, auditPath, runner, {
      probe: async () => { probeCalls.push(1); return { ok: true, detail: "context probe ok" }; },
    });
    const result = await runBase44FunctionDeploy(execInput, deps);
    assert.equal(result.status, "DEPLOYED");
    assert.equal(result.mutationPerformed, true);
    assert.deepEqual(calls.map((call) => call.kind), ["functionPull", "functionsDeploy"]);
    assert.equal(calls[1]!.name, FN, "exactly one named function is deployed");
    assert.equal(result.cliRun?.exitCode, 0);
    assert.deepEqual(result.probe, { ok: true, detail: "context probe ok" });
    assert.equal(probeCalls.length, 1);
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    assert.deepEqual(lines.map((line) => (JSON.parse(line) as Record<string, unknown>).result), ["PLAN", "DEPLOYED"]);
  });
});

test("function.deploy: a failing post-probe reports DEPLOYED_PROBE_FAILED honestly (the deploy did happen)", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { runner } = makeRunner({ live: LIVE_DIFFERENT });
    const deps = makeDeps(root, auditPath, runner, {
      probe: async () => ({ ok: false, detail: "probe saw an error" }),
    });
    const result = await runBase44FunctionDeploy(execInput, deps);
    assert.equal(result.status, "DEPLOYED_PROBE_FAILED");
    assert.equal(result.mutationPerformed, true);
    assert.ok(result.findings.some((finding) => finding.code === "BASE44_PROBE_FAILED" && finding.severity === "warning"));
  });
});

test("function.deploy: a throwing post-probe degrades to the same honest status", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { runner } = makeRunner({ live: LIVE_DIFFERENT });
    const deps = makeDeps(root, auditPath, runner, {
      probe: async () => { throw new Error("probe blew up"); },
    });
    const result = await runBase44FunctionDeploy(execInput, deps);
    assert.equal(result.status, "DEPLOYED_PROBE_FAILED");
    assert.ok(result.findings.some((finding) => finding.code === "BASE44_PROBE_FAILED" && finding.detail.includes("probe blew up")));
  });
});

test("function.deploy: a failed deploy audits DEPLOY_FAILED and rejects canonically", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const { calls, runner } = makeRunner({ live: LIVE_DIFFERENT, deployRuns: [authFailRun()] });
    await assert.rejects(runBase44FunctionDeploy(execInput, makeDeps(root, auditPath, runner)), /BASE44_AUTH_REJECTED/);
    assert.deepEqual(calls.map((call) => call.kind), ["functionPull", "functionsDeploy"]);
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    const audit = JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>;
    assert.equal(audit.result, "DEPLOY_FAILED");
    assert.equal(audit.auth_rejected, true);
  });
});

test("function.deploy: appId resolution is input > deps > env, visible in the audit", async () => {
  await withRoot(async ({ root, auditPath }) => {
    const env = { ENG_MCP_BASE44_APP_ID: "envapp0001" } as unknown as NodeJS.ProcessEnv;
    {
      const { runner } = makeRunner({ live: LIVE_DIFFERENT });
      await runBase44FunctionDeploy(
        { ...planInput, appId: "inputapp01" },
        makeDeps(root, auditPath, runner, { appId: "depsapp001", env }),
      );
    }
    {
      const { runner } = makeRunner({ live: LIVE_DIFFERENT });
      await runBase44FunctionDeploy(planInput, makeDeps(root, auditPath, runner, { appId: "depsapp001", env }));
    }
    {
      const { runner } = makeRunner({ live: LIVE_DIFFERENT });
      await runBase44FunctionDeploy(planInput, makeDeps(root, auditPath, runner, { env }));
    }
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 3);
    assert.equal((JSON.parse(lines[0]!) as Record<string, unknown>).app_id, "inputapp01");
    assert.equal((JSON.parse(lines[1]!) as Record<string, unknown>).app_id, "depsapp001");
    assert.equal((JSON.parse(lines[2]!) as Record<string, unknown>).app_id, "envapp0001");
  });
});