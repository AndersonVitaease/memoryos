import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGithubRead, __resetGithubReadStateForTests } from "../src/githubRead.ts";
import { __resetGithubAppAuthStateForTests, getInstallationToken, readGitHubAppConfig, sha16 } from "../src/githubAppAuth.ts";

// GH-APP-TOKEN-01 unit suite — zero real network. Keys are generated per run,
// every token below is a synthetic fixture.

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const dir = mkdtempSync(path.join(tmpdir(), "gh-app-auth-"));
const KEY_FILE = path.join(dir, "app.pem");
writeFileSync(KEY_FILE, PEM, { mode: 0o600 });
const INSTALL_TOKEN = "ghs_unitfixtureinstallationtoken0000";
const PAT = "ghp_unit-fixture-pat-token-000000000000";
const REPO = { full_name: "AndersonVitaease/memoryos", private: true, visibility: "private", default_branch: "main", pushed_at: "2026-09-28T00:00:00Z", html_url: "https://github.com/AndersonVitaease/memoryos" };
const ENV_KEYS = ["GITHUB_TOKEN", "GITHUB_TOKEN_FILE", "GITHUB_APP_ID", "GITHUB_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY_FILE", "ENG_MCP_GITHUB_APP_API_BASE", "ENG_MCP_GITHUB_REPO"];

test.after(() => rmSync(dir, { recursive: true, force: true }));

function withEnv(overrides: Record<string, string | undefined>): () => void {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) process.env[key] = value;
  return () => { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

const APP_ENV = { GITHUB_APP_ID: "123456", GITHUB_INSTALLATION_ID: "987654", GITHUB_APP_PRIVATE_KEY_FILE: KEY_FILE };
const rate = () => ({ "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4900", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600) });

type Call = { url: string; method: string; authorization: string };
function stubFetch(respond: (call: Call) => { status: number; body: unknown }): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { method?: string; headers?: Record<string, string> }) => {
    const call = { url: String(url), method: init?.method ?? "GET", authorization: (init?.headers ?? {}).authorization ?? "" };
    calls.push(call);
    const fixture = respond(call);
    return new Response(JSON.stringify(fixture.body), { status: fixture.status, headers: rate() });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

const expires = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const appRouter = (tokenExpiresInMs = 3_600_000) => (call: Call) => {
  if (call.method === "POST" && call.url === "https://api.github.com/app/installations/987654/access_tokens") return { status: 201, body: { token: INSTALL_TOKEN, expires_at: expires(tokenExpiresInMs), permissions: { contents: "read", metadata: "read" }, repository_selection: "selected" } };
  if (call.url === "https://api.github.com/repos/AndersonVitaease/memoryos") return { status: 200, body: REPO };
  return { status: 404, body: { message: "nope" } };
};

function reset(): void { __resetGithubReadStateForTests(); __resetGithubAppAuthStateForTests(); }

test("(a) App configured: RS256 JWT with correct claims+signature, installation token used for the API call", async () => {
  reset();
  const restoreEnv = withEnv({ ...APP_ENV, GITHUB_TOKEN: PAT });
  const { calls, restore } = stubFetch(appRouter());
  try {
    const result = await runGithubRead({ operation: "get_repo" });
    assert.equal(result.fullName, "AndersonVitaease/memoryos");
    const exchange = calls.find((call) => call.method === "POST");
    assert.ok(exchange, "token exchange happened");
    const jwt = exchange.authorization.replace(/^Bearer /, "");
    const [h, p, s] = jwt.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    assert.deepEqual(header, { alg: "RS256", typ: "JWT" });
    assert.equal(claims.iss, "123456");
    const now = Math.floor(Date.now() / 1000);
    assert.ok(claims.iat <= now && claims.iat >= now - 120, "iat backdated ≤2min");
    assert.ok(claims.exp - claims.iat <= 600, "exp-iat within GitHub's 10 min ceiling");
    const verifier = createVerify("RSA-SHA256"); verifier.update(`${h}.${p}`);
    assert.ok(verifier.verify(publicKey, Buffer.from(s, "base64url")), "signature verifies with the App public key");
    const repoCall = calls.find((call) => call.url.endsWith("/repos/AndersonVitaease/memoryos"));
    assert.equal(repoCall?.authorization, `Bearer ${INSTALL_TOKEN}`, "App wins over PAT when configured");
  } finally { restore(); restoreEnv(); }
});

test("(b) cache: second call inside TTL reuses the token; near expiry it renews by itself", async () => {
  reset();
  const restoreEnv = withEnv(APP_ENV);
  const { calls, restore } = stubFetch(appRouter());
  try {
    await runGithubRead({ operation: "get_repo" });
    __resetGithubReadStateForTests(); // clear the response cache, keep the token cache
    await runGithubRead({ operation: "get_repo" });
    assert.equal(calls.filter((call) => call.method === "POST").length, 1, "one exchange inside the TTL");
    const config = readGitHubAppConfig()!;
    const token = await getInstallationToken(config);
    // 56 min later: < 5 min of life left → must re-mint without being asked.
    await getInstallationToken(config, () => token.expiresAtMs - 4 * 60_000);
    assert.equal(calls.filter((call) => call.method === "POST").length, 2, "renewed inside the refresh margin");
    // concurrent callers share one in-flight exchange
    __resetGithubAppAuthStateForTests();
    await Promise.all([getInstallationToken(config), getInstallationToken(config), getInstallationToken(config)]);
    assert.equal(calls.filter((call) => call.method === "POST").length, 3, "single-flight");
  } finally { restore(); restoreEnv(); }
});

test("(c) App absent: PAT fallback exactly as before, zero exchange", async () => {
  reset();
  const restoreEnv = withEnv({ GITHUB_TOKEN: PAT });
  const { calls, restore } = stubFetch(appRouter());
  try {
    await runGithubRead({ operation: "get_repo" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].authorization, `Bearer ${PAT}`);
  } finally { restore(); restoreEnv(); }
});

test("(c2) partial App config fails closed — never silently degrades to the PAT", async () => {
  reset();
  const restoreEnv = withEnv({ GITHUB_APP_ID: "123456", GITHUB_TOKEN: PAT });
  const { calls, restore } = stubFetch(appRouter());
  try {
    await assert.rejects(runGithubRead({ operation: "get_repo" }), /GITHUB_APP_CONFIG_INCOMPLETE/);
    assert.equal(calls.length, 0);
  } finally { restore(); restoreEnv(); }
});

test("(d) scrub: exchange error echoing JWT/PEM/token leaks nothing; identifiers reported as sha16", async () => {
  reset();
  const restoreEnv = withEnv(APP_ENV);
  let echoedJwt = "";
  const { restore } = stubFetch((call) => {
    echoedJwt = call.authorization.replace(/^Bearer /, "");
    return { status: 401, body: { message: `bad jwt ${echoedJwt} key ${PEM} tok ${INSTALL_TOKEN}` } };
  });
  try {
    const error = await runGithubRead({ operation: "get_repo" }).then(() => null, (e: Error) => e);
    assert.ok(error);
    const message = error.message;
    assert.match(message, /^GITHUB_APP_AUTH_REJECTED:/);
    assert.ok(!message.includes(echoedJwt.slice(0, 40)), "JWT not echoed");
    assert.ok(!message.includes("PRIVATE KEY") && !message.includes(PEM.split("\n")[1].slice(0, 30)), "PEM not echoed");
    assert.ok(!message.includes(INSTALL_TOKEN), "token not echoed");
    assert.ok(!message.includes("123456") && message.includes(sha16("123456")), "app id only as sha16");
    const unreadable = withEnv({ ...APP_ENV, GITHUB_APP_PRIVATE_KEY_FILE: path.join(dir, "missing.pem") });
    __resetGithubAppAuthStateForTests();
    const e2 = await runGithubRead({ operation: "get_repo" }).then(() => null, (e: Error) => e);
    unreadable();
    assert.match(e2!.message, /^GITHUB_APP_KEY_UNREADABLE:/);
    assert.ok(!e2!.message.includes("missing.pem"), "path only as sha16");
  } finally { restore(); restoreEnv(); }
});

test("(e) bootstrap verify script: GREEN against a fake GitHub, prints no secret; RED on 0644 key", async () => {
  let posts = 0;
  const server = createServer((req, res) => {
    const auth = req.headers.authorization ?? "";
    if (req.method === "POST" && req.url === "/app/installations/987654/access_tokens" && auth.startsWith("Bearer eyJ")) {
      posts++;
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ token: INSTALL_TOKEN, expires_at: expires(3_600_000), permissions: { contents: "read", metadata: "read" }, repository_selection: "selected" }));
      return;
    }
    if (req.method === "GET" && req.url === "/repos/AndersonVitaease/memoryos" && auth === `Bearer ${INSTALL_TOKEN}`) {
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(REPO)); return;
    }
    res.writeHead(404); res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const script = path.join(import.meta.dirname, "..", "scripts", "github-app-verify.sh");
  const run = (keyFile: string) => new Promise<{ status: number | null; out: string }>((resolve) => {
    // spawnSync would block the event loop that serves the fake — run async.
    import("node:child_process").then(({ spawn }) => {
      const child = spawn("bash", [script], { env: { ...process.env, ...APP_ENV, GITHUB_APP_PRIVATE_KEY_FILE: keyFile, ENG_MCP_GITHUB_APP_API_BASE: `http://127.0.0.1:${port}` } });
      let out = ""; child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
      child.on("close", (status) => resolve({ status, out }));
    });
  });
  try {
    const green = await run(KEY_FILE);
    assert.equal(green.status, 0, green.out);
    assert.match(green.out, /RESULT GREEN/);
    assert.match(green.out, /least privilege — read-only/);
    assert.equal(posts, 1);
    for (const secret of [INSTALL_TOKEN, "PRIVATE KEY", "eyJ", "123456", "987654"]) assert.ok(!green.out.includes(secret), `verify output leaked ${secret}`);
    const loose = path.join(dir, "loose.pem"); writeFileSync(loose, PEM, { mode: 0o644 });
    const red = await run(loose);
    assert.equal(red.status, 1); assert.match(red.out, /FAIL key file mode/);
  } finally { server.close(); }
  void spawnSync;
});
