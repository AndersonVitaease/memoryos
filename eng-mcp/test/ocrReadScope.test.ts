// OCR-01 — scope perimeter through the full MCP stack (registerEngineeringTools
// + alias shim): engineering.ocr.read is catalogued as READ, refused with
// AUTHORIZATION_SCOPE_REQUIRED without engineering:ocr:read (engineering:read
// alone is not enough), and reaches the real handler with it (a missing inbox
// file fails closed as PATH_NOT_FOUND — no engine spawn needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";

const READ_ONLY: AuthenticatedSubject = { subject: "ocr-scope-probe", scopes: ["engineering:read"], tokenHash16: "0000000000000000" };
const WITH_OCR: AuthenticatedSubject = { ...READ_ONLY, scopes: ["engineering:read", "engineering:ocr:read"] };
const PROBE_CTX = { mcpReq: { requestState: () => undefined } };

function handlers(subject: AuthenticatedSubject) {
  const mcp = new McpServer(ENGINEERING_SERVER_INFO);
  const repository = new Proxy({}, { get: () => () => Promise.resolve({}) }) as unknown as RepositoryAdapter;
  registerEngineeringTools(mcp, repository, subject, "memoryos");
  installToolAliasCompatibility(mcp.server);
  const server = mcp.server as unknown as { _getRequestHandler(method: string): (request: unknown, ctx: unknown) => Promise<unknown> };
  return { call: server._getRequestHandler("tools/call"), list: server._getRequestHandler("tools/list") };
}
const text = (result: unknown) => ((result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "");

test("ocr.read is listed and gated by engineering:ocr:read", async () => {
  process.env.ENG_MCP_OCR_AUDIT_FILE = "/tmp/ocr-scope-probe-audit.jsonl";
  const denied = handlers(READ_ONLY);
  const names = ((await denied.list({ method: "tools/list", params: {} }, {})) as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
  assert.ok(names.includes("engineering.ocr.read"));
  const refused = await denied.call({ method: "tools/call", params: { name: "engineering.ocr.read", arguments: { path: "/data/ocr-inbox/x.png" } } }, PROBE_CTX);
  assert.equal((refused as { isError?: boolean }).isError, true);
  assert.ok(text(refused).includes("AUTHORIZATION_SCOPE_REQUIRED"));
  const allowed = handlers(WITH_OCR);
  const alias = await allowed.call({ method: "tools/call", params: { name: "engineering_ocr_read", arguments: { path: "/data/ocr-inbox/definitely-missing-ocr-probe.png" } } }, PROBE_CTX);
  assert.equal((alias as { isError?: boolean }).isError, true);
  assert.ok(text(alias).includes("PATH_NOT_FOUND"), text(alias).slice(0, 300));
  assert.ok(!text(alias).includes("AUTHORIZATION_SCOPE_REQUIRED"));
});
