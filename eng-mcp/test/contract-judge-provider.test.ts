/**
 * CONTRACT-01 — raw provider boundary contract.
 *
 * The reader (validateJudgeOutput inside runJudgeVerify/runJudgeEvaluate) and
 * the schema re-derivation (parseProviderDecisions in src/judgeContracts.ts)
 * are TWO INDEPENDENT derivations of the provider contract. This matrix forces
 * them to agree on every crafted case: reader throws <=> schema rejects. The
 * reader is the REAL production code path (deps-injected fetch, never network);
 * the synthetic raw payloads mirror the LIVE provider shape recorded on
 * 2026-09-21 (model typesafe/jev-1.13-<date>, answers map, usage{cost,
 * input_tokens, output_tokens}, extra provider field).
 *
 * The request side is pinned against the REAL sender: the body runJudgeVerify
 * actually posts (captured through the injected fetchImpl) must parse against
 * judgeProviderRequestSchema.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runJudgeVerify, runJudgeEvaluate, JUDGE_MODEL, VERDICT_KEYS } from "../src/judge.ts";
import {
  parseProviderDecisions,
  judgeProviderRequestSchema,
  judgeVerifyEnvelopeSchema,
  judgeEvaluateEnvelopeSchema,
  VERDICT_UNIVERSE,
} from "../src/judgeContracts.ts";

// Synthetic key constructed at runtime (never a literal secret; sha16-only provenance).
const SYNTHETIC_CREDENTIAL = `sk-or-v1-${"ab".repeat(32)}`;
const AUDIT_FILE = join(tmpdir(), `contract-judge-audit-${Date.now()}.jsonl`);

const CHOICE_CRITERIA = { supported: "claim is true", contradicted: "claim is false", not_addressed: "no evidence" };

function depsFor(raw: Record<string, unknown>, capturedBodies: unknown[] = []) {
  return {
    fetchImpl: async (_url: string, init: { body: string }) => {
      capturedBodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify(raw) };
    },
    readCredential: (_path: string) => SYNTHETIC_CREDENTIAL,
    timeoutMs: 1000,
    auditFile: AUDIT_FILE,
  } as const;
}

function rawProvider(answers: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    model: `${JUDGE_MODEL}-20260917`,
    answers,
    usage: { cost: 0.00001, input_tokens: 100, output_tokens: 20 },
    id: "gen-dec-contract",
    ...extra,
  };
}

const VERIFY_INPUT = { claims: [{ id: "c1", text: "the repo compiles cleanly" }], evidence: { files: ["src/x.ts"] } };
const NOUL_INPUT = { state: { command: "ls" }, questions: [{ id: "q_n", type: "noul" as const, instructions: "destructive?" }] };
const CHOICE_INPUT = {
  state: { command: "ls" },
  questions: [{ id: "q_c", type: "choice" as const, instructions: "verdict?", criteria: CHOICE_CRITERIA }],
};
const SCORE_INPUT = {
  state: { command: "ls" },
  questions: [{ id: "q_s", type: "score" as const, instructions: "severity?", criteria: ["low", "high"] }],
};

/** Reader verdict + schema verdict for one crafted raw response — they must agree. */
async function matrixCase(
  name: string,
  raw: Record<string, unknown>,
  runner: (deps: never) => Promise<unknown>,
  questions: ReadonlyArray<{ id: string; type: "noul" | "choice" | "score"; instructions: string; criteria?: unknown }>,
  expectAccept: boolean,
) {
  const bodies: unknown[] = [];
  const deps = depsFor(raw, bodies as never[]);
  let readerThrew = false;
  let readerCode: string | null = null;
  try {
    await runner(deps as never);
  } catch (error) {
    readerThrew = true;
    readerCode = (error as { code?: string }).code ?? "UNKNOWN";
  }
  const schemaResult = parseProviderDecisions(raw, questions as never);
  assert.equal(
    !readerThrew,
    schemaResult.ok,
    `CONTRACT MATRIX DISAGREEMENT on "${name}": reader ${readerThrew ? `threw ${readerCode}` : "accepted"}, schema ${schemaResult.ok ? "accepted" : `rejected: ${schemaResult.violations.join("; ")}`}`,
  );
  if (!expectAccept) {
    assert.equal(readerThrew, true, `${name}: expected the reader to throw`);
    assert.equal(readerCode, "JUDGE_OUTPUT_INVALID", `${name}: reader error code`);
  }
  return { bodies, readerThrew, schemaResult };
}

test("CONTRACT-01 provider: happy choice answer — reader and schema both accept, envelope parses, request pinned", async () => {
  const answers = { c1: { type: "choice", choice: "contradicted", probabilities: { supported: 0.1, contradicted: 0.84, not_addressed: 0.06 }, confidence: 0.76 } };
  const { bodies } = await matrixCase(
    "happy choice",
    rawProvider(answers, { provider: "TypeSafe" }),
    (deps) => runJudgeVerify(VERIFY_INPUT, deps),
    [{ id: "c1", type: "choice", instructions: "verdict?", criteria: CHOICE_CRITERIA }],
    true,
  );
  // Request side: the REAL outgoing body must parse against the request schema.
  const parsedRequest = judgeProviderRequestSchema.safeParse(bodies[0]);
  assert.equal(parsedRequest.success, true, JSON.stringify(parsedRequest.error?.issues ?? []));
  assert.equal((bodies[0] as { model: string }).model, JUDGE_MODEL);
});

test("CONTRACT-01 provider: happy noul + score answers — reader and schema both accept, envelopes parse", async () => {
  const { readerThrew } = await matrixCase(
    "happy noul",
    rawProvider({ q_n: { type: "noul", noul: 0.03, confidence: 0.9 } }),
    (deps) => runJudgeEvaluate(NOUL_INPUT, deps),
    [{ id: "q_n", type: "noul", instructions: "destructive?" }],
    true,
  );
  assert.equal(readerThrew, false);
  const { readerThrew: threw2 } = await matrixCase(
    "happy score",
    rawProvider({ q_s: { type: "score", score: 1, confidence: 0.5 } }),
    (deps) => runJudgeEvaluate(SCORE_INPUT, deps),
    [{ id: "q_s", type: "score", instructions: "severity?", criteria: ["low", "high"] }],
    true,
  );
  assert.equal(threw2, false);
  // The reader validates confidence ONLY in the choice/score branches (validateConfidence
  // is not called for noul) — a noul answer with confidence: 2 is ACCEPTED. The contract
  // mirrors that asymmetry instead of over-validating:
  const { readerThrew: threw3 } = await matrixCase(
    "noul branch ignores confidence",
    rawProvider({ q_n: { type: "noul", noul: 0.5, confidence: 2 } }),
    (deps) => runJudgeEvaluate(NOUL_INPUT, deps),
    [{ id: "q_n", type: "noul", instructions: "d?" }],
    true,
  );
  assert.equal(threw3, false);
});

const MATRIX: Array<{
  name: string;
  raw: Record<string, unknown>;
  runner: (deps: never) => Promise<unknown>;
  questions: ReadonlyArray<{ id: string; type: "noul" | "choice" | "score"; instructions: string; criteria?: unknown }>;
}> = [
  {
    name: "answers record missing",
    raw: { model: `${JUDGE_MODEL}-20260917`, usage: {}, id: "x" },
    runner: (deps) => runJudgeVerify(VERIFY_INPUT, deps),
    questions: [{ id: "c1", type: "choice", instructions: "v", criteria: CHOICE_CRITERIA }],
  },
  {
    name: "model outside JUDGE_MODEL prefix",
    raw: { model: "some-other-model", answers: { c1: { type: "choice", choice: "supported", probabilities: { supported: 0.9, contradicted: 0.05, not_addressed: 0.05 } } } },
    runner: (deps) => runJudgeVerify(VERIFY_INPUT, deps),
    questions: [{ id: "c1", type: "choice", instructions: "v", criteria: CHOICE_CRITERIA }],
  },
  {
    name: "noul out of [0,1]",
    raw: rawProvider({ q_n: { type: "noul", noul: 1.5 } }),
    runner: (deps) => runJudgeEvaluate(NOUL_INPUT, deps),
    questions: [{ id: "q_n", type: "noul", instructions: "d?" }],
  },
  {
    name: "noul field missing",
    raw: rawProvider({ q_n: { type: "noul", confidence: 0.5 } }),
    runner: (deps) => runJudgeEvaluate(NOUL_INPUT, deps),
    questions: [{ id: "q_n", type: "noul", instructions: "d?" }],
  },
  {
    name: "noul value is a string",
    raw: rawProvider({ q_n: { type: "noul", noul: "0.5" } }),
    runner: (deps) => runJudgeEvaluate(NOUL_INPUT, deps),
    questions: [{ id: "q_n", type: "noul", instructions: "d?" }],
  },
  {
    name: "choice outside criteria keys",
    raw: rawProvider({ q_c: { type: "choice", choice: "true_ish", probabilities: { supported: 1, contradicted: 0, not_addressed: 0 } } }),
    runner: (deps) => runJudgeEvaluate(CHOICE_INPUT, deps),
    questions: [{ id: "q_c", type: "choice", instructions: "v?", criteria: CHOICE_CRITERIA }],
  },
  {
    name: "choice probability mass 0.8",
    raw: rawProvider({ q_c: { type: "choice", choice: "supported", probabilities: { supported: 0.5, contradicted: 0.2, not_addressed: 0.1 } } }),
    runner: (deps) => runJudgeEvaluate(CHOICE_INPUT, deps),
    questions: [{ id: "q_c", type: "choice", instructions: "v?", criteria: CHOICE_CRITERIA }],
  },
  {
    name: "choice probabilities missing a criteria key",
    raw: rawProvider({ q_c: { type: "choice", choice: "supported", probabilities: { supported: 1 } } }),
    runner: (deps) => runJudgeEvaluate(CHOICE_INPUT, deps),
    questions: [{ id: "q_c", type: "choice", instructions: "v?", criteria: CHOICE_CRITERIA }],
  },
  {
    name: "choice probabilities not an object",
    raw: rawProvider({ q_c: { type: "choice", choice: "supported", probabilities: "nope" } }),
    runner: (deps) => runJudgeEvaluate(CHOICE_INPUT, deps),
    questions: [{ id: "q_c", type: "choice", instructions: "v?", criteria: CHOICE_CRITERIA }],
  },
  {
    name: "answer type mismatches question type",
    raw: rawProvider({ q_n: { type: "choice", choice: "supported", probabilities: { supported: 1, contradicted: 0, not_addressed: 0 } } }),
    runner: (deps) => runJudgeEvaluate(NOUL_INPUT, deps),
    questions: [{ id: "q_n", type: "noul", instructions: "d?" }],
  },
  {
    name: "answer missing for a question id",
    raw: rawProvider({}),
    runner: (deps) => runJudgeEvaluate(NOUL_INPUT, deps),
    questions: [{ id: "q_n", type: "noul", instructions: "d?" }],
  },
  {
    name: "confidence out of [0,1] (choice branch)",
    raw: rawProvider({ q_c: { type: "choice", choice: "supported", probabilities: { supported: 1, contradicted: 0, not_addressed: 0 }, confidence: 2 } }),
    runner: (deps) => runJudgeEvaluate(CHOICE_INPUT, deps),
    questions: [{ id: "q_c", type: "choice", instructions: "v?", criteria: CHOICE_CRITERIA }],
  },
  {
    name: "score above label range",
    raw: rawProvider({ q_s: { type: "score", score: 2 } }),
    runner: (deps) => runJudgeEvaluate(SCORE_INPUT, deps),
    questions: [{ id: "q_s", type: "score", instructions: "s?", criteria: ["low", "high"] }],
  },
];

for (const testCase of MATRIX) {
  test(`CONTRACT-01 provider matrix: ${testCase.name} — reader throw <=> schema reject`, async () => {
    await matrixCase(testCase.name, testCase.raw, testCase.runner, testCase.questions, false);
  });
}

test("CONTRACT-01 provider matrix: live-shape extras (provider field, usage) — both accept", async () => {
  const answers = { c1: { type: "choice", choice: "supported", probabilities: { supported: 0.9, contradicted: 0.05, not_addressed: 0.05 }, confidence: 0.8 } };
  await matrixCase(
    "live extras",
    rawProvider(answers, { provider: "TypeSafe", finish_reason: "stop" }),
    (deps) => runJudgeVerify(VERIFY_INPUT, deps),
    [{ id: "c1", type: "choice", instructions: "v?", criteria: CHOICE_CRITERIA }],
    true,
  );
});

test("CONTRACT-01 provider: the reader's verdict universe matches the contract's closed set", () => {
  // VERDICT_KEYS is the REAL constant in src/judge.ts; the contract derives its
  // refine from it + "uncertain". Drift in either direction dies here.
  assert.deepEqual([...VERDICT_UNIVERSE].sort(), [...VERDICT_KEYS, "uncertain"].sort());
});

test("CONTRACT-01 provider: verify pipeline output parses against the tool-envelope contract (raw -> reader -> envelope)", async () => {
  const answers = { c1: { type: "choice", choice: "supported", probabilities: { supported: 0.9, contradicted: 0.05, not_addressed: 0.05 }, confidence: 0.8 } };
  const deps = depsFor(rawProvider(answers, { provider: "TypeSafe" }));
  const envelope = (await runJudgeVerify(VERIFY_INPUT, deps as never)) as Record<string, unknown>;
  assert.equal(judgeVerifyEnvelopeSchema.safeParse(envelope).success, true, "the envelope produced by the REAL pipeline must satisfy the contract");
  assert.equal(envelope.aggregate, "ALL_SUPPORTED");
});

test("CONTRACT-01 provider: evaluate pipeline output parses against the tool-envelope contract", async () => {
  const deps = depsFor(rawProvider({ q_n: { type: "noul", noul: 0.03 } }));
  const envelope = (await runJudgeEvaluate(NOUL_INPUT, deps as never)) as Record<string, unknown>;
  assert.equal(judgeEvaluateEnvelopeSchema.safeParse(envelope).success, true);
  assert.equal(envelope.status, "JUDGED");
});