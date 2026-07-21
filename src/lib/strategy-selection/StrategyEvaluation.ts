/**
 * StrategyEvaluation.ts — Sprint EF-46 · Strategy Selection Engine
 *
 * SRP: tipos imutáveis que representam uma estratégia candidata e sua avaliação.
 *
 * NÃO contém lógica de scoring nem de seleção.
 * Apenas o modelo de dados.
 */

import { makeCOId } from "@/lib/cognitive-orchestrator/COTypes";
import type { OperationalIntent } from "@/lib/cognitive-orchestrator/COTypes";

// ── Connector profile used by a strategy ─────────────────────────────────────

export interface ConnectorProfile {
  readonly name:           string;   // e.g. "github", "googledrive", "gmail", "cache"
  readonly type:           "live_api" | "cache" | "local" | "hybrid";
  readonly latencyMs:      number;   // estimated latency per call
  readonly reliabilityPct: number;   // 0–100
  readonly costScore:      number;   // 0–10 (lower = cheaper)
}

// ── A candidate strategy ──────────────────────────────────────────────────────

export type StrategyApproach =
  | "direct"        // call connector(s) directly, no cache
  | "cache_first"   // try cache, fallback to live
  | "parallel"      // fetch from multiple sources simultaneously
  | "sequential"    // strict ordered fetch
  | "fallback"      // primary + fallback connector
  | "aggregated";   // merge results from N sources

export interface StrategyCandidate {
  readonly strategyId:    string;
  readonly label:         string;
  readonly description:   string;
  readonly approach:      StrategyApproach;
  readonly connectors:    readonly ConnectorProfile[];
  readonly intent:        OperationalIntent;
}

// ── Scored evaluation ─────────────────────────────────────────────────────────

export interface StrategyEvaluation {
  readonly strategyId:          string;
  readonly label:                string;
  readonly description:          string;
  readonly approach:             StrategyApproach;
  readonly connectorCount:       number;
  readonly estimatedCost:        number;        // 0–10 (lower = better)
  readonly estimatedLatencyMs:   number;
  readonly estimatedReliability: number;        // 0–100
  readonly parallelismScore:     number;        // 0–10
  readonly complexityScore:      number;        // 0–10 (lower = simpler)
  readonly confidenceScore:      number;        // 0–1
  readonly totalScore:           number;        // weighted composite (higher = better)
  readonly recommended:          boolean;
  readonly rationale:            string;
  readonly connectors:           readonly ConnectorProfile[];
}

// ── Selection result ──────────────────────────────────────────────────────────

export interface SelectionResult {
  readonly id:               string;
  readonly goalId:           string;
  readonly intent:           OperationalIntent;
  readonly candidates:       readonly StrategyEvaluation[];
  readonly winner:           StrategyEvaluation;
  readonly alternatives:     readonly StrategyEvaluation[];   // ranked fallbacks
  readonly weights:          ScoringWeights;
  readonly rationale:        string;
  readonly durationMs:       number;
  readonly createdAt:        string;
}

// ── Scoring weights (user-controllable) ───────────────────────────────────────

export interface ScoringWeights {
  readonly cost:         number;   // 0–1
  readonly latency:      number;   // 0–1
  readonly reliability:  number;   // 0–1
  readonly parallelism:  number;   // 0–1
  // weights are normalised internally — don't need to sum to 1
}

export const DEFAULT_WEIGHTS: ScoringWeights = Object.freeze({
  cost:        0.25,
  latency:     0.25,
  reliability: 0.30,
  parallelism: 0.20,
});

// ── Factory helpers ───────────────────────────────────────────────────────────

export function makeStrategyId(): string { return makeCOId("strat"); }
export function makeSelectionId(): string { return makeCOId("sel"); }