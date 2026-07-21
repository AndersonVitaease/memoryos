/**
 * GeneratedStrategy.ts — Sprint EF-47 · Strategy Generation Engine
 *
 * SRP: tipos imutáveis que representam uma estratégia gerada dinamicamente.
 *
 * Intencionalmente compatível com StrategyCandidate (EF-46) para que
 * StrategySelectionEngine possa consumir candidatos gerados e catalogados
 * de forma uniforme — sem modificar o SSE.
 *
 * NÃO contém lógica de geração nem de scoring.
 */

import type { OperationalIntent } from "@/lib/cognitive-orchestrator/COTypes";
import type { ConnectorProfile, StrategyApproach, StrategyCandidate } from "@/lib/strategy-selection/StrategyEvaluation";
import { makeCOId } from "@/lib/cognitive-orchestrator/COTypes";

// ── Execution stage ───────────────────────────────────────────────────────────

export type StageType =
  | "fetch"       // retrieve data from a connector
  | "cache_check" // check cache before live fetch
  | "parallel"    // execute N child stages simultaneously
  | "merge"       // combine outputs from previous stages
  | "analyze"     // LLM or rule-based analysis
  | "validate"    // validate output quality
  | "synthesize"  // produce final answer
  | "fallback";   // alternative if previous stage failed

export interface ExecutionStage {
  readonly stageIndex:   number;
  readonly type:         StageType;
  readonly label:        string;
  readonly connectors:   readonly string[];       // connector names
  readonly capabilities: readonly string[];       // required capabilities
  readonly parallel:     boolean;                 // runs concurrently with previous
  readonly optional:     boolean;                 // can be skipped on failure
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export interface StrategyRisk {
  readonly description: string;
  readonly severity:    "low" | "medium" | "high" | "critical";
  readonly mitigation:  string;
}

// ── Generated strategy ────────────────────────────────────────────────────────

export type GenerationProfile =
  | "fast"         // minimise latency, fewer stages
  | "deep"         // thorough, more stages, LLM analysis
  | "conservative" // cache-first, high reliability, low cost
  | "resilient"    // fallbacks at every stage
  | "economic"     // minimise cost
  | "parallel";    // maximise concurrency

export interface GeneratedStrategy {
  readonly strategyId:            string;
  readonly generationProfile:     GenerationProfile;
  readonly label:                 string;
  readonly description:           string;
  readonly objective:             string;
  readonly intent:                OperationalIntent;
  readonly approach:              StrategyApproach;
  readonly executionStages:       readonly ExecutionStage[];
  readonly connectorSequence:     readonly string[];   // ordered connector names
  readonly connectors:            readonly ConnectorProfile[];
  readonly requiredCapabilities:  readonly string[];
  readonly estimatedComplexity:   number;   // 1–10
  readonly estimatedLatencyMs:    number;
  readonly estimatedReliability:  number;   // 0–100
  readonly estimatedCostScore:    number;   // 0–10 (lower = cheaper)
  readonly assumptions:           readonly string[];
  readonly risks:                 readonly StrategyRisk[];
  readonly generatedAt:           string;
}

// ── Adapter: GeneratedStrategy → StrategyCandidate ───────────────────────────
// Allows StrategySelectionEngine (EF-46) to consume generated strategies
// without any modification to the SSE.

export function toStrategyCandidate(gs: GeneratedStrategy): StrategyCandidate {
  return Object.freeze({
    strategyId:  gs.strategyId,
    label:       gs.label,
    description: gs.description,
    approach:    gs.approach,
    connectors:  gs.connectors,
    intent:      gs.intent,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeGeneratedStrategyId(): string { return makeCOId("gen"); }

export function makeStage(
  index:   number,
  type:    StageType,
  label:   string,
  opts: Partial<Omit<ExecutionStage, "stageIndex" | "type" | "label">> = {},
): ExecutionStage {
  return Object.freeze({
    stageIndex:   index,
    type,
    label,
    connectors:   Object.freeze(opts.connectors ?? []),
    capabilities: Object.freeze(opts.capabilities ?? []),
    parallel:     opts.parallel ?? false,
    optional:     opts.optional ?? false,
  });
}