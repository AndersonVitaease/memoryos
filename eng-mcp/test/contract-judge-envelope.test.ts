/**
 * CONTRACT-01 — judge tool-envelope contract test.
 *
 * The JUDGE-HOOKS-01 failure mode: a mock mirroring {results} stayed 23/23 green
 * over production emitting {answers}. This file is the permanent guard:
 *   1. Golden envelopes RECORDED LIVE from production (2026-09-21) parse against
 *      the zod contract generated from the REAL types (src/judgeContracts.ts).
 *   2. The real band-2 reader (judgeSafeScore) consumes the REAL golden envelope
 *      and produces the calibrated outcome (0.88 — the same command class that
 *      historically routed to the operator).
 *   3. The historical mutation (answers -> results) and other shape mutations
 *      FAIL every layer — zod, smoke validator and reader.
 *   4. The smoke validator (scripts/eng-mcp-smoke-judge-contract.mjs) agrees
 *      with the zod contract on every fixture and mutation — the deployed-server
 *      check and the suite check cannot drift.
 *   5. The smoke's outgoing judge request parses against the REAL input schema.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { judgeVerifyEnvelopeSchema, judgeEvaluateEnvelopeSchema } from "../src/judgeContracts.ts";
import { judgeSafeScore, JUDGE_AUTO_SAFE_THRESHOLD } from "../src/harness/judgeGate.ts";
import { judgeVerifyInputSchema } from "../src/judge.ts";
import { validateJudgeVerifyEnvelope, SMOKE_JUDGE_ARGS } from "../scripts/eng-mcp-smoke-judge-contract.mjs";

const fixtureDir = join(fileURLToPath(import.meta.url), "..");
function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")).envelope;
}
// Golden bytes recorded LIVE (see _provenance inside each file).
const evaluateFixture = loadFixture("evaluate-envelope.live.json");
const verifyFixture = loadFixture("verify-envelope.live.json");

test("CONTRACT-01 golden: LIVE-recorded judge.evaluate envelope parses against the real-type zod schema", () => {
  const parsed = judgeEvaluateEnvelopeSchema.safeParse(evaluateFixture);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []));
  // The historical bug assertion: the field is `answers`, never `results`.
  assert.ok("answers" in evaluateFixture);
  assert.ok(!("results" in evaluateFixture));
});

test("CONTRACT-01 golden: LIVE-recorded judge.verify envelope parses against the real-type zod schema", () => {
  const parsed = judgeVerifyEnvelopeSchema.safeParse(verifyFixture);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []));
  assert.equal(verifyFixture.tool, "engineering.judge.verify");
});

test("CONTRACT-01 golden: the REAL band-2 reader consumes the LIVE evaluate envelope with calibrated outcome", () => {
  const { safeScore, probabilities } = judgeSafeScore(evaluateFixture);
  // Exact live probabilities, read from the answers the REAL provider produced.
  assert.deepEqual(probabilities, {
    q_destructive: 0.03,
    q_outward_facing: 0.04,
    q_touches_credentials: 0.12,
    q_large_blast_radius: 0.11,
  });
  // safeScore = 1 - max(risk) = 1 - 0.12 (float-safe comparison)
  assert.ok(Math.abs(safeScore - 0.88) < 1e-9, `safeScore=${safeScore}`);
  // Same command class as JUDGE-HOOKS-01: 0.88 < 0.9 → operator route, not auto.
  assert.ok(safeScore <= JUDGE_AUTO_SAFE_THRESHOLD);
});

test("CONTRACT-01 guard bites: the historical answers->results mutation fails zod, smoke validator and reader", () => {
  const mutated: Record<string, unknown> = { ...evaluateFixture };
  delete mutated.answers;
  mutated.results = evaluateFixture.answers; // exactly what JUDGE-HOOKS-01's mock imagined

  const zod = judgeEvaluateEnvelopeSchema.safeParse(mutated);
  assert.equal(zod.success, false, "zod must reject the results-mutation");

  const reader = judgeSafeScore(mutated);
  assert.ok(
    Math.abs(reader.safeScore - 0) < 1e-9,
    "the real reader must fail closed (p=1 for every band-2 question) when the answers field is missing",
  );

  const mjs = validateJudgeVerifyEnvelope(mutated);
  assert.equal(mjs.ok, false, "smoke validator must reject the results-mutation");
});

test("CONTRACT-01 guard bites: other envelope mutations fail every layer", () => {
  const mutations: Array<[string, (fixture: Record<string, unknown>) => Record<string, unknown>]> = [
    ["wrong tool name", (f) => ({ ...f, tool: "engineering.judge.verify2" })],
    ["wrong status", (f) => ({ ...f, status: "PENDING" })],
    ["missing provider", (f) => { const copy = { ...f }; delete copy.provider; return copy; }],
    ["probability out of range", (f) => ({ ...f, claims: [{ ...(f.claims as unknown[])[0], probability: 1.5 }] })],
    ["verdict outside closed set", (f) => ({ ...f, claims: [{ ...(f.claims as unknown[])[0], verdict: "true_ish" }] })],
    ["aggregate outside closed set", (f) => ({ ...f, aggregate: "MOSTLY_SUPPORTED" })],
    ["counts missing a key", (f) => { const copy = { ...f }; const counts = { ...(copy.counts as Record<string, number>) }; delete counts.uncertain; copy.counts = counts; return copy; }],
    ["unknown top-level key", (f) => ({ ...f, extra: true })],
  ];
  for (const [name, mutate] of mutations) {
    const mutated = mutate(verifyFixture);
    const zod = judgeVerifyEnvelopeSchema.safeParse(mutated);
    assert.equal(zod.success, false, `zod must reject: ${name}`);
    const mjs = validateJudgeVerifyEnvelope(mutated);
    assert.equal(mjs.ok, false, `smoke validator must reject: ${name}`);
  }
});

test("CONTRACT-01 zod <-> smoke validator agreement on the golden fixtures (both accept)", () => {
  assert.equal(judgeVerifyEnvelopeSchema.safeParse(verifyFixture).success, true);
  assert.equal(validateJudgeVerifyEnvelope(verifyFixture).ok, true);
});

test("CONTRACT-01 smoke judge request parses against the REAL judge input schema", () => {
  // SMOKE_JUDGE_ARGS is what the release smoke actually sends to production.
  const parsed = judgeVerifyInputSchema.safeParse(SMOKE_JUDGE_ARGS);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []));
  assert.equal(SMOKE_JUDGE_ARGS.claims.length, 1);
  assert.equal(SMOKE_JUDGE_ARGS.claims[0].id, "smoke1");
  // Read-only contract: evidence present, no destructive fields.
  assert.ok(SMOKE_JUDGE_ARGS.evidence && typeof SMOKE_JUDGE_ARGS.evidence === "object");
});

test("CONTRACT-01 smoke validator reports violations, not just a boolean", () => {
  const broken = { tool: "engineering.judge.verify", status: "JUDGED" };
  const result = validateJudgeVerifyEnvelope(broken);
  assert.equal(result.ok, false);
  assert.ok(result.violations.length > 0);
  assert.ok(result.violations.some((v) => v.includes("claims")));
  // The historical mutation must be NAMED, not silently folded into generic shape errors.
  const mutated = { ...verifyFixture };
  delete (mutated as Record<string, unknown>).answers;
  (mutated as Record<string, unknown>).results = [];
  const r2 = validateJudgeVerifyEnvelope(mutated);
  assert.ok(r2.violations.some((v) => v.includes("results") && v.includes("answers")));
});