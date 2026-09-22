// MEMORY-DEDUPE-01: unit tests for the read-only interior KB hygiene module
// (src/memoryDedupe.ts). The judge provider and the audit sink are always
// injected — no test reaches the network, the real credential file or
// /data/audit. runJudgeEvaluate writes its own audit, so both audit files are
// redirected to temp paths via env overrides (same convention as
// memoryGate.test.ts). Fixtures per mission spec: exact-duplicate pair,
// contradictory pair (shared mission slug), irrelevant pair (no candidate),
// the re-ranker flipping a recency distractor, and fail-open everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineeringError } from "../src/policy.js";
import { JUDGE_MODEL, type JudgeDeps, type JudgeHttpResponse } from "../src/judge.ts";
import {
  assertPeriodicAllowed,
  candidatePairs,
  dedupeScan,
  emitDedupeAudit,
  rerankSearchPayload,
  rowsFromPayload,
  type MemoryDedupeDeps
} from "../src/memoryDedupe.ts";

process.env.ENG_MCP_JUDGE_AUDIT_FILE = join(tmpdir(), "memory-dedupe-judge-audit-test-" + process.pid + ".jsonl");
process.env.ENG_MCP_MEMORY_DEDUPE_AUDIT_FILE = join(tmpdir(), "memory-dedupe-audit-test-" + process.pid + ".jsonl");

// ---- fixtures ----

const DUP_TEXT = "MEMDUP-SCAN-01 fechou o fluxo de captura com testes verdes e revisao do operador no mesmo dia";
const ctxWithDuplicate = {
  projectId: "memoryos",
  memories: [
    { id: "m1", content: "[AGENT MEMORY]\nAgent: eng\nSummary: " + DUP_TEXT, createdAt: "t1" },
    { id: "m2", content: "[AGENT MEMORY]\nAgent: eng\nSummary: " + DUP_TEXT, createdAt: "t2" }
  ]
};

const LEFT_CONFLICT = "DEDUPE-CONFLITO-01 decidiu que o re-ranker reordena os dez primeiros resultados de busca pelo score do juiz";
const RIGHT_CONFLICT = "DEDUPE-CONFLITO-01 decidiu que o re-ranker nunca reordena resultados e a ordem de recencia do bridge e final";
const ctxWithConflict = {
  projectId: "memoryos",
  memories: [
    { id: "c1", content: "[AGENT MEMORY]\nAgent: eng\nSummary: " + LEFT_CONFLICT, createdAt: "t1" },
    { id: "c2", content: "[AGENT MEMORY]\nAgent: eng\nSummary: " + RIGHT_CONFLICT, createdAt: "t2" }
  ]
};

const ctxIrrelevant = {
  projectId: "memoryos",
  memories: [
    { id: "i1", content: "lista de compras do fim de semana inclui cafe, pao e frutas para o cafe da manha", createdAt: "t1" },
    { id: "i2", content: "o relatorio trimestral de vendas mostra crescimento de doze por cento no setor sul", createdAt: "t2" }
  ]
};

// outgoing request carries questions as a RECORD keyed by id, not an array
type CapturedBody = { state: unknown; questions: Record<string, { type: string; instructions: string }> };

function judgeDepsFor(answers: Record<string, unknown>, calls: CapturedBody[] = [], fail = false): JudgeDeps {
  return {
    fetchImpl: async (_url: string, init: { body: string }) => {
      if (fail) throw new Error("JUDGE_UNREACHABLE: provider down");
      calls.push(JSON.parse(init.body) as CapturedBody);
      const payload = {
        model: JUDGE_MODEL + "-20260917",
        answers,
        usage: { input_tokens: 100, output_tokens: 20, cost: 0.00001 },
        id: "dedupe-test"
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) } satisfies JudgeHttpResponse;
    },
    readCredential: () => "sk-or-" + JSON.stringify("sk-or-v1-" + "a".repeat(64))
  };
}

const PAIR_ANSWERS = {
  q_duplicate: { type: "noul", noul: 0.95 },
  q_conflict: { type: "noul", noul: 0.05 },
  q_obsolete: { type: "noul", noul: 0.1 },
  q_prefer: { type: "choice", choice: "a", probabilities: { a: 0.8, b: 0.1, equal: 0.1 }, confidence: 0.8 }
};

const CONFLICT_ANSWERS = {
  q_duplicate: { type: "noul", noul: 0.05 },
  q_conflict: { type: "noul", noul: 0.9 },
  q_obsolete: { type: "noul", noul: 0.1 },
  q_prefer: { type: "choice", choice: "b", probabilities: { a: 0.1, b: 0.8, equal: 0.1 }, confidence: 0.8 }
};

function deps(overrides: Partial<MemoryDedupeDeps> = {}): MemoryDedupeDeps {
  return { projectId: "memoryos", authorizerHash16: null, recentContext: async () => ({ memories: [] }), ...overrides };
}

// ---- candidate pairing (cheap, in code, never the judge) ----

test("pairing: exact duplicate pairs by normalized hash, conflict pairs by shared slug, irrelevant pairs do not", () => {
  const dupRows = rowsFromPayload(ctxWithDuplicate);
  assert.equal(dupRows.length, 2);
  assert.deepEqual(candidatePairs(dupRows, 20), [[0, 1]]);

  const conflictRows = rowsFromPayload(ctxWithConflict);
  assert.deepEqual(candidatePairs(conflictRows, 20), [[0, 1]]);

  const irrelevantRows = rowsFromPayload(ctxIrrelevant);
  assert.deepEqual(candidatePairs(irrelevantRows, 20), []);
});

// ---- dedupeScan: dryRun, judged scan, fail-open, rate limit ----

test("dryRun lists candidates without calling the judge and emits a dry audit entry", async () => {
  const calls: CapturedBody[] = [];
  const report = await dedupeScan({ dryRun: true }, deps({ recentContext: async () => ctxWithDuplicate, judgeDeps: judgeDepsFor(PAIR_ANSWERS, calls) }));
  assert.equal(report.verdict, "not_judged");
  assert.equal(report.candidates, 1);
  assert.equal(report.pairsJudged, 0);
  assert.equal(report.dryRun, true);
  assert.equal(calls.length, 0);
  assert.equal(report.pairs[0].duplicate, null);
  assert.deepEqual(report.pairs[0].tags, []);
  assert.equal(report.pairs[0].a.memoryId, "m1");
  assert.equal(report.pairs[0].b.memoryId, "m2");
});

test("judged scan flags an exact duplicate with the advisory tag and audited cost", async () => {
  const calls: CapturedBody[] = [];
  const report = await dedupeScan({}, deps({ recentContext: async () => ctxWithDuplicate, judgeDeps: judgeDepsFor(PAIR_ANSWERS, calls) }));
  assert.equal(report.verdict, "screened");
  assert.equal(report.candidates, 1);
  assert.equal(report.pairsJudged, 1);
  assert.equal(report.summary.duplicates, 1);
  assert.equal(report.pairs[0].duplicate, true);
  assert.equal(report.pairs[0].conflict, false);
  assert.equal(report.pairs[0].prefer, "a");
  assert.ok(report.pairs[0].tags.some((t) => t.startsWith("[DEDUPE-CANDIDATE duplicate_of=")));
  assert.ok(report.cost > 0);
  assert.equal(calls.length, 1);
  // one judge call carries exactly the four pair questions as a record
  assert.deepEqual(Object.keys(calls[0].questions), ["q_duplicate", "q_conflict", "q_obsolete", "q_prefer"]);
  assert.ok(JSON.stringify(calls[0].state).length <= 5000);
  assert.ok(report.advisory.includes("never deletes or edits"));
});

test("judged scan flags a contradiction with the CONFLICT tag and prefer=b", async () => {
  const report = await dedupeScan({}, deps({ recentContext: async () => ctxWithConflict, judgeDeps: judgeDepsFor(CONFLICT_ANSWERS) }));
  assert.equal(report.verdict, "screened");
  assert.equal(report.summary.conflicts, 1);
  assert.equal(report.pairs[0].conflict, true);
  assert.equal(report.pairs[0].duplicate, false);
  assert.ok(report.pairs[0].tags.some((t) => t.startsWith("[CONFLICT ")));
  assert.equal(report.pairs[0].prefer, "b");
});

test("scan over disjoint memories yields zero candidates and an empty report", async () => {
  const calls: CapturedBody[] = [];
  const report = await dedupeScan({}, deps({ recentContext: async () => ctxIrrelevant, judgeDeps: judgeDepsFor(PAIR_ANSWERS, calls) }));
  assert.equal(report.candidates, 0);
  assert.equal(report.pairsJudged, 0);
  assert.equal(report.scanned, 2);
  assert.equal(calls.length, 0);
  assert.equal(report.verdict, "screened");
});

test("dead judge fails OPEN per pair: scan completes, pairs stay visible as unverified", async () => {
  const report = await dedupeScan({}, deps({ recentContext: async () => ctxWithDuplicate, judgeDeps: judgeDepsFor({}, [], true) }));
  assert.equal(report.verdict, "unavailable");
  assert.equal(report.unverified, true);
  assert.equal(report.summary.unverified, 1);
  assert.equal(report.pairs[0].duplicate, null);
  assert.deepEqual(report.pairs[0].tags, []);
  assert.ok(report.pairs[0].a.sha16.match(/^[0-9a-f]{16}$/));
});

test("periodic mode is rate-limited to one scan per project per 24h, read from the audit trail itself", async () => {
  const auditFile = join(tmpdir(), "memory-dedupe-rate-test-" + process.pid + ".jsonl");
  const now = () => 1_700_000_000_000;
  await dedupeScan({ mode: "periodic", dryRun: true }, deps({ auditFile, now, recentContext: async () => ctxWithDuplicate }));
  assert.throws(
    () => assertPeriodicAllowed("memoryos", auditFile, now() + 60_000),
    (err: unknown) => err instanceof EngineeringError && err.code === "MEMORY_DEDUPE_RATE_LIMIT"
  );
  // a different project is not rate-limited by this project's entry
  assert.doesNotThrow(() => assertPeriodicAllowed("other-project", auditFile, now() + 60_000));
  // ondemand is never rate-limited
  const report = await dedupeScan({ mode: "ondemand", dryRun: true }, deps({ auditFile, now, recentContext: async () => ctxWithDuplicate }));
  assert.equal(report.mode, "ondemand");
  // after 24h the same project may run periodic again
  assert.doesNotThrow(() => assertPeriodicAllowed("memoryos", auditFile, now() + 25 * 60 * 60 * 1000));
});

// ---- audit: metadata + hashes only, never memory content ----

test("dedupe audit lines carry metadata and hash16 only, never memory content", async () => {
  const auditFile = join(tmpdir(), "memory-dedupe-audit-content-test-" + process.pid + ".jsonl");
  const report = await dedupeScan({}, deps({ auditFile, recentContext: async () => ctxWithConflict, judgeDeps: judgeDepsFor(CONFLICT_ANSWERS) }));
  emitDedupeAudit(auditFile, { ts: "check", pairs_judged: report.pairsJudged, verdicts_summary_hash16: "0123456789abcdef", cost: report.cost });
  const raw = readFileSync(auditFile, "utf8");
  const lines = raw.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.equal(lines.length, 2); // scan entry + the explicit emit above
  assert.match(lines[0].verdicts_summary_hash16 as string, /^[0-9a-f]{16}$/);
  assert.equal(lines[0].pairs_judged, 1);
  assert.equal(lines[0].projectId, "memoryos");
  assert.ok(typeof lines[0].cost === "number" && (lines[0].cost as number) > 0);
  // zero content: neither fixture text nor any summary fragment may appear
  assert.ok(!raw.includes("reordena os dez primeiros"));
  assert.ok(!raw.includes("nunca reordena resultados"));
  assert.ok(!raw.includes("DEDUPE-CONFLITO-01"));
  assert.ok(!raw.includes("Agent: eng"));
});

// ---- re-ranking of memory.search ----

const QUERY = "memory dedupe scan reranker implementation";
const ROW_DISTRACTOR = "lista de compras do fim de semana inclui cafe pao e frutas frescas para o cafe da manha de domingo";
const ROW_RELEVANT = "memory dedupe scan reranks the top ten search rows with calibrated judge scores before returning them";

const rerankPayload = {
  results: [
    { id: "r0", content: ROW_DISTRACTOR }, // most recent, irrelevant — the recency distractor
    { id: "r1", content: ROW_RELEVANT }
  ]
};

const RERANK_FLIP = {
  r0: { type: "score", score: 0, confidence: 0.9 },
  r1: { type: "score", score: 3, confidence: 0.9 }
};

test("reranker flips a recency distractor: relevant row wins, payload shape is preserved", async () => {
  const calls: CapturedBody[] = [];
  const out = await rerankSearchPayload(QUERY, rerankPayload, { authorizerHash16: null, judgeDeps: judgeDepsFor(RERANK_FLIP, calls) });
  assert.equal(out.rerank.applied, true);
  assert.equal(out.rerank.verdict, "reranked");
  assert.ok(out.rerank.cost > 0);
  const rows = (out.payload as { results: Array<{ id: string }> }).results;
  assert.equal(rows[0].id, "r1");
  assert.equal(rows[1].id, "r0");
  assert.equal(calls.length, 1);
  // score questions: one per top-K entry, criteria = the four relevance labels
  assert.deepEqual(Object.keys(calls[0].questions), ["r0", "r1"]);
  assert.ok(Object.values(calls[0].questions).every((q) => q.type === "score" && q.instructions.includes("memory dedupe scan")));
});

test("reranker understands the REAL search row shape (text field) — MEMORY-DEDUPE-01 live regression", async () => {
  const calls: CapturedBody[] = [];
  const realSearch = {
    projectId: "memoryos",
    query: QUERY,
    count: 2,
    results: [
      { type: "message", id: "newer", text: ROW_DISTRACTOR, createdAt: "2026-09-21T23:49:26.195000", score: 1, metadata: { sessionId: "s" } },
      { type: "message", id: "older", text: ROW_RELEVANT, createdAt: "2026-09-21T23:43:45.511000", score: 1, metadata: { sessionId: "s" } }
    ]
  };
  const out = await rerankSearchPayload(QUERY, realSearch, { authorizerHash16: null, judgeDeps: judgeDepsFor(RERANK_FLIP, calls) });
  assert.equal(out.rerank.applied, true);
  assert.equal(out.rerank.verdict, "reranked");
  const rows = (out.payload as { results: Array<{ id: string }> }).results;
  assert.equal(rows[0].id, "older"); // relevant wins despite being older
  assert.equal(rows[1].id, "newer");
  assert.equal(calls.length, 1);
});

test("reranker fail-open: judge down returns the payload untouched with verdict unavailable", async () => {
  const out = await rerankSearchPayload(QUERY, rerankPayload, { authorizerHash16: null, judgeDeps: judgeDepsFor({}, [], true) });
  assert.equal(out.rerank.applied, false);
  assert.equal(out.rerank.verdict, "unavailable");
  assert.equal(out.rerank.cost, 0);
  assert.deepEqual(out.payload, rerankPayload);
});

test("reranker skips shapes it cannot reorder instead of guessing", async () => {
  const single = { results: [{ id: "only", content: ROW_RELEVANT }] };
  const one = await rerankSearchPayload(QUERY, single, { authorizerHash16: null, judgeDeps: judgeDepsFor(RERANK_FLIP) });
  assert.equal(one.rerank.verdict, "insufficient_rows");
  const unknownShape = { rows: [{ id: "x", content: "y" }] };
  const unrecognized = await rerankSearchPayload(QUERY, unknownShape, { authorizerHash16: null, judgeDeps: judgeDepsFor(RERANK_FLIP) });
  assert.equal(unrecognized.rerank.verdict, "shape_unrecognized");
  // text-less rows never become judge entries
  const emptyTexts = { results: [{ id: "a", content: "" }, { id: "b", content: "" }] };
  const noText = await rerankSearchPayload(QUERY, emptyTexts, { authorizerHash16: null, judgeDeps: judgeDepsFor(RERANK_FLIP) });
  assert.equal(noText.rerank.verdict, "insufficient_text");
});
