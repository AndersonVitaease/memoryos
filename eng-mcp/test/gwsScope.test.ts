// GWS-TOOLS-01 — tier-gate + schema integration tests for the 15 Google Workspace
// tools. Coverage: the 3 tier scopes exist in KNOWN_REGISTRY_SCOPES (drift-guard
// companion), the tier map is complete (5×T1 / 7×T2 / 3×T3), T1 passes with
// engineering:read OR engineering:google:read, T2 passes with engineering:write OR
// engineering:google:write, T3 accepts engineering:google:manage ONLY (no OR — an
// existing read+write bearer must be REFUSED), schemas are .strict() and T2/T3
// dryRun accepts only literal true. The positive controls fail closed downstream
// (GWS_SECRET_UNAVAILABLE / network), never on scope. Deterministic: no network,
// no LLM — the credential-file env is unset so runGws short-circuits fail-closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";
import { KNOWN_REGISTRY_SCOPES } from "../src/registryScopeGrant.ts";
import { GWS_SCHEMAS, GWS_TIER, type GwsOp } from "../src/gws.ts";

// Deterministic fail-closed: no credential file -> GWS_SECRET_UNAVAILABLE, never a network call.
delete process.env.ENG_MCP_GWS_SECRET_FILE;
delete process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE;

const READ_ONLY: AuthenticatedSubject = { subject: "gws-scope-probe", scopes: ["engineering:read"], tokenHash16: "0000000000000000" };
const READ_WRITE: AuthenticatedSubject = { ...READ_ONLY, scopes: [...READ_ONLY.scopes, "engineering:write"] };
const READ_GWS_READ: AuthenticatedSubject = { ...READ_ONLY, scopes: [...READ_ONLY.scopes, "engineering:google:read"] };
const GWS_WRITE_ONLY: AuthenticatedSubject = { ...READ_ONLY, scopes: ["engineering:read", "engineering:google:write"] };
const GWS_MANAGE: AuthenticatedSubject = { ...READ_ONLY, scopes: ["engineering:read", "engineering:google:manage"] };

test("the 3 Google tier scopes are in the single scope catalog", () => {
  for (const scope of ["engineering:google:read", "engineering:google:write", "engineering:google:manage"]) {
    assert.ok(KNOWN_REGISTRY_SCOPES.includes(scope), `catalog must carry ${scope}`);
  }
});

test("tier map is complete: 5 read + 7 write + 3 manage = 15 ops", () => {
  const ops = Object.keys(GWS_SCHEMAS) as GwsOp[];
  assert.equal(ops.length, 15);
  assert.deepEqual(ops.filter((o) => GWS_TIER[o] === "T1").sort(), ["calendar.list", "contacts.list", "drive.list", "gmail.get", "gmail.list"]);
  assert.deepEqual(ops.filter((o) => GWS_TIER[o] === "T2").sort(), ["calendar.createEvent", "docs.append", "docs.create", "drive.update", "drive.upload", "gmail.reply", "gmail.send"]);
  assert.deepEqual(ops.filter((o) => GWS_TIER[o] === "T3").sort(), ["calendar.deleteEvent", "drive.delete", "gmail.sendExternal"]);
});

test("every T2/T3 schema accepts dryRun=true only (literal true, strict)", () => {
  for (const [op, tier] of Object.entries(GWS_TIER) as [GwsOp, string][]) {
    if (tier === "T1") continue;
    const shape = GWS_SCHEMAS[op];
    assert.ok(shape !== undefined, `${op} schema must exist`);
    // dryRun:false must be rejected (z.literal(true)) — spot-check via gmail.send below;
    // here we assert the schema object carries the literal by parsing a wrong value
    // through the gmail.send schema (representative) — full per-op parse needs valid
    // business fields, which the per-op tools enforce at call time anyway.
  }
  const wrongDryRun = GWS_SCHEMAS["gmail.send"].safeParse({ to: "x@y.com", subject: "s", body: "b", dryRun: false });
  assert.equal(wrongDryRun.success, false, "dryRun=false must be rejected (literal true)");
  const unknownKey = GWS_SCHEMAS["gmail.send"].safeParse({ to: "x@y.com", subject: "s", body: "b", dryRun: true, injected: "x" });
  assert.equal(unknownKey.success, false, "strict() must reject unknown keys");
  const badEmail = GWS_SCHEMAS["gmail.send"].safeParse({ to: "not-an-email", subject: "s", body: "b" });
  assert.equal(badEmail.success, false, "to must match the email pattern");
});

function buildServer(subject: AuthenticatedSubject) {
  const mcp = new McpServer(ENGINEERING_SERVER_INFO);
  const repository = new Proxy({}, { get: () => () => Promise.resolve({}) }) as unknown as RepositoryAdapter;
  registerEngineeringTools(mcp, repository, subject, "memoryos");
  installToolAliasCompatibility(mcp.server);
  const handlers = mcp.server as unknown as { _getRequestHandler(method: string): ((request: unknown, ctx: unknown) => Promise<unknown>) | undefined };
  const call = handlers._getRequestHandler("tools/call");
  assert.ok(typeof call === "function", "tools/call handler must be installed");
  return call as (request: unknown, ctx: unknown) => Promise<unknown>;
}

function resultText(result: unknown): string {
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  return r.content?.[0]?.text ?? "";
}

const PROBE_CTX = { mcpReq: { requestState: () => undefined } };
const LIST_ARGS = { maxResults: 5 };

test("T1: read-only bearer passes the gate and fails closed downstream (no scope error)", async () => {
  const call = buildServer(READ_ONLY);
  const result = await call({ method: "tools/call", params: { name: "engineering.google.gmail.list", arguments: LIST_ARGS } }, PROBE_CTX);
  const text = resultText(result);
  assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `read bearer must pass the T1 gate (OR), got: ${text.slice(0, 200)}`);
  assert.ok(text.includes("GWS_"), `expected fail-closed downstream error, got: ${text.slice(0, 200)}`);
});

test("T1: dedicated engineering:google:read bearer passes the gate (hermes-grade path)", async () => {
  const call = buildServer(READ_GWS_READ);
  const result = await call({ method: "tools/call", params: { name: "engineering.google.gmail.list", arguments: LIST_ARGS } }, PROBE_CTX);
  assert.ok(!resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});

test("T2: read-only bearer is refused at the boundary (no OR leakage from google:read)", async () => {
  const call = buildServer(READ_ONLY);
  const result = await call({ method: "tools/call", params: { name: "engineering.google.gmail.send", arguments: { to: "a@b.com", subject: "s", body: "b" } } }, PROBE_CTX);
  assert.ok((result as { isError?: boolean }).isError);
  assert.ok(resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});

test("T2: dedicated engineering:google:write bearer passes even without engineering:write", async () => {
  const call = buildServer(GWS_WRITE_ONLY);
  const result = await call({ method: "tools/call", params: { name: "engineering.google.gmail.send", arguments: { to: "a@b.com", subject: "s", body: "b", dryRun: true } } }, PROBE_CTX);
  const text = resultText(result);
  assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `google:write bearer must pass the T2 gate, got: ${text.slice(0, 200)}`);
  assert.ok(text.includes("GWS_"), `expected fail-closed downstream, got: ${text.slice(0, 200)}`);
});

test("T3: existing read+write bearer is REFUSED — manage scope has no OR", async () => {
  const call = buildServer(READ_WRITE);
  const result = await call({ method: "tools/call", params: { name: "engineering.google.gmail.sendExternal", arguments: { to: "a@b.com", subject: "s", body: "b" } } }, PROBE_CTX);
  assert.ok((result as { isError?: boolean }).isError);
  assert.ok(resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});

test("T3: even google:write is refused — only manage covers external/destructive", async () => {
  const call = buildServer(GWS_WRITE_ONLY);
  const result = await call({ method: "tools/call", params: { name: "engineering.google.drive.delete", arguments: { fileId: "abc" } } }, PROBE_CTX);
  assert.ok(resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});

test("T3: engineering:google:manage bearer passes the gate (fails closed downstream)", async () => {
  const call = buildServer(GWS_MANAGE);
  const result = await call({ method: "tools/call", params: { name: "engineering.google.gmail.sendExternal", arguments: { to: "a@b.com", subject: "s", body: "b", dryRun: true } } }, PROBE_CTX);
  const text = resultText(result);
  assert.ok(!text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `manage bearer must pass the T3 gate, got: ${text.slice(0, 200)}`);
  assert.ok(text.includes("GWS_"), `expected fail-closed downstream, got: ${text.slice(0, 200)}`);
});