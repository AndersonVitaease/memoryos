/**
 * RuntimeScore.ts — Sprint EF-7.2.4
 *
 * Pure function module. Calculates a numeric score for an IRuntimeProvider.
 * Score drives auto-selection — highest score among available providers wins.
 *
 * Score factors:
 *   priority    — base weight (0–100 mapped to 0–0.60)
 *   available   — +0.30 if isAvailable, 0 otherwise
 *   environment — +0.10 bonus (reserved for future per-env tuning; currently constant)
 *
 * SRP: scoring only. No registry, no selection, no imports.
 * No if/else/switch branching for provider identity.
 */

import type { IRuntimeProvider } from "./IRuntimeProvider";

export interface RuntimeScoreResult {
  readonly runtimeId:    string;
  readonly priority:     number;
  readonly isAvailable:  boolean;
  readonly priorityScore: number;
  readonly availabilityScore: number;
  readonly environmentScore:  number;
  readonly totalScore:   number;
  readonly confidence:   number; // 0–1
}

// ── Weights ───────────────────────────────────────────────────────────────────

const W_PRIORITY    = 0.60;
const W_AVAILABLE   = 0.30;
const W_ENVIRONMENT = 0.10;
const MAX_PRIORITY  = 100;

// ── Scoring ───────────────────────────────────────────────────────────────────

export const RuntimeScore = {

  /** Calculate the score for a single provider. */
  score(provider: IRuntimeProvider): RuntimeScoreResult {
    const priorityScore     = (Math.min(provider.priority, MAX_PRIORITY) / MAX_PRIORITY) * W_PRIORITY;
    const availabilityScore = provider.isAvailable ? W_AVAILABLE : 0;
    const environmentScore  = W_ENVIRONMENT; // future: env-specific multipliers
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

  /** Score all providers and sort descending. */
  scoreAll(providers: IRuntimeProvider[]): RuntimeScoreResult[] {
    return providers
      .map(p => RuntimeScore.score(p))
      .sort((a, b) => b.totalScore - a.totalScore);
  },

  /** Select the best provider from a list. Returns undefined if list is empty. */
  selectBest(providers: IRuntimeProvider[]): IRuntimeProvider | undefined {
    if (providers.length === 0) return undefined;
    const scored = RuntimeScore.scoreAll(providers);
    const best   = scored[0];
    return providers.find(p => p.runtimeId === best.runtimeId);
  },

  /** Select only from available providers; fall back to highest-priority unavailable. */
  selectBestAvailable(providers: IRuntimeProvider[]): IRuntimeProvider | undefined {
    const available = providers.filter(p => p.isAvailable);
    return available.length > 0
      ? RuntimeScore.selectBest(available)
      : RuntimeScore.selectBest(providers);
  },
};