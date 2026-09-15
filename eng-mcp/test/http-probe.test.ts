import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHttpProbe } from "../src/probe.ts";

const SECRET = "e2e-probe-secret-9f8b7c6d5e4a";

let server: Server;
let credDir = "";
let lastAuthHeader: string | null = null;

before(async () => {
  credDir = await mkdtemp(join(tmpdir(), "eng-mcp-http-probe-"));
  await writeFile(join(credDir, "agent-memory-cred"), `${SECRET}\n`, "utf8");
  process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE = join(credDir, "agent-memory-cred");
  server = createServer((request, response) => {
    lastAuthHeader = (request.headers["x-agent-memory-token"] as string | undefined) ?? null;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.url === "/functions/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (request.url === "/functions/echo") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          ok: true,
          receivedToken: lastAuthHeader,
          nested: { authorization: "Bearer abc", setCookie: "sid=1", api_key: "k1", apikey: "k2", password: "p", secret: "s" },
          message: `credential was ${lastAuthHeader}`
        }));
        return;
      }
      if (request.url === "/functions/redirect") {
        response.writeHead(302, { location: "http://example.invalid/" });
        response.end();
        return;
      }
      if (request.url === "/functions/big") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ padding: "x".repeat(70_000) }));
        return;
      }
      if (request.url === "/functions/slow") {
        setTimeout(() => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end("{}");
        }, 1_000);
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT = `http://127.0.0.1:${(address as { port: number }).port}/functions/agentMemoryBridge`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT;
  delete process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE;
  if (credDir) await rm(credDir, { recursive: true, force: true });
});

test("PASS: allowed target and GET succeed", async () => {
  const result = await runHttpProbe("probe-test", { target: "base44", method: "GET", path: "/functions/health" });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.error, null);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.body, { status: "ok" });
});

test("PASS: POST succeeds with credentialRef resolved server-side and secrets redacted", async () => {
  const result = await runHttpProbe("probe-test", {
    target: "base44",
    method: "POST",
    path: "/functions/echo",
    body: { ping: true },
    credentialRef: "AGENT_MEMORY_MCP_SECRET",
    credentialHeader: "x-agent-memory-token"
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(lastAuthHeader, SECRET); // secret resolved server-side from the credential file
  const serialized = JSON.stringify(result.body) ?? "";
  assert.ok(!serialized.includes(SECRET)); // secret never appears in the result
  const payload = result.body as { receivedToken: string; nested: Record<string, string>; message: string };
  assert.equal(payload.receivedToken, "[REDACTED]");
  for (const key of ["authorization", "setCookie", "api_key", "apikey", "password", "secret"]) {
    assert.equal(payload.nested[key], "[REDACTED]");
  }
  assert.ok(!payload.message.includes(SECRET)); // secret embedded in a string is scrubbed
});

test("FAIL: arbitrary URL and unknown target rejected", async () => {
  assert.equal((await runHttpProbe("probe-test", { target: "https://evil.example.com", method: "GET", path: "/x" })).error, "TARGET_NOT_ALLOWED");
  assert.equal((await runHttpProbe("probe-test", { target: "unknown-target", method: "GET", path: "/x" })).error, "TARGET_NOT_ALLOWED");
});

test("FAIL: paths trying to change host or traverse rejected", async () => {
  const paths = ["//evil.example.com/x", "https://evil.example.com/x", "http://evil.example.com/x", "/functions/../secret", "/functions/..%2fsecret", "relative/path"];
  for (const path of paths) {
    const result = await runHttpProbe("probe-test", { target: "base44", method: "GET", path });
    assert.equal(result.error, "PATH_NOT_ALLOWED", path);
  }
});

test("FAIL: unknown credentialRef and disallowed credentialHeader rejected", async () => {
  const deniedRef = await runHttpProbe("probe-test", { target: "base44", method: "POST", path: "/functions/echo", credentialRef: "OPENROUTER_API_KEY", credentialHeader: "x-agent-memory-token" });
  assert.equal(deniedRef.error, "CREDENTIAL_REF_NOT_ALLOWED");
  const deniedHeader = await runHttpProbe("probe-test", { target: "base44", method: "POST", path: "/functions/echo", credentialRef: "AGENT_MEMORY_MCP_SECRET", credentialHeader: "authorization" });
  assert.equal(deniedHeader.error, "CREDENTIAL_HEADER_NOT_ALLOWED");
  const missingHeader = await runHttpProbe("probe-test", { target: "base44", method: "POST", path: "/functions/echo", credentialRef: "AGENT_MEMORY_MCP_SECRET" });
  assert.equal(missingHeader.error, "CREDENTIAL_PAIR_REQUIRED");
});

test("FAIL: non-allowlisted methods and oversized timeouts rejected", async () => {
  assert.equal((await runHttpProbe("probe-test", { target: "base44", method: "DELETE" as "GET" | "POST", path: "/functions/health" })).error, "METHOD_NOT_ALLOWED");
  assert.equal((await runHttpProbe("probe-test", { target: "base44", method: "PUT" as "GET" | "POST", path: "/functions/health" })).error, "METHOD_NOT_ALLOWED");
  assert.equal((await runHttpProbe("probe-test", { target: "base44", method: "GET", path: "/functions/health", timeoutMs: 60_000 })).error, "TIMEOUT_OUT_OF_RANGE");
});

test("FAIL: redirects are never followed", async () => {
  const result = await runHttpProbe("probe-test", { target: "base44", method: "GET", path: "/functions/redirect" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 302);
  assert.equal(result.error, "REDIRECT_NOT_FOLLOWED");
});

test("response larger than the cap is truncated", async () => {
  const result = await runHttpProbe("probe-test", { target: "base44", method: "GET", path: "/functions/big" });
  assert.equal(result.truncated, true);
  const serialized = JSON.stringify(result.body) ?? "";
  assert.ok(serialized.length < 200_000);
});

test("slow response enforces the probe timeout", async () => {
  const result = await runHttpProbe("probe-test", { target: "base44", method: "GET", path: "/functions/slow", timeoutMs: 200 });
  assert.equal(result.ok, false);
  assert.equal(result.error, "PROBE_TIMEOUT");
});
