// JUDGE-01: unit tests for the calibrated-judgment backends (src/judge.ts).
// The provider is always injected (JudgeDeps) — no test ever reaches the
// network or the real credential file. Synthetic credential strings are built
// at runtime (prefix + repeated filler), never written as literals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADVISORY,
  JUDGE_DECISION_THRESHOLD,
  JUDGE_ENDPOINT,
  JUDGE_MODEL,
  JudgeError,
  VERDICT_CRITERIA,
  VERIFY_RUBRIC,
  redactJudgeSecrets,
  runJudgeEvaluate,
  runJudgeVerify,
  sanitizeJudgeValue,
  type JudgeDeps,
  type JudgeHttpResponse
} from "../src/judge.ts";

// JUDGE-02: audit tests route every audit write to a temp file via the env
// override — the real /data/audit/judge.jsonl is never touched from tests.
process.env.ENG_MCP_JUDGE_AUDIT_FILE = join(tmpdir(), "judge-audit-test-" + process.pid + ".jsonl");

// Runtime-built synthetic key: the production credential file carries a stray
// leading artifact before the quoted key, and the extractor must skip past it.
const RAW_KEY = "sk-or-v1-" + "a".repeat(64);
const VALID_CREDENTIAL = "sk-or-" + JSON.stringify(RAW_KEY);
const GH_LIKE_TOKEN = "ghp_" + "A".repeat(20);

type CapturedInit = { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: "error" };
type CapturedCall = { url: string; init: CapturedInit };

function judgeResponse(payload: unknown, status = 200): JudgeHttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function providerPayload(answers: Record<string, unknown>, model = JUDGE_MODEL + "-20260917"): Record<string, unknown> {
  return { model, answers, usage: { input_tokens: 500, output_tokens: 100, cost: 0.00002 }, id: "gen-dec-test", provider: "TypeSafe" };
}

function choiceAnswer(choice: string, probabilities: Record<string, number>, confidence = 0.9): Record<string, unknown> {
  return { type: "choice", choice, probabilities, confidence };
}

function verifyResponse(c1: Record<string, unknown>, c2?: Record<string, unknown>): Record<string, unknown> {
  const answers: Record<string, unknown> = { c1 };
  if (c2) answers.c2 = c2;
  return providerPayload(answers);
}

const VERDICT_PROBABILITIES = { supported: 0.97, contradicted: 0.02, not_addressed: 0.01 };

function makeDeps(options: {
  response?: () => JudgeHttpResponse | Promise<JudgeHttpResponse>;
  credential?: string;
  timeoutMs?: number;
  authorizerHash16?: string;
  auditFile?: string;
}): { deps: JudgeDeps; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetchImpl = async (url: string, init: CapturedInit): Promise<JudgeHttpResponse> => {
    calls.push({ url, init });
    return options.response ? options.response() : judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES)));
  };
  const readCredential = (path: string): string => {
    if (options.credential === undefined) throw new Error("ENOENT: " + path);
    return options.credential;
  };
  const deps: JudgeDeps = { fetchImpl, readCredential };
  if (options.timeoutMs !== undefined) deps.timeoutMs = options.timeoutMs;
  if (options.authorizerHash16 !== undefined) deps.authorizerHash16 = options.authorizerHash16;
  if (options.auditFile !== undefined) deps.auditFile = options.auditFile;
  return { deps, calls };
}

const VERIFY_INPUT = {
  claims: [
    { id: "c1", text: "the merge returned NOTHING_TO_MERGE with ahead 10 and behind 0" },
    { id: "c2", text: "the push reached the remote head" }
  ],
  evidence: { merge: "NOTHING_TO_MERGE ahead=10 behind=0", push: "pushedSha ba4a0b69" }
};

const EVALUATE_INPUT = {
  state: { decision: "promote candidate", tests: "1031/0F" },
  questions: [
    { id: "q_noul", type: "noul" as const, instructions: "Is the decision ready?" },
    { id: "q_choice", type: "choice" as const, instructions: "Which action?", criteria: { promote: "ship it", hold: "wait" } },
    { id: "q_score", type: "score" as const, instructions: "How confident?", criteria: ["none", "low", "medium", "high", "certain", "absolute"] }
  ]
};

test("verify: happy path — one POST, typed questions, threshold verdicts, envelope shape", async () => {
  const { deps, calls } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES), choiceAnswer("supported", { supported: 0.72, contradicted: 0.2, not_addressed: 0.08 })))
  });
  const result = await runJudgeVerify(VERIFY_INPUT, deps);
  assert.equal(calls.length, 1, "exactly one provider call — no retries");
  assert.equal(calls[0].url, JUDGE_ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer " + RAW_KEY);
  assert.ok(!calls[0].init.headers.Authorization.includes(VALID_CREDENTIAL), "doubled-prefix artifact must not leak into the header");
  const body = JSON.parse(calls[0].init.body) as { model: string; questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> }> };
  assert.equal(body.model, JUDGE_MODEL);
  assert.equal(body.questions.c1.type, "choice");
  assert.deepEqual(body.questions.c1.criteria, VERDICT_CRITERIA);
  assert.ok(body.questions.c1.instructions.startsWith(VERIFY_RUBRIC));
  assert.ok(body.questions.c1.instructions.includes(VERIFY_INPUT.claims[0].text));
  assert.equal(result.status, "JUDGED");
  assert.equal(result.tool, "engineering.judge.verify");
  assert.equal(result.aggregate, "ALL_SUPPORTED");
  assert.deepEqual(result.counts, { supported: 2, contradicted: 0, not_addressed: 0, uncertain: 0 });
  assert.equal(result.claims[0].verdict, "supported");
  assert.equal(result.claims[1].verdict, "supported");
  assert.ok(result.advisory === ADVISORY && ADVISORY.includes("not a security boundary"));
  assert.equal(result.provider.model, JUDGE_MODEL + "-20260917");
  assert.equal(result.provider.cost, 0.00002);
  assert.equal(result.provenance.credentialSha16, createHash("sha256").update(VALID_CREDENTIAL).digest("hex").slice(0, 16));
  assert.match(result.provenance.stateHash16, /^[a-f0-9]{16}$/);
  assert.match(result.provenance.evidenceHash16, /^[a-f0-9]{16}$/);
});

test("verify: rubric is the closed-world literal and verdict keys are exactly three", () => {
  assert.ok(VERIFY_RUBRIC.includes("ONLY the evidence"));
  assert.ok(VERIFY_RUBRIC.includes("not_addressed"));
  assert.deepEqual(Object.keys(VERDICT_CRITERIA), ["supported", "contradicted", "not_addressed"]);
  assert.equal(JUDGE_DECISION_THRESHOLD, 0.6);
});

test("verify: sanitizes evidence BEFORE the provider call (evidence leaves, secrets never)", async () => {
  const { deps, calls } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES)))
  });
  const result = await runJudgeVerify({
    claims: [{ id: "c1", text: "audit holds" }],
    evidence: { note: "Bearer " + RAW_KEY, api_key: "raw-secret", safe: "plain" }
  }, deps);
  const body = JSON.parse(calls[0].init.body) as { state: Record<string, unknown> };
  assert.equal(body.state.note, "[REDACTED_SECRET]");
  assert.equal(body.state.api_key, "[REDACTED_SECRET]");
  assert.equal(body.state.safe, "plain");
  assert.ok(!calls[0].init.body.includes("raw-secret"));
  assert.ok(!calls[0].init.body.includes(RAW_KEY));
  assert.ok(result.provenance.redactions >= 2);
});

test("verify: p_max below the 0.6 threshold yields uncertain + UNCERTAIN aggregate", async () => {
  const { deps } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(verifyResponse(choiceAnswer("supported", { supported: 0.4, contradicted: 0.35, not_addressed: 0.25 }), choiceAnswer("not_addressed", { supported: 0.1, contradicted: 0.1, not_addressed: 0.8 })))
  });
  const result = await runJudgeVerify(VERIFY_INPUT, deps);
  assert.equal(result.claims[0].verdict, "uncertain");
  assert.equal(result.claims[1].verdict, "not_addressed");
  assert.equal(result.aggregate, "UNCERTAIN");
});

test("verify: contradicted claim yields HAS_CONTRADICTIONS; mixed yields MIXED", async () => {
  const { deps } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES), choiceAnswer("contradicted", { supported: 0.1, contradicted: 0.8, not_addressed: 0.1 })))
  });
  const result = await runJudgeVerify(VERIFY_INPUT, deps);
  assert.equal(result.aggregate, "HAS_CONTRADICTIONS");
  assert.equal(result.counts.contradicted, 1);
  const { deps: deps2 } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES), choiceAnswer("not_addressed", { supported: 0.1, contradicted: 0.1, not_addressed: 0.8 })))
  });
  const result2 = await runJudgeVerify(VERIFY_INPUT, deps2);
  assert.equal(result2.aggregate, "MIXED");
});

test("verify: provider 429 is a structured failure retried never", async () => {
  const { deps, calls } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse({ error: { message: "rate limited", code: 429 } }, 429)
  });
  await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, deps), (error: unknown) => {
    assert.ok(error instanceof JudgeError);
    assert.equal((error as JudgeError).code, "JUDGE_RATE_LIMIT");
    assert.ok((error as JudgeError).message.includes("rate limited"));
    return true;
  });
  assert.equal(calls.length, 1, "no retry after a provider rejection");
});

test("verify: timeout aborts the call and never fabricates a judgment", async () => {
  const calls: CapturedCall[] = [];
  const deps: JudgeDeps = {
    fetchImpl: (url, init) => {
      calls.push({ url, init });
      return new Promise<JudgeHttpResponse>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    },
    readCredential: () => VALID_CREDENTIAL,
    timeoutMs: 40
  };
  await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, deps), (error: unknown) => {
    assert.ok(error instanceof JudgeError);
    assert.equal((error as JudgeError).code, "JUDGE_TIMEOUT");
    return true;
  });
  assert.equal(calls.length, 1, "one call made, aborted — no retry");
});

test("verify: provider output invalid — missing answer, wrong model pin, bad distribution", async () => {
  const missing = makeDeps({ credential: VALID_CREDENTIAL, response: () => judgeResponse(providerPayload({ c1: choiceAnswer("supported", VERDICT_PROBABILITIES) })) });
  await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, missing.deps), (error: unknown) => (error as JudgeError).code === "JUDGE_OUTPUT_INVALID");
  const wrongModel = makeDeps({ credential: VALID_CREDENTIAL, response: () => judgeResponse(providerPayload({ c1: choiceAnswer("supported", VERDICT_PROBABILITIES), c2: choiceAnswer("supported", VERDICT_PROBABILITIES) }, "typesafe/jev-9.9")) });
  await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, wrongModel.deps), (error: unknown) => (error as JudgeError).code === "JUDGE_OUTPUT_INVALID");
  const badSum = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(verifyResponse(choiceAnswer("supported", { supported: 0.5, contradicted: 0.1, not_addressed: 0.1 })))
  });
  await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, badSum.deps), (error: unknown) => (error as JudgeError).code === "JUDGE_OUTPUT_INVALID");
});

test("verify: credential is file-only — missing, invalid and doubled-prefix extraction", async () => {
  const missing = makeDeps({ response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES))) });
  await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, missing.deps), (error: unknown) => (error as JudgeError).code === "JUDGE_CREDENTIAL_MISSING");
  const invalid = makeDeps({ credential: "not-a-key", response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES))) });
  await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, invalid.deps), (error: unknown) => (error as JudgeError).code === "JUDGE_CREDENTIAL_INVALID");
  const ok = makeDeps({ credential: VALID_CREDENTIAL, response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES), choiceAnswer("supported", { supported: 0.72, contradicted: 0.2, not_addressed: 0.08 }))) });
  const result = await runJudgeVerify(VERIFY_INPUT, ok.deps);
  assert.equal(result.provenance.credentialSha16, createHash("sha256").update(VALID_CREDENTIAL).digest("hex").slice(0, 16));
});

test("verify: duplicate claim ids are refused structurally", async () => {
  const { deps } = makeDeps({ credential: VALID_CREDENTIAL });
  await assert.rejects(
    () => runJudgeVerify({ claims: [{ id: "c1", text: "a" }, { id: "c1", text: "b" }], evidence: "x" }, deps),
    (error: unknown) => (error as JudgeError).code === "JUDGE_INPUT_INVALID"
  );
});

test("verify: idempotent — two identical calls produce identical verdict payloads", async () => {
  const first = makeDeps({ credential: VALID_CREDENTIAL, response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES), choiceAnswer("supported", { supported: 0.72, contradicted: 0.2, not_addressed: 0.08 }))) });
  const second = makeDeps({ credential: VALID_CREDENTIAL, response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES), choiceAnswer("supported", { supported: 0.72, contradicted: 0.2, not_addressed: 0.08 }))) });
  const a = await runJudgeVerify(VERIFY_INPUT, first.deps);
  const b = await runJudgeVerify(VERIFY_INPUT, second.deps);
  assert.deepEqual(a.claims, b.claims);
  assert.deepEqual(a.aggregate, b.aggregate);
  assert.deepEqual(a.provenance, b.provenance);
});

test("evaluate: noul/choice/score map through with full distributions", async () => {
  const { deps, calls } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(providerPayload({
      q_noul: { type: "noul", noul: 0.91 },
      q_choice: choiceAnswer("promote", { promote: 0.8, hold: 0.2 }),
      q_score: { type: "score", score: 3.66, legend: { "0": "none", "1": "low", "2": "medium", "3": "high", "4": "certain", "5": "absolute" }, probabilities: { "0": 0.01, "1": 0.04, "2": 0.15, "3": 0.3, "4": 0.3, "5": 0.2 }, confidence: 0.7 }
    }))
  });
  const result = await runJudgeEvaluate(EVALUATE_INPUT, deps);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body) as { model: string; questions: Record<string, { type: string }> };
  assert.equal(body.model, JUDGE_MODEL);
  assert.equal(body.questions.q_noul.type, "noul");
  assert.equal(body.questions.q_choice.type, "choice");
  assert.equal(body.questions.q_score.type, "score");
  const noul = result.answers.find((answer) => answer.id === "q_noul");
  if (!noul || !("complementProbability" in noul)) throw new Error("missing noul answer");
  assert.equal(noul.probability, 0.91);
  assert.equal(noul.complementProbability, 1 - 0.91);
  const choice = result.answers.find((answer) => answer.id === "q_choice");
  if (!choice || !("choice" in choice)) throw new Error("missing choice answer");
  assert.equal(choice.choice, "promote");
  const score = result.answers.find((answer) => answer.id === "q_score");
  if (!score || !("normalizedScore" in score)) throw new Error("missing score answer");
  assert.ok(Math.abs(score.normalizedScore - 0.732) < 1e-9);
  assert.equal(result.status, "JUDGED");
  assert.ok(result.advisory === ADVISORY);
});

test("evaluate: per-type criteria validation is structural and never reaches the provider", async () => {
  const missingCriteria = makeDeps({ credential: VALID_CREDENTIAL });
  await assert.rejects(
    () => runJudgeEvaluate({ state: "x", questions: [{ id: "q1", type: "choice", instructions: "pick" }] }, missingCriteria.deps),
    (error: unknown) => (error as JudgeError).code === "JUDGE_INPUT_INVALID"
  );
  const wrongCriteriaShape = makeDeps({ credential: VALID_CREDENTIAL });
  await assert.rejects(
    () => runJudgeEvaluate({ state: "x", questions: [{ id: "q1", type: "score", instructions: "rate", criteria: { a: "A" } }] }, wrongCriteriaShape.deps),
    (error: unknown) => (error as JudgeError).code === "JUDGE_INPUT_INVALID"
  );
  const noulWithCriteria = makeDeps({ credential: VALID_CREDENTIAL });
  await assert.rejects(
    () => runJudgeEvaluate({ state: "x", questions: [{ id: "q1", type: "noul", instructions: "y", criteria: ["a", "b"] }] }, noulWithCriteria.deps),
    (error: unknown) => (error as JudgeError).code === "JUDGE_INPUT_INVALID"
  );
  assert.equal(missingCriteria.calls.length, 0);
  assert.equal(wrongCriteriaShape.calls.length, 0);
  assert.equal(noulWithCriteria.calls.length, 0);
});

test("sanitize: value patterns, secret keys and the depth cap", () => {
  const redacted = redactJudgeSecrets("Bearer abc123 " + RAW_KEY + " " + GH_LIKE_TOKEN);
  assert.ok(!redacted.includes("Bearer abc123"));
  assert.ok(!redacted.includes(RAW_KEY));
  assert.ok(!redacted.includes(GH_LIKE_TOKEN));
  assert.ok(redacted.includes("[REDACTED_SECRET]"));
  assert.ok(redactJudgeSecrets("plain text stays").includes("plain text stays"));
  assert.ok(redactJudgeSecrets("x").length <= 500);
  const deep: Record<string, unknown> = { value: "ok" };
  let cursor: Record<string, unknown> = deep;
  for (let i = 0; i < 20; i++) {
    const next: Record<string, unknown> = { value: "ok" };
    cursor.nested = next;
    cursor = next;
  }
  const sanitized = sanitizeJudgeValue(deep);
  assert.ok(JSON.stringify(sanitized.value).includes("[REDACTED_DEPTH]"));
  const keyed = sanitizeJudgeValue({ token: "abc", password: "def", fine: "kept" });
  assert.equal(keyed.value.token, "[REDACTED_SECRET]");
  assert.equal(keyed.value.password, "[REDACTED_SECRET]");
  assert.equal(keyed.value.fine, "kept");
});

// JUDGE-02: the audit trail — one JSONL line per terminal outcome, metadata + hashes only.
test("verify writes an audit line with metadata and hashes only (success path)", async () => {
  const auditFile = join(tmpdir(), "judge-audit-success-" + process.pid + ".jsonl");
  const { deps } = makeDeps({ credential: VALID_CREDENTIAL, response: () => judgeResponse(verifyResponse(choiceAnswer("supported", VERDICT_PROBABILITIES), choiceAnswer("supported", { supported: 0.72, contradicted: 0.2, not_addressed: 0.08 }))), authorizerHash16: "0123456789abcdef", auditFile });
  rmSync(auditFile, { force: true });
  try {
    const result = await runJudgeVerify(VERIFY_INPUT, deps);
    assert.equal(result.audit, "written");
    const lines = readFileSync(auditFile, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.deepEqual(Object.keys(entry), ["ts", "tool", "n_claims", "verdict", "model", "usage", "latency_ms", "authorizerHash16", "contentHash16"]);
    assert.match(entry.ts as string, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(entry.tool, "engineering.judge.verify");
    assert.equal(entry.n_claims, 2);
    assert.equal(entry.verdict, "ALL_SUPPORTED");
    assert.equal(entry.model, JUDGE_MODEL + "-20260917");
    assert.deepEqual(entry.usage, { cost: 0.00002, inputTokens: 500, outputTokens: 100 });
    assert.equal(typeof entry.latency_ms, "number");
    assert.equal(entry.authorizerHash16, "0123456789abcdef");
    assert.equal(entry.contentHash16, createHash("sha256").update(JSON.stringify({ claims: VERIFY_INPUT.claims, evidence: VERIFY_INPUT.evidence })).digest("hex").slice(0, 16));
    assert.ok(!lines[0].includes("ba4a0b69"), "audit carries hashes, never evidence content");
  } finally {
    rmSync(auditFile, { force: true });
  }
});

test("verify provider failure writes an ERROR audit line (429 → JUDGE_RATE_LIMIT)", async () => {
  const auditFile = join(tmpdir(), "judge-audit-error-" + process.pid + ".jsonl");
  const { deps } = makeDeps({ credential: VALID_CREDENTIAL, response: () => judgeResponse({ error: "rate limited" }, 429), auditFile });
  rmSync(auditFile, { force: true });
  try {
    await assert.rejects(() => runJudgeVerify(VERIFY_INPUT, deps), (error: unknown) => (error as JudgeError).code === "JUDGE_RATE_LIMIT");
    const lines = readFileSync(auditFile, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.deepEqual(Object.keys(entry), ["ts", "tool", "n_claims", "verdict", "model", "usage", "latency_ms", "authorizerHash16", "contentHash16"]);
    assert.equal(entry.verdict, "ERROR:JUDGE_RATE_LIMIT");
    assert.equal(entry.model, JUDGE_MODEL);
    assert.equal(entry.usage, null);
    assert.equal(entry.n_claims, 2);
  } finally {
    rmSync(auditFile, { force: true });
  }
});

test("evaluate writes an audit line with a per-answer summary verdict", async () => {
  const auditFile = join(tmpdir(), "judge-audit-evaluate-" + process.pid + ".jsonl");
  const { deps } = makeDeps({
    credential: VALID_CREDENTIAL,
    response: () => judgeResponse(providerPayload({
      q_noul: { type: "noul", noul: 0.91 },
      q_choice: choiceAnswer("promote", { promote: 0.8, hold: 0.2 }),
      q_score: { type: "score", score: 3.66, legend: { "0": "none", "1": "low", "2": "medium", "3": "high", "4": "certain", "5": "absolute" }, probabilities: { "0": 0.01, "1": 0.04, "2": 0.15, "3": 0.3, "4": 0.3, "5": 0.2 }, confidence: 0.7 }
    })),
    auditFile
  });
  rmSync(auditFile, { force: true });
  try {
    const result = await runJudgeEvaluate(EVALUATE_INPUT, deps);
    assert.equal(result.audit, "written");
    const lines = readFileSync(auditFile, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.deepEqual(Object.keys(entry), ["ts", "tool", "n_claims", "verdict", "model", "usage", "latency_ms", "authorizerHash16", "contentHash16"]);
    assert.equal(entry.tool, "engineering.judge.evaluate");
    assert.equal(entry.n_claims, 3);
    assert.equal(entry.verdict, "q_noul:0.9100|q_choice:promote|q_score:0.7320");
    assert.equal(entry.model, JUDGE_MODEL + "-20260917");
    assert.deepEqual(entry.usage, { cost: 0.00002, inputTokens: 500, outputTokens: 100 });
    assert.equal(entry.authorizerHash16, null);
  } finally {
    rmSync(auditFile, { force: true });
  }
});
