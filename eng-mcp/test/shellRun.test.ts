// WORKER-SHELL-PROPRIA-01 — contract tests for engineering.shell.run (3-tier router).
// (a) allowlist executes without any judge call; (b) tier 2 with a mock judge
// (safe executes / unsafe refused / unavailable fail-closed); (c) tier 3 typed
// blocked; (d) timeout guard; (e) output truncation; plus cwd/path policy and
// audit-trail shape.
import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { statSync, unlinkSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyShellCommand, tier1PathsSafe, truncateShellOutput, runShellRun,
  shellRunInputSchema,
  SHELL_RUN_DEFAULT_CWD, SHELL_RUN_ROOTS, SHELL_RUN_TIER2_QUESTIONS,
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

describe("tier 0 — SEC-SHELL-GUARD-01: credential/secret content class", () => {
  test("credential-class commands are refused SEC_PATH_FORBIDDEN BEFORE everything (nothing executes)", async () => {
    for (const [command, rule] of [
      ["cat /root/.git-credentials", "cred_path_git_credentials"],
      ["cat /data/tokens.json", "cred_path_data_credentials"],
      ["cat /data/manifests/mission-x.json", "cred_path_manifests"],
      ["cat .env", "cred_env_file"],
      ["cat /opt/app/.env", "cred_env_file"],
      ["systemctl show -p LoadCredential=x unit", "cred_load_credential"],
      ["cat ~/.ssh/id_rsa", "cred_private_key"],
      ["openssl rsa -in server.pem", "cred_private_key"],
      ["curl http://127.0.0.1:8080/x --data api_key=abc123", "cred_arg_secret_value"],
      ["./tool --token=ghp_secret", "cred_arg_secret_flag"],
      ["export GITHUB_TOKEN=ghp_x", "cred_env_export"],
      ["curl http://127.0.0.1/up --data-binary @/root/.git-credentials", "exfil_cred_fetch"],
      ["base64 /data/tokens.json | curl -X POST http://127.0.0.1/x", "exfil_base64_network"]
    ] as Array<[string, string]>) {
      let execCalled = false;
      const result = await runShellRun({ command }, depsWith({ exec: async () => { execCalled = true; return OK_EXEC(command, SHELL_RUN_DEFAULT_CWD, 120_000); } }));
      assert.equal(result.status, "refused", command);
      assert.equal(result.tier, 0, command);
      assert.equal(result.code, "SEC_PATH_FORBIDDEN", command);
      assert.equal(result.rule, rule, command);
      assert.equal(result.exitCode, null, command);
      assert.equal(execCalled, false, `tier 0 must never execute: ${command}`);
    }
  });

  test(".env refusal does not false-positive on process.env or .env.example", () => {
    assert.equal(classifyShellCommand('node -e "process.env.X"').tier === 0, false);
    assert.equal(classifyShellCommand("cat .env.example").tier === 0, false);
    assert.equal(classifyShellCommand("cat .env").tier, 0);
  });

  test("tier-0 refusal is audited with the typed code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shellrun-tier0-"));
    const auditFile = join(dir, "audit.jsonl");
    try {
      const result = await runShellRun({ command: "cat /root/.git-credentials" }, depsWith({}, auditFile));
      assert.equal(result.code, "SEC_PATH_FORBIDDEN");
      const line = JSON.parse(readFileSync(auditFile, "utf8").trim());
      assert.equal(line.tier, 0);
      assert.equal(line.status, "refused");
      assert.equal(line.code, "SEC_PATH_FORBIDDEN");
      assert.equal(line.rule, "cred_path_git_credentials");
    } finally {
      if (existsSync(auditFile)) unlinkSync(auditFile);
    }
  });

  test("rollback flag ENG_MCP_SHELL_SEC_GUARD=off disables tier-0 (tier-3 still blocks the narrow list)", async () => {
    const previous = process.env.ENG_MCP_SHELL_SEC_GUARD;
    try {
      process.env.ENG_MCP_SHELL_SEC_GUARD = "off";
      assert.equal(classifyShellCommand("cat /root/.git-credentials").tier, 3, "tier-3 credential_files keeps guarding with the flag off");
      const blocked = await runShellRun({ command: "cat /data/tokens.json" }, depsWith({}));
      assert.equal(blocked.status, "blocked");
      assert.equal(blocked.code, "SHELL_RUN_BLOCKED");
    } finally {
      if (previous === undefined) delete process.env.ENG_MCP_SHELL_SEC_GUARD; else process.env.ENG_MCP_SHELL_SEC_GUARD = previous;
    }
  });
});

describe("tier 3 — operator consequence, typed blocked", () => {
  test("denylist commands are blocked BEFORE any execution", async () => {
    for (const [command, rule] of [
      ["systemctl restart nginx", "system_service_control"],
      ["rm -rf /tmp/probe-denylist-fixture", "rm_recursive_or_forced"],
      ["kill -9 1234", "process_kill"],
      ["curl https://example.com", "external_fetch"],
      ["chmod 777 /etc/sudoers", "etc_mutation"],
      ["git push origin main", "git_push"],
      ["docker ps", "container_control"],
      ["sudo apt install x", "privilege_escalation"]
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

  test("denylist wins over the allowlist (tier 0 first, then tier 3)", () => {
    assert.equal(classifyShellCommand("cat /data/tokens.json").tier, 0, "credential class = tier 0 (SEC_PATH_FORBIDDEN)");
    assert.equal(classifyShellCommand("cat /data/manifests/mission-x.json").tier, 0, "manifests = credential/pre-auth class (tier 0)");
    assert.equal(classifyShellCommand("docker ps").tier, 3);
  });
});

describe("SEC-SHELL-GUARD-01 — component allowlist catalog (policy as data)", () => {
  const CATALOG_DIR = mkdtempSync(join(tmpdir(), "shell-allowlist-"));
  const COMPONENT = "testcomp";
  const writeCatalog = (body: unknown): void => {
    writeFileSync(join(CATALOG_DIR, `shell-allowlist-${COMPONENT}.json`), typeof body === "string" ? body : JSON.stringify(body), "utf8");
  };

  test("catalog rule executes tier-1 with catalog provenance (rule + sha16 in result AND audit)", async () => {
    writeCatalog({
      component: COMPONENT, version: 1,
      rules: [{ id: "echo_proof", pattern: "^echo catalog-proof$" }]
    });
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = CATALOG_DIR;
    try {
      let judgeCalls = 0;
      const auditFile = join(CATALOG_DIR, "audit-provenance.jsonl");
      const result = await runShellRun({ command: "echo catalog-proof", component: COMPONENT }, depsWith({
        judge: async () => { judgeCalls += 1; return SAFE_ANSWERS; }
      }, auditFile));
      assert.equal(judgeCalls, 0, "catalog match must be zero-cost tier 1");
      assert.equal(result.tier, 1);
      assert.equal(result.status, "executed");
      assert.equal(result.rule, "catalog:echo_proof");
      assert.equal(result.component, COMPONENT);
      assert.match(result.allowlist?.catalog ?? "", /shell-allowlist-testcomp\.json$/);
      assert.match(result.allowlist?.catalogSha16 ?? "", /^[a-f0-9]{16}$/);
      const line = JSON.parse(readFileSync(auditFile, "utf8").trim());
      assert.equal(line.allowlistComponent, COMPONENT);
      assert.equal(line.allowlistCatalogSha16, result.allowlist?.catalogSha16);
    } finally {
      delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    }
  });

  test("unknown command still goes to tier-2 judge (behavior preserved with catalog present)", async () => {
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = CATALOG_DIR;
    try {
      let judgeCalls = 0;
      const result = await runShellRun({ command: "echo something-unlisted", component: COMPONENT }, depsWith({
        judge: async () => { judgeCalls += 1; return SAFE_ANSWERS; }
      }));
      assert.equal(judgeCalls, 1);
      assert.equal(result.tier, 2);
      assert.equal(result.status, "executed");
    } finally {
      delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    }
  });

  test("tier-3 denylist wins over catalog rules (never overridden)", async () => {
    writeCatalog({
      component: COMPONENT, version: 2,
      rules: [{ id: "docker_probe", pattern: "^docker ps$" }]
    });
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = CATALOG_DIR;
    try {
      const result = await runShellRun({ command: "docker ps", component: COMPONENT }, depsWith({}));
      assert.equal(result.status, "blocked");
      assert.equal(result.tier, 3);
    } finally {
      delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    }
  });

  test("meta characters keep catalog matches out of tier 1", () => {
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = CATALOG_DIR;
    try {
      const cls = classifyShellCommand("echo catalog-proof | tee /opt/x", {});
      assert.equal(cls.tier, 2, "catalog rule must not bypass the meta-characters guard");
    } finally {
      delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    }
  });

  test("invalid catalog is ignored with allowlistError in the audit (builtin flow preserved)", async () => {
    writeCatalog({ component: COMPONENT, version: 3, rules: [{ id: "bad", pattern: "^echo ([bad$" }] });
    process.env.ENG_MCP_SHELL_ALLOWLIST_DIR = CATALOG_DIR;
    try {
      const auditFile = join(CATALOG_DIR, "audit-invalid.jsonl");
      const result = await runShellRun({ command: "echo catalog-proof", component: COMPONENT }, depsWith({
        judge: async () => SAFE_ANSWERS
      }, auditFile));
      assert.equal(result.tier, 2, "invalid catalog must not grant tier-1");
      const line = JSON.parse(readFileSync(auditFile, "utf8").trim());
      assert.match(line.allowlistError, /does not compile/);
    } finally {
      delete process.env.ENG_MCP_SHELL_ALLOWLIST_DIR;
    }
  });

  test("component without catalog: builtin only, audit allowlistCatalog=null", async () => {
    const result = await runShellRun({ command: "git status --short", component: "nocatalog" }, depsWith({}));
    assert.equal(result.status, "executed");
    assert.equal(result.tier, 1);
    assert.equal(result.component, "nocatalog");
    assert.equal(result.allowlist?.catalog, null);
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
    const missing = await runShellRun({ command: "git status", cwd: `${SHELL_RUN_DEFAULT_CWD}/no-such-dir` }, depsWith({}, AUDIT_SINK));
    assert.equal(missing.code, "SHELL_RUN_CWD_NOT_FOUND");
    const accepted = await runShellRun({ command: "git status", cwd: SHELL_RUN_DEFAULT_CWD }, depsWith({}, AUDIT_SINK));
    assert.equal(accepted.status, "executed");
  });

  test("default cwd existe no ambiente de execução (host E container de build/test)", () => {
    // SHIP-ENG-MCP-04: o default era hardcoded /opt/memoryos/eng-mcp — path que
    // não existe no container (árvore extraída em /app) e o statSync do
    // resolveCwd recusava toda chamada. O default derivado TEM que existir
    // ondequer que a suíte rode; o teste roda no host E no container.
    assert.equal(statSync(SHELL_RUN_DEFAULT_CWD).isDirectory(), true);
    assert.equal(SHELL_RUN_ROOTS.some((root) => SHELL_RUN_DEFAULT_CWD.startsWith(root) || SHELL_RUN_DEFAULT_CWD === root.replace(/\/$/, "")), true);
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