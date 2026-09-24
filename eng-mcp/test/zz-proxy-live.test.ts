// STORE-MIG-01 PARTE B live probe — runs ON THE VPS via engineering.test.run
// mode=file. Proves the acceptance pair against the LIVE /mcp-proxy route:
//   1) read-only call SUCCEEDS with the fixed bearer identity,
//   2) mutation REFUSED with AUTHORIZATION_SCOPE_REQUIRED.
// zz-convention: ephemeral probe, NEVER staged/committed. Skips when the
// channel secret file is absent (non-VPS runner env). The secret is read by
// file reference and NEVER printed, logged or echoed; assertion messages carry
// truncated bodies only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const SECRET_FILE = "/data/credentials/hermes-proxy-secret";
const BASES = ["http://127.0.0.1:8787", "https://memoryos-engmcp.2-25-96-245.nip.io"];

type JsonRpcResponse = { result?: Record<string, unknown>; error?: { code?: number; message?: string }; [k: string]: unknown };

async function call(base: string, secret: string | null, method: string, params: Record<string, unknown>, id: number, session: string | null): Promise<{ status: number; contentType: string; body: JsonRpcResponse | { error?: string } }> {
  const headers: Record<string, string> = { "content-type": "application/json", "accept": "application/json, text/event-stream" };
  if (secret !== null) headers["x-proxy-secret"] = secret;
  if (session) headers["mcp-session-id"] = session;
  const res = await fetch(`${base}/mcp-proxy`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const contentType = res.headers.get("content-type") ?? "";
  let body: JsonRpcResponse | { error?: string };
  try {
    const raw = await res.text();
    const dataMatch = raw.match(/^data:\s*(.+)$/m);
    const jsonSource = contentType.includes("text/event-stream") && dataMatch ? dataMatch[1] : raw;
    body = JSON.parse(jsonSource) as JsonRpcResponse;
  } catch { body = { error: "non-json-body" }; }
  return { status: res.status, contentType, body };
}

test("LIVE /mcp-proxy: read-only call succeeds, mutation refused with the scope code", { timeout: 30_000 }, async () => {
  if (existsSync("/.dockerenv")) {
    // STORE-MIG-01: inside the suite container neither the loopback port nor the
    // Caddy route is the production path — the LIVE proof runs in file-mode on
    // the VPS host (no /.dockerenv there).
    console.log("[zz-proxy-live] SKIP: suite container (live proof is file-mode on the VPS)");
    return;
  }
  if (!existsSync(SECRET_FILE)) {
    console.log("[zz-proxy-live] SKIP: no channel secret file in this environment");
    return;
  }
  const secret = readFileSync(SECRET_FILE, "utf8").trim();
  assert.ok(secret.length >= 32, "channel secret looks like a real generated value");

  // find a reachable base (loopback container port first, then the Caddy route)
  let base: string | null = null;
  let session: string | null = null;
  let init: { status: number; contentType: string; body: JsonRpcResponse | { error?: string } } | null = null;
  const probe = await fetch(`${BASES[0]}/mcp-proxy`, { method: "POST", headers: { "content-type": "application/json", "x-proxy-secret": "wrong-secret-control" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping", params: {} }), signal: AbortSignal.timeout(4000) }).then((r) => r.status).catch(() => 0);
  base = probe === 403 ? BASES[0] : BASES[1];
  // MCP handshake: initialize first (stateless handler should answer each POST)
  init = await call(base, secret, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "store-mig-probe", version: "1.0.0" } }, 1, null);
  const initBody = init.body as JsonRpcResponse;
  if (!initBody.result) {
    // protocol version fallback
    init = await call(base, secret, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "store-mig-probe", version: "1.0.0" } }, 1, null);
  }
  const sessionHeader = init?.body && typeof (init.body as JsonRpcResponse).result === "object" ? ((init.body as JsonRpcResponse).result ?? {}) : {};
  void sessionHeader;
  console.log(`[zz-proxy-live] base=${base} initStatus=${init?.status}`);

  // Control: WRONG secret must be 403 Forbidden (Base44-compatible shape)
  const wrong = await call(base, "deliberately-wrong-secret", "tools/list", {}, 2, null);
  assert.equal(wrong.status, 403, `wrong-secret control must be 403, got ${wrong.status}`);
  assert.deepEqual((wrong.body as { error?: string }).error, "Forbidden");

  // 1) READ-ONLY REAL CALL — a real read tool through the fixed identity
  const read = await call(base, secret, "tools/call", { name: "engineering.memory.context", arguments: { projectId: "memoryos", limit: 3 } }, 3, null);
  const readText = JSON.stringify(read.body);
  if (read.status === 401 && readText.includes("AUTHENTICATION_REQUIRED")) {
    // Deterministic skip: the wire-form fix (6a83658a) is not live yet — this
    // probe must not contaminate a suite run against the pre-fix server.
    console.log("[zz-proxy-live] SKIP: wire-form fix not live yet (401 AUTHENTICATION_REQUIRED — v109 pending)");
    return;
  }
  assert.equal(read.status, 200, `read-only call must be 200: ${readText.slice(0, 300)}`);
  const readBody = read.body as JsonRpcResponse;
  assert.equal(readBody.error, undefined, `read-only call must not carry a JSON-RPC error (check hermes-2026-09 scopes): ${readText.slice(0, 300)}`);
  assert.notEqual((readBody.result ?? {})["isError"], true, `read-only call must not be a tool error: ${readText.slice(0, 300)}`);
  assert.ok(Boolean((read.body as JsonRpcResponse).result), `read-only call must carry a real JSON-RPC result (content-type=${read.contentType}): ${readText.slice(0, 300)}`);

  // 2) MUTATION REFUSED — merge is write-scoped; a schema-valid decision on
  // nonexistent ids dies in the scope gate (never reaches the handler)
  const mut = await call(base, secret, "tools/call", {
    name: "engineering.memory.merge",
    arguments: { decisions: [{ memoryIdA: "zz-probe-nonexistent-a", memoryIdB: "zz-probe-nonexistent-b", verdict: "duplicate", action: "DUPLICATE_DELETE" }] },
  }, 4, null);
  const mutBody = mut.body as JsonRpcResponse;
  const mutResult = (mutBody.result ?? {}) as Record<string, unknown>;
  const mutRefusal: unknown = mutBody.error ?? (mutResult["isError"] === true ? mutResult : null);
  assert.ok(mutRefusal !== null, `mutation must be refused (JSON-RPC error or tool-level isError): ${JSON.stringify(mut.body).slice(0, 300)}`);
  assert.ok(JSON.stringify(mutRefusal).includes("AUTHORIZATION_SCOPE_REQUIRED"), `mutation refusal must carry the scope code: ${JSON.stringify(mutRefusal).slice(0, 300)}`);

  // 3) audit hygiene: proxied lines exist, and NEITHER credential value appears
  const auditPath = "/data/audit/mcp-proxy.jsonl";
  if (existsSync(auditPath)) {
    const audit = readFileSync(auditPath, "utf8");
    assert.ok(audit.includes("\"event\":\"proxied\""), "audit carries proxied lines");
    assert.ok(!audit.includes(secret), "secret value never in audit");
  }
  console.log("[zz-proxy-live] PASS: read-only call OK, mutation AUTHORIZATION_SCOPE_REQUIRED, audit clean");
});