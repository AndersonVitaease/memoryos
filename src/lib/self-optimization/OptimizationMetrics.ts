/**
 * OptimizationMetrics.ts — Sprint EF-53
 *
 * SRP: calcular OptimizationMetrics a partir dos findings e recommendations.
 */

import type { OptimizationMetrics, OptimizationRecommendation, OptimizationTarget } from "./SOTypes";

function avgImpactByTarget(recs: readonly OptimizationRecommendation[], target: OptimizationTarget): number {
  const filtered = recs.filter(r => r.target === target);
  if (filtered.length === 0) return 0;
  return filtered.reduce((s, r) => s + r.expectedImpact, 0) / filtered.length;
}

export class OptimizationMetricsEngine {
  compute(recommendations: readonly OptimizationRecommendation[]): OptimizationMetrics {
    const count = recommendations.length;
    const avgImpact = count > 0
      ? recommendations.reduce((s, r) => s + r.expectedImpact, 0) / count
      : 0;

    return Object.freeze({
      optimizationOpportunities: count,
      avgImprovementScore:       avgImpact,
      executionGain:             avgImpactByTarget(recommendations, "execution"),
      plannerGain:               avgImpactByTarget(recommendations, "planner"),
      strategyGain:              avgImpactByTarget(recommendations, "strategy"),
      capabilityGain:            avgImpactByTarget(recommendations, "capability"),
      reasoningGain:             avgImpactByTarget(recommendations, "reasoning"),
      knowledgeGain:             avgImpactByTarget(recommendations, "knowledge"),
      connectorGain:             avgImpactByTarget(recommendations, "connector"),
      confidenceGain:            avgImpactByTarget(recommendations, "confidence"),
    });
  }
}