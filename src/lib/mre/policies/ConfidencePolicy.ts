/**
 * ConfidencePolicy.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * All confidence weights live here.
 * ConfidenceAdjuster consumes a policy — never hardcoded numbers.
 * Swap to a different policy (e.g. strict, lenient, experimental) without
 * touching the adjuster logic.
 */

export interface ConfidencePolicy {
  /** Added per unique corroborating provider. */
  readonly corroborationBonus:  number;
  /** Added when evidence is very recent (recency ≥ 0.8). */
  readonly recencyBonus:         number;
  /** Subtracted when evidence is involved in a conflict. */
  readonly conflictPenalty:      number;
  /** Added when 3+ providers are present in the result set. */
  readonly multiSourceBonus:     number;
  /** Floor — no adjusted confidence goes below this. */
  readonly minimumConfidence:    number;
  /** Ceiling — no adjusted confidence goes above this. */
  readonly maximumConfidence:    number;
  /** Threshold: similarity score above this → treat as duplicate. */
  readonly duplicateThreshold:   number;
  /** Threshold: similarity score above this → treat as complement. */
  readonly complementThreshold:  number;
  /** Minimum cross-provider topic overlap to flag a conflict. */
  readonly conflictTopicOverlap: number;
  /** Maximum content similarity allowed before flagging conflict. */
  readonly conflictContentMax:   number;
}

// ── Default policy ────────────────────────────────────────────────────────────

export const DEFAULT_CONFIDENCE_POLICY: ConfidencePolicy = Object.freeze({
  corroborationBonus:  0.05,
  recencyBonus:         0.05,
  conflictPenalty:      0.10,
  multiSourceBonus:     0.03,
  minimumConfidence:    0.05,
  maximumConfidence:    0.99,
  duplicateThreshold:   0.75,
  complementThreshold:  0.35,
  conflictTopicOverlap: 0.40,
  conflictContentMax:   0.30,
});

// ── Strict policy (for high-stakes reasoning) ─────────────────────────────────

export const STRICT_CONFIDENCE_POLICY: ConfidencePolicy = Object.freeze({
  ...DEFAULT_CONFIDENCE_POLICY,
  conflictPenalty:  0.20,
  minimumConfidence: 0.10,
});