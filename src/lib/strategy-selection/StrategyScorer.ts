/**
 * StrategyScorer.ts — Sprint EF-46 · Strategy Selection Engine
 *
 * SRP: calcular a pontuação de uma StrategyCandidate dado um ScoringWeights.
 *
 * NÃO seleciona — apenas pontua.
 * NÃO conhece Goal nem CognitivePlan — trabalha só com ConnectorProfiles.
 *
 * Imutável — sem side effects.
 */

import type { StrategyCandidate, StrategyEvaluation, ScoringWeights } from "./StrategyEvaluation";
import type { OperationalIntent } from "@/lib/cognitive-orchestrator/COTypes";

// ── Individual dimension scorers ──────────────────────────────────────────────

/** costScore: average connector cost, normalised to 0–10 (lower = cheaper → higher final score) */
function scoreCost(candidate: StrategyCandidate): number {
  if (candidate.connectors.length === 0) return 5;
  const avg = candidate.connectors.reduce((s, c) => s + c.costScore, 0) / candidate.connectors.length;
  return Math.max(0, 10 - avg);  // invert: lower cost → higher score
}

/** latency: total estimated latency normalised to 0–10 (lower = faster → higher final score) */
function scoreLatency(candidate: StrategyCandidate): number {
  const total = candidate.approach === "parallel"
    ? Math.max(...candidate.connectors.map(c => c.latencyMs))  // parallel = max, not sum
    : candidate.connectors.reduce((s, c) => s + c.latencyMs, 0);
  // Map 0–5000ms to 10–0
  return Math.max(0, 10 - (total / 500));
}

/** reliability: average reliability across connectors, normalised to 0–10 */
function scoreReliability(candidate: StrategyCandidate): number {
  if (candidate.connectors.length === 0) return 5;
  const avg = candidate.connectors.reduce((s, c) => s + c.reliabilityPct, 0) / candidate.connectors.length;
  return avg / 10;  // 0–100 → 0–10
}

/** parallelism: how much the approach leverages parallel execution */
function scoreParallelism(candidate: StrategyCandidate): number {
  const base: Record<string, number> = {
    parallel:   10,
    aggregated: 8,
    hybrid:     6,
    cache_first: 5,
    fallback:   4,
    sequential: 2,
    direct:     3,
  };
  return base[candidate.approach] ?? 3;
}

/** complexity: fewer connectors + simpler approach = lower complexity (better) */
function scoreComplexity(candidate: StrategyCandidate): number {
  const connectorPenalty = Math.min(candidate.connectors.length * 1.5, 8);
  const approachPenalty: Record<string, number> = {
    direct: 1, cache_first: 2, fallback: 3,
    sequential: 4, parallel: 4, hybrid: 5, aggregated: 6,
  };
  return Math.min(10, connectorPenalty + (approachPenalty[candidate.approach] ?? 3));
  // Note: complexity is inverted in total score (lower = better)
}

/** confidence: derived from reliability + approach familiarity */
function scoreConfidence(candidate: StrategyCandidate): number {
  const rel = scoreReliability(candidate) / 10;
  const approachConf: Record<string, number> = {
    direct: 0.9, cache_first: 0.85, fallback: 0.8,
    sequential: 0.88, parallel: 0.82, hybrid: 0.78, aggregated: 0.75,
  };
  return Math.min(1, (rel + (approachConf[candidate.approach] ?? 0.75)) / 2);
}

// ── Weighted total ────────────────────────────────────────────────────────────

function normalise(weights: ScoringWeights): ScoringWeights {
  const sum = weights.cost + weights.latency + weights.reliability + weights.parallelism;
  if (sum === 0) return { cost: 0.25, latency: 0.25, reliability: 0.25, parallelism: 0.25 };
  return {
    cost:        weights.cost        / sum,
    latency:     weights.latency     / sum,
    reliability: weights.reliability / sum,
    parallelism: weights.parallelism / sum,
  };
}

function buildRationale(ev: Omit<StrategyEvaluation, "rationale" | "recommended" | "totalScore">): string {
  const parts: string[] = [];
  if (ev.estimatedReliability >= 90) parts.push(`alta confiabilidade (${ev.estimatedReliability.toFixed(0)}%)`);
  if (ev.estimatedLatencyMs <= 400)   parts.push(`baixa latência (~${ev.estimatedLatencyMs}ms)`);
  if (ev.estimatedCost <= 3)          parts.push("custo baixo");
  if (ev.parallelismScore >= 7)       parts.push("alto paralelismo");
  if (ev.complexityScore <= 4)        parts.push("baixa complexidade");
  return parts.length > 0 ? parts.join(", ") : "estratégia equilibrada";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scoreCandidate(
  candidate: StrategyCandidate,
  weights: ScoringWeights,
): Omit<StrategyEvaluation, "recommended"> {
  const w   = normalise(weights);
  const cost        = scoreCost(candidate);
  const latency     = scoreLatency(candidate);
  const reliability = scoreReliability(candidate);
  const parallelism = scoreParallelism(candidate);
  const complexity  = scoreComplexity(candidate);
  const confidence  = scoreConfidence(candidate);

  const totalScore =
    w.cost        * cost        +
    w.latency     * latency     +
    w.reliability * reliability +
    w.parallelism * parallelism -
    0.1           * (complexity / 10);  // small complexity penalty

  const partial = {
    strategyId:           candidate.strategyId,
    label:                candidate.label,
    description:          candidate.description,
    approach:             candidate.approach,
    connectorCount:       candidate.connectors.length,
    estimatedCost:        Math.round((10 - cost) * 10) / 10,        // back to cost scale
    estimatedLatencyMs:   candidate.approach === "parallel"
      ? Math.max(...candidate.connectors.map(c => c.latencyMs))
      : candidate.connectors.reduce((s, c) => s + c.latencyMs, 0),
    estimatedReliability: Math.round(
      candidate.connectors.reduce((s, c) => s + c.reliabilityPct, 0) /
      Math.max(candidate.connectors.length, 1)
    ),
    parallelismScore:     Math.round(parallelism * 10) / 10,
    complexityScore:      Math.round(complexity  * 10) / 10,
    confidenceScore:      Math.round(confidence  * 100) / 100,
    totalScore:           Math.round(totalScore   * 1000) / 1000,
    connectors:           candidate.connectors,
    rationale:            "",
  };
  partial.rationale = buildRationale(partial);
  return Object.freeze(partial);
}