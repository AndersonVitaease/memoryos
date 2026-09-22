// MEMORY-MERGE-01: unit tests for the governed applicator of the dedupe
// approval list (src/memoryMerge.ts). The judge provider and the audit sinks
// are always injected/redirected — no test reaches the network, the real
// credential file or /data/audit. Fixtures reuse the EXACT shapes from
// memoryDedupe.test.ts (the merge runs an internal anti-stale dedupeScan, so
// pairing must behave identically). Covered per the v2 amendment: tombstone
// semantics (no physical delete, content never sent), plan zero-mutation,
// byte-identical idempotency, fail-closed anti-stale (judge down / verdict
// changed), reverse-order rollback, hash-only audit trail and refusals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineeringError } from "../src/policy.js";
import { JUDGE_MODEL, type JudgeDeps, type JudgeHttpResponse } from "../src/judge.ts";
import {
  memoryMerge,
  stripTombstoned,
  rawRows,
  type MergeDecision,
  type MemoryMergeDeps
} from "../src/memoryMerge.ts";

process.env.ENG_MCP_JUDGE_AUDIT_FILE = join(tmpdir(), "memory-merge-judge-audit-test-" + process.pid + ".jsonl");
process.env.ENG_MCP_MEMORY_DEDUPE_AUDIT_FILE = join(tmpdir(), "memory-merge-dedupe-audit-test-" + process.pid + ".jsonl");
process.env.ENG_MCP_MEMORY_MERGE_AUDIT_FILE = join(tmpdir(), "memory-merge-audit-test-" + process.pid + ".jsonl");

// ---- fixtures (identical shapes to memoryDedupe.test.ts) ----

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

const FIXED_NOW = Date.parse("2026-09-22T12:00:00.000Z");
const FIXED_ISO = "2026-09-22T12:00:00.000Z";
const DUP_REASON = "exact duplicate of the gate closure summary, same mission slug";
const DUP_DELETE: MergeDecision = {
  memoryIdA: "m1", memoryIdB: "m2", verdict: "duplicate",
  action: "DUPLICATE_DELETE", survivorId: "m1", reason: DUP_REASON
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
        id: "merge-test"
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

// Harness: in-memory KB store + recording updateMemory + injected judge/audit.
function harness(opts: { ctx: unknown; judgeAnswers?: Record<string, unknown>; judgeFail?: boolean; failOnCall?: number }) {
  const calls: CapturedBody[] = [];
  const store = new Map<string, Record<string, unknown>>();
  for (const row of rawRows(opts.ctx)) {
    if (typeof row.id === "string") store.set(row.id, { ...row });
  }
  const updateLog: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const updateMemory = async (id: string, fields: Record<string, unknown>) => {
    updateLog.push({ id, fields });
    if (updateLog.length === opts.failOnCall) throw new Error("BRIDGE_DOWN: OPERATION_NOT_ALLOWED");
    const row = store.get(id);
    if (!row) throw new Error("NOT_FOUND: " + id);
    Object.assign(row, fields);
  };
  const auditFile = join(tmpdir(), "memory-merge-audit-case-" + process.pid + "-" + Math.random().toString(36).slice(2) + ".jsonl");
  const deps: MemoryMergeDeps = {
    projectId: "memoryos",
    authorizerHash16: "0123456789abcdef",
    recentContext: async () => JSON.parse(JSON.stringify(opts.ctx)),
    updateMemory,
    judgeDeps: judgeDepsFor(opts.judgeAnswers ?? PAIR_ANSWERS, calls, opts.judgeFail),
    auditFile,
    now: () => FIXED_NOW
  };
  const storePayload = () => ({ projectId: "memoryos", memories: [...store.values()] });
  return { deps, store, updateLog, calls, storePayload, auditFile };
}

// ---- stripTombstoned ----

test("stripTombstoned filters tombstones from memories/results/bare payloads and keeps identity when nothing is tombstoned", () => {
  const live = { id: "a", content: "keep me" };
  const tomb = { id: "b", content: "gone", deleted: true };
  const memoriesOut = stripTombstoned({ memories: [live, tomb] }) as { memories: unknown[] };
  assert.deepEqual(memoriesOut.memories, [live]);
  const resultsOut = stripTombstoned({ results: [live, tomb] }) as { results: unknown[] };
  assert.deepEqual(resultsOut.results, [live]);
  const bareOut = stripTombstoned([live, tomb]) as unknown[];
  assert.deepEqual(bareOut, [live]);
  const intact = { memories: [live], other: 1 };
  assert.equal(stripTombstoned(intact), intact, "no copy at all when nothing is tombstoned");
  assert.equal(stripTombstoned("not-a-payload"), "not-a-payload");
  const noRows = { nope: [] };
  assert.equal(stripTombstoned(noRows), noRows, "non-row payloads pass through untouched");
});

// ---- plan: zero mutation, exact field plan ----

test("plan mode never mutates and previews the exact tombstone field plan", async () => {
  const h = harness({ ctx: ctxWithDuplicate });
  const result = await memoryMerge({ decisions: [DUP_DELETE], mode: "plan" }, h.deps);
  assert.equal(h.updateLog.length, 0);
  assert.equal(result.decisionsTotal, 1);
  assert.equal(result.applied, 0);
  assert.equal(result.refused, 0);
  assert.equal(result.results[0].status, "planned");
  assert.deepEqual(result.results[0].updates, [
    { id: "m1", fields: { merged_from: "m2", merged_at: FIXED_ISO } },
    { id: "m2", fields: { deleted: true, merged_into: "m1", deleted_reason: DUP_REASON, merged_at: FIXED_ISO } }
  ]);
  // anti-stale scan ran (pending existed) and confirmed the pair
  assert.equal(h.calls.length, 1);
  assert.equal(result.scan.verdict, "screened");
  assert.equal(result.scan.candidates, 1);
});

// ---- execute: tombstone apply + reads ----

test("execute applies DUPLICATE_DELETE survivor-first, tombstones the duplicate and never touches content", async () => {
  const h = harness({ ctx: ctxWithDuplicate });
  const result = await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h.deps);
  assert.equal(result.applied, 1);
  assert.equal(result.results[0].status, "applied");
  // deterministic sequence: survivor first, duplicate second
  assert.deepEqual(h.updateLog.map((u) => u.id), ["m1", "m2"]);
  assert.deepEqual(h.updateLog[0].fields, { merged_from: "m2", merged_at: FIXED_ISO });
  assert.equal(h.updateLog[1].fields.deleted, true);
  assert.equal(h.updateLog[1].fields.merged_into, "m1");
  assert.equal(h.updateLog[1].fields.deleted_reason, DUP_REASON);
  // content is NEVER part of any update (tombstone, not rewrite)
  for (const u of h.updateLog) assert.ok(!("content" in u.fields), "content must never be sent");
  // store state: provenance on survivor, tombstone on duplicate, contents intact
  assert.equal(h.store.get("m1")?.merged_from, "m2");
  assert.equal(h.store.get("m1")?.content, "[AGENT MEMORY]\nAgent: eng\nSummary: " + DUP_TEXT);
  assert.equal(h.store.get("m2")?.deleted, true);
  assert.equal(h.store.get("m2")?.content, "[AGENT MEMORY]\nAgent: eng\nSummary: " + DUP_TEXT);
});

test("post-apply reads hide the duplicate and the survivor keeps provenance", async () => {
  const h = harness({ ctx: ctxWithDuplicate });
  await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h.deps);
  const filtered = stripTombstoned(h.storePayload()) as { memories: Array<Record<string, unknown>> };
  assert.deepEqual(filtered.memories.map((m) => m.id), ["m1"], "tombstoned record is no longer returned by any reader");
  assert.equal(filtered.memories[0].merged_from, "m2");
  assert.equal(filtered.memories[0].content, "[AGENT MEMORY]\nAgent: eng\nSummary: " + DUP_TEXT);
});

// ---- idempotency ----

test("re-running an applied decision is NO_OP byte_identical with zero updates and no judge call", async () => {
  const first = harness({ ctx: ctxWithDuplicate });
  const applied = await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, first.deps);
  assert.equal(applied.applied, 1);
  // replay against the post-apply KB state
  const second = harness({ ctx: first.storePayload() });
  const replay = await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, second.deps);
  assert.equal(replay.noOp, 1);
  assert.equal(replay.results[0].status, "no_op");
  assert.equal(replay.results[0].reason, "byte_identical");
  assert.equal(second.updateLog.length, 0);
  assert.equal(second.calls.length, 0, "already-applied decisions skip the anti-stale scan");
});

// ---- fail-safe: rollback ----

test("mid-batch failure rolls back applied updates in reverse order with previous values", async () => {
  const h = harness({ ctx: ctxWithDuplicate, failOnCall: 2 });
  const result = await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h.deps);
  assert.equal(result.rolledBack, 1);
  const r = result.results[0];
  assert.equal(r.status, "rolled_back");
  assert.ok((r.reason ?? "").startsWith("apply_failed:BRIDGE_DOWN"), r.reason);
  // survivor update reverted with the previous (absent -> null) values
  assert.deepEqual(r.reverted, [{ id: "m1", fields: { merged_from: null, merged_at: null } }]);
  assert.deepEqual(h.updateLog.map((u) => u.id), ["m1", "m2", "m1"]);
  // duplicate was never tombstoned — no partial state
  assert.ok(!("deleted" in (h.store.get("m2") ?? {})));
  assert.equal(h.store.get("m1")?.merged_from, null);
});

// ---- anti-stale: fail-closed ----

test("judge unavailable in execute refuses the decision with zero updates (fail-closed)", async () => {
  const h = harness({ ctx: ctxWithDuplicate, judgeFail: true });
  const result = await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h.deps);
  assert.equal(result.refused, 1);
  assert.equal(result.applied, 0);
  assert.equal(result.results[0].status, "refused");
  assert.equal(result.results[0].reason, "judge_unavailable_fail_closed");
  assert.equal(result.scan.verdict, "unavailable");
  assert.equal(h.updateLog.length, 0);
});

test("pair no longer confirmed as duplicate is refused as verdict_changed", async () => {
  const h = harness({ ctx: ctxWithDuplicate, judgeAnswers: CONFLICT_ANSWERS });
  const result = await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h.deps);
  assert.equal(result.refused, 1);
  assert.equal(result.results[0].status, "refused");
  assert.equal(result.results[0].reason, "verdict_changed");
  assert.equal(h.updateLog.length, 0);
});

// ---- restoration (tombstone is an update, reversible) ----

test("restoration is a plain update revert: content identical and the row becomes visible again", async () => {
  const h = harness({ ctx: ctxWithDuplicate });
  await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h.deps);
  const before = h.store.get("m2")?.content;
  // operator-driven restoration: revert the tombstone fields via update
  await h.deps.updateMemory("m2", { deleted: null, merged_into: null, deleted_reason: null, merged_at: null });
  const row = h.store.get("m2") ?? {};
  assert.equal(row.deleted, null, "deleted===true is the only tombstone marker; null restores visibility");
  assert.equal(row.content, before, "content byte-identical through tombstone and revert");
  const visible = stripTombstoned(h.storePayload()) as { memories: Array<Record<string, unknown>> };
  assert.deepEqual(visible.memories.map((m) => m.id), ["m1", "m2"]);
});

// ---- audit trail ----

test("audit trail carries hashes and counters only — no ids, no reason text, no memory content", async () => {
  const h = harness({ ctx: ctxWithDuplicate });
  await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h.deps);
  const lines = readFileSync(h.auditFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.equal(lines.length, 2, "one decision entry + one batch_done");
  for (const line of lines) {
    const raw = JSON.stringify(line);
    assert.ok(!raw.includes("m1"), "pair ids must never appear");
    assert.ok(!raw.includes("m2"), "pair ids must never appear");
    assert.ok(!raw.includes(DUP_TEXT), "memory content must never appear");
    assert.ok(!raw.includes(DUP_REASON), "decision reason must never appear");
  }
  const decisionEntry = lines[0];
  assert.ok(/^[0-9a-f]{16}$/.test(String(decisionEntry.pair_sha16)));
  assert.equal(decisionEntry.status, "applied");
  assert.equal(decisionEntry.records_affected, 2);
  assert.equal(decisionEntry.authorizerHash16, "0123456789abcdef");
  const batch = lines[1];
  assert.equal(batch.status, "batch_done");
  assert.equal(batch.decisions_total, 1);
  assert.equal(batch.applied, 1);
  assert.ok((batch.scan_cost as number) > 0);
});

// ---- conflict resolutions and annotations ----

test("CONFLICT_RESOLVE keep_second annotates the loser and keep_both_period_tag annotates both", async () => {
  const h1 = harness({ ctx: ctxWithConflict, judgeAnswers: CONFLICT_ANSWERS });
  const r1 = await memoryMerge({
    decisions: [{ memoryIdA: "c1", memoryIdB: "c2", verdict: "conflict", action: "CONFLICT_RESOLVE", resolution: "keep_second", reason: "second record reflects the shipped reranker behavior" }],
    mode: "execute"
  }, h1.deps);
  assert.equal(r1.applied, 1);
  assert.deepEqual(h1.updateLog, [{ id: "c1", fields: { stale: true, stale_reason: "second record reflects the shipped reranker behavior", superseded_by: "c2", stale_at: FIXED_ISO } }]);

  const h2 = harness({ ctx: ctxWithConflict, judgeAnswers: CONFLICT_ANSWERS });
  const r2 = await memoryMerge({
    decisions: [{ memoryIdA: "c1", memoryIdB: "c2", verdict: "conflict", action: "CONFLICT_RESOLVE", resolution: "keep_both_period_tag", periodTag: "2026-W39" }],
    mode: "execute"
  }, h2.deps);
  assert.equal(r2.applied, 1);
  assert.deepEqual(h2.updateLog, [
    { id: "c1", fields: { period_tag: "2026-W39", tagged_at: FIXED_ISO } },
    { id: "c2", fields: { period_tag: "2026-W39", tagged_at: FIXED_ISO } }
  ]);
});

test("MARK_STALE and PERIOD_TAG annotate exactly the target row", async () => {
  const h1 = harness({ ctx: ctxWithConflict, judgeAnswers: CONFLICT_ANSWERS });
  const r1 = await memoryMerge({
    decisions: [{ memoryIdA: "c1", memoryIdB: "c2", verdict: "conflict", action: "MARK_STALE", targetId: "c1", reason: "superseded by the certified reranker contract" }],
    mode: "execute"
  }, h1.deps);
  assert.equal(r1.applied, 1);
  assert.deepEqual(h1.updateLog, [{ id: "c1", fields: { stale: true, stale_reason: "superseded by the certified reranker contract", stale_at: FIXED_ISO } }]);

  const h2 = harness({ ctx: ctxWithConflict, judgeAnswers: CONFLICT_ANSWERS });
  const r2 = await memoryMerge({
    decisions: [{ memoryIdA: "c1", memoryIdB: "c2", verdict: "conflict", action: "PERIOD_TAG", targetId: "c2", periodTag: "sprint-39" }],
    mode: "execute"
  }, h2.deps);
  assert.equal(r2.applied, 1);
  assert.deepEqual(h2.updateLog, [{ id: "c2", fields: { period_tag: "sprint-39", tagged_at: FIXED_ISO } }]);
});

// ---- structural validation + state refusals (before any scan) ----

test("incomplete decisions are refused per-decision with exact reasons and no scan", async () => {
  const h = harness({ ctx: ctxWithDuplicate });
  const result = await memoryMerge({
    decisions: [
      { memoryIdA: "m1", memoryIdB: "m1", verdict: "duplicate", action: "DUPLICATE_DELETE", survivorId: "m1", reason: DUP_REASON },
      { memoryIdA: "m1", memoryIdB: "m2", verdict: "duplicate", action: "DUPLICATE_DELETE", reason: DUP_REASON },
      { memoryIdA: "m1", memoryIdB: "m2", verdict: "duplicate", action: "DUPLICATE_DELETE", survivorId: "m1", reason: "short" },
      { memoryIdA: "m1", memoryIdB: "m2", verdict: "conflict", action: "CONFLICT_RESOLVE", resolution: "keep_both_period_tag" },
      { memoryIdA: "m1", memoryIdB: "m2", verdict: "conflict", action: "MARK_STALE", targetId: "zz9", reason: "stale target outside the pair" }
    ],
    mode: "plan"
  }, h.deps);
  assert.deepEqual(result.results.map((r) => r.reason), [
    "same_ids",
    "survivor_must_be_in_pair",
    "reason_required_min_8",
    "period_tag_required",
    "target_must_be_in_pair"
  ]);
  assert.equal(h.updateLog.length, 0);
  assert.equal(h.calls.length, 0, "validation refusals never reach the judge");
});

test("missing pair and tombstoned target refuse without scanning", async () => {
  const h1 = harness({ ctx: ctxWithDuplicate });
  const r1 = await memoryMerge({
    decisions: [{ memoryIdA: "zz1", memoryIdB: "zz2", verdict: "duplicate", action: "DUPLICATE_DELETE", survivorId: "zz1", reason: DUP_REASON }],
    mode: "execute"
  }, h1.deps);
  assert.equal(r1.results[0].status, "refused");
  assert.equal(r1.results[0].reason, "pair_not_found");
  assert.equal(h1.calls.length, 0);

  const tombCtx = {
    projectId: "memoryos",
    memories: [
      { id: "m1", content: "alive", createdAt: "t1" },
      { id: "m2", content: "already tombstoned", createdAt: "t2", deleted: true }
    ]
  };
  const h2 = harness({ ctx: tombCtx });
  const r2 = await memoryMerge({ decisions: [DUP_DELETE], mode: "execute" }, h2.deps);
  assert.equal(r2.results[0].status, "refused");
  assert.equal(r2.results[0].reason, "target_unavailable");
  assert.equal(h2.calls.length, 0);
});

// ---- input guards ----

test("zero decisions and over-cap decisions throw typed errors", async () => {
  const h = harness({ ctx: ctxWithDuplicate });
  await assert.rejects(
    () => memoryMerge({ decisions: [] }, h.deps),
    (e: unknown) => e instanceof EngineeringError && (e as EngineeringError).code === "MEMORY_MERGE_NO_DECISIONS"
  );
  const many: MergeDecision[] = Array.from({ length: 21 }, (_, i) => ({
    memoryIdA: "a" + i, memoryIdB: "b" + i, verdict: "duplicate", action: "DUPLICATE_DELETE", survivorId: "a" + i, reason: DUP_REASON
  }));
  await assert.rejects(
    () => memoryMerge({ decisions: many }, h.deps),
    (e: unknown) => e instanceof EngineeringError && (e as EngineeringError).code === "MEMORY_MERGE_TOO_MANY_DECISIONS"
  );
});
