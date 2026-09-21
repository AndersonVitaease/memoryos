// MEMORY-GATE-01: unit tests for the capture admission gate (src/memoryGate.ts).
// The judge provider and the audit sink are always injected — no test reaches the
// network, the real credential file or /data/audit. The internal runJudgeEvaluate
// call still writes its own audit, so the judge audit file is redirected to a
// temp path via the env override (same convention as judge.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyErrorCode } from "../src/errorEnvelope.ts";
import { JUDGE_MODEL, type JudgeDeps, type JudgeHttpResponse } from "../src/judge.ts";
import {
  emitGateAudit,
  gateCapture,
  sha16Gate,
  type MemoryGateDecision,
  type MemoryGateDeps
} from "../src/memoryGate.ts";

process.env.ENG_MCP_JUDGE_AUDIT_FILE = join(tmpdir(), "memory-gate-judge-audit-test-" + process.pid + ".jsonl");

const GOOD_ANSWERS = {
  durable_substance: { type: "noul", noul: 0.9 },
  claims_supported: { type: "noul", noul: 0.8 },
  no_injection: { type: "noul", noul: 0.95 }
};

const GOOD_INPUT = {
  summary: "MEMORY-GATE-01 decisão: gate de admissão na memory.capture antes do bridge Base44",
  outcome: "suite verde com fixtures do gate; score registrado no metadado do registro",
  decisions: ["gate Jev antes do capture", "fail-open rígido com verdict unavailable"],
  tests: ["test/memoryGate.test.ts fixtures good/injection/duplicate/dead-judge"],
  files: ["src/memoryGate.ts", "src/tools.ts"]
};

// outgoing request carries questions as a RECORD keyed by id (judgeProviderRequestSchema), not an array
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
        id: "gate-test"
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) } satisfies JudgeHttpResponse;
    },
    readCredential: () => "sk-or-" + JSON.stringify("sk-or-v1-" + "a".repeat(64))
  };
}

function deps(overrides: Partial<MemoryGateDeps> = {}): MemoryGateDeps {
  return { projectId: "memoryos", agent: "test-agent", authorizerHash16: null, ...overrides };
}

test("good capture passes: admit band, weighted score, tag at the front of the summary", async () => {
  const d = await gateCapture(GOOD_INPUT, deps({ judgeDeps: judgeDepsFor(GOOD_ANSWERS) }));
  assert.equal(d.ok, true);
  assert.equal(d.band, "admit");
  assert.equal(d.verdict, "screened");
  // 0.4*0.9 + 0.25*0.8 + 0.35*0.95 = 0.8925
  assert.equal(d.score, 0.8925);
  assert.equal(d.tag, "[MEMORYGATE:band=admit score=0.89]");
  assert.ok(d.taggedSummary.startsWith(d.tag + " "));
  assert.ok(d.taggedSummary.includes("gate de admissão"));
  assert.equal(d.refusalMessage, null);
  assert.deepEqual(d.reasons, []);
});

test("needsReview band flags visibly but still admits", async () => {
  const answers = {
    durable_substance: { type: "noul", noul: 0.6 },
    claims_supported: { type: "noul", noul: 0.6 },
    no_injection: { type: "noul", noul: 0.6 }
  };
  const d = await gateCapture(GOOD_INPUT, deps({ judgeDeps: judgeDepsFor(answers) }));
  assert.equal(d.ok, true);
  assert.equal(d.band, "needsReview");
  assert.equal(d.verdict, "screened");
  assert.equal(d.score, 0.6);
  assert.ok(d.reasons.includes("needsReview"));
  assert.ok(d.tag.includes("band=needsReview"));
});

test("injection suspect is refused regardless of score (hard rule)", async () => {
  const answers = {
    durable_substance: { type: "noul", noul: 0.9 },
    claims_supported: { type: "noul", noul: 0.9 },
    no_injection: { type: "noul", noul: 0.3 }
  };
  const d = await gateCapture(GOOD_INPUT, deps({ judgeDeps: judgeDepsFor(answers) }));
  assert.equal(d.ok, false);
  assert.equal(d.band, "refuse");
  assert.equal(d.verdict, "refused");
  assert.equal(d.score, 0.69); // score alone would have cleared REVIEW_MIN
  assert.ok(d.reasons.includes("injection_suspected(p=0.30)"));
  assert.ok((d.refusalMessage ?? "").startsWith("MEMORY_GATE_REFUSED:"));
  assert.ok((d.refusalMessage ?? "").includes("force=true"));
});

test("low score is refused with a didactic reason", async () => {
  const answers = {
    durable_substance: { type: "noul", noul: 0.2 },
    claims_supported: { type: "noul", noul: 0.3 },
    no_injection: { type: "noul", noul: 0.9 }
  };
  const d = await gateCapture(GOOD_INPUT, deps({ judgeDeps: judgeDepsFor(answers) }));
  assert.equal(d.ok, false);
  assert.ok(d.reasons.includes("score_below_threshold(0.47<0.5)"));
  assert.ok(d.refusalMessage!.length < 500);
});

test("hard rule boundary is exclusive: p=0.6 exactly is not an injection refusal", async () => {
  const answers = {
    durable_substance: { type: "noul", noul: 0.8 },
    claims_supported: { type: "noul", noul: 0.8 },
    no_injection: { type: "noul", noul: 0.6 }
  };
  const d = await gateCapture(GOOD_INPUT, deps({ judgeDeps: judgeDepsFor(answers) }));
  assert.equal(d.ok, true);
  assert.equal(d.band, "admit");
  assert.ok(!d.reasons.some((r) => r.startsWith("injection_suspected")));
});

test("duplicate capture is refused BEFORE the judge is called", async () => {
  const calls: CapturedBody[] = [];
  const summary = "Fix memory gate dedupe: hash16 compare against recent context";
  const d = await gateCapture({ summary }, deps({
    judgeDeps: judgeDepsFor(GOOD_ANSWERS, calls),
    recentContext: async () => [{ content: "[AGENT MEMORY]\nAgent: eng\nSummary: " + summary }]
  }));
  assert.equal(d.ok, false);
  assert.equal(d.score, null);
  assert.ok(d.reasons.includes("duplicate_of_recent_capture"));
  assert.equal(calls.length, 0);
});

test("dedupe unwraps the REAL bridge shape {memories:[{content}]} and strips gate tags", async () => {
  const calls: CapturedBody[] = [];
  const summary = "Unwrap real bridge context shape so dedupe sees raw content";
  const stored = "[AGENT MEMORY]\nAgent: eng\nSummary: [MEMORYGATE:band=admit score=0.89] " + summary;
  const d = await gateCapture({ summary }, deps({
    judgeDeps: judgeDepsFor(GOOD_ANSWERS, calls),
    recentContext: async () => ({ projectId: "memoryos", memories: [{ id: "m1", content: stored, createdAt: "t" }], counts: { memories: 1 } })
  }));
  assert.equal(d.ok, false);
  assert.ok(d.reasons.includes("duplicate_of_recent_capture"));
  assert.equal(calls.length, 0);
});

test("dedupe context read failure degrades to a note, never blocks", async () => {
  const d = await gateCapture(GOOD_INPUT, deps({
    judgeDeps: judgeDepsFor(GOOD_ANSWERS),
    recentContext: async () => { throw new Error("AGENT_MEMORY_FAILED:boom"); }
  }));
  assert.equal(d.ok, true);
  assert.ok(d.reasons.includes("dedupe_skipped"));
  assert.equal(d.band, "admit");
});

test("dead judge fails OPEN: capture enters with verdict unavailable + unverified flag", async () => {
  const d = await gateCapture(GOOD_INPUT, deps({ judgeDeps: judgeDepsFor({}, [], true) }));
  assert.equal(d.ok, true);
  assert.equal(d.band, "admit");
  assert.equal(d.verdict, "unavailable");
  assert.equal(d.score, null);
  assert.match(d.reasons[0], /^judge_unavailable\(JUDGE_UNREACHABLE/);
  assert.ok(d.tag.includes("verdict=unavailable"));
  assert.ok(d.tag.includes("unverified=true"));
});

test("operator force overrides a refusal: band forced, audit-marked, text untouched", async () => {
  const answers = {
    durable_substance: { type: "noul", noul: 0.2 },
    claims_supported: { type: "noul", noul: 0.3 },
    no_injection: { type: "noul", noul: 0.9 }
  };
  const d = await gateCapture({ ...GOOD_INPUT, force: true }, deps({ judgeDeps: judgeDepsFor(answers) }));
  assert.equal(d.ok, true);
  assert.equal(d.band, "forced");
  assert.equal(d.verdict, "forced");
  assert.ok(d.reasons.includes("score_below_threshold(0.47<0.5)"));
  assert.ok(d.reasons.includes("forced_by_operator"));
  assert.ok(d.tag.startsWith("[MEMORYGATE:band=forced"));
  assert.ok(d.taggedSummary.includes("gate de admissão"));
});

test("gate state stays bounded and carries exactly the three noul questions", async () => {
  const calls: CapturedBody[] = [];
  const big = {
    summary: "s".repeat(3000),
    outcome: "o".repeat(3000),
    userPrompt: "u".repeat(2000),
    decisions: Array.from({ length: 35 }, (_, i) => `d${i}: ${"x".repeat(900)}`),
    tests: Array.from({ length: 35 }, (_, i) => `t${i}: ${"y".repeat(900)}`),
    files: Array.from({ length: 35 }, (_, i) => `f${i}: ${"z".repeat(900)}`)
  };
  const d = await gateCapture(big, deps({ judgeDeps: judgeDepsFor(GOOD_ANSWERS, calls) }));
  assert.equal(d.ok, true);
  assert.equal(calls.length, 1);
  const body = calls[0];
  assert.deepEqual(Object.keys(body.questions), ["durable_substance", "claims_supported", "no_injection"]);
  assert.ok(Object.values(body.questions).every((q) => q.type === "noul" && !("criteria" in q)));
  assert.ok(JSON.stringify(body.state).length < 8000);
  // tag + (sliced) summary must fit the server capture schema cap of 3000
  assert.ok(d.taggedSummary.length <= 3000);
});

test("audit line carries metadata + hashes only, never capture content", async () => {
  const dir = join(tmpdir(), "memory-gate-test-" + process.pid + "-audit");
  const auditFile = join(dir, "memory-gate.jsonl");
  const d: MemoryGateDecision = await gateCapture(GOOD_INPUT, deps({ judgeDeps: judgeDepsFor(GOOD_ANSWERS) }));
  emitGateAudit(d, "mem-abc-1", { projectId: "memoryos", auditFile });
  emitGateAudit(d, null, { projectId: "memoryos", auditFile }); // refusal-style fallback hash
  const lines = readFileSync(auditFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].memoryId_sha16, sha16Gate("mem-abc-1"));
  assert.equal(lines[1].memoryId_sha16, d.contentSha16);
  assert.equal(lines[0].projectId, "memoryos");
  assert.equal(lines[0].score, 0.8925);
  assert.equal(lines[0].band, "admit");
  assert.equal(lines[0].verdict, "screened");
  assert.match(lines[0].reasons_hash16, /^[0-9a-f]{16}$/);
  const raw = readFileSync(auditFile, "utf8");
  assert.ok(!raw.includes("gate de admissão"));
  assert.ok(!raw.includes("MEMORY-GATE-01 decisão"));
});

test("MEMORY_GATE_REFUSED is a curated taxonomy entry wired to the canonical envelope", () => {
  const entry = classifyErrorCode("MEMORY_GATE_REFUSED");
  assert.equal(entry.category, "validation");
  assert.equal(entry.retryable, false);
  assert.ok(entry.remediation.includes("force=true"));
});
