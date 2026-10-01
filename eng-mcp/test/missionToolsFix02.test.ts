// ENG-MCP-TOOLS-FIX-02 — tests for the engineering.mission.verify + engineering.mission.close
// wrappers (src/missionOps.ts). Coverage: strict schemas mirror the plugin handler contract
// (missionId XOR paneId XOR fragment; close flags dryRun/expectBadge/keepPane/cancel/force/
// decisionNote), extra fields are refused, close is WRITE-gated (AUTHORIZATION_SCOPE_REQUIRED
// before any handler work), verify is readable by a read-only bearer and round-trips the real
// handler (MISSION_NOT_FOUND for an unknown mission — the handler never invents state).
// Deterministic: no LLM, no JEV gate (verify never gates; refusals short-circuit), one python
// handler exec that is read-only by construction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import { missionVerifyInputSchema, missionCloseInputSchema } from "../src/missionOps.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";

const READ_ONLY: AuthenticatedSubject = { subject: "tools-fix-02-probe", scopes: ["engineering:read"], tokenHash16: "0000000000000000" };
const READ_WRITE: AuthenticatedSubject = { ...READ_ONLY, scopes: [...READ_ONLY.scopes, "engineering:write"] };

test("missionVerifyInputSchema mirrors the handler contract (strict)", () => {
  assert.ok(missionVerifyInputSchema.safeParse({ missionId: "m1" }).success);
  assert.ok(missionVerifyInputSchema.safeParse({ fragment: "roster" }).success);
  assert.ok(missionVerifyInputSchema.safeParse({ paneId: "w1:p1", timeoutMs: 40000, checks: ["c1"] }).success);
  // campo extra recusado (strict)
  assert.ok(!missionVerifyInputSchema.safeParse({ missionId: "m1", bogus: true }).success);
  assert.ok(!missionVerifyInputSchema.safeParse({ missionId: "m1", checks: [1] }).success);
});

test("missionCloseInputSchema carries the ENG-MCP-TOOLS-FIX-02 flags (strict)", () => {
  assert.ok(missionCloseInputSchema.safeParse({ missionId: "m1", dryRun: true }).success);
  assert.ok(missionCloseInputSchema.safeParse({
    fragment: "fix", expectBadge: true, keepPane: true, decisionNote: "motivo",
  }).success);
  assert.ok(missionCloseInputSchema.safeParse({ missionId: "m1", cancel: true, force: true }).success);
  // campos extra recusados (strict) — inclusive o antigo par que agora é opcional
  assert.ok(!missionCloseInputSchema.safeParse({ missionId: "m1", bogus: 1 }).success);
  assert.ok(!missionCloseInputSchema.safeParse({ checks: ["c1"] }).success);
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

test("engineering.mission.close is WRITE-gated (read-only bearer refused at the boundary)", async () => {
  const call = buildServer(READ_ONLY);
  const result = await call({ method: "tools/call", params: { name: "engineering.mission.close", arguments: { missionId: "m1" } } }, PROBE_CTX);
  assert.ok((result as { isError?: boolean }).isError);
  assert.ok(resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});

test("engineering.mission.verify is READ and round-trips the real handler (MISSION_NOT_FOUND, never invented state)", async () => {
  const call = buildServer(READ_ONLY);
  const result = await call({
    method: "tools/call",
    params: { name: "engineering.mission.verify", arguments: { missionId: "toolsfix02-no-such-mission" } },
  }, PROBE_CTX);
  assert.ok(!resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"), "read bearer must pass the verify gate");
  // ENG-MCP-VERIFY-PYFIX-03: o release gate roda num container hermético sem o plugin
  // montado — lá a recusa honesta é MISSION_OPS_UNAVAILABLE; com o plugin, round-trip real.
  const expected = existsSync("/root/.hermes/plugins/mission-ops/__init__.py") ? "MISSION_NOT_FOUND" : "MISSION_OPS_UNAVAILABLE";
  assert.ok(resultText(result).includes(expected), `unknown mission must be refused honestly (${expected}), got: ${resultText(result).slice(0, 200)}`);
});