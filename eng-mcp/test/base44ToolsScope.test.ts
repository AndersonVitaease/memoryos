// BASE44-CLI-01 — scope-gate integration tests for the two new base44 tools
// through the full MCP server stack (registerEngineeringTools + envelope).
// Coverage: the tools appear in tools/list (catalog 103 -> 106), both are
// refused with AUTHORIZATION_SCOPE_REQUIRED without their base44:* scopes, and
// with the scopes they fail closed into canonical, side-effect-free paths
// (unset env source -> BLOCKED; unknown function -> allowlist refusal) without
// ever spawning the CLI. Deterministic: no network, no LLM, no SSH/shell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";

const SUBJECT_WITHOUT: AuthenticatedSubject = { subject: "base44-scope-probe", scopes: ["engineering:read", "engineering:write"], tokenHash16: "0000000000000000" };
const SUBJECT_WITH: AuthenticatedSubject = { ...SUBJECT_WITHOUT, scopes: [...SUBJECT_WITHOUT.scopes, "base44:secret:write", "base44:function:deploy"] };

function buildServer(subject: AuthenticatedSubject) {
  const mcp = new McpServer(ENGINEERING_SERVER_INFO);
  const repository = new Proxy({}, { get: () => () => Promise.resolve({}) }) as unknown as RepositoryAdapter;
  registerEngineeringTools(mcp, repository, subject, "memoryos");
  installToolAliasCompatibility(mcp.server);
  const handlers = mcp.server as unknown as { _getRequestHandler(method: string): ((request: unknown, ctx: unknown) => Promise<unknown>) | undefined };
  const call = handlers._getRequestHandler("tools/call");
  const list = handlers._getRequestHandler("tools/list");
  assert.ok(typeof call === "function", "tools/call handler must be installed");
  assert.ok(typeof list === "function", "tools/list handler must be installed");
  return { call: call as (request: unknown, ctx: unknown) => Promise<unknown>, list: list as (request: unknown, ctx: unknown) => Promise<unknown> };
}

async function listNames(list: (request: unknown, ctx: unknown) => Promise<unknown>): Promise<string[]> {
  const result = (await list({ method: "tools/list", params: {} }, {})) as { tools: Array<{ name: string }> };
  return result.tools.map((tool) => tool.name);
}

function resultText(result: unknown): string {
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  return r.content?.[0]?.text ?? "";
}

const PROBE_CTX = { mcpReq: { requestState: () => undefined } };

test("tools/list carries both base44 tools (catalog 106)", async () => {
  const { list } = buildServer(SUBJECT_WITH);
  const names = await listNames(list);
  assert.equal(names.length, 106);
  assert.ok(names.includes("engineering.base44.secret.write"));
  assert.ok(names.includes("engineering.base44.function.deploy"));
});

test("without the base44 scopes, secret.write and function.deploy are refused before any work", async () => {
  const { call } = buildServer(SUBJECT_WITHOUT);
  const secretCall = await call(
    { method: "tools/call", params: { name: "engineering.base44.secret.write", arguments: { secretName: "AGENT_MEMORY_MCP_SECRET", source: { kind: "env", name: "ANY_NAME" }, acknowledgeWrite: true } } },
    PROBE_CTX,
  );
  assert.ok((secretCall as { isError?: boolean }).isError);
  assert.ok(resultText(secretCall).includes("AUTHORIZATION_SCOPE_REQUIRED"));
  const deployCall = await call(
    { method: "tools/call", params: { name: "engineering.base44.function.deploy", arguments: { function: "agentMemoryBridge", acknowledgeWrite: true } } },
    PROBE_CTX,
  );
  assert.ok((deployCall as { isError?: boolean }).isError);
  assert.ok(resultText(deployCall).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});

test("with the scopes, an unset env secret source degrades to a canonical BLOCKED with no CLI call", async () => {
  const { call } = buildServer(SUBJECT_WITH);
  const result = await call(
    { method: "tools/call", params: { name: "engineering.base44.secret.write", arguments: { secretName: "AGENT_MEMORY_MCP_SECRET", source: { kind: "env", name: "BASE44_SCOPE_TEST_UNSET_VAR" }, acknowledgeWrite: true } } },
    PROBE_CTX,
  );
  assert.ok(!(result as { isError?: boolean }).isError, `unexpected error: ${resultText(result)}`);
  const text = resultText(result);
  assert.ok(text.includes("BLOCKED"), `expected BLOCKED status, got: ${text}`);
  assert.ok(text.includes("BASE44_SOURCE_EMPTY"), `expected the canonical blocker, got: ${text}`);
});

test("with the scopes, a non-allowlisted function is refused by the allowlist gate itself", async () => {
  const { call } = buildServer(SUBJECT_WITH);
  const result = await call(
    { method: "tools/call", params: { name: "engineering.base44.function.deploy", arguments: { function: "notTheBridge", acknowledgeWrite: true } } },
    PROBE_CTX,
  );
  assert.ok((result as { isError?: boolean }).isError);
  assert.ok(resultText(result).includes("BASE44_FUNCTION_NOT_ALLOWED"));
});