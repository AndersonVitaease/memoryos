import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync, type KeyObject } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildBootstrapLaunch, buildGitHubAppManifest, convertManifestCode, conversionSummary, parseManifestCode } from "../src/githubAppBootstrap.ts";
import { __resetGithubAppAuthStateForTests, getInstallationToken } from "../src/githubAppAuth.ts";
import { githubAppDockerArgs } from "../scripts/eng-mcp-release.mjs";
import { parseGithubAppEnv } from "../scripts/eng-mcp-release-runner.mjs";

// GITHUB-APP-BOOTSTRAP-01 — zero real network; RSA keys generated per run; every
// code/token below is a synthetic fixture.

const root = path.resolve(import.meta.dirname, "..");
const newPem = () => generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const verifyJwt = (jwt: string, pem: string): boolean => {
  const [h, p, s] = jwt.split(".");
  const v = createVerify("RSA-SHA256"); v.update(`${h}.${p}`); v.end();
  return v.verify(pem, Buffer.from(s, "base64url"));
};

test("manifest: read-only by construction, webhook inactive, loopback redirect only", () => {
  const m = buildGitHubAppManifest({ name: "memoryos-eng-mcp-ro" });
  assert.deepEqual(Object.values(m.default_permissions).filter((v) => v !== "read"), []);
  assert.equal(m.default_permissions.contents, "read");
  assert.equal(m.default_permissions.metadata, "read");
  assert.equal(m.hook_attributes.active, false);
  assert.deepEqual(m.default_events, []);
  assert.equal(m.public, false);
  assert.match(m.redirect_url, /^http:\/\/127\.0\.0\.1:/);
  assert.throws(() => buildGitHubAppManifest({ name: "x", permissions: { contents: "write", metadata: "read" } }), /WRITE_PERMISSION_REFUSED/);
  assert.throws(() => buildGitHubAppManifest({ name: "x", permissions: { administration: "admin", contents: "read", metadata: "read" } }), /WRITE_PERMISSION_REFUSED/);
  assert.throws(() => buildGitHubAppManifest({ name: "x", redirectUrl: "https://evil.example/cb" }), /REDIRECT_NOT_LOOPBACK/);
  assert.throws(() => buildGitHubAppManifest({ name: "x", permissions: { contents: "read" } }), /MINIMUM_PERMISSIONS/);
});

test("launcher: form POST to settings/apps/new?state=..., manifest field round-trips, data: URL decodes to the same page", () => {
  const l = buildBootstrapLaunch({ name: "memoryos-eng-mcp-ro", state: "abcdef0123456789abcdef0123456789" });
  assert.equal(l.formAction, "https://github.com/settings/apps/new?state=abcdef0123456789abcdef0123456789");
  assert.match(l.html, /<form id="f" method="post" action="https:\/\/github\.com\/settings\/apps\/new\?state=abcdef0123456789abcdef0123456789">/);
  const value = /name="manifest" value="([^"]*)"/.exec(l.html)?.[1] ?? "";
  const decoded = value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  assert.deepEqual(JSON.parse(decoded), l.manifest);
  assert.equal(Buffer.from(l.dataUrl.replace("data:text/html;base64,", ""), "base64").toString("utf8"), l.html);
  assert.notEqual(buildBootstrapLaunch({ name: "a" }).state, buildBootstrapLaunch({ name: "a" }).state, "state is random per launch");
});

test("code parsing: redirect URL or bare code; state mismatch refused; junk refused", () => {
  assert.equal(parseManifestCode("http://127.0.0.1:65535/github-app-manifest-callback?code=abc123DEF456&state=s1s1s1s1s1s1s1s1", "s1s1s1s1s1s1s1s1"), "abc123DEF456");
  assert.equal(parseManifestCode("  abc123DEF456\n"), "abc123DEF456");
  assert.throws(() => parseManifestCode("http://127.0.0.1/cb?code=abc123DEF456&state=other000000000000", "s1s1s1s1s1s1s1s1"), /STATE_MISMATCH/);
  assert.throws(() => parseManifestCode("abc/../../x"), /CODE_INVALID/);
});

function stubFetch(respond: (url: string, init?: RequestInit) => Response): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => respond(String(url), init)) as typeof fetch;
  return () => { globalThis.fetch = previous; };
}

test("conversion: summary carries ids + pemSha16 only; expired code typed; write permission in result refused; errors scrubbed", async () => {
  const pem = newPem();
  let restore = stubFetch((url, init) => {
    assert.equal(url, "https://api.github.com/app-manifests/code12345678/conversions");
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ id: 4242, slug: "memoryos-eng-mcp-ro", owner: { login: "AndersonVitaease" }, pem, client_secret: "cs_fixture", webhook_secret: null, permissions: { contents: "read", metadata: "read" }, html_url: "https://github.com/apps/memoryos-eng-mcp-ro" }), { status: 201 });
  });
  try {
    const c = await convertManifestCode("code12345678");
    assert.equal(c.appId, 4242);
    const summary = JSON.stringify(conversionSummary(c));
    assert.ok(!summary.includes("PRIVATE KEY") && !summary.includes("cs_fixture"));
    assert.match(summary, /"pemSha16":"[a-f0-9]{16}"/);
  } finally { restore(); }
  restore = stubFetch(() => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }));
  try { await assert.rejects(convertManifestCode("code12345678"), /CODE_EXPIRED_OR_USED/); } finally { restore(); }
  restore = stubFetch(() => new Response(JSON.stringify({ id: 1, pem, permissions: { contents: "write" } }), { status: 201 }));
  try { await assert.rejects(convertManifestCode("code12345678"), /WRITE_PERMISSION_REFUSED/); } finally { restore(); }
  restore = stubFetch(() => new Response(JSON.stringify({ message: "boom", pem }), { status: 500 }));
  try {
    await assert.rejects(convertManifestCode("code12345678"), (e: Error) => !e.message.includes("PRIVATE KEY") && /CONVERSION_FAILED/.test(e.message));
  } finally { restore(); }
});

type FakeGithub = { base: string; close: () => Promise<void>; requests: string[]; state: { pem: string; installed: boolean; acceptPem: string } };
async function fakeGithub(pem: string): Promise<FakeGithub> {
  const requests: string[] = [];
  const state = { pem, installed: true, acceptPem: pem };
  const jwtOk = (req: IncomingMessage) => verifyJwt(String(req.headers.authorization ?? "").replace(/^Bearer /, ""), state.acceptPem);
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "POST" && req.url === "/app-manifests/fixturecode123/conversions") return send(201, { id: 4242, slug: "memoryos-eng-mcp-ro", owner: { login: "AndersonVitaease" }, pem: state.pem, permissions: { contents: "read", metadata: "read" }, html_url: "https://github.com/apps/x" });
    if (req.method === "POST" && req.url?.startsWith("/app-manifests/")) return send(404, { message: "Not Found" });
    if (req.url === "/repos/AndersonVitaease/memoryos/installation") return jwtOk(req) ? (state.installed ? send(200, { id: 777 }) : send(404, { message: "Not Found" })) : send(401, { message: "bad jwt" });
    if (req.url === "/app") return jwtOk(req) ? send(200, { id: 4242, slug: "memoryos-eng-mcp-ro" }) : send(401, { message: "bad jwt" });
    send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${port}`, requests, state, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function runScript(script: string, args: string[], env: Record<string, string>, stdin = ""): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", path.join(root, "scripts", script), ...args], { cwd: root, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env } });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

test("convert script E2E (fake GitHub): PEM 0600, env 0600 with both IDs, stdout never carries the PEM; no overwrite; pending install path", async () => {
  const pem = newPem();
  const gh = await fakeGithub(pem);
  const dir = mkdtempSync(path.join(tmpdir(), "gh-app-bootstrap-"));
  try {
    const env = { GITHUB_APP_SECRETS_DIR: dir, ENG_MCP_GITHUB_APP_API_BASE: gh.base };
    const r = await runScript("github-app-convert.ts", [], env, "http://127.0.0.1:65535/github-app-manifest-callback?code=fixturecode123&state=zzzzzzzzzzzzzzzz");
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.equal(out.result, "GREEN"); assert.equal(out.appId, 4242); assert.equal(out.installationId, "777");
    assert.ok(!r.stdout.includes("PRIVATE KEY") && !r.stderr.includes("PRIVATE KEY") && !/eyJ[A-Za-z0-9_-]{8,}\./.test(r.stdout + r.stderr));
    const pemFile = path.join(dir, "github-app.private-key.pem");
    assert.equal(readFileSync(pemFile, "utf8").trim(), pem.trim());
    assert.equal(statSync(pemFile).mode & 0o777, 0o600);
    assert.equal(statSync(path.join(dir, "github-app.env")).mode & 0o777, 0o600);
    assert.deepEqual(parseGithubAppEnv(readFileSync(path.join(dir, "github-app.env"), "utf8")), { GITHUB_APP_ID: "4242", GITHUB_INSTALLATION_ID: "777" });
    const again = await runScript("github-app-convert.ts", [], env, "fixturecode123");
    assert.equal(again.code, 1); assert.match(again.stdout, /PEM_ALREADY_PRESENT/);
    assert.equal(readFileSync(pemFile, "utf8").trim(), pem.trim(), "existing PEM untouched");
    // install pending → env without installation id → --resolve-installation completes it
    rmSync(pemFile); rmSync(path.join(dir, "github-app.env"));
    gh.state.installed = false;
    const pending = await runScript("github-app-convert.ts", [], env, "fixturecode123");
    assert.equal(pending.code, 3); assert.match(pending.stdout, /PENDING_INSTALL/);
    assert.deepEqual(parseGithubAppEnv(readFileSync(path.join(dir, "github-app.env"), "utf8")), { GITHUB_APP_ID: "4242" });
    gh.state.installed = true;
    const resolved = await runScript("github-app-convert.ts", ["--resolve-installation"], env);
    assert.equal(resolved.code, 0, resolved.stdout); assert.match(resolved.stdout, /"installationId":"777"/);
    const expired = await runScript("github-app-convert.ts", [], { ...env, GITHUB_APP_SECRETS_DIR: mkdtempSync(path.join(tmpdir(), "gh-app-exp-")) }, "usedcode9999");
    assert.equal(expired.code, 1); assert.match(expired.stdout, /CODE_EXPIRED_OR_USED/);
  } finally { await gh.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("rotation: rotate script proves the NEW key against GitHub before swapping; token cache follows the key file", async () => {
  const oldPem = newPem();
  const nextPem = newPem();
  const gh = await fakeGithub(oldPem);
  const dir = mkdtempSync(path.join(tmpdir(), "gh-app-rotate-"));
  const current = path.join(dir, "github-app.private-key.pem");
  try {
    writeFileSync(current, oldPem, { mode: 0o600 });
    writeFileSync(path.join(dir, "github-app.env"), "GITHUB_APP_ID=4242\nGITHUB_INSTALLATION_ID=777\n", { mode: 0o600 });
    const env = { GITHUB_APP_SECRETS_DIR: dir, ENG_MCP_GITHUB_APP_API_BASE: gh.base };
    // GitHub still only knows the old key → new key refused, nothing swapped
    writeFileSync(`${current}.new`, nextPem, { mode: 0o600 });
    const refused = await runScript("github-app-rotate.ts", [], env);
    assert.equal(refused.code, 1); assert.match(refused.stdout, /NEW_KEY_REJECTED_BY_GITHUB/);
    assert.equal(readFileSync(current, "utf8"), oldPem);
    // operator generated the key on GitHub → accepted → swapped, old kept as .prev
    gh.state.acceptPem = nextPem;
    const swapped = await runScript("github-app-rotate.ts", [], env);
    assert.equal(swapped.code, 0, swapped.stdout);
    const out = JSON.parse(swapped.stdout) as Record<string, string>;
    assert.equal(out.result, "SWAPPED"); assert.match(out.oldKeyGithubFingerprint, /^SHA256:/);
    assert.equal(readFileSync(current, "utf8"), nextPem);
    assert.equal(readFileSync(`${current}.prev`, "utf8"), oldPem);
    assert.equal(statSync(current).mode & 0o777, 0o600);
    assert.ok(!swapped.stdout.includes("PRIVATE KEY"));
    assert.ok(!existsSync(`${current}.new`));
  } finally { await gh.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("rotation: swapping the PEM file invalidates the cached installation token (next call mints with the new key)", async () => {
  __resetGithubAppAuthStateForTests();
  const dir = mkdtempSync(path.join(tmpdir(), "gh-app-cache-"));
  const keyFile = path.join(dir, "app.pem");
  const pemA = newPem(); const pemB = newPem();
  writeFileSync(keyFile, pemA, { mode: 0o600 });
  const signers: string[] = [];
  const restore = stubFetch((_url, init) => {
    const jwt = String((init?.headers as Record<string, string>).authorization).replace("Bearer ", "");
    signers.push(verifyJwt(jwt, pemA) ? "A" : verifyJwt(jwt, pemB) ? "B" : "?");
    return new Response(JSON.stringify({ token: `ghs_fixture${signers.length}`, expires_at: new Date(Date.now() + 3_600_000).toISOString() }), { status: 201 });
  });
  try {
    const config = { appId: "4242", installationId: "777", privateKeyFile: keyFile };
    await getInstallationToken(config); await getInstallationToken(config);
    assert.deepEqual(signers, ["A"], "cached within TTL");
    writeFileSync(`${keyFile}.tmp`, pemB, { mode: 0o600 }); renameSync(`${keyFile}.tmp`, keyFile);
    await getInstallationToken(config);
    assert.deepEqual(signers, ["A", "B"], "key swap → cache invalidated → minted with the new key");
  } finally { restore(); __resetGithubAppAuthStateForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test("deploy wiring: container args all-or-nothing; runner env parser takes only numeric IDs", () => {
  assert.deepEqual(githubAppDockerArgs({}), []);
  assert.deepEqual(githubAppDockerArgs({ GITHUB_APP_PRIVATE_KEY_FILE: "/run/credentials/x/github-app-private-key", GITHUB_APP_ID: "4242" }), []);
  assert.deepEqual(githubAppDockerArgs({ GITHUB_APP_PRIVATE_KEY_FILE: "rel/path", GITHUB_APP_ID: "1", GITHUB_INSTALLATION_ID: "2" }), []);
  assert.deepEqual(githubAppDockerArgs({ GITHUB_APP_PRIVATE_KEY_FILE: "/k:/etc", GITHUB_APP_ID: "1", GITHUB_INSTALLATION_ID: "2" }), []);
  assert.deepEqual(githubAppDockerArgs({ GITHUB_APP_PRIVATE_KEY_FILE: "/run/credentials/x/github-app-private-key", GITHUB_APP_ID: "4242", GITHUB_INSTALLATION_ID: "777" }), ["-v", "/run/credentials/x/github-app-private-key:/run/secrets/github-app-key:ro", "-e", "GITHUB_APP_PRIVATE_KEY_FILE=/run/secrets/github-app-key", "-e", "GITHUB_APP_ID=4242", "-e", "GITHUB_INSTALLATION_ID=777"]);
  assert.deepEqual(parseGithubAppEnv("GITHUB_APP_ID=4242\nGITHUB_INSTALLATION_ID=777\nEVIL=1\nGITHUB_APP_ID2=9\n"), { GITHUB_APP_ID: "4242", GITHUB_INSTALLATION_ID: "777" });
  assert.deepEqual(parseGithubAppEnv("GITHUB_APP_ID=$(rm -rf /)\n"), {});
});

void (null as unknown as KeyObject);
