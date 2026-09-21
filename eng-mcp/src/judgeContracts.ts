/**
 * CONTRACT-01 — schema contracts generated from the REAL TypeScript types.
 *
 * Failure mode being extinguished (JUDGE-HOOKS-01): a test mock mirroring an
 * imagined shape ({results}) stayed green over production emitting {answers}.
 * Mocks validate imagination; these schemas validate reality. Every schema
 * here is pinned — via AssertEqual, a compile-time bidirectional type identity
 * check — to the type the REAL implementation actually produces:
 *
 *   - judgeVerifyEnvelopeSchema   <-> Awaited<ReturnType<typeof runJudgeVerify>>  (src/judge.ts)
 *   - judgeEvaluateEnvelopeSchema <-> Awaited<ReturnType<typeof runJudgeEvaluate>> (src/judge.ts)
 *   - errorEnvelopeSchema         <-> ErrorEnvelope (src/errorEnvelope.ts)
 *   - registryTokenRecordSchema   <-> TokenRecord (src/policy.ts)
 *
 * If someone changes the real shape without these schemas (or vice versa),
 * engineering.typecheck.run fails at the pin — shape drift dies in the gate,
 * not in production. The contract tests (test/contract-*.test.ts) run these
 * schemas against golden envelopes RECORDED LIVE from production (2026-09-21,
 * test/{evaluate,verify}-envelope.live.json) and against the smoke validator
 * (scripts/eng-mcp-smoke-judge-contract.mjs) so the three layers cannot drift
 * silently. The raw provider boundary additionally has parseProviderDecisions,
 * an independent zod re-derivation of validateJudgeOutput's rules; the matrix
 * test requires the two to agree on every crafted case.
 */
import * as z from "zod/v4";
import { ADVISORY, JUDGE_MODEL, VERDICT_KEYS } from "./judge.ts";
import { ERROR_CATEGORIES } from "./errorEnvelope.ts";
import type { ErrorEnvelope } from "./errorEnvelope.ts";
import type { runJudgeVerify, runJudgeEvaluate } from "./judge.ts";
import type { TokenRecord } from "./policy.ts";

/** Compile-time bidirectional type identity: true only when A and B are identical types. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type AssertEqual<A, B> = Equal<A, B>;

/** The real envelopes, derived from the implementations (not from imagination). */
export type RealJudgeVerifyEnvelope = Awaited<ReturnType<typeof runJudgeVerify>>;
export type RealJudgeEvaluateEnvelope = Awaited<ReturnType<typeof runJudgeEvaluate>>;

/** Closed verdict universe: the reader's criteria keys plus the sub-threshold fallback. */
export const VERDICT_UNIVERSE: readonly string[] = [...VERDICT_KEYS, "uncertain"];

/** The verdict must land inside the closed set the reader can actually emit. */
const verdictRefine = (v: string) => VERDICT_UNIVERSE.includes(v);
/** Runtime-strict, type-loose: the real envelope's string fields are all TS-widened
 *  to `string`, and a `(v) => v === "lit"` callback is an inferred type predicate
 *  (TS 5.5+) that zod v4 propagates, narrowing the output back to the literal. The
 *  helper's `expected: string` parameter absorbs the literal, so the refine infers
 *  plain `string` — matching the real type — while the check stays exact. */
const exactValue = (expected: string) => (v: string) => v === expected;
const AGGREGATE_UNIVERSE: readonly string[] = ["HAS_CONTRADICTIONS", "ALL_SUPPORTED", "MIXED", "UNCERTAIN"];

const providerMetaSchema = z.strictObject({
  model: z.string().nullable(),
  id: z.string().nullable(),
  latencyMs: z.number(),
  cost: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
});

const verifyProvenanceSchema = z.strictObject({
  credentialSha16: z.string(),
  stateHash16: z.string(),
  evidenceHash16: z.string(),
  redactions: z.number(),
});

const verifyClaimSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
  verdict: z.string().refine(verdictRefine),
  probability: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().nullable(),
});

/** Tool envelope of engineering.judge.verify — mirrors the live production shape exactly (9 keys). */
export const judgeVerifyEnvelopeSchema = z.strictObject({
  // Real type: EVERY top-level string field is TS-widened to `string` — tool and
  // status are inline literals in the mutable envelope object, and the const
  // aggregate reference widens too (all proven against the compiler's own view of
  // the real type). A `(v) => v === "lit"` callback is an inferred type predicate
  // (TS 5.5+) and zod v4 propagates it, narrowing the inferred type back to the
  // literal — so use the non-predicate helper: its `expected: string` annotation
  // absorbs the literal, keeping the inferred type `string` (runtime strict).
  tool: z.string().refine(exactValue("engineering.judge.verify")),
  status: z.string().refine(exactValue("JUDGED")),
  provider: providerMetaSchema,
  provenance: verifyProvenanceSchema,
  claims: z.array(verifyClaimSchema).min(1),
  aggregate: z.string().refine((v) => AGGREGATE_UNIVERSE.includes(v)),
  counts: z.strictObject({
    supported: z.number(),
    contradicted: z.number(),
    not_addressed: z.number(),
    uncertain: z.number(),
  }),
  advisory: z.string().refine(exactValue(ADVISORY)),
  audit: z.string(),
});

/** Tool envelope of engineering.judge.evaluate — the per-question outcomes live under `answers`. */
const noulAnswerSchema = z.strictObject({
  id: z.string(),
  type: z.string().refine(exactValue("noul")),
  probability: z.number(),
  complementProbability: z.number(),
  // The real union normalizes every member with the other branches' keys as
  // optional-undefined — the schema must carry the same shape.
  choice: z.undefined().optional(),
  probabilities: z.undefined().optional(),
  confidence: z.undefined().optional(),
  score: z.undefined().optional(),
  normalizedScore: z.undefined().optional(),
  legend: z.undefined().optional(),
});

const choiceAnswerSchema = z.strictObject({
  id: z.string(),
  type: z.string().refine(exactValue("choice")),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().nullable(),
  probability: z.undefined().optional(),
  complementProbability: z.undefined().optional(),
  score: z.undefined().optional(),
  normalizedScore: z.undefined().optional(),
  legend: z.undefined().optional(),
});

const scoreAnswerSchema = z.strictObject({
  id: z.string(),
  type: z.string().refine(exactValue("score")),
  score: z.number(),
  normalizedScore: z.number(),
  legend: z.record(z.string(), z.unknown()).nullable(),
  probabilities: z.record(z.string(), z.unknown()).nullable(),
  confidence: z.number().nullable(),
  probability: z.undefined().optional(),
  complementProbability: z.undefined().optional(),
  choice: z.undefined().optional(),
});

export const judgeEvaluateEnvelopeSchema = z.strictObject({
  // Real type: every string field is TS-widened to `string` (inline literals in
  // the envelope and the map callback widen) — see the verify schema comment.
  tool: z.string().refine(exactValue("engineering.judge.evaluate")),
  status: z.string().refine(exactValue("JUDGED")),
  provider: providerMetaSchema,
  provenance: z.strictObject({
    credentialSha16: z.string(),
    stateHash16: z.string(),
    redactions: z.number(),
  }),
  // z.union, not discriminatedUnion: the widened `type` (string) cannot be a zod discriminant.
  answers: z.array(z.union([noulAnswerSchema, choiceAnswerSchema, scoreAnswerSchema])),
  advisory: z.string().refine(exactValue(ADVISORY)),
  audit: z.string(),
});

/** Error envelope contract — pinned to the choke point's own type (src/errorEnvelope.ts). */
export const errorEnvelopeSchema = z.strictObject({
  // Mirror isUpperSnake (the choke point's own runtime rule): at least 2 chars, UPPER_SNAKE.
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  category: z.enum(ERROR_CATEGORIES),
  retryable: z.boolean(),
  remediation: z.string(),
  message: z.string(),
  evidenceRefs: z.array(z.string()),
  tool: z.string().optional(),
});

/** One registry token record — pinned to the boot parser's own TokenRecord (src/policy.ts). */
export const registryTokenRecordSchema = z.strictObject({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/i),
  subject: z.string(),
  scopes: z.array(z.string()),
  allowedRepositoryIds: z.array(z.string()),
  expiresAt: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  revokedAt: z.string().nullable().optional(),
});

/** The registry FILE shape the boot loader (loadOperationalConfig) consumes. */
export const registryFileSchema = z.looseObject({
  tokens: z.array(registryTokenRecordSchema).min(1),
});

/**
 * The outgoing request the judge client sends to the OpenRouter provider
 * (judgeFetchDecisions body) — asserted against the REAL sender in the
 * contract test by capturing the body it actually posts.
 */
export const judgeProviderRequestSchema = z.strictObject({
  model: z.string().refine((m) => m.startsWith(JUDGE_MODEL)),
  state: z.unknown(),
  questions: z.record(
    z.string(),
    z.strictObject({
      type: z.enum(["noul", "choice", "score"]),
      instructions: z.string(),
      criteria: z
        .union([z.record(z.string(), z.string()), z.array(z.string())])
        .optional(),
    }),
  ),
});

/**
 * Raw provider response shape — ONLY the rules validateJudgeOutput checks
 * globally: model prefix + an answers RECORD whose values are objects. Every
 * field-level rule (noul bounds, choice membership, probabilities shape and
 * sum, score vs label count, confidence) is QUESTION-RELATIVE and lives in
 * parseProviderDecisions, mirroring the reader's per-branch validation (the
 * noul branch, e.g., never validates confidence). Over-validating here would
 * reject payloads the reader accepts — the exact drift this contract kills.
 * Loose: the live provider sends extra fields (e.g. provider, finish_reason).
 */
export const judgeProviderResponseSchema = z.looseObject({
  model: z.string().refine((m) => m.startsWith(JUDGE_MODEL)),
  answers: z.record(z.string(), z.record(z.string(), z.unknown())),
  usage: z
    .looseObject({
      cost: z.number().optional(),
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
  id: z.string().optional(),
});

export type ProviderQuestion = {
  id: string;
  type: "noul" | "choice" | "score";
  instructions: string;
  criteria?: Record<string, string> | string[];
};

export type ContractParseResult =
  | { ok: true; violations: [] }
  | { ok: false; violations: string[] };
function confidenceViolation(questionId: string, confidence: unknown): string | null {
  // Mirrors validateConfidence (src/judge.ts): undefined/null pass through;
  // anything else must be a finite number in [0,1].
  if (confidence === undefined || confidence === null) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return `answers.${questionId}.confidence: must be a finite number in [0,1]`;
  }
  return null;
}

/**
 * Independent re-derivation of validateJudgeOutput (src/judge.ts): structural
 * shape via zod, question-relative rules mirroring the reader exactly. The
 * contract matrix test requires this to accept/reject in lockstep with the
 * real reader on every case — two derivations, one agreement.
 */
export function parseProviderDecisions(
  data: unknown,
  questions: readonly ProviderQuestion[],
): ContractParseResult {
  const violations: string[] = [];
  const shape = judgeProviderResponseSchema.safeParse(data);
  if (!shape.success) {
    violations.push(...shape.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    return { ok: false, violations };
  }
  const answers = (data as { answers?: Record<string, unknown> }).answers ?? {};
  for (const question of questions) {
    const answer = answers[question.id];
    if (answer === null || typeof answer !== "object") {
      violations.push(`answers.${question.id}: missing or not an object`);
      continue;
    }
    const answerType = (answer as { type?: unknown }).type;
    if (typeof answerType === "string" && answerType !== question.type) {
      violations.push(`answers.${question.id}: type ${answerType} does not match question type ${question.type}`);
      continue;
    }
    // NOTE: confidence is NOT validated here globally — the reader validates it
    // only in the choice/score branches (confidenceViolation below), and the
    // contract must accept exactly what the reader accepts.
    if (question.type === "noul") {
      const noul = (answer as { noul?: unknown }).noul;
      if (typeof noul !== "number" || !Number.isFinite(noul) || noul < 0 || noul > 1) {
        violations.push(`answers.${question.id}.noul: must be a finite number in [0,1]`);
      }
    } else if (question.type === "choice") {
      const criteria = question.criteria ?? {};
      const keys = Object.keys(criteria);
      if (keys.length === 0) {
        violations.push(`questions.${question.id}: choice question without criteria keys`);
        continue;
      }
      const choice = (answer as { choice?: unknown }).choice;
      if (typeof choice !== "string" || !keys.includes(choice)) {
        violations.push(`answers.${question.id}.choice: must be one of ${keys.join("|")}`);
        continue;
      }
      const probabilities = (answer as { probabilities?: unknown }).probabilities;
      if (probabilities === null || typeof probabilities !== "object") {
        violations.push(`answers.${question.id}.probabilities: missing or not an object`);
        continue;
      }
      const record = probabilities as Record<string, unknown>;
      let sum = 0;
      let keysOk = true;
      for (const key of keys) {
        const value = record[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
          violations.push(`answers.${question.id}.probabilities.${key}: must be a finite number in [0,1]`);
          keysOk = false;
        } else {
          sum += value;
        }
      }
      if (keysOk && (sum < 0.9 || sum > 1.1)) {
        violations.push(`answers.${question.id}.probabilities: criteria-key sum ${sum} outside [0.9,1.1]`);
      }
      const choiceConfidence = confidenceViolation(question.id, (answer as { confidence?: unknown }).confidence);
      if (choiceConfidence) violations.push(choiceConfidence);
    } else {
      const score = (answer as { score?: unknown }).score;
      const criteria = question.criteria ?? {};
      const maxIndex = Object.keys(criteria).length - 1;
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > maxIndex) {
        violations.push(`answers.${question.id}.score: must be a finite number in [0,${maxIndex}]`);
      }
      // Reader parity: only choice/score validate confidence — the noul branch never does.
      const scoreConfidence = confidenceViolation(question.id, (answer as { confidence?: unknown }).confidence);
      if (scoreConfidence) violations.push(scoreConfidence);
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations };
}

// ---- compile-time pins: schema <-> real type. If these fail, shape drifted. ----
const _pinVerifyEnvelope: AssertEqual<z.infer<typeof judgeVerifyEnvelopeSchema>, RealJudgeVerifyEnvelope> = true;
const _pinEvaluateEnvelope: AssertEqual<
  z.infer<typeof judgeEvaluateEnvelopeSchema>,
  RealJudgeEvaluateEnvelope
> = true;
const _pinErrorEnvelope: AssertEqual<z.infer<typeof errorEnvelopeSchema>, ErrorEnvelope> = true;
const _pinRegistryRecord: AssertEqual<z.infer<typeof registryTokenRecordSchema>, TokenRecord> = true;
export const _contractPins = [_pinVerifyEnvelope, _pinEvaluateEnvelope, _pinErrorEnvelope, _pinRegistryRecord] as const;