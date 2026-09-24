/**
 * VERIFY-01 — FINGERPRINT close-ledger contract test (CONTRACT-01 pattern).
 *
 * The close ledger travels INSIDE the existing engineering.memory.capture
 * `summary` (z.string().min(1).max(3000), src/tools.ts — untouched by this
 * mission) as a single content line:
 *
 *   FINGERPRINT {"missionId":"VERIFY-01","head":"<40-hex>","registrySha16":"<16-hex>",
 *                "suite":"PASS|FAIL|n/a","deploy":"<tag|n/a>",
 *                "verdicts":{"aggregate":"ALL_SUPPORTED","supported":N,"total":N},
 *                "ts":"<ISO-8601>"}
 *
 * This test pins that format:
 *   1. The GOLDEN close summary (a real-shaped VERIFY-01 closing capture) parses
 *      against the zod contract.
 *   2. A closing capture WITHOUT the FINGERPRINT line FAILS the contract (a
 *      mission may not close without its ledger).
 *   3. Shape mutations (renamed/missing fields, wrong hex lengths, missing
 *      counts, multi-line JSON) FAIL — a drifting emitter cannot stay green.
 *   4. A fingerprint whose `head` is INCONSISTENT with the verifiable release
 *      state FAILS the consistency rule (stateConsistency, injectable — the
 *      release-state.json is untracked and absent in the test container, so
 *      the rule is pure logic over injected fixtures, matching releaseState).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// The real contract: the capture summary field this ledger travels in
// (engineering.memory.capture, src/tools.ts) — pinned, never redefined.
const captureSummarySchema = z.string().min(1).max(3000);

// ---------------------------------------------------------------------------
// FINGERPRINT line contract.
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const verifyLedgerFingerprintSchema = z.object({
  missionId: z.string().min(2).max(80),
  head: z.string().regex(/^[0-9a-f]{40}$/, "head must be a 40-hex git SHA"),
  registrySha16: z.string().regex(/^[0-9a-f]{16}$/, "registrySha16 must be 16-hex"),
  suite: z.enum(["PASS", "FAIL", "n/a"]).optional(),
  deploy: z.string().max(200).optional(),
  verdicts: z.object({
    aggregate: z.enum(["ALL_SUPPORTED", "HAS_CONTRADICTIONS", "MIXED", "UNCERTAIN"]),
    supported: z.number().int().min(0),
    total: z.number().int().min(1),
  }),
  ts: z.string().regex(ISO_8601),
}).strict();

const FINGERPRINT_LINE = /^FINGERPRINT (.+)$/m;

/** Extract and parse the FINGERPRINT line out of a capture summary. */
export function parseFingerprint(summary: string): { ok: true; fingerprint: Record<string, unknown> } | { ok: false; reason: string } {
  const summaryParsed = captureSummarySchema.safeParse(summary);
  if (!summaryParsed.success) return { ok: false, reason: `summary fails the real capture contract: ${summaryParsed.error.issues.map(i => i.message).join("; ")}` };
  const line = summary.match(FINGERPRINT_LINE);
  if (!line) return { ok: false, reason: "closing capture has NO FINGERPRINT line" };
  let raw: unknown;
  try { raw = JSON.parse(line[1]); } catch { return { ok: false, reason: "FINGERPRINT payload is not valid single-line JSON" }; }
  const parsed = verifyLedgerFingerprintSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `FINGERPRINT fails schema: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  return { ok: true, fingerprint: parsed.data };
}

/**
 * State-consistency rule (layer-1 probe logic, injectable). `releaseState` is
 * the verifiable release evidence (untracked release-state.json shape); in
 * production the caller feeds the REAL parsed release-state.json + live HEAD.
 * A fingerprint whose head/suite claims disagree with that state FAILS.
 */
export function checkStateConsistency(
  fingerprint: { head: string; suite?: string },
  releaseState: { testStatus?: string; failed?: number; head?: string | null } | null,
  liveHead: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (liveHead !== null && fingerprint.head !== liveHead) {
    return { ok: false, reason: `fingerprint head ${fingerprint.head} != live HEAD ${liveHead}` };
  }
  if (releaseState && releaseState.head && fingerprint.head !== releaseState.head) {
    return { ok: false, reason: `fingerprint head ${fingerprint.head} != live HEAD ${releaseState.head}` };
  }
  if (releaseState && typeof releaseState.failed === "number" && fingerprint.suite === "PASS" && releaseState.failed > 0) {
    return { ok: false, reason: `fingerprint claims suite PASS but release-state reports ${releaseState.failed} failed` };
  }
  if (releaseState && releaseState.testStatus && fingerprint.suite && fingerprint.suite !== "n/a" && releaseState.testStatus !== fingerprint.suite) {
    return { ok: false, reason: `fingerprint suite ${fingerprint.suite} != release-state testStatus ${releaseState.testStatus}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Golden: a real-shaped closing capture for VERIFY-01.
const GOLDEN_SUMMARY = [
  "[MEMORYGATE:band=admit score=0.92]",
  "[AGENT MEMORY] Agent: claude-code | Mission: VERIFY-01 close ledger (3-layer verification regime in effect).",
  "Decisions: fingerprint as content line in the EXISTING capture summary; zero capture-code mutation; doc at docs/verify-ledger.md; contract test pins the format.",
  'FINGERPRINT {"missionId":"VERIFY-01","head":"7bc5390f360e8a352b7d8a7ca4f5c38d50d974c7","registrySha16":"2655b039037d4013","suite":"PASS","deploy":"n/a","verdicts":{"aggregate":"ALL_SUPPORTED","supported":6,"total":6},"ts":"2026-09-24T21:30:00.000Z"}',
].join("\n");

const clone = (s: string) => s;

// ---------------------------------------------------------------------------
test("VERIFY-01 golden: real-shaped closing capture parses against the contract", () => {
  const parsed = parseFingerprint(GOLDEN_SUMMARY);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (parsed.ok) {
    assert.equal(parsed.fingerprint.missionId, "VERIFY-01");
    assert.equal(parsed.fingerprint.registrySha16, "2655b039037d4013");
    assert.equal((parsed.fingerprint.verdicts as Record<string, unknown>).aggregate, "ALL_SUPPORTED");
  }
  assert.ok(GOLDEN_SUMMARY.length <= 3000, "golden must fit the real capture summary cap");
});

test("VERIFY-01 golden: verdicts match judge-verify envelope fields", () => {
  const goldenEnvelope = JSON.parse(readFileSync(join(fileURLToPath(import.meta.url), "..", "verify-ledger-golden.fingerprint.json"), "utf8"));
  const parsed = parseFingerprint(GOLDEN_SUMMARY);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.fingerprint, goldenEnvelope);
});

test("VERIFY-01: closing capture WITHOUT a FINGERPRINT line FAILS", () => {
  const without = GOLDEN_SUMMARY.split("\n").filter((l) => !l.startsWith("FINGERPRINT ")).join("\n");
  const parsed = parseFingerprint(without);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.reason, /NO FINGERPRINT line/);
});

test("VERIFY-01: shape mutations FAIL the contract", () => {
  const golden = GOLDEN_SUMMARY.match(FINGERPRINT_LINE)![1];
  const mutations: Array<[string, (f: Record<string, any>) => void]> = [
    ["head renamed", (f) => { f.commit = f.head; delete f.head; }],
    ["head missing", (f) => { delete f.head; }],
    ["head short (non-40-hex)", (f) => { f.head = f.head.slice(0, 12); }],
    ["head uppercase", (f) => { f.head = f.head.toUpperCase(); }],
    ["registrySha16 as full sha", (f) => { f.registrySha16 = f.registrySha16 + "a".repeat(48); }],
    ["registrySha16 renamed", (f) => { f.registryHash = f.registrySha16; delete f.registrySha16; }],
    ["verdicts missing counts", (f) => { f.verdicts = { aggregate: "ALL_SUPPORTED" }; }],
    ["verdicts aggregate unknown", (f) => { f.verdicts.aggregate = "MOSTLY_OK"; }],
    ["ts not ISO-8601", (f) => { f.ts = "24/09/2026 21:30"; }],
    ["ts missing", (f) => { delete f.ts; }],
    ["suite invalid enum", (f) => { f.suite = "GREEN"; }],
    ["extra top-level field", (f) => { f.catalogHash = "x"; }],
    ["missionId missing", (f) => { delete f.missionId; }],
  ];
  for (const [label, mutate] of mutations) {
    const f = JSON.parse(golden);
    mutate(f);
    const bad = JSON.stringify(f);
    const mutatedSummary = GOLDEN_SUMMARY.replace(FINGERPRINT_LINE, `FINGERPRINT ${bad}`);
    const parsed = parseFingerprint(mutatedSummary);
    assert.equal(parsed.ok, false, `mutation must fail: ${label}`);
  }
});

test("VERIFY-01: multi-line / trailing-garbage FINGERPRINT payload FAILS", () => {
  const pretty = GOLDEN_SUMMARY.replace(FINGERPRINT_LINE, `FINGERPRINT ${JSON.stringify(JSON.parse(GOLDEN_SUMMARY.match(FINGERPRINT_LINE)![1]), null, 2)}`);
  assert.equal(parseFingerprint(pretty).ok, false);
  const garbage = GOLDEN_SUMMARY.replace(FINGERPRINT_LINE, "FINGERPRINT {\"missionId\":\"VERIFY-01\"} oops");
  assert.equal(parseFingerprint(garbage).ok, false);
});

// ---------------------------------------------------------------------------
// State consistency (head vs release-state) — pure logic over injected
// fixtures (release-state.json is untracked and absent in the test container).
const FP = { head: "7bc5390faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01", suite: "PASS" } as const;

test("VERIFY-01: fingerprint consistent with matching state PASSES", () => {
  assert.equal(checkStateConsistency(FP, { testStatus: "PASS", failed: 0, head: FP.head }, FP.head).ok, true);
  assert.equal(checkStateConsistency(FP, null, null).ok, true, "no verifiable state -> cannot contradict (fail-open)");
});

test("VERIFY-01: fingerprint with HEAD INCONSISTENT with release-state FAILS", () => {
  const r1 = checkStateConsistency(FP, { testStatus: "PASS", failed: 0 }, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.equal(r1.ok, false, "live HEAD diverged from fingerprint head");
  if (!r1.ok) assert.match(r1.reason, /!= live HEAD/);
  const r2 = checkStateConsistency(FP, { testStatus: "PASS", failed: 0, head: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }, null);
  assert.equal(r2.ok, false, "release-state head diverged from fingerprint head");
  if (!r2.ok) assert.match(r2.reason, /!= live HEAD/);
});

test("VERIFY-01: fingerprint claiming PASS against failing release-state FAILS", () => {
  const r = checkStateConsistency(FP, { testStatus: "FAIL", failed: 3, head: FP.head }, FP.head);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /failed/);
  const r2 = checkStateConsistency({ ...FP, suite: "n/a" }, { testStatus: "PASS", failed: 0, head: FP.head }, FP.head);
  assert.equal(r2.ok, true, "suite n/a is not a PASS claim");
});

test("VERIFY-01: parseFingerprint is deterministic and side-effect free", () => {
  const a = parseFingerprint(clone(GOLDEN_SUMMARY));
  const b = parseFingerprint(clone(GOLDEN_SUMMARY));
  assert.deepEqual(a, b);
});
