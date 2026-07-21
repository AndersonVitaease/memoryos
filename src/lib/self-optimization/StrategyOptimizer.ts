/**
 * StrategyOptimizer.ts — Sprint EF-53
 *
 * SRP: calcular métricas de desempenho por estratégia e sugerir melhorias de peso.
 * Nunca modifica StrategySelectionEngine ou StrategyGenerationEngine.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";
import type { OptimizationPolicyConfig } from "./OptimizationPolicy";

export class StrategyOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
    policy: OptimizationPolicyConfig,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    const strategies = Object.entries(snapshot.strategyDistribution);
    const total = strategies.reduce((s, [, v]) => s + v, 0);

    if (total === 0) return { findings, recommendations };

    // Dominant strategy (>70% of executions)
    const dominant = strategies.find(([, v]) => v / total > 0.70);
    if (dominant) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "strategy",
        category: "strategy_dominance",
        title: "Single Strategy Dominance",
        description: `Strategy "${dominant[0]}" accounts for ${((dominant[1] / total) * 100).toFixed(0)}% of executions — insufficient diversity.`,
        severity: "medium",
        metrics: { dominanceRate: dominant[1] / total, strategyCount: strategies.length },
        evidence: [`strategy=${dominant[0]}`, `usage=${dominant[1]}/${total}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "strategy",
        title: "Increase Strategy Diversity",
        description: `"${dominant[0]}" is over-relied upon. Consider adjusting strategy selection weights to explore alternatives.`,
        justification: `${((dominant[1] / total) * 100).toFixed(0)}% dominance reduces system resilience.`,
        evidence: [`dominance=${((dominant[1] / total) * 100).toFixed(0)}%`, `total_executions=${total}`],
        priority: "medium", risk: "low",
        expectedImpact: 0.20, confidence: 0.70,
        affectedComponents: ["StrategySelectionEngine", "StrategyScorer"],
        estimatedGain: "More balanced strategy distribution, improved resilience",
        isAutomatic: false,
      }));
    }

    // Unused strategies
    const unused = strategies.filter(([, v]) => v / total < policy.minCapabilityUsageRate);
    if (unused.length > 0) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "strategy",
        category: "unused_strategies",
        title: "Underutilized Strategies Detected",
        description: `${unused.length} strategy(ies) have <${(policy.minCapabilityUsageRate * 100).toFixed(0)}% usage: ${unused.map(([k]) => k).join(", ")}.`,
        severity: "low",
        metrics: { unusedCount: unused.length, threshold: policy.minCapabilityUsageRate },
        evidence: unused.map(([k, v]) => `${k}=${((v / total) * 100).toFixed(1)}%`),
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "strategy",
        title: "Review Underutilized Strategies",
        description: "Evaluate whether low-usage strategies serve distinct scenarios or can be deprecated.",
        justification: `${unused.length} strategies collectively used <${(policy.minCapabilityUsageRate * 100).toFixed(0)}% of the time.`,
        evidence: [`underutilized=${unused.map(([k]) => k).join(", ")}`],
        priority: "low", risk: "none",
        expectedImpact: 0.10, confidence: 0.60,
        affectedComponents: ["StrategyGenerationEngine", "StrategyCatalog"],
        estimatedGain: "Reduced cognitive overhead in strategy selection",
        isAutomatic: false,
      }));
    }

    // Overall low success rate → strategy issue
    if (snapshot.avgEpisodeSuccess < policy.minSuccessRateWarning) {
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "strategy",
        title: "Recalibrate Strategy Success Weights",
        description: "Reweight strategies based on actual success rates from episodic history.",
        justification: `Global success rate of ${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}% suggests strategy weights are misaligned.`,
        evidence: [`global_success=${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}%`, `threshold=${(policy.minSuccessRateWarning * 100).toFixed(0)}%`],
        priority: "high", risk: "medium",
        expectedImpact: 0.40, confidence: 0.75,
        affectedComponents: ["StrategyScorer", "StrategySelectionEngine"],
        estimatedGain: `Up to ${((policy.minSuccessRateWarning - snapshot.avgEpisodeSuccess) * 100).toFixed(0)}pp success rate improvement`,
        isAutomatic: false,
      }));
    }

    return { findings, recommendations };
  }
}