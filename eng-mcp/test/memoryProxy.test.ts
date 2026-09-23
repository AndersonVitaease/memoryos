// STORE-MIG-01 PARTE B: local MCP proxy tests — real HTTP end-to-end (the same
// wire contract the Hermes channel consumes through the Base44 engMcpProxy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensureProxySecret, handleMcpProxyRequest, type McpProxyDeps } from "../src/memoryProxy.ts";

function tmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), `proxy-${randomUUID().slice(0, 8)}-`));
}

type Harness = {
  server: Server;
  url: string;
  secretFile: string;
  bearerFile: string;
  auditFile: string;
  calls: { authenticate: string[]; handlers: Array<Record<string, unknown>> };
  setBearer: (token: string | null) => void;
};

async function startHarness(dir: string, authBehavior: "ok" | "refuse" = "ok"): Promise<Harness> {
  const secretFile = path.join(dir, "hermes-proxy-secret");
  const bearerFile = path.join(dir, "hermes-2026-09");
  const auditFile = path.join(dir, "mcp-proxy.jsonl");
  const calls = { authenticate: [] as string[], handlers: [] as Array<Record<string, unknown>> };
  const harness: Harness = {
    server: undefined as unknown as Server,
    url: "",
    secretFile, bearerFile, auditFile, calls,
    setBearer: (token) => {
      if (token == null) { try { rmSync(bearerFile); } catch { /* absent */ } return; }
      writeFileSync(bearerFile, `${token}\n`, { mode: 0o600 });
    },
  };
  harness.server = createServer((request, response) => {
    const deps: McpProxyDeps = {
      secretFile,
      bearerFile,
      auditFile,
      authenticateBearer: (token) => {
        // Mirrors the REAL policy contract (src/policy.ts parseBearerAuthorization):
        // the value presented is the full "Authorization: Bearer <token>" header
        // value — a raw token is a wiring bug, not a valid credential.
        calls.authenticate.push(token);
        if (!/^Bearer [^\s]+$/.test(token)) throw new Error("AUTHENTICATION_REQUIRED");
        if (authBehavior === "refuse") throw new Error("AUTHORIZATION_TOKEN_REVOKED");
        return { subject: "hermes-2026-09", scopes: ["memory:read", "verify:read"] };
      },
      buildMcpHandler: (subject) => {
        calls.handlers.push(subject as Record<string, unknown>);
        return {
          fetch: async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true, subject: (subject as { subject?: string }).subject } }), { headers: { "content-type": "application/json" } }),
          close: async () => { /* stateless */ },
        };
      },
    };
    void handleMcpProxyRequest(request, response, deps);
  });
  await new Promise<void>((resolve) => harness.server.listen(0, "127.0.0.1", resolve));
  const address = harness.server.address();
  assert.ok(address && typeof address === "object");
  harness.url = `http://127.0.0.1:${address.port}/mcp-proxy`;
  return harness;
}

async function closeServer(harness: Harness): Promise<void> {
  await new Promise<void>((resolve) => harness.server.close(() => resolve()));
}

test("ensureProxySecret: generates a 0600 secret once, returns hash16 only", () => {
  const dir = tmpDir();
  const file = path.join(dir, "hermes-proxy-secret");
  const first = ensureProxySecret(file);
  assert.equal(first.created, true);
  assert.equal(first.hash16.length, 16);
  const mode = statSync(file).mode & 0o777;
  assert.equal(mode, 0o600, "secret file is 0600");
  const value = readFileSync(file, "utf8").trim();
  assert.ok(value.length >= 64, "32 random bytes hex");
  assert.ok(!JSON.stringify(first).includes(value), "the value never appears in the metadata");
  const second = ensureProxySecret(file);
  assert.equal(second.created, false);
  assert.equal(second.hash16, first.hash16);
  rmSync(dir, { recursive: true, force: true });
});

test("proxy: wrong secret → 403 {error:'Forbidden'} (Base44-compatible shape)", async () => {
  const dir = tmpDir();
  const harness = await startHarness(dir);
  ensureProxySecret(harness.secretFile);
  harness.setBearer("eng_readonly_token_value");
  const res = await fetch(harness.url, { method: "POST", headers: { "x-proxy-secret": "wrong" }, body: "{}" });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Forbidden" });
  await closeServer(harness);
  rmSync(dir, { recursive: true, force: true });
});

test("proxy: missing secret file and missing bearer file fail closed (503)", async () => {
  const dir = tmpDir();
  const harness = await startHarness(dir);
  const noSecret = await fetch(harness.url, { method: "POST", headers: { "x-proxy-secret": "anything" }, body: "{}" });
  assert.equal(noSecret.status, 503);
  assert.deepEqual(await noSecret.json(), { error: "PROXY_SECRET_UNAVAILABLE" });
  ensureProxySecret(harness.secretFile);
  const noBearer = await fetch(harness.url, { method: "POST", headers: { "x-proxy-secret": readFileSync(harness.secretFile, "utf8").trim() }, body: "{}" });
  assert.equal(noBearer.status, 503);
  assert.deepEqual(await noBearer.json(), { error: "PROXY_BEARER_UNAVAILABLE" });
  await closeServer(harness);
  rmSync(dir, { recursive: true, force: true });
});

test("proxy: GET is refused with 405", async () => {
  const dir = tmpDir();
  const harness = await startHarness(dir);
  ensureProxySecret(harness.secretFile);
  harness.setBearer("eng_readonly_token_value");
  const res = await fetch(harness.url, { method: "GET", headers: { "x-proxy-secret": readFileSync(harness.secretFile, "utf8").trim() } });
  assert.equal(res.status, 405);
  await closeServer(harness);
  rmSync(dir, { recursive: true, force: true });
});

test("proxy: fixed read-only identity — client Authorization is STRIPPED, the file token is injected", async () => {
  const dir = tmpDir();
  const harness = await startHarness(dir);
  ensureProxySecret(harness.secretFile);
  const fileToken = "eng_readonly_hermes_2026_09_value";
  harness.setBearer(fileToken);
  const res = await fetch(harness.url, {
    method: "POST",
    headers: {
      "x-proxy-secret": readFileSync(harness.secretFile, "utf8").trim(),
      // a smuggled stronger bearer must be IGNORED, never forwarded
      authorization: "Bearer eng_write_capable_smuggled_value",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result: { subject: string } };
  assert.equal(body.result.subject, "hermes-2026-09");
  assert.deepEqual(
    harness.calls.authenticate,
    [`Bearer ${fileToken}`],
    "authenticateBearer sees the file token in the Authorization wire form — and nothing else",
  );
  assert.deepEqual(harness.calls.handlers.map((s) => s.subject), ["hermes-2026-09"]);
  // audit: metadata only — no secret, no bearer values
  await closeServer(harness);
  const audit = readFileSync(harness.auditFile, "utf8");
  assert.ok(audit.includes('"event":"proxied"'));
  assert.ok(!audit.includes(fileToken), "bearer value never in audit");
  assert.ok(!audit.includes("eng_write_capable_smuggled_value"), "smuggled value never in audit");
  assert.ok(!audit.includes(readFileSync(harness.secretFile, "utf8").trim()), "secret value never in audit");
  rmSync(dir, { recursive: true, force: true });
});

test("proxy: revoked/unauthenticated bearer fails closed with 401 and the code", async () => {
  const dir = tmpDir();
  const harness = await startHarness(dir, "refuse");
  ensureProxySecret(harness.secretFile);
  harness.setBearer("eng_revoked_token_value");
  const res = await fetch(harness.url, {
    method: "POST",
    headers: { "x-proxy-secret": readFileSync(harness.secretFile, "utf8").trim() },
    body: "{}",
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "AUTHORIZATION_TOKEN_REVOKED" });
  await closeServer(harness);
  rmSync(dir, { recursive: true, force: true });
});
