/**
 * RuntimeScore.ts — Sprint EF-7.2.5
 *
 * Single responsibility: calculate numeric score for an IRuntimeProvider.
 * Selection logic has been moved to RuntimeSelector.
 *
 * SRP: scoring only. No selection. No sorting. No registry access.
 *
 * API: score() · compare() · normalize()
 */

import type { IRuntimeProvider } from "./IRuntimeProvider";

export interface RuntimeScoreResult {
  readonly runtimeId:         string;
  readonly priority:          number;
  readonly isAvailable:       boolean;
  readonly priorityScore:     number;
  readonly availabilityScore: number;
  readonly environmentScore:  number;
  readonly totalScore:        number;
  readonly confidence:        number; // 0–1
}

// ── Weights ───────────────────────────────────────────────────────────────────

const W_PRIORITY    = 0.60;
const W_AVAILABLE   = 0.30;
const W_ENVIRONMENT = 0.10;
const MAX_PRIORITY  = 100;

// ── Scoring ───────────────────────────────────────────────────────────────────

export const RuntimeScore = {

  /** Calculate the score for a single provider. Pure — no side effects. */
  score(provider: IRuntimeProvider): RuntimeScoreResult {
    const priorityScore     = (Math.min(provider.priority, MAX_PRIORITY) / MAX_PRIORITY) * W_PRIORITY;
    const availabilityScore = provider.isAvailable ? W_AVAILABLE : 0;
    const environmentScore  = W_ENVIRONMENT;
    const totalScore        = priorityScore + availabilityScore + environmentScore;
    const confidence        = parseFloat(Math.min(totalScore, 1).toFixed(4));

    return Object.freeze({
      runtimeId:          provider.runtimeId,
      priority:           provider.priority,
      isAvailable:        provider.isAvailable,
      priorityScore:      parseFloat(priorityScore.toFixed(4)),
      availabilityScore:  parseFloat(availabilityScore.toFixed(4)),
      environmentScore:   parseFloat(environmentScore.toFixed(4)),
      totalScore:         parseFloat(totalScore.toFixed(4)),
      confidence,
    });
  },

  /** Compare two providers by score. Returns positive if a > b. */
  compare(a: IRuntimeProvider, b: IRuntimeProvider): number {
    return RuntimeScore.score(a).totalScore - RuntimeScore.score(b).totalScore;
  },

  /** Normalize a raw score value to 0–1 range. */
  normalize(value: number, max = 1): number {
    return parseFloat(Math.min(Math.max(value / max, 0), 1).toFixed(4));
  },
};