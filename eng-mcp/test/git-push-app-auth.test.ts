// GIT-PUSH-APP-AUTH-01: credential-SOURCE tests for the governed git tools.
// (a) App configured → the push resolves through the installation token
//     (credSource=github-app) and never needs the credential-store file;
// (b) no App config → PAT fallback with the typed audit warning
//     github_app_fallback_pat (never silent);
// (c) an installation token inside the TTL margin is NOT reused — the next
//     push re-mints;
// plus the mode matrix (app-only without App refuses; invalid mode fails
// closed; pat-only keeps credSource=pat-fallback without the fallback warning).
// Zero real network: fetch is stubbed, origin is a local bare repo (file://),
// keys and tokens are synthetic fixtures.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { __resetGithubAppAuthStateForTests } from "../src/githubAppAuth.ts";
import { GitPushError, runGitPush } from "../src/gitPush.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const dir = mkdtempSync(path.join(tmpdir(), "git-push-app-auth-"));
const KEY_FILE = path.join(dir, "app.pem");
writeFileSync(KEY_FILE, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), { mode: 0o600 });
const INSTALL_TOKEN = "ghs_unitfixtureinstallationtoken0000";
const MISSING_CREDENTIALS = path.join(dir, "credentials-NOT-READ");
const ENV_KEYS = ["GITHUB_TOKEN", "GITHUB_APP_ID", "GITHUB_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY_FILE", "ENG_MCP_GITHUB_APP_API_BASE", "GIT_CREDENTIALS_FILE", "GIT_PUSH_AUDIT_FILE", "ENG_MCP_GIT_CRED_MODE"];

test.after(() => rmSync(dir, { recursive: true, force: true }));

function withEnv(overrides: Record<string, string | undefined>, work: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) { saved.set(key, process.env[key]); delete process.env[key]; }
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) process.env[key] = value;
  return work().finally(() => { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

const hasCode = (code: string) => (error: unknown) => error instanceof GitPushError && error.code === code;

type Fixture = {
  base: string; root: string; origin: string; auditFile: string;
  commit: (message: string) => string;
  head: () => string;
  originHead: () => string;
  auditLines: () => Array<Record<string, unknown>>;
};

function makeFixture(): Fixture {
  const base = mkdtempSync(path.join(tmpdir(), "git-push-app-auth-fx-"));
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
  const auditFile = path.join(base, "audit", "git-push.jsonl");
  return {
    base, root, origin, auditFile,
    commit: (message: string) => {
      writeFileSync(path.join(root, `file-${Date.now()}-${Math.random()}.txt`), `${message}\n`);
      execFileSync("git", ["add", "-A"], { cwd: root });
      execFileSync("git", ["commit", "-m", message], { cwd: root });
      return git(root, ["rev-parse", "refs/heads/main"]).trim();
    },
    head: () => git(root, ["rev-parse", "refs/heads/main"]).trim(),
    originHead: () => git(origin, ["rev-parse", "refs/heads/main"]).trim(),
    auditLines: () => readFileSync(auditFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

const git = (cwd: string, args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" });

// Stub of globalThis.fetch covering BOTH consumers: the installation-token
// exchange (POST /app/installations/...) and the LIVE branch-head precheck /
// postcheck (GET .../branches/main). Exchange calls are counted for the TTL test.
function stubGithubFetch(head: () => string, exchangeBody: () => { token: string; expiresAt: string }) {
  let exchanges = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/access_tokens")) {
      exchanges += 1;
      return new Response(JSON.stringify({ token: exchangeBody().token, expires_at: exchangeBody().expiresAt, permissions: { contents: "write" }, repository_selection: "selected" }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/branches/main")) {
      return new Response(JSON.stringify({ commit: { sha: head(), commit: { committer: { date: "2026-10-03T00:00:00Z" } } } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  }) as typeof fetch;
  return { exchanges: () => exchanges, restore: () => { globalThis.fetch = previous; } };
}

const EXECUTE = { execute: true, approval: { approved: true }, acknowledgePush: true };

test("(a) App configured: push resolves the installation token — credSource=github-app, credential file never read", async () => {
  __resetGithubAppAuthStateForTests();
  const fixture = makeFixture();
  const pushed = fixture.commit("app-auth (a): token-based push");
  const stub = stubGithubFetch(() => fixture.originHead(), () => ({ token: INSTALL_TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
  try {
    await withEnv({ GITHUB_APP_ID: "123456", GITHUB_INSTALLATION_ID: "987654", GITHUB_APP_PRIVATE_KEY_FILE: KEY_FILE, GIT_CREDENTIALS_FILE: MISSING_CREDENTIALS, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const report = await runGitPush({ ...EXECUTE, expectedHead: pushed }, { repoRoot: fixture.root, subject: "git-push-app-auth-a" });
      assert.equal(report.status, "PUSHED");
      assert.equal(report.pushedSha, pushed);
      assert.equal(fixture.originHead(), pushed);
      assert.equal(report.credential.credSource, "github-app");
      assert.ok(!("warning" in report.credential), "no fallback warning in the App path");
      const last = fixture.auditLines().at(-1) ?? {};
      assert.equal(last.result, "pushed");
      assert.equal(last.credSource, "github-app");
      assert.equal(last.credMode, "app-with-fallback");
      assert.ok(!("warning" in last), "fallback warning must be absent when the App is used");
      assert.ok(stub.exchanges() >= 1, "the installation-token exchange happened");
    });
  } finally { stub.restore(); }
});

test("(b) no App config: PAT fallback is used AND audited with the typed warning github_app_fallback_pat", async () => {
  __resetGithubAppAuthStateForTests();
  const fixture = makeFixture();
  const credentials = path.join(fixture.base, "git-credentials");
  writeFileSync(credentials, "https://x-access-token:fixture-pat@github.com\n");
  const pushed = fixture.commit("app-auth (b): pat fallback push");
  const stub = stubGithubFetch(() => fixture.originHead(), () => ({ token: INSTALL_TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
  try {
    await withEnv({ GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const report = await runGitPush({ ...EXECUTE, expectedHead: pushed }, { repoRoot: fixture.root, subject: "git-push-app-auth-b" });
      assert.equal(report.status, "PUSHED");
      assert.equal(report.credential.credSource, "pat-fallback");
      assert.equal(report.credential.warning, "github_app_fallback_pat");
      const last = fixture.auditLines().at(-1) ?? {};
      assert.equal(last.result, "pushed");
      assert.equal(last.credSource, "pat-fallback");
      assert.equal(last.warning, "github_app_fallback_pat");
      assert.equal(stub.exchanges(), 0, "no token exchange without App config");
    });
  } finally { stub.restore(); }
});

test("(c) an installation token inside the TTL margin is not reused — the next push re-mints; a healthy token is reused", async () => {
  __resetGithubAppAuthStateForTests();
  const fixture = makeFixture();
  fixture.commit("app-auth (c): renewal case");
  const appEnv = { GITHUB_APP_ID: "123456", GITHUB_INSTALLATION_ID: "987654", GITHUB_APP_PRIVATE_KEY_FILE: KEY_FILE, GIT_CREDENTIALS_FILE: MISSING_CREDENTIALS, GIT_PUSH_AUDIT_FILE: fixture.auditFile };
  // Healthy token (1h): first push PUSHED; the second execute reuses the cached
  // token (no new exchange) and stops at nothing-to-push — which still runs
  // AFTER credential resolution, proving the reuse.
  const healthyStub = stubGithubFetch(() => fixture.originHead(), () => ({ token: INSTALL_TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
  try {
    await withEnv({ ...appEnv, GITHUB_TOKEN: "ghp_unit-fixture-token-000000" }, async () => {
      const first = await runGitPush({ ...EXECUTE }, { repoRoot: fixture.root, subject: "git-push-app-auth-c" });
      assert.equal(first.status, "PUSHED");
      const exchangesAfterHealthy = healthyStub.exchanges();
      const again = await runGitPush({ ...EXECUTE }, { repoRoot: fixture.root, subject: "git-push-app-auth-c" }).then(
        () => null,
        (error: unknown) => error,
      );
      assert.ok(again instanceof GitPushError && again.code === "PUSH_NOTHING_TO_PUSH", `expected PUSH_NOTHING_TO_PUSH, got ${String(again)}`);
      assert.equal(healthyStub.exchanges(), exchangesAfterHealthy, "a token with >5min of life is reused (no new exchange)");
    });
  } finally { healthyStub.restore(); }
  // Now the cached token is replaced by one inside the 5min TTL margin: the next
  // resolution MUST re-mint instead of reusing it.
  __resetGithubAppAuthStateForTests();
  const shortStub = stubGithubFetch(() => fixture.originHead(), () => ({ token: INSTALL_TOKEN, expiresAt: new Date(Date.now() + 120_000).toISOString() }));
  try {
    await withEnv({ ...appEnv, GITHUB_TOKEN: "ghp_unit-fixture-token-000000" }, async () => {
      const third = await runGitPush({ ...EXECUTE }, { repoRoot: fixture.root, subject: "git-push-app-auth-c" }).then(
        () => null,
        (error: unknown) => error,
      );
      assert.ok(third instanceof GitPushError && third.code === "PUSH_NOTHING_TO_PUSH", `expected PUSH_NOTHING_TO_PUSH, got ${String(third)}`);
      // Exactly 2 mints: the push resolution (first resolver after the reset)
      // re-mints, and the live remote-head READ also refuses the <5min token and
      // re-mints its own — every consumer re-mints while inside the TTL margin,
      // which is precisely "não reusa após TTL".
      assert.equal(shortStub.exchanges(), 2, "a token inside the TTL margin is re-minted (push + read), not reused");
    });
  } finally { shortStub.restore(); }
});

test("mode matrix: app-only without App config refuses (GIT_CRED_MODE_NO_APP); invalid mode fails closed", async () => {
  __resetGithubAppAuthStateForTests();
  const fixture = makeFixture();
  fixture.commit("app-auth mode matrix");
  const stub = stubGithubFetch(() => fixture.originHead(), () => ({ token: INSTALL_TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
  try {
    await withEnv({ ENG_MCP_GIT_CRED_MODE: "app-only", GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: MISSING_CREDENTIALS, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      const plan = await runGitPush({}, { repoRoot: fixture.root });
      assert.ok(plan.blockers.includes("GIT_CRED_MODE_NO_APP"), JSON.stringify(plan.blockers));
      await assert.rejects(() => runGitPush({ ...EXECUTE }, { repoRoot: fixture.root }), hasCode("GIT_CRED_MODE_NO_APP"));
    });
    await withEnv({ ENG_MCP_GIT_CRED_MODE: "tightrope", GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      await assert.rejects(() => runGitPush({}, { repoRoot: fixture.root }), hasCode("GIT_CRED_MODE_INVALID"));
    });
    await withEnv({ GITHUB_APP_ID: "123456", GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      // Partial App config: the operator meant App mode — fail closed, no silent PAT fallback.
      await assert.rejects(() => runGitPush({}, { repoRoot: fixture.root }), hasCode("GITHUB_APP_CONFIG_INCOMPLETE"));
    });
  } finally { stub.restore(); }
});

test("mode pat-only: credential file is the source without the fallback warning", async () => {
  __resetGithubAppAuthStateForTests();
  const fixture = makeFixture();
  const credentials = path.join(fixture.base, "git-credentials");
  writeFileSync(credentials, "https://x-access-token:fixture-pat@github.com\n");
  const pushed = fixture.commit("app-auth pat-only push");
  const stub = stubGithubFetch(() => fixture.originHead(), () => ({ token: INSTALL_TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
  try {
    await withEnv({ ENG_MCP_GIT_CRED_MODE: "pat-only", GITHUB_APP_ID: "123456", GITHUB_INSTALLATION_ID: "987654", GITHUB_APP_PRIVATE_KEY_FILE: KEY_FILE, GITHUB_TOKEN: "ghp_unit-fixture-token-000000", GIT_CREDENTIALS_FILE: credentials, GIT_PUSH_AUDIT_FILE: fixture.auditFile }, async () => {
      // App IS configured but pat-only keeps the file as the push source — the
      // push resolution itself never exchanges (any stub exchange belongs to
      // the read path, which always prefers the App when configured).
      const report = await runGitPush({ ...EXECUTE, expectedHead: pushed }, { repoRoot: fixture.root, subject: "git-push-app-auth-pat-only" });
      assert.equal(report.status, "PUSHED");
      assert.equal(report.credential.credSource, "pat-fallback");
      assert.ok(!("warning" in report.credential), "pat-only is a choice, not a fallback — no warning");
      const last = fixture.auditLines().at(-1) ?? {};
      assert.equal(last.credMode, "pat-only");
      assert.equal(last.credSource, "pat-fallback");
    });
  } finally { stub.restore(); }
});
