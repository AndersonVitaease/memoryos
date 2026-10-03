// WORKER-SHELL-PROPRIA-01 — contract tests for engineering.shell.run (3-tier router).
// (a) allowlist executes without any judge call; (b) tier 2 with a mock judge
// (safe executes / unsafe refused / unavailable fail-closed); (c) tier 3 typed
// blocked; (d) timeout guard; (e) output truncation; plus cwd/path policy and
// audit-trail shape.
import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { unlinkSync, readFileSync, existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyShellCommand, tier1PathsSafe, truncateShellOutput, runShellRun,
  shellRunInputSchema,
  SHELL_RUN_DEFAULT_CWD, SHELL_RUN_TIER2_QUESTIONS,
  type ShellRunDeps, type ShellExecOutcome
} from "../src/shellRun.ts";

/** Real-exec tests sink their audit lines into /dev/null (never the production trail). */
const AUDIT_SINK = "/dev/null";

const SAFE_ANSWERS = { answers: SHELL_RUN_TIER2_QUESTIONS.map((q) => ({ id: q.id, probability: 0.01 })) };
const RISKY_ANSWERS = { answers: [{ id: "q_destructive", probability: 0.95 }, { id: "q_outward_facing", probability: 0.02 }, { id: "q_touches_credentials", probability: 0.02 }, { id: "q_large_blast_radius", probability: 0.02 }] };
const OK_EXEC = (command: string, cwd: string, timeoutMs: number): Promise<ShellExecOutcome> =>
  Promise.resolve({ exitCode: 0, stdout: "ok", stderr: "", timedOut: false, durationMs: 5 });

function depsWith(overrides: Partial<ShellRunDeps> = {}, auditFile?: string): ShellRunDeps {
  return { exec: OK_EXEC, ...overrides, auditFile: auditFile ?? AUDIT_SINK };
}

describe("tier 1 — allowlist executes without LLM", () => {
  test("tier-1 command executes and the judge is NEVER called", async () => {
    let judgeCalls = 0;
    let execCommand = "";
    const result = await runShellRun({ command: "git status --short" }, depsWith({
      judge: async () => { judgeCalls += 1; return SAFE_ANSWERS; },
      exec: (command) => { execCommand = command; return OK_EXEC(command, SHELL_RUN_DEFAULT_CWD, 120_000); }
    }));
    assert.equal(judgeCalls, 0, "tier 1 must be zero-cost (no judge call)");
    assert.equal(result.tier, 1);
    assert.equal(result.status, "executed");
    assert.equal(result.rule, "git_read_or_stage");
    assert.equal(execCommand, "git status --short");
  });

  test("allowlist coverage: unittest, node --test, npm test, cat, python3 script.py", () => {
    for (const command of [
      "python3 -m unittest discover",
      "pytest test_x.py",
      "node --test test/shellRun.test.ts",
      "node --import tsx --test test/shellRun.test.ts",
      "npm test",
      "npm run test",
      "git add src/shellRun.ts",
      "git commit -m 'x'",
      "git log --oneline -1",
      "git branch --show-current",
      "ls -la",
      `cat ${SHELL_RUN_DEFAULT_CWD}/release-state.json`,
      "python3 /opt/memoryos/eng-mcp/scripts/probe.py"
    ]) {
      assert.equal(classifyShellCommand(command).tier, 1, command);
    }
  });

  test("tier-1 path escape falls to tier 2 (judged, never silently run)", async () => {
    assert.equal(tier1PathsSafe("cat /etc/passwd", SHELL_RUN_DEFAULT_CWD), false);
    assert.equal(tier1PathsSafe("cat ../../../etc/passwd", SHELL_RUN_DEFAULT_CWD), false);
    assert.equal(tier1PathsSafe("python3 /etc/cron.py", SHELL_RUN_DEFAULT_CWD), false);
    let judgeCalled = false;
    const result = await runShellRun({ command: "cat /etc/passwd" }, depsWith({
      judge: async () => { judgeCalled = true; return { answers: [{ id: "q_touches_credentials", probability: 0.99 }, ...SHELL_RUN_TIER2_QUESTIONS.slice(1).map((q) => ({ id: q.id, probability: 0.01 }))] }; }
    }));
    assert.equal(judgeCalled, true);
    assert.equal(result.status, "refused");
    assert.equal(result.code, "SHELL_RUN_JUDGE_REFUSED");
  });

  test("tier-1 with relative path inside allowed cwd stays tier 1", () => {
    assert.equal(tier1PathsSafe("node --test test/shellRun.test.ts", SHELL_RUN_DEFAULT_CWD), true);
    assert.equal(tier1PathsSafe("cat release-state.json", SHELL_RUN_DEFAULT_CWD), true);
  });
});

describe("tier 2 — judge classifies safe/unsafe", () => {
  test("safe command (safeScore >= 0.9) executes with judge provenance", async () => {
    const result = await runShellRun({ command: "echo hello" }, depsWith({
      judge: async () => SAFE_ANSWERS
    }));
    assert.equal(result.tier, 2);
    assert.equal(result.status, "executed");
    assert.equal(result.judge?.safeScore, 0.99);
  });

  test("unsafe command is refused with reasons (SHELL_RUN_JUDGE_REFUSED)", async () => {
    const result = await runShellRun({ command: "echo hello" }, depsWith({
      judge: async () => RISKY_ANSWERS
    }));
    assert.equal(result.status, "refused");
    assert.equal(result.tier, 2);
    assert.equal(result.code, "SHELL_RUN_JUDGE_REFUSED");
    assert.match(result.reason ?? "", /q_destructive=0\.950/);
    assert.equal(result.exitCode, null);
  });

  test("judge unavailable = fail-CLOSED (unknown command never auto-runs)", async () => {
    const result = await runShellRun({ command: "echo hello" }, depsWith({
      judge: async () => { throw new Error("provider down"); }
    }));
    assert.equal(result.status, "refused");
    assert.equal(result.code, "SHELL_RUN_JUDGE_UNAVAILABLE");
  });

  test("unknown/missing judge answer = max risk (fail-closed)", async () => {
    const result = await runShellRun({ command: "echo hello" }, depsWith({
      judge: async () => ({ answers: [{ id: "q_destructive", probability: 0.01 }] })
    }));
    assert.equal(result.status, "refused");
    assert.equal(result.code, "SHELL_RUN_JUDGE_REFUSED");
  });

  test("shell meta characters keep the command out of tier 1", () => {
    assert.equal(classifyShellCommand("git status && git log").tier, 2);
    assert.equal(classifyShellCommand("ls | cat").tier, 2);
    assert.equal(classifyShellCommand("echo `whoami`").tier, 2);
  });
});

describe("tier 3 — operator consequence, typed blocked", () => {
  test("denylist commands are blocked BEFORE any execution", async () => {
    for (const [command, rule] of [
      ["systemctl restart nginx", "system_service_control"],
      ["rm -rf /opt/memoryos", "rm_recursive_or_forced"],
      ["kill -9 1234", "process_kill"],
      ["curl https://example.com", "external_fetch"],
      ["chmod 777 /etc/sudoers", "etc_mutation"],
      ["cat /data/manifests/mission-x.json", "mission_manifests"],
      ["git push origin main", "git_push"],
      ["docker ps", "container_control"],
      ["sudo apt install x", "privilege_escalation"],
      ["cat /data/tokens.json", "credential_files"]
    ] as Array<[string, string]>) {
      let execCalled = false;
      const result = await runShellRun({ command }, depsWith({ exec: async () => { execCalled = true; return OK_EXEC(command, SHELL_RUN_DEFAULT_CWD, 120_000); } }));
      assert.equal(result.status, "blocked", command);
      assert.equal(result.tier, 3, command);
      assert.equal(result.code, "SHELL_RUN_BLOCKED", command);
      assert.equal(result.rule, rule, command);
      assert.equal(result.exitCode, null, command);
      assert.equal(execCalled, false, `tier 3 must never execute: ${command}`);
    }
  });

  test("denylist wins over the allowlist (evaluated first)", () => {
    const blocked = classifyShellCommand("cat /data/tokens.json");
    assert.equal(blocked.tier, 3);
  });
});

describe("guards", () => {
  test("(d) timeout guard kills the command (real spawn)", async () => {
    const startedAt = Date.now();
    // No exec injection: this test exercises the REAL defaultExec spawn.
    const result = await runShellRun({ command: "sleep 5", timeoutMs: 1000 }, {
      judge: async () => SAFE_ANSWERS,
      auditFile: AUDIT_SINK
    });
    const wall = Date.now() - startedAt;
    assert.equal(result.status, "executed", "the call itself completes (guard, not crash)");
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode === null || result.exitCode !== 0, true);
    assert.ok(wall < 4500, `timeout must actually cut the run (wall ${wall}ms)`);
  });

  test("(e) output truncation head+tail 50KB with grep-able marker (real spawn)", async () => {
    // No exec injection: this test exercises the REAL defaultExec spawn.
    const result = await runShellRun({ command: "cat src/tools.ts" }, { auditFile: AUDIT_SINK });
    assert.equal(result.status, "executed");
    assert.equal(result.truncated, true);
    assert.match(result.stdout, /SHELL_RUN_OUTPUT_TRUNCATED \d+ bytes dropped/);
    assert.ok(Buffer.byteLength(result.stdout, "utf8") < 60_000, "truncated stdout stays bounded");
  });

  test("truncateShellOutput pure: small text untouched, big text head+tail", () => {
    const small = truncateShellOutput("hello");
    assert.equal(small.truncated, false);
    assert.equal(small.text, "hello");
    const big = "x".repeat(80_000);
    const cut = truncateShellOutput(big);
    assert.equal(cut.truncated, true);
    assert.match(cut.text, /SHELL_RUN_OUTPUT_TRUNCATED/);
    assert.ok(cut.text.startsWith("x"));
    assert.ok(cut.text.endsWith("x"));
  });

  test("cwd policy: outside roots refused, inside roots accepted", async () => {
    const denied = await runShellRun({ command: "git status", cwd: "/etc" }, depsWith({}, AUDIT_SINK));
    assert.equal(denied.status, "refused");
    assert.equal(denied.code, "SHELL_RUN_CWD_DENIED");
    const missing = await runShellRun({ command: "git status", cwd: "/opt/memoryos/eng-mcp/no-such-dir" }, depsWith({}, AUDIT_SINK));
    assert.equal(missing.code, "SHELL_RUN_CWD_NOT_FOUND");
    const accepted = await runShellRun({ command: "git status", cwd: "/opt/memoryos/eng-mcp" }, depsWith({}, AUDIT_SINK));
    assert.equal(accepted.status, "executed");
  });

  test("schema bounds: command cap and timeout cap", () => {
    assert.throws(() => shellRunInputSchema.parse({ command: "x".repeat(4001) }));
    assert.throws(() => shellRunInputSchema.parse({ command: "ls", timeoutMs: 600_001 }));
    assert.equal(shellRunInputSchema.parse({ command: "ls", timeoutMs: 600_000 }).timeoutMs, 600_000);
  });
});

describe("audit trail", () => {
  test("every call writes one audit line (tier, verdict, command, exit)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shellrun-audit-"));
    const auditFile = join(dir, "audit.jsonl");
    try {
      await runShellRun({ command: "git status --short" }, depsWith({}, auditFile));
      await runShellRun({ command: "systemctl restart x" }, depsWith({}, auditFile));
      await runShellRun({ command: "echo hi" }, depsWith({ judge: async () => SAFE_ANSWERS }, auditFile));
      const lines = readFileSync(auditFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(lines.length, 3);
      assert.equal(lines[0].tier, 1);
      assert.equal(lines[0].status, "executed");
      assert.equal(lines[0].exitCode, 0);
      assert.equal(lines[0].command, "git status --short");
      assert.equal(lines[1].tier, 3);
      assert.equal(lines[1].status, "blocked");
      assert.equal(lines[1].code, "SHELL_RUN_BLOCKED");
      assert.equal(lines[2].tier, 2);
      assert.equal(lines[2].status, "executed");
      assert.match(lines[0].commandSha16, /^[a-f0-9]{16}$/);
      assert.match(lines[0].ts, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      if (existsSync(auditFile)) unlinkSync(auditFile);
    }
  });
});