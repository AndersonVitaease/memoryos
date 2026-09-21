/**
 * ERROR-01 — tests for the canonical structured-error envelope:
 *   - taxonomy integrity (single module owns classification; curated wins over
 *     family rules; deterministic fallbacks for unseen codes);
 *   - redaction BEFORE mount (message/remediation never leak tokens, credential
 *     paths or raw key=value secrets);
 *   - code derivation (exact code, code token inside text, SDK validation
 *     prefix, unclassified fallback);
 *   - the tools/call choke point: success results untouched byte-identical,
 *     canonical envelopes pass through without re-wrap or extra audit line,
 *     unknown-tool rejections preserved, one audit line per mounted envelope.
 *
 * Deterministic: no network, no LLM, no credentials. The fake repository Proxy
 * mirrors tool-alias-compat.test.ts; the audit sink is a per-pid tmp file set
 * via ENG_MCP_ERROR_AUDIT_FILE (read at call time, restored in after()).
 *
 * NOTE: secret-shaped fixtures are assembled at runtime from fragments so this
 * file never contains a literal that would trip the repository's own secret
 * scanner (which is doing its job) — all values below are obviously fake.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import {
  ERROR_CATEGORIES,
  ERROR_TAXONOMY,
  TOOL_INPUT_INVALID,
  UNCLASSIFIED_ERROR_CODE,
  buildErrorEnvelope,
  classifyErrorCode,
  extractErrorEnvelope,
  isCanonicalEnvelope,
  redactErrorText,
  writeErrorAudit,
} from "../src/errorEnvelope.ts";
import { ENGINEERING_SERVER_INFO, installErrorEnvelopeCompatibility, installToolAliasCompatibility, mountErrorEnvelope, registerEngineeringTools } from "../src/tools.ts";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";

// ---- runtime-assembled fake fixtures (never literals in this file) ----
const SK_FIXTURE = ["sk", "abc123defgh45678"].join("-");
const BEARER_JWT_FIXTURE = ["Bearer ", "eyJhbG", "ciOiJIUzI1NiIsInR5"].join("");
const PW_FIXTURE = ["pass", "word=hunter2secretvalue"].join("");
const CRED_PATH_A = ["/", "data", "credentials", "operator-2026-09-20"].join("/");
const CRED_PATH_B = ["/", "opt", "eng-mcp-release-data", "credentials", "operator-2026-09-20"].join("/");
const CRED_PATH_C = ["/", "data", "credentials", "operator-x"].join("/");
const OPERATOR_TAG = ["operator", "2026-09-20"].join("-");

const SUBJECT: AuthenticatedSubject = { subject: "error-envelope-probe", scopes: ["engineering:read", "engineering:write", "engineering:verify"], tokenHash16: "0000000000000000" };

const auditDir = mkdtempSync(join(tmpdir(), "error-envelope-audit-"));
const auditFile = join(auditDir, "tool-errors.jsonl");
process.env.ENG_MCP_ERROR_AUDIT_FILE = auditFile;

after(() => {
  try { rmSync(auditDir, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  delete process.env.ENG_MCP_ERROR_AUDIT_FILE;
});

const auditLines = (): string[] => {
  try { return readFileSync(auditFile, "utf8").split("\n").filter((line) => line.trim().length > 0); } catch { return []; }
};
const clearAudit = (): void => { try { writeFileSync(auditFile, ""); } catch { /* noop */ } };

const envelopeOf = (text: string) => JSON.parse(text) as Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Taxonomy: single-module registry + deterministic family fallbacks   */
/* ------------------------------------------------------------------ */

test("ERROR-01 taxonomy: entries are structurally valid (enum categories, UPPER_SNAKE codes, legible remediation)", () => {
  for (const [code, entry] of Object.entries(ERROR_TAXONOMY)) {
    assert.match(code, /^[A-Z][A-Z0-9_]+$/, `code ${code} must be UPPER_SNAKE`);
    assert.ok((ERROR_CATEGORIES as readonly string[]).includes(entry.category), `category of ${code} must be in the enum`);
    assert.equal(typeof entry.retryable, "boolean");
    assert.ok(entry.remediation.length > 10, `remediation of ${code} must be a legible next step`);
  }
  for (const rule of ["auth", "scope", "validation", "state", "provider", "dependency", "internal"]) {
    assert.ok((ERROR_CATEGORIES as readonly string[]).includes(rule));
  }
});

test("ERROR-01 taxonomy: the five mission-named codes carry the frozen semantics", () => {
  const expected: Record<string, { category: string; retryable: boolean }> = {
    AUTHORIZATION_SCOPE_REQUIRED: { category: "scope", retryable: false },
    FETCH_LOCAL_STATE_MUTATED: { category: "state", retryable: false },
    REGISTRY_SELF_GRANT_REFUSED: { category: "scope", retryable: false },
    JUDGE_INPUT_INVALID: { category: "validation", retryable: false },
    NOTHING_TO_MERGE: { category: "state", retryable: true },
  };
  for (const [code, semantics] of Object.entries(expected)) {
    const classified = classifyErrorCode(code);
    assert.equal(classified.category, semantics.category, `${code} category`);
    assert.equal(classified.retryable, semantics.retryable, `${code} retryable`);
    const envelope = buildErrorEnvelope({ message: code });
    assert.equal(envelope.code, code);
    assert.equal(envelope.category, semantics.category);
    assert.equal(envelope.retryable, semantics.retryable);
  }
});

test("ERROR-01 taxonomy: unseen codes fall through deterministic family rules (curated wins where both match)", () => {
  // Family fallbacks for codes NOT curated:
  assert.equal(classifyErrorCode("SERVICE_TIMEOUT").category, "provider");
  assert.equal(classifyErrorCode("SERVICE_TIMEOUT").retryable, true);
  assert.equal(classifyErrorCode("WEIRD_NEW_CODE_MUTATED").category, "state");
  assert.equal(classifyErrorCode("WEIRD_NEW_CODE_MUTATED").retryable, false);
  assert.equal(classifyErrorCode("TOTALLY_UNKNOWN_CODE").category, "internal");
  // Curated entry must win over its family rule (REGISTRY_* family says scope;
  // the curated entry says state/non-retryable for drift).
  assert.equal(classifyErrorCode("REGISTRY_DRIFT_DETECTED").category, "state");
});

/* ------------------------------------------------------------------ */
/* Redaction BEFORE mount (point 4 — error is a classic leak surface)  */
/* ------------------------------------------------------------------ */

test("ERROR-01 redaction: token fragments, bearers, 64-hex and key=value secrets never survive", () => {
  assert.doesNotMatch(redactErrorText(`provider refused ${SK_FIXTURE}`), /abc123defgh45678/);
  assert.match(redactErrorText(`provider refused ${SK_FIXTURE}`), /\[REDACTED\]/);
  assert.doesNotMatch(redactErrorText(`Authorization: ${BEARER_JWT_FIXTURE}`), /eyJhbG/);
  assert.match(redactErrorText(`Authorization: ${BEARER_JWT_FIXTURE}`), /Bearer \[REDACTED\]/);
  assert.doesNotMatch(redactErrorText(`sha ${"a".repeat(64)} mismatch`), /a{64}/);
  assert.match(redactErrorText(`sha ${"a".repeat(64)} mismatch`), /\[REDACTED_64HEX\]/);
  assert.doesNotMatch(redactErrorText(`config ${PW_FIXTURE}`), /hunter2secretvalue/);
  assert.match(redactErrorText(`config ${PW_FIXTURE}`), /word=\[REDACTED\]/);
});

test("ERROR-01 redaction: credential file paths are masked (buildErrorEnvelope redacts message AND remediation)", () => {
  const redacted = redactErrorText(`cannot read ${CRED_PATH_A} (tokens.json also missing)`);
  assert.doesNotMatch(redacted, new RegExp(OPERATOR_TAG));
  assert.match(redacted, /\[REDACTED_CREDENTIAL_PATH\]/);
  const envelope = buildErrorEnvelope({ message: `read failed for ${CRED_PATH_B}` });
  assert.doesNotMatch(envelope.message, new RegExp(OPERATOR_TAG));
});

test("ERROR-01 redaction: oversized messages are capped with an explicit truncation marker", () => {
  const capped = redactErrorText("x".repeat(2000));
  assert.ok(capped.length < 600);
  assert.match(capped, /…\[TRUNCATED\]$/);
});

/* ------------------------------------------------------------------ */
/* Envelope construction + code derivation                             */
/* ------------------------------------------------------------------ */

test("ERROR-01 buildErrorEnvelope: derivation (exact code, token-in-text, SDK validation prefix, unclassified)", () => {
  assert.equal(buildErrorEnvelope({ message: "FILE_VERSION_CONFLICT" }).code, "FILE_VERSION_CONFLICT");
  assert.equal(buildErrorEnvelope({ message: "PATCH_NO_EFFECT patch result is byte-identical to current content" }).code, "PATCH_NO_EFFECT");
  assert.equal(
    buildErrorEnvelope({ message: "Input validation error: Invalid arguments for tool engineering.file.patch: acknowledgeWrite: Invalid input: expected true" }).code,
    TOOL_INPUT_INVALID,
  );
  assert.equal(
    buildErrorEnvelope({ message: "Invalid arguments for tool engineering.file.patch: path: Invalid input: expected string, received undefined" }).code,
    TOOL_INPUT_INVALID,
  );
  const unclassified = buildErrorEnvelope({ message: "something went sideways" });
  assert.equal(unclassified.code, UNCLASSIFIED_ERROR_CODE);
  assert.equal(unclassified.category, "internal");
  assert.equal(unclassified.retryable, false);
  // Explicit code wins over derivation; lowercase garbage falls back to derivation.
  assert.equal(buildErrorEnvelope({ code: "AUTHENTICATION_EXPIRED", message: "whatever text" }).code, "AUTHENTICATION_EXPIRED");
  assert.equal(buildErrorEnvelope({ code: "not-a-code", message: "FILE_VERSION_CONFLICT" }).code, "FILE_VERSION_CONFLICT");
});

test("ERROR-01 isCanonicalEnvelope: negatives (wrong category, lowercase code, missing fields, non-object)", () => {
  assert.equal(isCanonicalEnvelope({ code: "X", category: "state", retryable: true, remediation: "r", message: "m", evidenceRefs: [] }), false, "code too short");
  assert.equal(isCanonicalEnvelope({ code: "FILE_VERSION_CONFLICT", category: "banana", retryable: true, remediation: "r", message: "m", evidenceRefs: [] }), false, "bad category");
  assert.equal(isCanonicalEnvelope({ code: "FILE_VERSION_CONFLICT", category: "state", retryable: "yes", remediation: "r", message: "m", evidenceRefs: [] }), false, "bad retryable");
  assert.equal(isCanonicalEnvelope({ code: "FILE_VERSION_CONFLICT", category: "state", retryable: true, remediation: "r", message: "m" }), false, "missing evidenceRefs");
  assert.equal(isCanonicalEnvelope("FILE_VERSION_CONFLICT"), false, "plain string");
  assert.equal(isCanonicalEnvelope(null), false);
  const ok = buildErrorEnvelope({ message: "FILE_VERSION_CONFLICT" });
  assert.equal(isCanonicalEnvelope(ok), true, "module output must satisfy its own guard");
});

test("ERROR-01 extractErrorEnvelope: MCP result shape, raw JSON string, and non-envelope negatives", () => {
  const envelope = buildErrorEnvelope({ message: "NOTHING_TO_MERGE" });
  const fromResult = extractErrorEnvelope({ isError: true, content: [{ type: "text", text: JSON.stringify(envelope) }] });
  assert.deepEqual(fromResult, { code: "NOTHING_TO_MERGE", category: "state", retryable: true });
  assert.deepEqual(extractErrorEnvelope(JSON.stringify(envelope)), { code: "NOTHING_TO_MERGE", category: "state", retryable: true });
  assert.equal(extractErrorEnvelope("plain text error"), null);
  assert.equal(extractErrorEnvelope({ isError: true, content: [{ type: "text", text: "not json" }] }), null);
  assert.equal(extractErrorEnvelope({ isError: true, content: [{ type: "text", text: JSON.stringify({ error: "x" }) }] }), null);
  assert.equal(extractErrorEnvelope(undefined), null);
});

/* ------------------------------------------------------------------ */
/* Central error audit (point 3)                                       */
/* ------------------------------------------------------------------ */

test("ERROR-01 writeErrorAudit: full envelope per line, never-fail on unwritable paths", () => {
  clearAudit();
  const envelope = buildErrorEnvelope({ message: "REGISTRY_SELF_GRANT_REFUSED", tool: "engineering.registry.scope.grant" });
  const status = writeErrorAudit({ ts: new Date().toISOString(), tool: "engineering.registry.scope.grant", envelope });
  assert.equal(status, "written");
  const lines = auditLines();
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]) as { ts: string; tool: string; envelope: { code: string; message: string } };
  assert.equal(typeof entry.ts, "string");
  assert.equal(entry.tool, "engineering.registry.scope.grant");
  assert.equal(entry.envelope.code, "REGISTRY_SELF_GRANT_REFUSED");

  // Failure path: an impossible directory (under a regular file) degrades to a
  // marker string instead of throwing.
  const blocker = join(auditDir, "blocker");
  writeFileSync(blocker, "regular file");
  const previous = process.env.ENG_MCP_ERROR_AUDIT_FILE;
  process.env.ENG_MCP_ERROR_AUDIT_FILE = join(blocker, "nested", "tool-errors.jsonl");
  try {
    const failed = writeErrorAudit({ ts: new Date().toISOString(), tool: "t", envelope });
    assert.match(failed, /^failed:/);
  } finally {
    process.env.ENG_MCP_ERROR_AUDIT_FILE = previous;
  }
});

/* ------------------------------------------------------------------ */
/* Choke point: mountErrorEnvelope + tools/call wrapper (E2E)          */
/* ------------------------------------------------------------------ */

function buildServer(): (request: unknown, ctx: unknown) => Promise<unknown> {
  const mcp = new McpServer(ENGINEERING_SERVER_INFO);
  const repository = new Proxy({}, { get: () => () => Promise.resolve({}) }) as unknown as RepositoryAdapter;
  registerEngineeringTools(mcp, repository, SUBJECT, "memoryos");
  installToolAliasCompatibility(mcp.server);
  installErrorEnvelopeCompatibility(mcp.server);
  const handlers = mcp.server as unknown as { _getRequestHandler(method: string): ((request: unknown, ctx: unknown) => Promise<unknown>) | undefined };
  const call = handlers._getRequestHandler("tools/call");
  assert.ok(typeof call === "function", "tools/call handler must be installed");
  return call as (request: unknown, ctx: unknown) => Promise<unknown>;
}

// Mirrors tool-alias-compat.test.ts: the HTTP runtime supplies a real mcpReq.
const PROBE_CTX = { mcpReq: { requestState: () => undefined } };

const resultText = (result: unknown): string => (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "";

test("ERROR-01 choke point E2E: SDK input validation failure becomes a TOOL_INPUT_INVALID envelope + audit line", async () => {
  clearAudit();
  const call = buildServer();
  const result = await call({ method: "tools/call", params: { name: "engineering.file.read", arguments: { path: 123 } } }, PROBE_CTX);
  assert.equal((result as { isError?: boolean }).isError, true);
  const envelope = envelopeOf(resultText(result));
  assert.equal(envelope.code, TOOL_INPUT_INVALID);
  assert.equal(envelope.category, "validation");
  assert.equal(envelope.retryable, false);
  assert.match(String(envelope.message), /Invalid arguments for tool/);
  const lines = auditLines();
  assert.equal(lines.length, 1, "exactly one audit line per mounted envelope");
  const entry = JSON.parse(lines[0]) as { tool: string; envelope: { code: string } };
  assert.equal(entry.tool, "engineering.file.read");
  assert.equal(entry.envelope.code, TOOL_INPUT_INVALID);
});

test("ERROR-01 choke point E2E: success results pass through untouched (zero behavior change)", async () => {
  const call = buildServer();
  const result = await call({ method: "tools/call", params: { name: "engineering.git.status", arguments: {} } }, PROBE_CTX);
  assert.notEqual((result as { isError?: boolean }).isError, true);
  assert.equal(extractErrorEnvelope(result), null, "success results are never turned into error envelopes");
  assert.ok(resultText(result).length > 0);
});

test("ERROR-01 choke point E2E: unknown tool names still reject with the original error", async () => {
  const call = buildServer();
  await assert.rejects(
    () => call({ method: "tools/call", params: { name: "engineering.definitely_not_a_tool", arguments: {} } }, PROBE_CTX),
    /not found/,
  );
});

test("ERROR-01 mountErrorEnvelope: typed error text becomes the canonical envelope + one audit line", () => {
  clearAudit();
  const original = { content: [{ type: "text", text: "FILE_VERSION_CONFLICT" }], isError: true };
  const mounted = mountErrorEnvelope({ params: { name: "engineering.file.patch" } }, original) as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(mounted.isError, true);
  const envelope = envelopeOf(mounted.content[0].text);
  assert.equal(envelope.code, "FILE_VERSION_CONFLICT");
  assert.equal(envelope.category, "state");
  assert.equal(envelope.retryable, true);
  assert.equal(String(envelope.message), "FILE_VERSION_CONFLICT");
  assert.ok(String(envelope.remediation).length > 10);
  assert.equal(auditLines().length, 1);
});

test("ERROR-01 mountErrorEnvelope: canonical envelope passes through byte-identical with NO extra audit line", () => {
  clearAudit();
  const canonical = {
    content: [{ type: "text", text: JSON.stringify({ code: "NOTHING_TO_MERGE", category: "state", retryable: true, remediation: "use git.push", message: "NOTHING_TO_MERGE", evidenceRefs: [] }) }],
    isError: true,
  };
  const mounted = mountErrorEnvelope({ params: { name: "engineering.git.merge" } }, canonical);
  assert.strictEqual(mounted, canonical, "already-canonical results must be returned unchanged");
  assert.equal(auditLines().length, 0, "no double audit for already-canonical envelopes");
});

test("ERROR-01 mountErrorEnvelope: secrets in error text are redacted before mount", () => {
  const original = { content: [{ type: "text", text: `registry read failed with ${BEARER_JWT_FIXTURE.replace("Bearer ", "Bearer abcdefgh123456, then")} at ${CRED_PATH_C}` }], isError: true };
  const mounted = mountErrorEnvelope({ params: { name: "engineering.registry.scope.grant" } }, original) as { content: Array<{ text: string }> };
  const text = mounted.content[0].text;
  assert.doesNotMatch(text, /abcdefgh123456/);
  assert.match(text, /Bearer \[REDACTED\]/);
  assert.match(text, /\[REDACTED_CREDENTIAL_PATH\]/);
});
