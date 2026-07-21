/**
 * PlannerOptimizer.ts — Sprint EF-53
 *
 * SRP: detectar ineficiências nos planos produzidos pelo Planner.
 * Nunca modifica o Planner automaticamente — apenas gera recomendações.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";
import type { OptimizationPolicyConfig } from "./OptimizationPolicy";

export class PlannerOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
    policy: OptimizationPolicyConfig,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    // Detect high average duration (long plans)
    if (snapshot.avgEpisodeDurationMs > policy.maxAvgDurationMs) {
      const fId = makeSOId("f");
      findings.push(Object.freeze({
        id: fId, detectedAt: Date.now(), target: "planner",
        category: "plan_duration",
        title: "High Average Plan Execution Time",
        description: `Average plan duration is ${snapshot.avgEpisodeDurationMs.toFixed(0)}ms, exceeding threshold of ${policy.maxAvgDurationMs}ms.`,
        severity: snapshot.avgEpisodeDurationMs > policy.maxAvgDurationMs * 2 ? "critical" : "high",
        metrics: { avgDurationMs: snapshot.avgEpisodeDurationMs, threshold: policy.maxAvgDurationMs },
        evidence: [`${snapshot.episodeCount} episodes analyzed`, `avg=${snapshot.avgEpisodeDurationMs.toFixed(0)}ms`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "planner",
        title: "Simplify Execution Plans",
        description: "Consider reducing plan depth, parallelizing independent steps, or caching repeated sub-plans.",
        justification: `Plans average ${snapshot.avgEpisodeDurationMs.toFixed(0)}ms — ${((snapshot.avgEpisodeDurationMs / policy.maxAvgDurationMs - 1) * 100).toFixed(0)}% above policy threshold.`,
        evidence: [`avg_duration=${snapshot.avgEpisodeDurationMs.toFixed(0)}ms`, `threshold=${policy.maxAvgDurationMs}ms`],
        priority: "high", risk: "low",
        expectedImpact: 0.35, confidence: 0.75,
        affectedComponents: ["Planner", "ExecutionDispatcher"],
        estimatedGain: `Up to ${((1 - policy.maxAvgDurationMs / snapshot.avgEpisodeDurationMs) * 100).toFixed(0)}% latency reduction`,
        isAutomatic: false,
      }));
    }

    // Detect low success rate
    if (snapshot.avgEpisodeSuccess < policy.minSuccessRateWarning) {
      const severity = snapshot.avgEpisodeSuccess < policy.minSuccessRateCritical ? "critical" : "high";
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "planner",
        category: "plan_success_rate",
        title: "Low Plan Success Rate",
        description: `${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}% of plans succeed, below ${(policy.minSuccessRateWarning * 100).toFixed(0)}% threshold.`,
        severity,
        metrics: { successRate: snapshot.avgEpisodeSuccess, threshold: policy.minSuccessRateWarning },
        evidence: [`${snapshot.episodeCount} episodes`, `success_rate=${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}%`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "planner",
        title: "Review Failing Plan Patterns",
        description: "Identify which goal types consistently fail and refine their planning templates.",
        justification: `${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}% success rate indicates systematic plan failures.`,
        evidence: [`success_rate=${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}%`, `below_threshold=${(policy.minSuccessRateWarning * 100).toFixed(0)}%`],
        priority: severity === "critical" ? "critical" : "high", risk: "medium",
        expectedImpact: 0.50, confidence: 0.80,
        affectedComponents: ["Planner", "StrategySelectionEngine"],
        estimatedGain: `Potential ${((policy.minSuccessRateWarning - snapshot.avgEpisodeSuccess) * 100).toFixed(0)}pp improvement in plan success`,
        isAutomatic: false,
      }));
    }

    // Detect high cost
    if (snapshot.avgEpisodeCost > policy.maxCost) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "planner",
        category: "plan_cost",
        title: "High Average Execution Cost",
        description: `Average cost is ${snapshot.avgEpisodeCost.toFixed(1)}/10, above threshold of ${policy.maxCost}/10.`,
        severity: "medium",
        metrics: { avgCost: snapshot.avgEpisodeCost, threshold: policy.maxCost },
        evidence: [`avg_cost=${snapshot.avgEpisodeCost.toFixed(1)}`, `threshold=${policy.maxCost}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "planner",
        title: "Reduce Plan Execution Cost",
        description: "Prefer lower-cost strategies and capabilities when multiple options are available.",
        justification: `Average cost ${snapshot.avgEpisodeCost.toFixed(1)} exceeds policy maximum of ${policy.maxCost}.`,
        evidence: [`avg_cost=${snapshot.avgEpisodeCost.toFixed(1)}`, `policy_max=${policy.maxCost}`],
        priority: "medium", risk: "low",
        expectedImpact: 0.25, confidence: 0.65,
        affectedComponents: ["Planner", "StrategyGenerationEngine"],
        estimatedGain: `${((1 - policy.maxCost / snapshot.avgEpisodeCost) * 100).toFixed(0)}% cost reduction`,
        isAutomatic: false,
      }));
    }

    return { findings, recommendations };
  }
}