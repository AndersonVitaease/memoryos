import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGithubRead, __resetGithubReadStateForTests } from "../src/githubRead.ts";

// FASE 2 unit suite — deterministic, zero real network: globalThis.fetch is
// replaced by a fixture router and restored in each test's finally. Every token,
// sha and payload below is a synthetic fixture.

const TOKEN = "ghp_unit-fixture-token-000000000000";

type Fixture = { status: number; body?: unknown; headers?: Record<string, string> };

function rateHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4942", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600), ...extra };
}

function stubFetch(respond: (url: string) => Fixture): { calls: Array<{ url: string; authorization?: string }>; restore: () => void } {
  const calls: Array<{ url: string; authorization?: string }> = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { headers?: Record<string, string> }) => {
    const target = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: target, authorization: headers.authorization ?? headers.Authorization });
    const fixture = respond(target);
    return new Response(JSON.stringify(fixture.body ?? {}), { status: fixture.status, headers: fixture.headers ?? rateHeaders() });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

function withEnv(overrides: Record<string, string | undefined>): () => void {
  const keys = ["GITHUB_TOKEN", "GITHUB_TOKEN_FILE", "ENG_MCP_GITHUB_REPO", "ENG_MCP_GITHUB_RATE_FLOOR", "ENG_MCP_GITHUB_TIMEOUT_MS"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) process.env[key] = value;
  return () => { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  try { await promise; assert.fail(`expected ${code}`); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.ok(message.includes(code), `expected ${code}, got: ${message.slice(0, 250)}`);
  }
}

const REPO = { full_name: "AndersonVitaease/memoryos", private: false, visibility: "public", default_branch: "main", pushed_at: "2026-09-17T15:47:46Z", html_url: "https://github.com/AndersonVitaease/memoryos" };

test("get_repo happy path: exact URL, Bearer auth, mapped fields, quota block", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch((url) => url === "https://api.github.com/repos/AndersonVitaease/memoryos" ? { status: 200, body: REPO } : { status: 404, body: { message: "nope" } });
  try {
    const result = await runGithubRead({ operation: "get_repo" });
    assert.equal(result.fullName, "AndersonVitaease/memoryos");
    assert.equal(result.defaultBranch, "main");
    assert.equal(result.private, false);
    assert.equal(result.visibility, "public");
    assert.equal(result.operation, "get_repo");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.github.com/repos/AndersonVitaease/memoryos");
    assert.equal(calls[0].authorization, `Bearer ${TOKEN}`);
    const rateLimit = result.rateLimit as { limit: number; remaining: number };
    assert.equal(rateLimit.limit, 5000);
    assert.equal(rateLimit.remaining, 4942);
  } finally { restore(); restoreEnv(); }
});

test("identical get_repo within TTL is served from cache (1 upstream call)", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: REPO }));
  try {
    await runGithubRead({ operation: "get_repo" });
    const second = await runGithubRead({ operation: "get_repo" });
    assert.equal(calls.length, 1);
    assert.equal(second.cached, true);
  } finally { restore(); restoreEnv(); }
});

test("compare: default base resolves default_branch, then live ahead/behind", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch((url) => {
    if (url === "https://api.github.com/repos/AndersonVitaease/memoryos") return { status: 200, body: REPO };
    if (url === "https://api.github.com/repos/AndersonVitaease/memoryos/compare/main...feature") return { status: 200, body: { ahead_by: 3, behind_by: 1, status: "diverged", commits: [1, 2, 3].map((n) => ({ sha: `sha${n}`, commit: { message: `feat ${n}`, author: { date: "2026-09-17T00:00:00Z" } } })) } };
    return { status: 404, body: { message: "nope" } };
  });
  try {
    const result = await runGithubRead({ operation: "compare", head: "feature" });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "https://api.github.com/repos/AndersonVitaease/memoryos/compare/main...feature");
    assert.equal(result.aheadBy, 3);
    assert.equal(result.behindBy, 1);
    assert.equal(result.status, "diverged");
    assert.equal((result.commits as unknown[]).length, 3);
    assert.equal(result.bothRefsAreRemote, true);
  } finally { restore(); restoreEnv(); }
});

test("compare: explicit base hits compare/<base>...<head> directly", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: { ahead_by: 0, behind_by: 0, status: "identical", commits: [] } }));
  try {
    const result = await runGithubRead({ operation: "compare", base: "abc123", head: "main" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.github.com/repos/AndersonVitaease/memoryos/compare/abc123...main");
    assert.equal(result.cached, undefined);
  } finally { restore(); restoreEnv(); }
});

test("get_commit: default omits patch; includePatch bounds patch at 32KB with honest flag", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const bigPatch = "x".repeat(40_000);
  const commitFixture = { sha: "abc123", commit: { message: "title line\nbody", author: { date: "2026-09-17T00:00:00Z" } }, author: { login: "someone" }, stats: { additions: 10, deletions: 2, total: 12 }, files: [{ filename: "a.ts", status: "modified", additions: 6, deletions: 1, changes: 7, patch: bigPatch }, { filename: "b.ts", status: "added", additions: 4, deletions: 1, changes: 5, patch: "small" }] };
  const { calls, restore } = stubFetch(() => ({ status: 200, body: commitFixture }));
  try {
    const plain = await runGithubRead({ operation: "get_commit", ref: "abc123" });
    assert.equal(calls[0].url, "https://api.github.com/repos/AndersonVitaease/memoryos/commits/abc123");
    assert.equal(plain.message, "title line");
    assert.equal(plain.author, "someone");
    const files0 = plain.files as Array<Record<string, unknown>>;
    assert.equal(files0[0].patch, undefined);
    assert.equal(plain.includePatch, false);
    __resetGithubReadStateForTests();
    const withPatch = await runGithubRead({ operation: "get_commit", ref: "abc123", includePatch: true });
    const files1 = withPatch.files as Array<Record<string, unknown>>;
    assert.equal((files1[0].patch as string).length, 32_768);
    assert.equal(files1[0].patchTruncated, true);
    assert.equal(withPatch.anyPatchTruncated, true);
    assert.equal(files1[1].patch, "small");
  } finally { restore(); restoreEnv(); }
});

test("list_commits: since mode builds query params and maps commits", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: [1, 2, 3, 4, 5].map((n) => ({ sha: `s${n}`, commit: { message: `c${n}`, author: { date: "2026-09-17T00:00:00Z" } } })) }));
  try {
    const result = await runGithubRead({ operation: "list_commits", since: "2026-09-01T00:00:00Z", maxCount: 5 });
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/repos/AndersonVitaease/memoryos/commits");
    assert.equal(url.searchParams.get("per_page"), "5");
    assert.equal(url.searchParams.get("since"), "2026-09-01T00:00:00.000Z");
    assert.equal((result.commits as unknown[]).length, 5);
    assert.equal(result.truncated, true);
  } finally { restore(); restoreEnv(); }
});

test("list_commits: sinceSha mode uses the compare range endpoint", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: { commits: [{ sha: "s2", commit: { message: "b", author: {} } }] } }));
  try {
    const result = await runGithubRead({ operation: "list_commits", sinceSha: "abc", ref: "main" });
    assert.equal(calls[0].url, "https://api.github.com/repos/AndersonVitaease/memoryos/compare/abc...main");
    assert.equal(result.mode, "range");
    assert.equal((result.commits as unknown[]).length, 1);
  } finally { restore(); restoreEnv(); }
});

test("get_branch_head: resolves branch sha and commit date", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: { commit: { sha: "deadbeef", commit: { committer: { date: "2026-09-17T00:00:00Z" } } } } }));
  try {
    const result = await runGithubRead({ operation: "get_branch_head", branch: "main" });
    assert.equal(calls[0].url, "https://api.github.com/repos/AndersonVitaease/memoryos/branches/main");
    assert.equal(result.sha, "deadbeef");
    assert.equal(result.commitDate, "2026-09-17T00:00:00Z");
  } finally { restore(); restoreEnv(); }
});

test("get_pr: pulls + reviews + check-runs + status fan-out", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch((url) => {
    if (url.endsWith("/pulls/7")) return { status: 200, body: { state: "open", draft: false, merged: false, mergeable: true, mergeable_state: "clean", title: "T", base: { ref: "main" }, head: { ref: "feat", sha: "headsha7" }, created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T01:00:00Z", html_url: "https://github.com/AndersonVitaease/memoryos/pull/7" } };
    if (url.endsWith("/pulls/7/reviews")) return { status: 200, body: [{ user: { login: "rev" }, state: "APPROVED", submitted_at: "2026-09-17T01:30:00Z", body: "lgtm" }] };
    if (url.endsWith("/commits/headsha7/check-runs")) return { status: 200, body: { check_runs: [{ name: "ci", status: "completed", conclusion: "success", html_url: "https://ci.example/run/1" }] } };
    if (url.endsWith("/commits/headsha7/status")) return { status: 200, body: { state: "success" } };
    return { status: 404, body: { message: "nope" } };
  });
  try {
    const result = await runGithubRead({ operation: "get_pr", number: 7, includeReviews: true, includeChecks: true });
    assert.equal(calls.length, 4);
    assert.equal(result.state, "open");
    assert.equal(result.mergeable, true);
    assert.equal(result.headSha, "headsha7");
    const reviews = result.reviews as Array<Record<string, unknown>>;
    assert.equal(reviews[0].state, "APPROVED");
    const checkRuns = result.checkRuns as Array<Record<string, unknown>>;
    assert.equal(checkRuns[0].conclusion, "success");
    assert.equal(result.commitStatus, "success");
  } finally { restore(); restoreEnv(); }
});

test("list_action_runs and list_refs: tags vs releases shapes", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch((url) => {
    if (url.includes("/actions/runs?")) return { status: 200, body: { total_count: 5, workflow_runs: [{ name: "ci", event: "push", status: "completed", conclusion: "failure", head_branch: "main", head_sha: "s1", created_at: "2026-09-17T00:00:00Z", html_url: "https://github.com/x/actions/runs/1" }, { name: "ci2", event: "push", status: "completed", conclusion: "success", head_branch: "main", head_sha: "s2", created_at: "2026-09-17T00:01:00Z", html_url: "u2" }] } };
    if (url.includes("/tags?")) return { status: 200, body: [{ name: "v1.0.0", commit: { sha: "tagsha" } }] };
    if (url.includes("/releases?")) return { status: 200, body: [{ name: "R1", tag_name: "v1.0.0", published_at: "2026-09-17T00:00:00Z", draft: false, prerelease: false }] };
    return { status: 404, body: { message: "nope" } };
  });
  try {
    const runs = await runGithubRead({ operation: "list_action_runs", branch: "main", maxCount: 2 });
    const runsUrl = new URL(calls[0].url);
    assert.equal(runsUrl.searchParams.get("branch"), "main");
    assert.equal(runsUrl.searchParams.get("per_page"), "2");
    assert.equal(runs.totalCount, 5);
    const runList = runs.runs as Array<Record<string, unknown>>;
    assert.equal(runList[0].conclusion, "failure");
    __resetGithubReadStateForTests();
    const tags = await runGithubRead({ operation: "list_refs", kind: "tags" });
    assert.equal(calls[1].url, "https://api.github.com/repos/AndersonVitaease/memoryos/tags?per_page=50");
    assert.equal((tags.items as Array<Record<string, unknown>>)[0].sha, "tagsha");
    __resetGithubReadStateForTests();
    const releases = await runGithubRead({ operation: "list_refs", kind: "releases", maxCount: 10 });
    assert.equal(calls[2].url, "https://api.github.com/repos/AndersonVitaease/memoryos/releases?per_page=10");
    const rel = (releases.items as Array<Record<string, unknown>>)[0];
    assert.equal(rel.tagName, "v1.0.0");
    assert.equal(rel.draft, false);
  } finally { restore(); restoreEnv(); }
});

test("get_file: decodes base64, maps size/sha/bytes; ref goes into the query", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const content = Buffer.from("hello world").toString("base64");
  const { calls, restore } = stubFetch(() => ({ status: 200, body: { type: "file", size: 11, sha: "f1", encoding: "base64", content } }));
  try {
    const result = await runGithubRead({ operation: "get_file", path: "src/a.ts", ref: "main" });
    assert.equal(calls[0].url, "https://api.github.com/repos/AndersonVitaease/memoryos/contents/src/a.ts?ref=main");
    assert.equal(result.content, "hello world");
    assert.equal(result.bytes, 11);
    assert.equal(result.size, 11);
    assert.equal(result.truncated, false);
    __resetGithubReadStateForTests();
    await runGithubRead({ operation: "get_file", path: "src/a.ts" });
    assert.equal(calls[1].url, "https://api.github.com/repos/AndersonVitaease/memoryos/contents/src/a.ts");
  } finally { restore(); restoreEnv(); }
});

test("get_file: backslash, traversal and sensitive-path denials happen BEFORE any fetch", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: {} }));
  try {
    await expectError(runGithubRead({ operation: "get_file", path: "src\\win.ts" }), "GITHUB_PATH_INVALID");
    await expectError(runGithubRead({ operation: "get_file", path: "../etc/passwd" }), "GITHUB_PATH_INVALID");
    await expectError(runGithubRead({ operation: "get_file", path: "a//b" }), "GITHUB_PATH_INVALID");
    await expectError(runGithubRead({ operation: "get_file", path: ".env" }), "PATH_DENIED");
    await expectError(runGithubRead({ operation: "get_file", path: "config/secrets.json" }), "PATH_DENIED");
    assert.equal(calls.length, 0);
  } finally { restore(); restoreEnv(); }
});

test("get_file: refuses oversize, refuses >1MB-omitted content, refuses binary", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { restore } = stubFetch(() => ({ status: 200, body: { type: "file", size: 100_000, content: "" } }));
  try {
    await expectError(runGithubRead({ operation: "get_file", path: "big.bin" }), "GITHUB_FILE_TOO_LARGE");
    __resetGithubReadStateForTests();
    await expectError(runGithubRead({ operation: "get_file", path: "blob.bin", maxBytes: 65_536 }), "GITHUB_FILE_TOO_LARGE");
  } finally { restore(); }
  __resetGithubReadStateForTests();
  const binary = Buffer.from([104, 105, 0]).toString("base64");
  const { restore: restore2 } = stubFetch(() => ({ status: 200, body: { type: "file", size: 3, encoding: "base64", content: binary } }));
  try {
    await expectError(runGithubRead({ operation: "get_file", path: "bin.bin" }), "GITHUB_FILE_BINARY");
  } finally { restore2(); }
  __resetGithubReadStateForTests();
  // PEM header assembled from parts: the patch-level sensitive-content gate
  // blocks the contiguous literal — which is exactly the runtime gate we assert.
  const pemFixture = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
  const { restore: restore3 } = stubFetch(() => ({ status: 200, body: { type: "file", size: 32, encoding: "base64", content: Buffer.from(pemFixture).toString("base64") } }));
  try {
    await expectError(runGithubRead({ operation: "get_file", path: "leak.txt" }), "SENSITIVE_CONTENT_BLOCKED");
  } finally { restore3(); restoreEnv(); }
});

test("status mapping: 401 AUTH_REJECTED, 403+rem0 RATE_EXCEEDED, 403+quota FORBIDDEN", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { restore } = stubFetch(() => ({ status: 401, body: { message: "Bad credentials" } }));
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_AUTH_REJECTED");
  } finally { restore(); }
  __resetGithubReadStateForTests();
  const { restore: restore2 } = stubFetch(() => ({ status: 403, body: { message: "limit" }, headers: rateHeaders({ "x-ratelimit-remaining": "0" }) }));
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_RATE_LIMIT_EXCEEDED");
  } finally { restore2(); }
  __resetGithubReadStateForTests();
  const { restore: restore3 } = stubFetch(() => ({ status: 403, body: { message: "resource not accessible" }, headers: rateHeaders() }));
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_FORBIDDEN");
  } finally { restore3(); restoreEnv(); }
});

test("status mapping: 404 NOT_FOUND with private-repo hint, 422 VALIDATION_FAILED", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { restore } = stubFetch(() => ({ status: 404, body: { message: "Not Found" } }));
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_NOT_FOUND");
  } finally { restore(); }
  __resetGithubReadStateForTests();
  const { restore: restore2 } = stubFetch(() => ({ status: 422, body: { message: "Validation Failed" } }));
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_VALIDATION_FAILED");
  } finally { restore2(); restoreEnv(); }
});

test("network failure surfaces as GITHUB_UNREACHABLE; slow upstream aborts as GITHUB_TIMEOUT", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_UNREACHABLE");
  } finally { globalThis.fetch = previous; restoreEnv(); }
  __resetGithubReadStateForTests();
  const restoreEnv2 = withEnv({ GITHUB_TOKEN: TOKEN, ENG_MCP_GITHUB_TIMEOUT_MS: "250" });
  globalThis.fetch = ((url: unknown, init?: { signal?: AbortSignal }) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted")));
  })) as typeof fetch;
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_TIMEOUT");
  } finally { globalThis.fetch = previous; restoreEnv2(); }
});

test("credential: missing token fails closed; GITHUB_TOKEN_FILE is read per call", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({});
  const { restore } = stubFetch(() => ({ status: 200, body: REPO }));
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_CREDENTIAL_MISSING");
  } finally { restore(); restoreEnv(); }
  __resetGithubReadStateForTests();
  const dir = await mkdtemp(path.join(tmpdir(), "github-read-test-"));
  const tokenFile = path.join(dir, "github-pat");
  await writeFile(tokenFile, ` ${TOKEN} \n`, "utf8");
  const restoreEnv2 = withEnv({ GITHUB_TOKEN_FILE: tokenFile });
  const { calls, restore: restore2 } = stubFetch(() => ({ status: 200, body: REPO }));
  try {
    const result = await runGithubRead({ operation: "get_repo" });
    assert.equal(result.fullName, REPO.full_name);
    assert.equal(calls[0].authorization, `Bearer ${TOKEN}`);
  } finally { restore2(); restoreEnv2(); await rm(dir, { recursive: true, force: true }); }
});

test("local rate floor: remaining below floor refuses BEFORE the upstream call", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: REPO, headers: rateHeaders({ "x-ratelimit-remaining": "40" }) }));
  try {
    await runGithubRead({ operation: "get_repo" });
    assert.equal(calls.length, 1);
    await expectError(runGithubRead({ operation: "get_commit", ref: "abc" }), "GITHUB_RATE_LIMIT_LOW");
    assert.equal(calls.length, 1);
  } finally { restore(); restoreEnv(); }
  __resetGithubReadStateForTests();
  const restoreEnv2 = withEnv({ GITHUB_TOKEN: TOKEN, ENG_MCP_GITHUB_RATE_FLOOR: "0" });
  const { calls: calls2, restore: restore2 } = stubFetch(() => ({ status: 200, body: REPO, headers: rateHeaders({ "x-ratelimit-remaining": "40" }) }));
  try {
    await runGithubRead({ operation: "get_commit", ref: "abc" });
    await runGithubRead({ operation: "get_commit", ref: "abc" });
    assert.equal(calls2.length, 1);
  } finally { restore2(); restoreEnv2(); }
});

test("token NEVER leaks: error detail redacted, payload clean", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { restore } = stubFetch(() => ({ status: 404, body: { message: `token ${TOKEN} leaked` } }));
  try {
    await expectError(runGithubRead({ operation: "get_repo" }), "GITHUB_NOT_FOUND");
  } finally { restore(); restoreEnv(); }
  __resetGithubReadStateForTests();
  const restoreEnv2 = withEnv({ GITHUB_TOKEN: TOKEN });
  const { restore: restore2 } = stubFetch(() => ({ status: 200, body: REPO }));
  try {
    const text = JSON.stringify(await runGithubRead({ operation: "get_repo" }));
    assert.ok(!text.includes(TOKEN), "token must never appear in output");
  } finally { restore2(); restoreEnv2(); }
});

test("allowlist: foreign/malformed repos refused; ENG_MCP_GITHUB_REPO re-points default", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: REPO }));
  try {
    await expectError(runGithubRead({ operation: "get_repo", repo: "evil/repo" }), "GITHUB_REPO_NOT_ALLOWLISTED");
    await expectError(runGithubRead({ operation: "get_repo", repo: "bad name" }), "GITHUB_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally { restore(); restoreEnv(); }
  __resetGithubReadStateForTests();
  const restoreEnv2 = withEnv({ GITHUB_TOKEN: TOKEN, ENG_MCP_GITHUB_REPO: "other/repo" });
  const { calls: calls2, restore: restore2 } = stubFetch(() => ({ status: 200, body: { ...REPO, full_name: "other/repo" } }));
  try {
    const result = await runGithubRead({ operation: "get_repo" });
    assert.equal(calls2[0].url, "https://api.github.com/repos/other/repo");
    assert.equal(result.fullName, "other/repo");
    await expectError(runGithubRead({ operation: "get_repo", repo: "AndersonVitaease/memoryos" }), "GITHUB_REPO_NOT_ALLOWLISTED");
  } finally { restore2(); restoreEnv2(); }
});

test("get_rate_limit: free meter — never cached, two calls two fetches", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: { resources: { core: { limit: 5000, used: 58, remaining: 4942, reset: 1800000000 } } } }));
  try {
    const first = await runGithubRead({ operation: "get_rate_limit" });
    const second = await runGithubRead({ operation: "get_rate_limit" });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.github.com/rate_limit");
    const core = first.core as { limit: number; used: number; remaining: number; resetAt: string };
    assert.equal(core.remaining, 4942);
    assert.equal(typeof core.resetAt, "string");
    assert.equal(second.cached, undefined);
  } finally { restore(); restoreEnv(); }
});

test("schema: unknown operation, bad maxBytes, bad number and missing ref are GITHUB_VALIDATION_FAILED", async () => {
  __resetGithubReadStateForTests();
  const restoreEnv = withEnv({ GITHUB_TOKEN: TOKEN });
  const { calls, restore } = stubFetch(() => ({ status: 200, body: REPO }));
  try {
    await expectError(runGithubRead({ operation: "nope" }), "GITHUB_VALIDATION_FAILED");
    await expectError(runGithubRead({ operation: "get_file", path: "a.ts", maxBytes: 10 }), "GITHUB_VALIDATION_FAILED");
    await expectError(runGithubRead({ operation: "get_pr", number: 0 }), "GITHUB_VALIDATION_FAILED");
    await expectError(runGithubRead({ operation: "get_commit" }), "GITHUB_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally { restore(); restoreEnv(); }
});

