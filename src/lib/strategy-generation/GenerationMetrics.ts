/**
 * GenerationMetrics.ts — Sprint EF-47 · Strategy Generation Engine
 *
 * SRP: calcular métricas de um conjunto de GeneratedStrategies.
 *
 * Responde perguntas como:
 *   - Qual tem menor latência?
 *   - Qual é mais confiável?
 *   - Qual tem menor custo?
 *   - Qual é mais simples?
 *
 * Imutável — sem side effects.
 */

import type { GeneratedStrategy } from "./GeneratedStrategy";

export interface GenerationSummary {
  readonly totalGenerated:      number;
  readonly fastestMs:           number;
  readonly mostReliablePct:     number;
  readonly cheapestCostScore:   number;
  readonly simplestComplexity:  number;
  readonly avgLatencyMs:        number;
  readonly avgReliabilityPct:   number;
  readonly avgCostScore:        number;
  readonly profileCoverage:     readonly string[];
  readonly totalStages:         number;
  readonly uniqueConnectors:    readonly string[];
  readonly durationMs:          number;
}

export function computeGenerationMetrics(
  strategies:  readonly GeneratedStrategy[],
  durationMs:  number,
): GenerationSummary {
  if (strategies.length === 0) {
    return Object.freeze({
      totalGenerated: 0, fastestMs: 0, mostReliablePct: 0,
      cheapestCostScore: 0, simplestComplexity: 0,
      avgLatencyMs: 0, avgReliabilityPct: 0, avgCostScore: 0,
      profileCoverage: [], totalStages: 0, uniqueConnectors: [], durationMs,
    });
  }

  const latencies     = strategies.map(s => s.estimatedLatencyMs);
  const reliabilities = strategies.map(s => s.estimatedReliability);
  const costs         = strategies.map(s => s.estimatedCostScore);
  const complexities  = strategies.map(s => s.estimatedComplexity);
  const avg           = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const uniqueConnectors = [...new Set(
    strategies.flatMap(s => s.connectors.map(c => c.name))
  )];

  return Object.freeze({
    totalGenerated:     strategies.length,
    fastestMs:          Math.min(...latencies),
    mostReliablePct:    Math.max(...reliabilities),
    cheapestCostScore:  Math.min(...costs),
    simplestComplexity: Math.min(...complexities),
    avgLatencyMs:       avg(latencies),
    avgReliabilityPct:  avg(reliabilities),
    avgCostScore:       avg(costs),
    profileCoverage:    Object.freeze(strategies.map(s => s.generationProfile)),
    totalStages:        strategies.reduce((a, s) => a + s.executionStages.length, 0),
    uniqueConnectors:   Object.freeze(uniqueConnectors),
    durationMs,
  });
}