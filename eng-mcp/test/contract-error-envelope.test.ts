// CONTRACT-01 — contract tests for the REAL error-envelope choke point
// (src/errorEnvelope.ts). The zod schema (src/judgeContracts.ts, pinned to
// ErrorEnvelope at compile time) and the runtime guard (isCanonicalEnvelope)
// are two independent derivations of the same boundary: every test below
// requires them to accept/reject in lockstep. Mutations simulate the
// shape-drift class CONTRACT-01 extinguishes — a refactor that renames or
// drops an envelope field dies here, not in production.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildErrorEnvelope,
  classifyErrorCode,
  extractErrorEnvelope,
  isCanonicalEnvelope,
  redactErrorText,
  UNCLASSIFIED_ERROR_CODE,
} from "../src/errorEnvelope.ts";
import { errorEnvelopeSchema } from "../src/judgeContracts.ts";

const strip = (envelope: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...envelope };
  delete copy[key];
  return copy;
};

/** Lockstep assertion: the real guard and the zod schema must give the SAME verdict. */
const expects = (label: string, value: unknown, accepts: boolean): void => {
  assert.equal(isCanonicalEnvelope(value), accepts, `guard verdict for ${label}`);
  assert.equal(errorEnvelopeSchema.safeParse(value).success, accepts, `schema verdict for ${label}`);
};

test("classifyErrorCode: organic production codes resolve to their curated taxonomy", () => {
  const cases: Array<[string, string, boolean]> = [
    ["PATH_NOT_FOUND", "validation", false],
    ["FILE_VERSION_CONFLICT", "state", true],
    ["JUDGE_INPUT_INVALID", "validation", false],
    ["AUTHORIZATION_SCOPE_REQUIRED", "scope", false],
    ["FETCH_LOCAL_STATE_MUTATED", "state", false],
    ["BASELINE_LIMIT_EXCEEDED", "state", true],
    ["NOTHING_TO_MERGE", "state", true],
  ];
  for (const [code, category, retryable] of cases) {
    const taxonomy = classifyErrorCode(code);
    assert.equal(taxonomy.category, category, code);
    assert.equal(taxonomy.retryable, retryable, code);
    assert.ok(taxonomy.remediation.length > 0, `${code} carries a remediation`);
  }
});

test("classifyErrorCode: curated entries win over family rules; unseen codes follow family rules; garbage falls to internal", () => {
  // REGISTRY_BACKUP_FAILED would match the earlier ^REGISTRY_ family rule (scope);
  // the curated entry (state) must win.
  assert.equal(classifyErrorCode("REGISTRY_BACKUP_FAILED").category, "state");
  // Family rules classify codes never curated:
  assert.equal(classifyErrorCode("SOMETHING_SCOPE_REQUIRED").category, "scope");
  assert.equal(classifyErrorCode("MYTOOL_TIMEOUT").category, "provider");
  assert.equal(classifyErrorCode("MYTOOL_TIMEOUT").retryable, true);
  assert.equal(classifyErrorCode("SOMETHING_MUTATED").category, "state");
  // Nothing matches -> internal fallback:
  const garbage = classifyErrorCode("TOTALLY_UNKNOWN_CODE_XY");
  assert.equal(garbage.category, "internal");
  assert.equal(garbage.retryable, false);
  assert.ok(garbage.remediation.includes("No typed code matched"));
});

test("buildErrorEnvelope mounts a canonical envelope the schema and guard both accept (round-trip)", () => {
  const envelope = buildErrorEnvelope({
    code: "FILE_VERSION_CONFLICT",
    message: "re-read the file and re-apply the patch",
    tool: "engineering.file.patch",
    evidenceRefs: ["src/file.ts:12"],
  });
  expects("buildErrorEnvelope output", envelope, true);
  assert.deepEqual(errorEnvelopeSchema.parse(envelope), envelope);
  assert.equal(envelope.code, "FILE_VERSION_CONFLICT");
  assert.equal(envelope.category, "state");
  assert.equal(envelope.retryable, true);
});

test("buildErrorEnvelope derives the code from the message and canonicalizes SDK validation text", () => {
  const derived = buildErrorEnvelope({ message: "Error: FILE_VERSION_CONFLICT — re-read before patching" });
  assert.equal(derived.code, "FILE_VERSION_CONFLICT");
  expects("derived envelope", derived, true);

  const sdk = buildErrorEnvelope({ message: "Invalid arguments for tool engineering.file.patch: baseHash" });
  assert.equal(sdk.code, "TOOL_INPUT_INVALID");
  assert.equal(sdk.category, "validation");
  expects("sdk-validation envelope", sdk, true);

  const unclassified = buildErrorEnvelope({ message: "something truly inexplicable happened" });
  assert.equal(unclassified.code, UNCLASSIFIED_ERROR_CODE);
  assert.equal(unclassified.category, "internal");
  expects("unclassified envelope", unclassified, true);
});

test("redactErrorText: 64-hex secret", () => {
  const hex64 = "ab".repeat(32);
  const hashed = redactErrorText(`hash ${hex64} refused`);
  assert.ok(hashed.includes("[REDACTED_64HEX]"), `actual: ${hashed}`);
  assert.ok(!hashed.includes(hex64), `actual: ${hashed}`);
  // A Bearer-prefixed 64-hex is consumed by the MORE SPECIFIC Bearer pattern first
  // (REDACTION_PATTERNS order) — either way the secret never survives:
  const bearerHex = redactErrorText(`bearer ${hex64} refused`);
  assert.ok(bearerHex.includes("Bearer [REDACTED]"), `actual: ${bearerHex}`);
});

test("redactErrorText: sk- token and Bearer header", () => {
  const sk = redactErrorText("call with sk-abc12345defghijk failed");
  assert.ok(sk.includes("[REDACTED]"), `actual: ${sk}`);
  assert.ok(!sk.includes("sk-abc"), `actual: ${sk}`);
  const bearer = redactErrorText("Authorization: Bearer abcdef1234567890 refused");
  assert.ok(bearer.includes("Bearer [REDACTED]"), `actual: ${bearer}`);
});

test("redactErrorText: credential path and key=value secret form", () => {
  const credPath = redactErrorText("credential file /data/credentials/judge.token.json missing");
  assert.ok(credPath.includes("[REDACTED_CREDENTIAL_PATH]"), `actual: ${credPath}`);
  assert.ok(!credPath.includes("/data/credentials"), `actual: ${credPath}`);
  const kv = redactErrorText('token: "sk-or-v1-0123456789abcdef0123456789abcdef"');
  assert.ok(!/sk-or-v1-/.test(kv), `actual: ${kv}`);
});

test("redactErrorText: cap at 500 chars", () => {
  const capped = redactErrorText("x".repeat(600));
  assert.ok(capped.endsWith("…[TRUNCATED]"), `actual: ${capped}`);
  assert.ok(capped.length <= 500 + "…[TRUNCATED]".length, `actual length: ${capped.length}`);
});

test("buildErrorEnvelope routes message AND evidenceRefs through the redaction", () => {
  const leaking = buildErrorEnvelope({
    code: "PATH_NOT_FOUND",
    message: `hash ${"ef".repeat(32)} at /data/tokens.json`,
    evidenceRefs: ["/data/tokens.json"],
  });
  assert.ok(!leaking.message.includes("ef".repeat(32)), `actual: ${leaking.message}`);
  assert.ok(!leaking.message.includes("/data/tokens.json"), `actual: ${leaking.message}`);
  assert.ok(!leaking.evidenceRefs.some((ref) => ref.includes("/data/tokens.json")), `actual: ${JSON.stringify(leaking.evidenceRefs)}`);
  expects("leaking envelope", leaking, true);
});

test("extractErrorEnvelope reads the REAL MCP error response shape", () => {
  const envelope = buildErrorEnvelope({ code: "PATH_NOT_FOUND", message: "no such file", tool: "engineering.file.read" });
  const triple = { code: "PATH_NOT_FOUND", category: "validation", retryable: false };
  const mcpResponse = { isError: true, content: [{ type: "text", text: JSON.stringify(envelope) }] };
  assert.deepEqual(extractErrorEnvelope(mcpResponse), triple);
  assert.deepEqual(extractErrorEnvelope(JSON.stringify(envelope)), triple);
  assert.deepEqual(extractErrorEnvelope({ text: JSON.stringify(envelope) }), triple);
  // Legacy / non-envelope inputs return null — never a guess:
  assert.equal(extractErrorEnvelope({ content: [{ type: "text", text: "plain legacy error text" }] }), null);
  assert.equal(extractErrorEnvelope("plain legacy error text"), null);
  assert.equal(extractErrorEnvelope({ content: [] }), null);
  assert.equal(extractErrorEnvelope(null), null);
  assert.equal(extractErrorEnvelope({ content: [{ type: "text", text: JSON.stringify({ code: "PATH_NOT_FOUND" }) }] }), null);
});

test("CONTRACT: schema and real guard accept/reject in lockstep on mutated envelopes", () => {
  const base = buildErrorEnvelope({ code: "PATH_NOT_FOUND", message: "m", tool: "engineering.file.read" });
  const mutations: Array<[string, unknown, boolean]> = [
    ["intact envelope", base, true],
    ["category removed", strip(base, "category"), false],
    ["category outside the taxonomy", { ...base, category: "networking" }, false],
    ["retryable removed", strip(base, "retryable"), false],
    ["retryable not boolean", { ...base, retryable: "yes" }, false],
    ["code lowercase", { ...base, code: "path_not_found" }, false],
    ["code single char (isUpperSnake requires 2+)", { ...base, code: "X" }, false],
    ["code empty", { ...base, code: "" }, false],
    ["evidenceRefs not an array", { ...base, evidenceRefs: "src/file.ts" }, false],
    ["remediation removed", strip(base, "remediation"), false],
    ["message not a string", { ...base, message: 7 }, false],
  ];
  for (const [label, value, accepts] of mutations) expects(label, value, accepts);
});

test("CONTRACT asymmetry, documented: the schema pins the write shape; the runtime guard tolerates legacy extras", () => {
  // isCanonicalEnvelope is the lenient READ guard (extractErrorEnvelope over
  // arbitrary caller responses) and ignores unknown keys; buildErrorEnvelope
  // mounts EXACTLY the 7 fields, and the schema pins that write shape. The
  // two directions that must hold: guard-reject implies schema-reject, and
  // schema-accept implies guard-accept — both hold across every mutation above.
  const base = buildErrorEnvelope({ code: "PATH_NOT_FOUND", message: "m" });
  const withExtra = { ...base, legacyNote: "kept for callers matching text.includes" };
  assert.equal(isCanonicalEnvelope(withExtra), true, "guard tolerates extra keys (lenient legacy reader)");
  assert.equal(errorEnvelopeSchema.safeParse(withExtra).success, false, "schema pins exactly what buildErrorEnvelope mounts");
});