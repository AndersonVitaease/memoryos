// GIT-FETCH-01: engineering.git.fetch governed read-only fetch — integration through
// the MCP HTTP harness (real git, real bare origin over file://) plus direct runGitFetch
// calls with injected deps for the error-mapping edges. The tool accepts NO input;
// the ONLY mutation boundary is remote-tracking refs and the working tree / HEAD /
// local refs are snapshot-proven unchanged (FETCH_LOCAL_STATE_MUTATED otherwise).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createEngineeringHttpServer } from "../src/server.js";
import { GitFetchError, runGitFetch, type GitFetchDeps } from "../src/gitFetch.js";

const sha256 = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const hasCode = (code: string) => (error: unknown) => error instanceof GitFetchError && error.code === code;

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
  branch: (name: string) => void;
};

function makeFixture(): Fixture {
  const base = mkdtempSync(path.join(tmpdir(), "eng-mcp-gitfetch-"));
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
  const auditFile = path.join(base, "audit", "git-fetch.jsonl");
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
    branch: (name: string) => {
      execFileSync("git", ["branch", name], { cwd: root });
      execFileSync("git", ["push", "origin", `refs/heads/${name}:refs/heads/${name}`], { cwd: root });
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

async function withEnv(overrides: Record<string, string | undefined>, work: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) { saved.set(key, process.env[key]); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { await work(); } finally { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

async function startServer(fixture: Fixture, scopes: string[]) {
  const token = "fetch-integration-token";
  const tokenRegistry = [{ tokenHash: sha256(token), subject: "fetch-tester", scopes: [...scopes], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
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

test("git.fetch refuses callers without the engineering:git:fetch scope", async () => {
  const fixture = makeFixture();
  const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git"]);
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.fetch", arguments: {} });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally { server.close(); }
});

test("E2E: fetch refreshes remote-tracking refs and reports main-first ahead/behind with zero local mutation", async () => {
  const fixture = makeFixture();
  const second = fixture.commit("second commit ahead");
  const third = fixture.commit("third commit ahead");
  fixture.branch("feature");
  const remoteHead = remoteCommit(fixture);
  // The work repo is a CLONE of origin.git, so origin/main already exists as a
  // remote-tracking ref (pointing at the remote state at clone time); the fetch
  // must UPDATE it, not add it.
  const initialRemoteHead = git(fixture.root, ["rev-parse", "refs/remotes/origin/main"]).trim();
  await withEnv({ GIT_CREDENTIALS_FILE: fixture.credentials, GIT_FETCH_AUDIT_FILE: fixture.auditFile }, async () => {
    const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:fetch"]);
    try {
      await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
      await mcp(endpoint, token, 2, "notifications/initialized", {});
      const statusBefore = git(fixture.root, ["status", "--porcelain"]);
      const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.fetch", arguments: {} });
      const raw = JSON.stringify(call.result);
      const report = payload(call);
      assert.equal(report.status, "FETCHED");
      assert.equal(report.mutationPerformed, false);
      assert.equal(report.remote, "origin");
      assert.ok(String(report.boundary).includes("remote-tracking"));
      const proof = report.zeroMutationProof as Record<string, boolean>;
      assert.equal(proof.worktreeStatusIdentical, true);
      assert.equal(proof.headUnchanged, true);
      assert.equal(proof.localBranchAndTagRefsUnchanged, true);
      // Zero working-tree mutation, proven BOTH by the snapshot diff inside the tool
      // and by comparing the real git status before/after the call.
      assert.equal(git(fixture.root, ["status", "--porcelain"]), statusBefore);
      assert.equal(report.credential && (report.credential as Record<string, unknown>).state, "mounted");
      const fetch = report.fetch as Record<string, unknown>;
      assert.equal(fetch.exitCode, 0);
      // The work repo is a clone: origin/main already exists as a remote-tracking ref
      // (UPDATED by the fetch), and origin/feature was pushed from the work repo
      // itself, so its tracking ref already matches and produces NO ref change.
      const refs = fetch.remoteTrackingRefs as Record<string, unknown>;
      assert.equal(refs.updated, 1);
      assert.equal(refs.added, 0);
      assert.equal(refs.removed, 0);
      const changes = refs.changes as Array<Record<string, unknown>>;
      const mainChange = changes.find((change) => change.ref === "refs/remotes/origin/main");
      assert.ok(mainChange, `expected an origin/main ref change, got ${JSON.stringify(changes)}`);
      assert.equal(mainChange.before, initialRemoteHead);
      assert.equal(mainChange.after, remoteHead);
      // Branch comparison: main ALWAYS first, feature second; ahead/behind quantified.
      const comparison = report.comparison as Array<Record<string, unknown>>;
      assert.deepEqual(comparison.map((entry) => entry.branch), ["main", "feature"]);
      const main = comparison[0];
      assert.equal(main.ahead, 2);
      assert.equal(main.behind, 1);
      assert.equal(main.localHead, third);
      assert.equal(main.remoteHead, remoteHead);
      assert.equal(typeof main.remoteCommitDate, "string");
      const aheadCommits = main.aheadCommits as Array<Record<string, string>>;
      assert.deepEqual(aheadCommits.map((commit) => commit.sha), [third.slice(0, 7), second.slice(0, 7)]);
      assert.deepEqual(aheadCommits.map((commit) => commit.subject), ["third commit ahead", "second commit ahead"]);
      const behindCommits = main.behindCommits as Array<Record<string, string>>;
      assert.deepEqual(behindCommits.map((commit) => commit.subject), ["remote commit"]);
      const feature = comparison[1];
      assert.equal(feature.ahead, 0);
      assert.equal(feature.behind, 0);
      assert.deepEqual(feature.aheadCommits, []);
      assert.deepEqual(feature.behindCommits, []);
      // The origin URL (which may embed credentials in production) is NEVER returned.
      assert.ok(!raw.includes(fixture.origin), "origin URL must never appear in the report");
      assert.ok(!raw.includes("fixture-credential"), "credential content must never appear in the report");
      assert.equal(report.audit, "written");
      const auditLine = readFileSync(fixture.auditFile, "utf8").trim().split("\n").pop() ?? "";
      const audit = JSON.parse(auditLine) as Record<string, unknown>;
      assert.equal(audit.result, "fetched");
      assert.equal(audit.ahead, 2);
      assert.equal(audit.behind, 1);
      assert.equal(audit.remoteTrackingChanged, true);
    } finally { server.close(); }
  });
});

test("a second fetch after no upstream movement reports up-to-date with zero ref changes", async () => {
  const fixture = makeFixture();
  await withEnv({ GIT_CREDENTIALS_FILE: fixture.credentials, GIT_FETCH_AUDIT_FILE: fixture.auditFile }, async () => {
    const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:fetch"]);
    try {
      await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
      await mcp(endpoint, token, 2, "notifications/initialized", {});
      const first = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.fetch", arguments: {} });
      assert.equal(payload(first).status, "FETCHED");
      const second = await mcp(endpoint, token, 4, "tools/call", { name: "engineering.git.fetch", arguments: {} });
      const report = payload(second);
      const refs = (report.fetch as Record<string, unknown>).remoteTrackingRefs as Record<string, unknown>;
      assert.equal(refs.updated, 0);
      assert.equal(refs.added, 0);
      assert.equal(refs.removed, 0);
      const main = (report.comparison as Array<Record<string, unknown>>)[0];
      assert.equal(main.branch, "main");
      assert.equal(main.ahead, 0);
      assert.equal(main.behind, 0);
      const audit = JSON.parse(readFileSync(fixture.auditFile, "utf8").trim().split("\n").pop() ?? "{}") as Record<string, unknown>;
      assert.equal(audit.remoteTrackingChanged, false);
    } finally { server.close(); }
  });
});

test("input hygiene: any caller-supplied key is structurally forbidden", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => runGitFetch({ remote: "https://evil.example/repo" } as unknown as Record<string, never>, { repoRoot: fixture.root }),
    hasCode("FETCH_INPUT_FORBIDDEN"),
  );
  await assert.rejects(
    () => runGitFetch({ branch: "main" } as unknown as Record<string, never>, { repoRoot: fixture.root }),
    hasCode("FETCH_INPUT_FORBIDDEN"),
  );
});

test("the MCP schema itself rejects caller-supplied remote input", async () => {
  const fixture = makeFixture();
  const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git:fetch"]);
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.fetch", arguments: { remote: "https://evil.example/repo" } as unknown as Record<string, unknown> });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("remote"), `expected a strict-schema refusal, got ${text.slice(0, 300)}`);
  } finally { server.close(); }
});

test("credential precheck fails closed before any git call", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => runGitFetch({}, { repoRoot: fixture.root, credentialFile: path.join(fixture.base, "does-not-exist") }),
    hasCode("FETCH_CREDENTIAL_MISSING"),
  );
});

function fakeGit(handlers: Record<string, (args: string[]) => { stdout: string; stderr: string; exitCode: number }>): NonNullable<GitFetchDeps["executeGit"]> {
  return async (args) => {
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (args.join(" ").includes(pattern)) return handler(args);
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
}

test("error mapping: remote missing, auth rejected, forbidden, network and generic failures", async () => {
  const fixture = makeFixture();
  // The real fetch argv is prefixed by the two -c credential.helper flags, so the
  // failing call is identified by args[0]: "remote" (the get-url precheck) or "-c"
  // (the fetch itself) — args[0] is NEVER "fetch".
  const stageFailure = (stage: "remote" | "fetch", stderr: string, exitCode: number): GitFetchDeps => ({
    repoRoot: fixture.root,
    credentialFile: fixture.credentials,
    auditFile: path.join(fixture.base, "audit-edges.jsonl"),
    executeGit: async (args) => {
      if (stage === "remote" ? args[0] === "remote" : args[0] === "-c") return { stdout: "", stderr, exitCode };
      if (args[0] === "remote") return { stdout: "https://github.com/example/repo.git\n", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  });
  await assert.rejects(() => runGitFetch({}, stageFailure("remote", "error: No such remote 'origin'", 1)), hasCode("FETCH_REMOTE_MISSING"));
  await assert.rejects(() => runGitFetch({}, stageFailure("fetch", "fatal: could not read Username for 'https://example.invalid': terminal prompts disabled", 128)), hasCode("FETCH_AUTH_REJECTED"));
  await assert.rejects(() => runGitFetch({}, stageFailure("fetch", "fatal: unable to access 'https://example.invalid/x': The requested URL returned error: 403", 128)), hasCode("FETCH_FORBIDDEN"));
  await assert.rejects(() => runGitFetch({}, stageFailure("fetch", "fatal: unable to access 'https://example.invalid/x': Could not resolve host: example.invalid", 128)), hasCode("FETCH_NETWORK_UNREACHABLE"));
  await assert.rejects(() => runGitFetch({}, stageFailure("fetch", "fatal: something unexpected happened", 128)), hasCode("FETCH_EXECUTION_FAILED"));
});

test("fail-closed: any local state change across the fetch throws FETCH_LOCAL_STATE_MUTATED", async () => {
  const fixture = makeFixture();
  let statusCalls = 0;
  await assert.rejects(
    () => runGitFetch({}, {
      repoRoot: fixture.root,
      credentialFile: fixture.credentials,
      auditFile: path.join(fixture.base, "audit-mutated.jsonl"),
      executeGit: async (args) => {
        if (args.join(" ").includes("remote get-url")) return { stdout: "https://github.com/example/repo.git\n", stderr: "", exitCode: 0 };
        if (args[0] === "status") { statusCalls += 1; return { stdout: statusCalls === 1 ? "" : " M mutated.txt\n", stderr: "", exitCode: 0 }; }
        if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n", stderr: "", exitCode: 0 };
        if (args[0] === "for-each-ref") return { stdout: "refs/heads/main bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    }),
    hasCode("FETCH_LOCAL_STATE_MUTATED"),
  );
  const audit = JSON.parse(readFileSync(path.join(fixture.base, "audit-mutated.jsonl"), "utf8").trim().split("\n").pop() ?? "{}") as Record<string, unknown>;
  assert.equal(audit.result, "failed");
  assert.equal(audit.code, "FETCH_LOCAL_STATE_MUTATED");
});

test("fail-closed: a fetched origin without a main remote-tracking ref is refused", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => runGitFetch({}, {
      repoRoot: fixture.root,
      credentialFile: fixture.credentials,
      auditFile: path.join(fixture.base, "audit-nobranch.jsonl"),
      executeGit: fakeGit({
        "remote get-url": () => ({ stdout: "https://github.com/example/repo.git\n", stderr: "", exitCode: 0 }),
        status: () => ({ stdout: "", stderr: "", exitCode: 0 }),
        "rev-parse HEAD": () => ({ stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n", stderr: "", exitCode: 0 }),
        "refs/heads": () => ({ stdout: "refs/heads/main bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n", stderr: "", exitCode: 0 }),
        "refs/remotes/origin": () => ({ stdout: "refs/remotes/origin/other cccccccccccccccccccccccccccccccccccccccc\n", stderr: "", exitCode: 0 }),
        fetch: () => ({ stdout: "", stderr: "", exitCode: 0 }),
      }),
    }),
    hasCode("FETCH_BRANCH_NOT_FOUND"),
  );
});
