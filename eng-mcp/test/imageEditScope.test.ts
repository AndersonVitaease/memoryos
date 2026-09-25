// PHOTOPEA-TOKEN-01 — scope-gate integration tests for the engineering.image.edit
// dedicated surgical scope (operator-approved Option B, 2026-09-25). Coverage: the
// dedicated engineering:image:edit scope exists in KNOWN_REGISTRY_SCOPES, a bearer
// WITHOUT write AND image:edit is refused with AUTHORIZATION_SCOPE_REQUIRED before
// any relay work, a read+image:edit bearer passes the gate (hermes-grade path), and
// an existing read+write bearer keeps passing (zero regression). The positive
// controls fail closed downstream (offline relay / schema), never on scope.
// Deterministic: no network, no LLM, no executor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";
import { KNOWN_REGISTRY_SCOPES } from "../src/registryScopeGrant.ts";

const READ_ONLY: AuthenticatedSubject = { subject: "image-edit-scope-probe", scopes: ["engineering:read"], tokenHash16: "0000000000000000" };
const READ_WRITE: AuthenticatedSubject = { ...READ_ONLY, scopes: [...READ_ONLY.scopes, "engineering:write"] };
const READ_IMAGE_EDIT: AuthenticatedSubject = { ...READ_ONLY, scopes: [...READ_ONLY.scopes, "engineering:image:edit"] };

test("engineering:image:edit is in the single scope catalog", () => {
  assert.ok(KNOWN_REGISTRY_SCOPES.includes("engineering:image:edit"), "catalog must carry the dedicated image:edit scope");
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
const PROBE_ARGS = { action: "inspect" };

test("read-only bearer is refused at the boundary before any relay work", async () => {
  const call = buildServer(READ_ONLY);
  const result = await call({ method: "tools/call", params: { name: "engineering.image.edit", arguments: PROBE_ARGS } }, PROBE_CTX);
  assert.ok((result as { isError?: boolean }).isError);
  assert.ok(resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});

test("existing read+write bearer keeps passing the gate (zero regression)", async () => {
  const call = buildServer(READ_WRITE);
  const result = await call({ method: "tools/call", params: { name: "engineering.image.edit", arguments: PROBE_ARGS } }, PROBE_CTX);
  assert.ok(!resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"), `write subject must not be refused on scope, got: ${resultText(result).slice(0, 200)}`);
});

test("read + dedicated engineering:image:edit bearer passes the gate (hermes-grade path)", async () => {
  const call = buildServer(READ_IMAGE_EDIT);
  const result = await call({ method: "tools/call", params: { name: "engineering.image.edit", arguments: PROBE_ARGS } }, PROBE_CTX);
  assert.ok(!resultText(result).includes("AUTHORIZATION_SCOPE_REQUIRED"), `granted subject must not be refused on scope, got: ${resultText(result).slice(0, 200)}`);
});