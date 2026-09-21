// CONTRACT-01 — smoke-side contract for the engineering.judge.verify tool envelope.
//
// Structural mirror of src/judgeContracts.ts (zod judgeVerifyEnvelopeSchema).
// The two are pinned together by test/contract-judge-envelope.test.ts: the same
// fixture matrix must produce IDENTICAL accept/reject verdicts in both, so the
// deployed-server check (this file, run live inside the release smoke) and the
// pre-deploy suite check (zod) cannot drift silently.
//
// Why this exists: JUDGE-HOOKS-01 shipped a test mock that mirrored {results}
// while production emitted {answers}; the suite stayed green over a broken
// reader. The smoke is the last gate before production — it now validates the
// REAL envelope against the REAL provider, and divergence fails the deploy.

/**
 * Arguments the smoke sends to engineering.judge.verify. Stable across
 * deploys (comparable audit trail); read-only; ~1 provider call (~$0.00004).
 * Validated in the contract tests against the REAL judgeVerifyInputSchema.
 */
export const SMOKE_JUDGE_ARGS = Object.freeze({
  claims: [
    {
      id: "smoke1",
      text: "the release smoke of eng-mcp exercises one read-only live judge.verify call to pin the deployed envelope shape before promoting a candidate",
    },
  ],
  evidence: {
    purpose:
      "CONTRACT-01 smoke contract probe: one read-only live judge call asserting the deployed server still emits the recorded production envelope shape",
    caller: "scripts/eng-mcp-release.mjs smokeAction step 7",
    contractSuite: "test/contract-judge-envelope.test.ts (golden fixtures recorded 2026-09-21)",
    readOnly: true,
  },
});

const VERDICTS = new Set(["supported", "contradicted", "not_addressed", "uncertain"]);
const AGGREGATES = new Set(["ALL_SUPPORTED", "HAS_CONTRADICTIONS", "MIXED", "UNCERTAIN"]);
const KNOWN_TOP_KEYS = new Set([
  "tool",
  "status",
  "provider",
  "provenance",
  "claims",
  "aggregate",
  "counts",
  "advisory",
  "audit",
]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isString = (v) => typeof v === "string";
const isNonEmptyString = (v) => isString(v) && v.length > 0;
const inUnitRange = (v) => isFiniteNumber(v) && v >= 0 && v <= 1;

function checkObject(value, label, keys, violations) {
  if (!isObject(value)) {
    violations.push(`${label}: must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) violations.push(`${label}: unexpected key "${key}"`);
  }
  return true;
}

/**
 * Validate one engineering.judge.verify tool envelope structurally.
 * Returns { ok: true, violations: [] } or { ok: false, violations: [...] }.
 */
export function validateJudgeVerifyEnvelope(value) {
  const violations = [];
  if (!isObject(value)) return { ok: false, violations: ["envelope: must be an object"] };

  // The historical mutation (JUDGE-HOOKS-01): evaluate outcomes under "results".
  if ("results" in value) {
    violations.push('historical mutation detected: top-level "results" key — envelope field is "answers"');
  }

  checkObject(value, "envelope", KNOWN_TOP_KEYS, violations);
  if (value.tool !== "engineering.judge.verify") violations.push('envelope.tool: must be exactly "engineering.judge.verify"');
  if (value.status !== "JUDGED") violations.push('envelope.status: must be exactly "JUDGED"');

  const providerKeys = new Set(["model", "id", "latencyMs", "cost", "inputTokens", "outputTokens"]);
  if (checkObject(value.provider, "provider", providerKeys, violations)) {
    if (!isNonEmptyString(value.provider.model)) violations.push("provider.model: must be a non-empty string");
    if (!isNonEmptyString(value.provider.id)) violations.push("provider.id: must be a non-empty string");
    if (!(isFiniteNumber(value.provider.latencyMs) && value.provider.latencyMs >= 0)) {
      violations.push("provider.latencyMs: must be a finite number >= 0");
    }
    for (const key of ["cost", "inputTokens", "outputTokens"]) {
      const v = value.provider[key];
      if (v !== null && !isFiniteNumber(v)) violations.push(`provider.${key}: must be a finite number or null`);
    }
  }

  const provenanceKeys = new Set(["credentialSha16", "stateHash16", "evidenceHash16", "redactions"]);
  if (checkObject(value.provenance, "provenance", provenanceKeys, violations)) {
    for (const key of ["credentialSha16", "stateHash16", "evidenceHash16"]) {
      if (!isNonEmptyString(value.provenance[key])) violations.push(`provenance.${key}: must be a non-empty string`);
    }
    if (!(isFiniteNumber(value.provenance.redactions) && value.provenance.redactions >= 0)) {
      violations.push("provenance.redactions: must be a finite number >= 0");
    }
  }

  if (!Array.isArray(value.claims) || value.claims.length === 0) {
    violations.push("claims: must be a non-empty array");
  } else {
    value.claims.forEach((claim, index) => {
      const label = `claims[${index}]`;
      const keys = new Set(["id", "text", "verdict", "probability", "probabilities", "confidence"]);
      if (checkObject(claim, label, keys, violations)) {
        if (!isNonEmptyString(claim.id)) violations.push(`${label}.id: must be a non-empty string`);
        if (!isNonEmptyString(claim.text)) violations.push(`${label}.text: must be a non-empty string`);
        if (!isString(claim.verdict) || !VERDICTS.has(claim.verdict)) {
          violations.push(`${label}.verdict: must be one of ${[...VERDICTS].join("|")}`);
        }
        if (!inUnitRange(claim.probability)) violations.push(`${label}.probability: must be a finite number in [0,1]`);
        if (!isObject(claim.probabilities)) {
          violations.push(`${label}.probabilities: must be an object`);
        } else {
          for (const [key, v] of Object.entries(claim.probabilities)) {
            if (!inUnitRange(v)) violations.push(`${label}.probabilities.${key}: must be a finite number in [0,1]`);
          }
        }
        if (claim.confidence !== null && !inUnitRange(claim.confidence)) {
          violations.push(`${label}.confidence: must be a finite number in [0,1] or null`);
        }
      }
    });
  }

  if (!isString(value.aggregate) || !AGGREGATES.has(value.aggregate)) {
    violations.push(`envelope.aggregate: must be one of ${[...AGGREGATES].join("|")}`);
  }

  const countKeys = new Set(["supported", "contradicted", "not_addressed", "uncertain"]);
  if (checkObject(value.counts, "counts", countKeys, violations)) {
    for (const key of countKeys) {
      if (!(isFiniteNumber(value.counts[key]) && value.counts[key] >= 0)) {
        violations.push(`counts.${key}: must be a finite number >= 0`);
      }
    }
  }

  if (!isNonEmptyString(value.advisory) || !value.advisory.startsWith("ADVISORY")) {
    violations.push("envelope.advisory: must be a non-empty string starting with ADVISORY");
  }
  if (!isNonEmptyString(value.audit)) violations.push("envelope.audit: must be a non-empty string");

  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations };
}