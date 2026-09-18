// GIT-PUSH-01: engineering.git.push governed push — integration through the MCP
// HTTP harness (real git, real bare origin over file://) plus direct runGitPush
// calls with injected deps for the error-mapping edges. PLAN never mutates;
// execute requires approval + acknowledge; diverged / non-fast-forward /
// credential / head-mismatch / postcheck paths are all typed refusals.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createEngineeringHttpServer } from "../src/server.js";
import { GitPushError, runGitPush, type GitPushDeps } from "../src/gitPush.js";

const sha256 = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const hasCode = (code: string) => (error: unknown) => error instanceof GitPushError && error.code === code;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

type Fixture = {
  base: string;
  root: string;
  origin: string;
  credentials: string;
  auditFile: string;
  head: () => string;
  originHead: () => string;
  commit: (message: string) => string;
};

function makeFixture(): Fixture {
  const base = mkdtempSync(path.join(tmpdir(), "eng-mcp-gitpush-"));
  const root = path.join(base, "work");
  const origin = path.join(base, "origin.git");
  execFileSync("git", ["init", "--bare", origin]);
  execFileSync("git", ["init", root]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  writeFileSync(path.join(root, "app.js"), "export const hello = 'world';\n");
  execFileSync("git", ["add", "app.js"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture initial"], { cwd: root });
  execFileSync("git", ["branch", "-M", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: root });
  execFileSync("git", ["push", "origin", "refs/heads/main:refs/heads/main"], { cwd: root });
  execFileSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: origin });
  const credentials = path.join(base, "git-credentials");
  writeFileSync(credentials, "https://x-access-token:fixture-credential@github.com\n");
  const auditFile = path.join(base, "audit", "git-push.jsonl");
  return {
    base, root, origin, credentials, auditFile,
    head: () => git(root, ["rev-parse", "refs/heads/main"]).trim(),
    originHead: () => git(origin, ["rev-parse", "refs/heads/main"]).trim(),
    commit: (message: string) => {
      writeFileSync(path.join(root, `file-${Date.now()}-${Math.random()}.txt`), `${message}\n`);
      execFileSync("git", ["add", "-A"], { cwd: root });
      execFileSync("git", ["commit", "-m", message], { cwd: root });
      return git(root, ["rev-parse", "refs/heads/main"]).trim();
    },
  };
}

// Simulate a second actor pushing to the origin (the divergence source): clone,
// commit, push — exactly what the base44-builder bot did against our local repo.
function remoteCommit(fixture: Fixture): string {
  const clone = path.join(fixture.base, `clone-${Date.now()}-${Math.random()}`);
  execFileSync("git", ["clone", fixture.origin, clone]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: clone });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: clone });
  writeFileSync(path.join(clone, "remote-file.txt"), "remote change\n");
  execFileSync("git", ["add", "-A"], { cwd: clone });
  execFileSync("git", ["commit", "-m", "remote commit"], { cwd: clone });
  execFileSync("git", ["push", "origin", "refs/heads/main:refs/heads/main"], { cwd: clone });
  rmSync(clone, { recursive: true, force: true });
  return fixture.originHead();
}

// LIVE branch-head stub: the github.read get_branch_head primitive reads the
// CURRENT origin state (getter), so the postcheck observes the post-push head.
function stubBranchHead(head: () => string) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("api.github.com")) return original(input, init);
    calls.push(url);
    if (url.includes("/branches/main")) {
      return new Response(JSON.stringify({ commit: { sha: head(), commit: { committer: { date: "2026-09-17T23:57:07Z" } } } }), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": "9999999999" } });
    }
    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

async function withEnv(overrides: Record<string, string | undefined>, work: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) { saved.set(key, process.env[key]); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { await work(); } finally { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

async function startServer(fixture: Fixture, scopes: string[]) {
  const token = "push-integration-token";
  const tokenRegistry = [{ tokenHash: sha256(token), subject: "push-tester", scopes: [...scopes], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: fixture.root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, endpoint: `http://127.0.0.1:${address.port}/mcp`, token };
}

async function mcp(endpoint: string, token: string, id: number, method: string, params: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  assert.equal(response.status, 200);
  const body = await response.text();
  const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  assert.ok(data);
  return JSON.parse(data.slice(6));
}

function payload(call: { result?: { content?: Array<{ type: string; text?: string }> } }): Record<string, unknown> {
  const text = call.result?.content?.find((part) => part.type === "text")?.text ?? "";
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

test("git.push refuses callers without the engineering:git:push scope", async () => {
  const fixture = makeFixture();
  const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git"]);
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: {} });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
    assert.equal(fixture.originHead(), git(fixture.origin, ["rev-parse", "refs/heads/main"]).trim());
  } finally { server.close(); }
});

test("PLAN is read-only and reports a fast-forward ahead state", async () => {
  const fixture = makeFixture();
  const second = fixture.commit("second commit ahead");
  const stub = stubBranchHead(() => fixture.originHead());
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const before = fixture.originHead();
        const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: {} });
        const report = payload(call);
        assert.equal(report.status, "PLAN");
        assert.equal(report.mutationPerformed, false);
        assert.equal(report.relation, "fast-forward");
        assert.equal(report.aheadCount, 1);
        assert.equal(report.branch, "main");
        assert.equal(report.hooks, "enabled");
        assert.equal(report.refspec, "refs/heads/main:refs/heads/main");
        assert.equal(report.localHead, second);
        assert.deepEqual(report.blockers, []);
        assert.ok((report.pendingCommits as string[]).some((line) => line.includes("second commit ahead")));
        assert.equal((report.credential as { state: string }).state, "mounted");
        assert.equal(fixture.originHead(), before, "PLAN must not touch the origin");
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("PLAN classifies a diverged remote as blocked", async () => {
  const fixture = makeFixture();
  const remoteHead = remoteCommit(fixture);
  const stub = stubBranchHead(() => remoteHead);
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: {} });
        const report = payload(call);
        assert.equal(report.status, "PLAN");
        assert.equal(report.relation, "diverged");
        assert.deepEqual(report.blockers, ["PUSH_STATE_DIVERGED"]);
        assert.equal((report.remoteHead as { sha: string }).sha, remoteHead);
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("execute without approval or acknowledge is refused before any mutation", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const stub = stubBranchHead(() => fixture.originHead());
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const before = fixture.originHead();
        const bare = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: { execute: true } });
        assert.ok(JSON.stringify(bare.result).includes("PUSH_APPROVAL_REQUIRED"), JSON.stringify(bare.result).slice(0, 300));
        const unacked = await mcp(endpoint, token, 4, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true } } });
        assert.ok(JSON.stringify(unacked.result).includes("PUSH_APPROVAL_REQUIRED"), JSON.stringify(unacked.result).slice(0, 300));
        assert.equal(fixture.originHead(), before, "refused executes must not mutate the origin");
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("execute blocks a diverged remote with the origin untouched", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const remoteHead = remoteCommit(fixture);
  const stub = stubBranchHead(() => fixture.originHead());
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true } });
        const text = JSON.stringify(call.result);
        assert.ok(text.includes("PUSH_STATE_DIVERGED"), text.slice(0, 300));
        assert.equal(fixture.originHead(), remoteHead, "blocked push must leave the origin untouched");
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("execute blocks a known non-fast-forward with the origin untouched", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const remoteHead = remoteCommit(fixture);
  execFileSync("git", ["fetch", "origin", "main"], { cwd: fixture.root });
  const stub = stubBranchHead(() => remoteHead);
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true } });
        const text = JSON.stringify(call.result);
        assert.ok(text.includes("PUSH_NON_FAST_FORWARD_BLOCKED"), text.slice(0, 300));
        assert.equal(fixture.originHead(), remoteHead, "blocked push must leave the origin untouched");
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("execute pushes exactly the refspec, lands the head, and audits it", async () => {
  const fixture = makeFixture();
  const pushed = fixture.commit("second commit ahead");
  const stub = stubBranchHead(() => fixture.originHead());
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true, expectedHead: pushed } });
        const report = payload(call);
        assert.equal(report.status, "PUSHED");
        assert.equal(report.mutationPerformed, true);
        assert.equal(report.pushedSha, pushed);
        assert.equal((report.remoteHeadAfter as { sha: string }).sha, pushed);
        assert.equal(fixture.originHead(), pushed, "the origin head must equal the pushed sha");
        const auditLines = readFileSync(fixture.auditFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
        const last = auditLines[auditLines.length - 1];
        assert.equal(last.result, "pushed");
        assert.equal(last.pushedSha, pushed);
        assert.equal(last.subject, "push-tester");
        assert.equal(last.branch, "main");
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("after the push lands, execute and PLAN report nothing-to-push", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const stub = stubBranchHead(() => fixture.originHead());
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true } });
        const plan = await mcp(endpoint, token, 4, "tools/call", { name: "engineering.git.push", arguments: {} });
        const report = payload(plan);
        assert.equal(report.relation, "up-to-date");
        assert.deepEqual(report.blockers, ["PUSH_NOTHING_TO_PUSH"]);
        const again = await mcp(endpoint, token, 5, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true } });
        assert.ok(JSON.stringify(again.result).includes("PUSH_NOTHING_TO_PUSH"), JSON.stringify(again.result).slice(0, 300));
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("a stale expectedHead is refused with PUSH_HEAD_MISMATCH", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const stub = stubBranchHead(() => fixture.originHead());
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: fixture.credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const stale = "a".repeat(40);
        const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true, expectedHead: stale } });
        assert.ok(JSON.stringify(call.result).includes("PUSH_HEAD_MISMATCH"), JSON.stringify(call.result).slice(0, 300));
        assert.equal(fixture.originHead(), git(fixture.origin, ["rev-parse", "refs/heads/main"]).trim());
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("credential resolution is honest: missing file blocks, directory detail explains the auto-created-dir failure", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const stub = stubBranchHead(() => fixture.originHead());
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: "/nonexistent/git-credentials", GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const plan = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: {} });
        const report = payload(plan);
        assert.equal((report.credential as { state: string }).state, "missing");
        assert.ok((report.blockers as string[]).includes("PUSH_CREDENTIAL_MISSING"));
        const execute = await mcp(endpoint, token, 4, "tools/call", { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true } });
        assert.ok(JSON.stringify(execute.result).includes("PUSH_CREDENTIAL_MISSING"), JSON.stringify(execute.result).slice(0, 300));
        assert.equal(fixture.originHead(), fixture.originHead());
      } finally { server.close(); }
    });
    const dir = path.join(fixture.base, "credentials-dir");
    mkdirSync(dir, { recursive: true });
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: dir, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
      try {
        await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
        await mcp(endpoint, token, 2, "notifications/initialized", {});
        const plan = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: {} });
        const report = payload(plan);
        assert.equal((report.credential as { state: string }).state, "missing");
        assert.ok(String((report.credential as { detail?: string }).detail ?? "").includes("directory"), JSON.stringify(report.credential));
      } finally { server.close(); }
    });
  } finally { stub.restore(); }
});

test("the push argv resets credential.helper, points at the mounted store, and pushes exactly the refspec", async () => {
  const fixture = makeFixture();
  const pushed = fixture.commit("second commit ahead");
  const parent = fixture.originHead();
  const calls: string[][] = [];
  let remoteReads = 0;
  const report = await runGitPush({ execute: true, approval: { approved: true }, acknowledgePush: true, expectedHead: pushed }, {
    repoRoot: fixture.root,
    executeGit: async (args) => {
      calls.push(args);
      if (args[0] === "rev-parse") return { stdout: `${fixture.head()}\n`, stderr: "", exitCode: 0 };
      if (args[0] === "rev-list") return { stdout: "1\n", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    resolveRemoteHead: async () => { remoteReads += 1; return { sha: remoteReads <= 1 ? parent : pushed, commitDate: null }; },
    credentialFile: fixture.credentials,
    auditFile: fixture.auditFile,
    subject: "argv-unit",
  });
  assert.equal(report.status, "PUSHED");
  const push = calls.filter((args) => args[0] === "-c").at(-1)!;
  assert.deepEqual(push.slice(0, 6), ["-c", "credential.helper=", "-c", `credential.helper=store --file=${fixture.credentials}`, "push", "origin"]);
  assert.equal(push[6], "refs/heads/main:refs/heads/main");
  assert.ok(!calls.flat().includes("--force"), "no force push, ever");
  assert.ok(!calls.flat().includes("--no-verify"), "hooks always run");
  assert.ok(remoteReads >= 2, "precheck and postcheck each read the LIVE head");
});

const FAILURE_TABLE: Array<{ name: string; stderr: string; exitCode: number; code: string }> = [
  { name: "auth rejected", stderr: "fatal: Authentication failed for 'https://github.com/'", exitCode: 128, code: "PUSH_AUTH_REJECTED" },
  { name: "forbidden 403", stderr: "fatal: unable to access 'https://github.com/x/x/': The requested URL returned error: 403", exitCode: 128, code: "PUSH_FORBIDDEN" },
  { name: "remote rejected non-fast-forward", stderr: "! [remote rejected] main -> main (non-fast-forward)\nerror: failed to push some refs", exitCode: 1, code: "PUSH_NON_FAST_FORWARD_BLOCKED" },
  { name: "remote missing", stderr: "fatal: 'origin' does not appear to be a git repository", exitCode: 128, code: "PUSH_REMOTE_MISSING" },
  { name: "generic execution failure", stderr: "error: RPC failed; curl 56 OpenSSL SSL_read", exitCode: 1, code: "PUSH_EXECUTION_FAILED" },
];

for (const scenario of FAILURE_TABLE) {
  test(`execute maps "${scenario.name}" to ${scenario.code}`, async () => {
    const fixture = makeFixture();
    fixture.commit("second commit ahead");
    const parent = fixture.originHead();
    const localHead = fixture.head();
    const executeGit = async (args: string[]) => {
      if (args[0] === "rev-parse") return { stdout: `${localHead}\n`, stderr: "", exitCode: 0 };
      if (args[0] === "cat-file" || args[0] === "merge-base" || args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
      if (args[0] === "rev-list") return { stdout: "1\n", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: scenario.stderr, exitCode: scenario.exitCode };
    };
    await assert.rejects(
      () => runGitPush({ execute: true, approval: { approved: true }, acknowledgePush: true }, {
        repoRoot: fixture.root, executeGit, resolveRemoteHead: async () => ({ sha: parent, commitDate: null }),
        credentialFile: fixture.credentials, auditFile: path.join(fixture.base, "audit-failure.jsonl"),
      }),
      hasCode(scenario.code),
    );
    assert.equal(fixture.originHead(), parent);
  });
}

test("runner timeout and precheck failures surface as typed errors", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const parent = fixture.originHead();
  const localHead = fixture.head();
  await assert.rejects(
    () => runGitPush({ execute: true, approval: { approved: true }, acknowledgePush: true }, {
      repoRoot: fixture.root,
      executeGit: async (args) => { if (args[0] === "rev-parse") return { stdout: `${localHead}\n`, stderr: "", exitCode: 0 }; throw new GitPushError("PUSH_TIMEOUT", "git push exceeded 60000ms"); },
      resolveRemoteHead: async () => ({ sha: parent, commitDate: null }),
      credentialFile: fixture.credentials,
    }),
    hasCode("PUSH_TIMEOUT"),
  );
  await assert.rejects(
    () => runGitPush({}, {
      repoRoot: fixture.root,
      executeGit: async () => ({ stdout: `${localHead}\n`, stderr: "", exitCode: 0 }),
      resolveRemoteHead: async () => { throw new Error("upstream 500"); },
      credentialFile: fixture.credentials,
    }),
    hasCode("PUSH_PRECHECK_UNAVAILABLE"),
  );
});

test("postcheck refuses to claim success when the remote head does not move", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const parent = fixture.originHead();
  const localHead = fixture.head();
  await assert.rejects(
    () => runGitPush({ execute: true, approval: { approved: true }, acknowledgePush: true }, {
      repoRoot: fixture.root,
      executeGit: async (args) => {
        if (args[0] === "rev-list") return { stdout: "1\n", stderr: "", exitCode: 0 };
        if (args[0] === "rev-parse") return { stdout: `${localHead}\n`, stderr: "", exitCode: 0 };
        if (args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      resolveRemoteHead: async () => ({ sha: parent, commitDate: null }),
      credentialFile: fixture.credentials,
      auditFile: path.join(fixture.base, "audit-postcheck.jsonl"),
    }),
    hasCode("PUSH_POSTCHECK_FAILED"),
  );
});

test("concurrent executes are refused with PUSH_IN_FLIGHT, not queued", async () => {
  const fixture = makeFixture();
  fixture.commit("second commit ahead");
  const parent = fixture.originHead();
  const localHead = fixture.head();
  let pushedToOrigin = false;
  const slowGit = async (args: string[]) => {
    if (args[0] === "rev-parse") return { stdout: `${localHead}\n`, stderr: "", exitCode: 0 };
    if (args[0] === "rev-list") return { stdout: "1\n", stderr: "", exitCode: 0 };
    if (args[0] === "status") return { stdout: "", stderr: "", exitCode: 0 };
    if (args[0] === "-c") { await new Promise((resolve) => setTimeout(resolve, 80)); pushedToOrigin = true; return { stdout: "", stderr: "", exitCode: 0 }; }
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const deps: GitPushDeps = {
    repoRoot: fixture.root, executeGit: slowGit, resolveRemoteHead: async () => ({ sha: pushedToOrigin ? localHead : parent, commitDate: null }),
    credentialFile: fixture.credentials, auditFile: path.join(fixture.base, "audit-inflight.jsonl"),
  };
  const first = runGitPush({ execute: true, approval: { approved: true }, acknowledgePush: true }, deps);
  const second = await runGitPush({ execute: true, approval: { approved: true }, acknowledgePush: true }, deps).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(second instanceof GitPushError && second.code === "PUSH_IN_FLIGHT", `expected PUSH_IN_FLIGHT, got ${String(second)}`);
  const report = await first;
  assert.equal(report.status, "PUSHED");
});

test("input hygiene: remote/url/credential-like keys and a malformed acknowledge are structurally forbidden", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => runGitPush({ remote: "https://evil.example/repo" } as unknown as { execute?: boolean }, { repoRoot: fixture.root }),
    hasCode("PUSH_INPUT_FORBIDDEN"),
  );
  await assert.rejects(
    () => runGitPush({ acknowledgePush: false }, { repoRoot: fixture.root }),
    hasCode("PUSH_INPUT_FORBIDDEN"),
  );
  await assert.rejects(
    () => runGitPush({ expectedHead: "zzz" }, { repoRoot: fixture.root }),
    hasCode("PUSH_INPUT_FORBIDDEN"),
  );
});

test("the MCP schema itself rejects caller-supplied remote input", async () => {
  const fixture = makeFixture();
  const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:push"]);
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.push", arguments: { remote: "https://evil.example/repo" } as unknown as Record<string, unknown> });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("remote"), `expected a strict-schema refusal, got ${text.slice(0, 300)}`);
  } finally { server.close(); }
});
