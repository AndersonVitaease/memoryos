// JUDGE-01: engineering.judge.verify / engineering.judge.evaluate — calibrated
// judgment (Jev via OpenRouter) as read-only governed backends, mirroring the
// github.read pattern (no PLAN, no retries, no global state — idempotent). The
// provider returns calibrated probabilities, never text: verify maps claims to
// typed choice questions under a closed-world rubric; evaluate passes
// noul/choice/score through with full distributions. The calibration constants
// and rubrics below are part of the asset — the threshold is the product.
// Credential is FILE ONLY (no inline env, ever): resolved at call time from
// ENG_MCP_JUDGE_KEY_FILE (default /data/credentials/openrouter-judge), mode
// 0600 enforced, sk-or-v1- key extracted, sha16-only provenance — the value
// never reaches argv, text env, output or logs. state/evidence are sanitized
// BEFORE the provider call (evidence may leave, credentials never). Provider
// failures are structured and retried never; a judgment is never fabricated.
// Every response carries the ADVISORY line.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import * as z from "zod/v4";

export class JudgeError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}:${redactJudgeSecrets(detail)}` : code);
    this.name = "JudgeError";
  }
}

export const JUDGE_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
export const JUDGE_MODEL = "typesafe/jev-1.13";
export const JUDGE_DECISION_THRESHOLD = 0.6;
export const JUDGE_MAX_STATE_CHARS = 32000;
const CREDENTIAL_PATH_DEFAULT = "/data/credentials/openrouter-judge";
const CREDENTIAL_EXTRACTION = /sk-or-v1-[A-Za-z0-9]{20,}/;

export const ADVISORY =
  "ADVISORY — calibrated judgment is not a security boundary; operator approval decides.";

export const VERIFY_RUBRIC =
  "Closed-world claim verification. Classify the claim using ONLY the evidence. supported = the evidence directly shows the claim is true; contradicted = the evidence directly shows the claim is false; not_addressed = the evidence neither shows it true nor false. Do not use knowledge outside the evidence.";

export const VERDICT_CRITERIA: Record<string, string> = {
  supported: "evidence directly shows the claim is true",
  contradicted: "evidence directly shows the claim is false",
  not_addressed: "evidence does not show the claim true nor false"
};
export const VERDICT_KEYS = Object.keys(VERDICT_CRITERIA);

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+\S+/gi,
  /\bsk-or-v1-[A-Za-z0-9]{8,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
];
const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|authorization|bearer)/i;

export function redactJudgeSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, "[REDACTED_SECRET]");
  return out.slice(0, 500);
}

export type SanitizedValue = { value: unknown; redactions: number };

export function sanitizeJudgeValue(value: unknown, depth = 0): SanitizedValue {
  if (depth > 12) return { value: "[REDACTED_DEPTH]", redactions: 1 };
  if (typeof value === "string") {
    let out = value;
    let redactions = 0;
    for (const pattern of SECRET_VALUE_PATTERNS) {
      const matches = out.match(pattern);
      if (matches) redactions += matches.length;
      out = out.replace(pattern, "[REDACTED_SECRET]");
    }
    return { value: out, redactions };
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    let redactions = 0;
    for (const item of value) {
      const sanitized = sanitizeJudgeValue(item, depth + 1);
      out.push(sanitized.value);
      redactions += sanitized.redactions;
    }
    return { value: out, redactions };
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    let redactions = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED_SECRET]";
        redactions += 1;
        continue;
      }
      const sanitized = sanitizeJudgeValue(item, depth + 1);
      out[key] = sanitized.value;
      redactions += sanitized.redactions;
    }
    return { value: out, redactions };
  }
  return { value, redactions: 0 };
}

export type JudgeQuestion = {
  type: "noul" | "choice" | "score";
  instructions: string;
  criteria?: Record<string, string> | string[];
};

export type JudgeHttpResponse = { ok: boolean; status: number; text: () => Promise<string> };

export type JudgeDeps = {
  fetchImpl: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: "error" }
  ) => Promise<JudgeHttpResponse>;
  readCredential: (path: string) => string;
  timeoutMs?: number;
  authorizerHash16?: string | null;
  auditFile?: string | null;
};

export function defaultJudgeDeps(): JudgeDeps {
  return {
    fetchImpl: (url, init) => fetch(url, init as RequestInit) as unknown as Promise<JudgeHttpResponse>,
    readCredential: (path) => {
      const stat = statSync(path);
      if ((stat.mode & 0o077) !== 0) throw new JudgeError("JUDGE_CREDENTIAL_MODE", "credential file must be mode 0600");
      return readFileSync(path, "utf8");
    }
  };
}

function credentialPath(): string {
  const raw = process.env.ENG_MCP_JUDGE_KEY_FILE;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : CREDENTIAL_PATH_DEFAULT;
}

export type JudgeCredential = { key: string; sha16: string };

function resolveJudgeCredential(deps: JudgeDeps): JudgeCredential {
  const path = credentialPath();
  let text: string;
  try {
    text = deps.readCredential(path);
  } catch (error) {
    if (error instanceof JudgeError) throw error;
    throw new JudgeError("JUDGE_CREDENTIAL_MISSING", `credential file not readable at ${path}`);
  }
  const match = text.match(CREDENTIAL_EXTRACTION);
  if (!match) throw new JudgeError("JUDGE_CREDENTIAL_INVALID", "credential file does not contain an sk-or-v1- key");
  return { key: match[0], sha16: createHash("sha256").update(text).digest("hex").slice(0, 16) };
}

function judgeTimeoutMs(deps: JudgeDeps): number {
  if (typeof deps.timeoutMs === "number" && Number.isFinite(deps.timeoutMs) && deps.timeoutMs >= 1) return deps.timeoutMs;
  const raw = Number(process.env.ENG_MCP_JUDGE_TIMEOUT_MS ?? "10000");
  if (Number.isFinite(raw) && raw >= 250) return raw;
  return 10000;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || (error as NodeJS.ErrnoException).code === "ABORT_ERR");
}

function providerErrorDetail(text: string): string {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const error = parsed.error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.length > 0) return `: ${message.slice(0, 200)}`;
    }
  } catch {
    // non-JSON body — fall through to the raw slice
  }
  return text.length > 0 ? `: ${text.slice(0, 200)}` : "";
}

function mapStatusToJudgeError(status: number, text: string): JudgeError {
  const detail = providerErrorDetail(text);
  if (status === 401) return new JudgeError("JUDGE_AUTH_REJECTED", `provider rejected the credential (401)${detail}`);
  if (status === 429) return new JudgeError("JUDGE_RATE_LIMIT", `provider rate limited the call (429)${detail}`);
  if (status === 400 || status === 404 || status === 422) {
    return new JudgeError("JUDGE_PROVIDER_REJECTED", `provider rejected the request (${status})${detail}`);
  }
  return new JudgeError("JUDGE_PROVIDER_ERROR", `provider returned HTTP ${status}${detail}`);
}

function parseProviderJson(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JudgeError("JUDGE_OUTPUT_INVALID", `provider response is not JSON: ${text.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new JudgeError("JUDGE_OUTPUT_INVALID", "provider response is not an object");
  }
  return parsed as Record<string, unknown>;
}

async function judgeFetchDecisions(
  body: unknown,
  key: string,
  deps: JudgeDeps
): Promise<{ raw: Record<string, unknown>; latencyMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), judgeTimeoutMs(deps));
  const started = Date.now();
  try {
    const response = await deps.fetchImpl(JUDGE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error"
    });
    const latencyMs = Date.now() - started;
    const text = (await response.text()).slice(0, 5000);
    if (!response.ok) throw mapStatusToJudgeError(response.status, text);
    return { raw: parseProviderJson(text), latencyMs };
  } catch (error) {
    if (error instanceof JudgeError) throw error;
    if (isAbortError(error)) throw new JudgeError("JUDGE_TIMEOUT", "provider call aborted by timeout");
    throw new JudgeError("JUDGE_UNREACHABLE", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateConfidence(qid: string, answer: Record<string, unknown>): void {
  const confidence = answer.confidence;
  if (
    confidence !== undefined &&
    confidence !== null &&
    (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)
  ) {
    throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} confidence must be a finite number in [0,1]`);
  }
}

function validateJudgeOutput(
  data: Record<string, unknown>,
  questions: Record<string, JudgeQuestion>
): Record<string, Record<string, unknown>> {
  const model = data.model;
  if (typeof model !== "string" || !model.startsWith(JUDGE_MODEL)) {
    throw new JudgeError("JUDGE_OUTPUT_INVALID", `provider model must start with ${JUDGE_MODEL}`);
  }
  const answers = data.answers;
  if (!isRecord(answers)) throw new JudgeError("JUDGE_OUTPUT_INVALID", "provider response has no answers record");
  const validated: Record<string, Record<string, unknown>> = {};
  for (const [qid, question] of Object.entries(questions)) {
    const answer = answers[qid];
    if (!isRecord(answer)) throw new JudgeError("JUDGE_OUTPUT_INVALID", `provider response missing answer for question ${qid}`);
    if (typeof answer.type === "string" && answer.type !== question.type) {
      throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} type ${answer.type} does not match requested ${question.type}`);
    }
    if (question.type === "noul") {
      const probability = answer.noul;
      if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} noul must be a finite number in [0,1]`);
      }
    } else if (question.type === "choice") {
      const criteria = question.criteria as Record<string, string>;
      const keys = Object.keys(criteria);
      const choice = answer.choice;
      if (typeof choice !== "string" || !keys.includes(choice)) {
        throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} choice must be one of ${keys.join(",")}`);
      }
      if (!isRecord(answer.probabilities)) throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} has no probabilities record`);
      let sum = 0;
      for (const key of keys) {
        const probability = (answer.probabilities as Record<string, unknown>)[key];
        if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
          throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} probability for ${key} must be a finite number in [0,1]`);
        }
        sum += probability;
      }
      if (sum < 0.9 || sum > 1.1) {
        throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} probabilities must sum to ~1 (got ${sum.toFixed(3)})`);
      }
      validateConfidence(qid, answer);
    } else {
      const labels = question.criteria as string[];
      const score = answer.score;
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > labels.length - 1) {
        throw new JudgeError("JUDGE_OUTPUT_INVALID", `answer ${qid} score must be a finite number within [0,${labels.length - 1}]`);
      }
      validateConfidence(qid, answer);
    }
    validated[qid] = answer;
  }
  return validated;
}

function providerUsage(data: Record<string, unknown>): { cost: number | null; inputTokens: number | null; outputTokens: number | null } {
  const usage = data.usage;
  if (!isRecord(usage)) return { cost: null, inputTokens: null, outputTokens: null };
  return {
    cost: typeof usage.cost === "number" ? usage.cost : null,
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : null
  };
}

function providerMeta(data: Record<string, unknown>, latencyMs: number) {
  const usage = providerUsage(data);
  return {
    model: typeof data.model === "string" ? data.model : null,
    id: typeof data.id === "string" ? data.id : null,
    latencyMs,
    cost: usage.cost,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  };
}

function sha16Of(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const CLAIM_ID = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);

export const judgeVerifyInputSchema = z
  .object({
    claims: z.array(z.object({ id: CLAIM_ID, text: z.string().min(1).max(2000) })).min(1).max(10),
    evidence: z.union([z.string().max(32000), z.record(z.string(), z.unknown()), z.array(z.unknown())])
  })
  .strict();

export const judgeEvaluateInputSchema = z
  .object({
    state: z.union([z.string().max(32000), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
    questions: z
      .array(
        z.object({
          id: CLAIM_ID,
          type: z.enum(["noul", "choice", "score"]),
          instructions: z.string().min(1).max(4000),
          criteria: z
            .union([z.record(z.string(), z.string().min(1).max(500)), z.array(z.string().min(1).max(200))])
            .optional()
        })
      )
      .min(1)
      .max(20)
  })
  .strict();

export type JudgeVerifyInput = z.infer<typeof judgeVerifyInputSchema>;
export type JudgeEvaluateInput = z.infer<typeof judgeEvaluateInputSchema>;

const AUDIT_FILE_DEFAULT = "/data/audit/judge.jsonl";

// Every terminal call outcome lands as one JSONL line in /data/audit/judge.jsonl:
// metadata + hashes only. state/evidence content never enters the audit file —
// contentHash16 links the line to the response envelope that carries the full
// provenance. A write failure degrades to a marker and never fails the judgment.
export type JudgeAuditEntry = {
  ts: string;
  tool: "engineering.judge.verify" | "engineering.judge.evaluate";
  n_claims: number;
  verdict: string;
  model: string | null;
  usage: { cost: number | null; inputTokens: number | null; outputTokens: number | null } | null;
  latency_ms: number;
  authorizerHash16: string | null;
  contentHash16: string;
};

function writeJudgeAudit(deps: JudgeDeps, entry: JudgeAuditEntry): string {
  const file = deps.auditFile ?? process.env.ENG_MCP_JUDGE_AUDIT_FILE ?? AUDIT_FILE_DEFAULT;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runJudgeVerify(input: JudgeVerifyInput, deps: JudgeDeps = defaultJudgeDeps()) {
  const startedAt = Date.now();
  const contentHash16 = sha16Of(JSON.stringify({ claims: input.claims, evidence: input.evidence ?? null }));
  const nClaims = input.claims.length;
  try {
    return await runJudgeVerifyInner(input, deps, contentHash16, nClaims);
  } catch (error) {
    writeJudgeAudit(deps, {
      ts: new Date().toISOString(),
      tool: "engineering.judge.verify",
      n_claims: nClaims,
      verdict: `ERROR:${error instanceof JudgeError ? error.code : "JUDGE_UNEXPECTED"}`,
      model: JUDGE_MODEL,
      usage: null,
      latency_ms: Date.now() - startedAt,
      authorizerHash16: deps.authorizerHash16 ?? null,
      contentHash16
    });
    throw error;
  }
}

async function runJudgeVerifyInner(input: JudgeVerifyInput, deps: JudgeDeps, contentHash16: string, nClaims: number) {
  const seenIds = new Set<string>();
  for (const claim of input.claims) {
    if (seenIds.has(claim.id)) throw new JudgeError("JUDGE_INPUT_INVALID", `duplicate claim id ${claim.id}`);
    seenIds.add(claim.id);
  }
  const sanitized = sanitizeJudgeValue(input.evidence);
  const stateJson = JSON.stringify(sanitized.value);
  if (stateJson.length > JUDGE_MAX_STATE_CHARS) {
    throw new JudgeError("JUDGE_INPUT_INVALID", `evidence exceeds ${JUDGE_MAX_STATE_CHARS} chars after sanitization`);
  }
  const questions: Record<string, JudgeQuestion> = {};
  for (const claim of input.claims) {
    questions[claim.id] = { type: "choice", instructions: `${VERIFY_RUBRIC} Claim: ${claim.text}`, criteria: VERDICT_CRITERIA };
  }
  const credential = resolveJudgeCredential(deps);
  const { raw, latencyMs } = await judgeFetchDecisions(
    { model: JUDGE_MODEL, state: sanitized.value, questions },
    credential.key,
    deps
  );
  const answers = validateJudgeOutput(raw, questions);
  const claims = input.claims.map((claim) => {
    const answer = answers[claim.id];
    const choice = answer.choice as string;
    const probabilities = answer.probabilities as Record<string, number>;
    const probability = probabilities[choice];
    return {
      id: claim.id,
      text: claim.text,
      verdict: probability >= JUDGE_DECISION_THRESHOLD ? choice : "uncertain",
      probability,
      probabilities,
      confidence: typeof answer.confidence === "number" ? answer.confidence : null
    };
  });
  const counts = { supported: 0, contradicted: 0, not_addressed: 0, uncertain: 0 };
  for (const claim of claims) counts[claim.verdict as keyof typeof counts] += 1;
  const aggregate =
    counts.contradicted > 0
      ? "HAS_CONTRADICTIONS"
      : counts.supported === claims.length
        ? "ALL_SUPPORTED"
        : counts.supported > 0
          ? "MIXED"
          : "UNCERTAIN";
  const envelope = {
    tool: "engineering.judge.verify",
    status: "JUDGED",
    provider: providerMeta(raw, latencyMs),
    provenance: {
      credentialSha16: credential.sha16,
      stateHash16: sha16Of(stateJson),
      evidenceHash16: sha16Of(JSON.stringify(input.evidence ?? null)),
      redactions: sanitized.redactions
    },
    claims,
    aggregate,
    counts,
    advisory: ADVISORY
  };
  const audit = writeJudgeAudit(deps, {
    ts: new Date().toISOString(),
    tool: "engineering.judge.verify",
    n_claims: nClaims,
    verdict: aggregate,
    model: envelope.provider.model,
    usage: { cost: envelope.provider.cost, inputTokens: envelope.provider.inputTokens, outputTokens: envelope.provider.outputTokens },
    latency_ms: envelope.provider.latencyMs,
    authorizerHash16: deps.authorizerHash16 ?? null,
    contentHash16
  });
  return { ...envelope, audit };
}

export async function runJudgeEvaluate(input: JudgeEvaluateInput, deps: JudgeDeps = defaultJudgeDeps()) {
  const startedAt = Date.now();
  const contentHash16 = sha16Of(JSON.stringify({ state: input.state, questions: input.questions }));
  const nClaims = input.questions.length;
  try {
    return await runJudgeEvaluateInner(input, deps, contentHash16, nClaims);
  } catch (error) {
    writeJudgeAudit(deps, {
      ts: new Date().toISOString(),
      tool: "engineering.judge.evaluate",
      n_claims: nClaims,
      verdict: `ERROR:${error instanceof JudgeError ? error.code : "JUDGE_UNEXPECTED"}`,
      model: JUDGE_MODEL,
      usage: null,
      latency_ms: Date.now() - startedAt,
      authorizerHash16: deps.authorizerHash16 ?? null,
      contentHash16
    });
    throw error;
  }
}

async function runJudgeEvaluateInner(input: JudgeEvaluateInput, deps: JudgeDeps, contentHash16: string, nClaims: number) {
  const seenIds = new Set<string>();
  const questions: Record<string, JudgeQuestion> = {};
  for (const question of input.questions) {
    if (seenIds.has(question.id)) throw new JudgeError("JUDGE_INPUT_INVALID", `duplicate question id ${question.id}`);
    seenIds.add(question.id);
    if (question.type === "choice") {
      const criteria = question.criteria;
      if (!criteria || Array.isArray(criteria)) {
        throw new JudgeError("JUDGE_INPUT_INVALID", `question ${question.id}: choice requires criteria as a record with 2-10 keys`);
      }
      const keyCount = Object.keys(criteria).length;
      if (keyCount < 2 || keyCount > 10) {
        throw new JudgeError("JUDGE_INPUT_INVALID", `question ${question.id}: choice requires criteria as a record with 2-10 keys`);
      }
      questions[question.id] = { type: question.type, instructions: question.instructions, criteria };
    } else if (question.type === "score") {
      const criteria = question.criteria;
      if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10) {
        throw new JudgeError("JUDGE_INPUT_INVALID", `question ${question.id}: score requires criteria as an array of 2-10 labels`);
      }
      questions[question.id] = { type: question.type, instructions: question.instructions, criteria };
    } else {
      if (question.criteria !== undefined) {
        throw new JudgeError("JUDGE_INPUT_INVALID", `question ${question.id}: noul must not carry criteria`);
      }
      questions[question.id] = { type: question.type, instructions: question.instructions };
    }
  }
  const sanitized = sanitizeJudgeValue(input.state);
  const stateJson = JSON.stringify(sanitized.value);
  if (stateJson.length > JUDGE_MAX_STATE_CHARS) {
    throw new JudgeError("JUDGE_INPUT_INVALID", `state exceeds ${JUDGE_MAX_STATE_CHARS} chars after sanitization`);
  }
  const credential = resolveJudgeCredential(deps);
  const { raw, latencyMs } = await judgeFetchDecisions(
    { model: JUDGE_MODEL, state: sanitized.value, questions },
    credential.key,
    deps
  );
  const answers = validateJudgeOutput(raw, questions);
  const results = input.questions.map((question) => {
    const answer = answers[question.id];
    if (question.type === "noul") {
      const probability = answer.noul as number;
      return { id: question.id, type: "noul", probability, complementProbability: 1 - probability };
    }
    if (question.type === "choice") {
      return {
        id: question.id,
        type: "choice",
        choice: answer.choice as string,
        probabilities: answer.probabilities as Record<string, number>,
        confidence: typeof answer.confidence === "number" ? answer.confidence : null
      };
    }
    const labels = question.criteria as string[];
    const score = answer.score as number;
    return {
      id: question.id,
      type: "score",
      score,
      normalizedScore: Math.round((score / (labels.length - 1)) * 1e6) / 1e6,
      legend: isRecord(answer.legend) ? answer.legend : null,
      probabilities: isRecord(answer.probabilities) ? answer.probabilities : null,
      confidence: typeof answer.confidence === "number" ? answer.confidence : null
    };
  });
  const envelope = {
    tool: "engineering.judge.evaluate",
    status: "JUDGED",
    provider: providerMeta(raw, latencyMs),
    provenance: { credentialSha16: credential.sha16, stateHash16: sha16Of(stateJson), redactions: sanitized.redactions },
    answers: results,
    advisory: ADVISORY
  };
  const summary = results
    .map((r) => (r.type === "noul" ? `${r.id}:${(r.probability as number).toFixed(4)}` : r.type === "choice" ? `${r.id}:${r.choice}` : `${r.id}:${(r.normalizedScore as number).toFixed(4)}`))
    .join("|");
  const audit = writeJudgeAudit(deps, {
    ts: new Date().toISOString(),
    tool: "engineering.judge.evaluate",
    n_claims: nClaims,
    verdict: summary.length > 512 ? `${summary.slice(0, 512)}…` : summary,
    model: envelope.provider.model,
    usage: { cost: envelope.provider.cost, inputTokens: envelope.provider.inputTokens, outputTokens: envelope.provider.outputTokens },
    latency_ms: envelope.provider.latencyMs,
    authorizerHash16: deps.authorizerHash16 ?? null,
    contentHash16
  });
  return { ...envelope, audit };
}
