// MEMORY-CAPTURE-SCOPE-01 — dedicated engineering:memory:capture scope for
// engineering.memory.capture (same design as PHOTOPEA-TOKEN-01 image:edit and the
// judge:read grant already in production). Coverage: the scope is in the single
// catalog; the pure predicate accepts memory:capture OR the broad write (compat) and
// nothing else (judge:read alone is NOT enough — zero coupling to the judge grant);
// the tools/call boundary refuses read-only and read+judge:read bearers with
// AUTHORIZATION_SCOPE_REQUIRED before any gate/store work; the capture handler is
// wired to the predicate (structural pin — the positive path would reach the real
// memory store, so it is proven post-deploy E2E, not here).
// Deterministic: no network, no LLM, no store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools, canCaptureMemory } from "../src/tools.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";
import { KNOWN_REGISTRY_SCOPES } from "../src/registryScopeGrant.ts";

const READ_ONLY: AuthenticatedSubject = { subject: "memory-capture-scope-probe", scopes: ["engineering:read"], tokenHash16: "0000000000000000" };
const READ_JUDGE: AuthenticatedSubject = { ...READ_ONLY, scopes: [...READ_ONLY.scopes, "engineering:judge:read"] };

test("engineering:memory:capture is in the single scope catalog", () => {
  assert.ok(KNOWN_REGISTRY_SCOPES.includes("engineering:memory:capture"));
});

test("predicate: memory:capture OR write authorizes; nothing / read / judge:read does not", () => {
  assert.equal(canCaptureMemory([]), false);
  assert.equal(canCaptureMemory(["engineering:read"]), false);
  assert.equal(canCaptureMemory(["engineering:read", "engineering:judge:read"]), false);
  assert.equal(canCaptureMemory(["engineering:read", "engineering:write"]), true, "compat: broad write keeps working");
  assert.equal(canCaptureMemory(["engineering:read", "engineering:memory:capture"]), true, "dedicated scope authorizes");
  assert.equal(canCaptureMemory(["engineering:memory:capture"]), true);
  assert.equal(canCaptureMemory(["engineering:memory"]), false, "no prefix matching");
});

function buildServer(subject: AuthenticatedSubject) {
  const mcp = new McpServer(ENGINEERING_SERVER_INFO);
  const repository = new Proxy({}, { get: () => () => Promise.resolve({}) }) as unknown as RepositoryAdapter;
  registerEngineeringTools(mcp, repository, subject, "memoryos");
  installToolAliasCompatibility(mcp.server);
  const handlers = mcp.server as unknown as { _getRequestHandler(method: string): ((request: unknown, ctx: unknown) => Promise<unknown>) | undefined };
  const call = handlers._getRequestHandler("tools/call");
  assert.ok(typeof call === "function");
  return call as (request: unknown, ctx: unknown) => Promise<unknown>;
}
const text = (r: unknown) => (r as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "";
const CTX = { mcpReq: { requestState: () => undefined } };
const ARGS = { summary: "MEMORY-CAPTURE-SCOPE-01 probe — never reaches the store", projectId: "memoryos" };

for (const [label, subject] of [["read-only", READ_ONLY], ["read+judge:read", READ_JUDGE]] as const) {
  test(`${label} bearer is refused at the boundary with AUTHORIZATION_SCOPE_REQUIRED`, async () => {
    const result = await buildServer(subject)({ method: "tools/call", params: { name: "engineering.memory.capture", arguments: ARGS } }, CTX);
    assert.ok((result as { isError?: boolean }).isError);
    assert.ok(text(result).includes("AUTHORIZATION_SCOPE_REQUIRED"), text(result).slice(0, 200));
  });
}

test("structural: memory.capture handler gates on canCaptureMemory (not bare requireWrite)", () => {
  const src = readFileSync(new URL("../src/tools.ts", import.meta.url), "utf8");
  const start = src.indexOf('register("engineering.memory.capture"');
  assert.ok(start > 0);
  const handler = src.slice(src.indexOf("async (input) => {", start), src.indexOf("gateCapture(", start));
  assert.match(handler, /requireMemoryCaptureOrWrite\(\)/);
  assert.doesNotMatch(handler, /requireWrite\(\)/);
});
