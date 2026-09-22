import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools, resolveToolAlias } from "../src/tools.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";

// GH-03 TOOL-ALIAS-COMPAT - same-session registry stability for sanitized tool names.
// Deterministic: no network, no LLM, no SSH/shell, zero mutation. All fake values are obviously synthetic.
// Mirrors the client behavior observed in production: Kilo/Goose surface "eng-mcp__engineering_git_status"
// (dots sanitized to underscores) and send the SANITIZED name back to the server, which must resolve it
// to the canonical dotted tool WITHOUT changing tools/list.

const SUBJECT: AuthenticatedSubject = { subject: "alias-compat-probe", scopes: ["engineering:read", "engineering:write", "engineering:verify", "engineering:git", "engineering:release", "engineering:distribution:publish"], tokenHash16: "0000000000000000" };

function buildServer() {
  const mcp = new McpServer(ENGINEERING_SERVER_INFO);
  const repository = new Proxy({}, { get: () => () => Promise.resolve({}) }) as unknown as RepositoryAdapter;
  registerEngineeringTools(mcp, repository, SUBJECT, "memoryos");
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

// Direct-handler invocation context: the HTTP runtime supplies a real mcpReq; this probe answers the one field the wrapped tools/call chain reads (SDK _invokeInputRequiredCapableHandler).
const PROBE_CTX = { mcpReq: { requestState: () => undefined } };

test("GH-03 alias map: every canonical tool resolves its sanitized alias, aliases are unique and never listed", async () => {
  const { list } = buildServer();
  const names = await listNames(list);
  assert.equal(names.length, 105);
  const aliases = names.map((name) => name.replaceAll(".", "_"));
  assert.equal(new Set(aliases).size, aliases.length, "sanitized aliases must be collision-free");
  for (let i = 0; i < names.length; i++) assert.equal(resolveToolAlias(aliases[i]), names[i]);
  assert.equal(names.filter((name) => resolveToolAlias(name) !== null).length, 0, "canonical names must never be treated as aliases");
  assert.equal(names.filter((name) => aliases.includes(name)).length, 0, "tools/list must never contain alias entries");
});

test("GH-03 same-session stability: 24 alternating sanitized calls, zero Tool not found, catalog unchanged", async () => {
  const { call, list } = buildServer();
  const namesBefore = await listNames(list);
  assert.equal(namesBefore.length, 105);
  const targets = ["engineering.git.status", "engineering.file.read", "engineering.code.search"];
  const sanitized = targets.map((name) => name.replaceAll(".", "_"));
  const validArgs: Record<string, Record<string, unknown>> = { "engineering.git.status": {}, "engineering.file.read": { path: "src/tools.ts" }, "engineering.code.search": { query: "AgentRuntime" } };
  for (let i = 0; i < 24; i++) {
    const result = await call({ method: "tools/call", params: { name: sanitized[i % 3], arguments: validArgs[targets[i % 3]] } }, PROBE_CTX);
    const r = result as { isError?: boolean };
    assert.ok(!r.isError, `call ${i} (${sanitized[i % 3]}) must not error, got: ${resultText(result)}`);
    assert.ok(resultText(result).length > 0, `call ${i} must return content`);
  }
  const namesAfter = await listNames(list);
  assert.equal(namesAfter.length, 105, "catalog size must stay stable within the same session");
  assert.deepEqual([...namesAfter].sort(), [...namesBefore].sort());
});

test("GH-03: canonical dotted names keep working and unknown names still fail closed", async () => {
  const { call } = buildServer();
  const direct = await call({ method: "tools/call", params: { name: "engineering.git.status", arguments: {} } }, PROBE_CTX);
  assert.ok(!(direct as { isError?: boolean }).isError, "canonical dotted name must keep working");
  const natural = resolveToolAlias("engineering_git_remote_compare");
  assert.equal(natural, "engineering.git.remote_compare", "natural-underscore canonical names must keep a working alias");
  await assert.rejects(
    () => call({ method: "tools/call", params: { name: "engineering.definitely_not_a_tool", arguments: {} } }, PROBE_CTX),
    /not found/,
    "unknown tool names must still fail with the original error",
  );
});
