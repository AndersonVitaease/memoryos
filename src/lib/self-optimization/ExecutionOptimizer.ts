/**
 * ExecutionOptimizer.ts — Sprint EF-53
 *
 * SRP: analisar tempo, falhas, repetições e uso de recursos na execução.
 * Nunca modifica o ExecutionDispatcher ou ConnectorRuntime.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";
import type { OptimizationPolicyConfig } from "./OptimizationPolicy";

export class ExecutionOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
    policy: OptimizationPolicyConfig,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    // Slow execution
    if (snapshot.avgEpisodeDurationMs > policy.maxAvgDurationMs) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "execution",
        category: "slow_execution",
        title: "Slow Average Execution",
        description: `Average execution time is ${snapshot.avgEpisodeDurationMs.toFixed(0)}ms, exceeding ${policy.maxAvgDurationMs}ms threshold.`,
        severity: snapshot.avgEpisodeDurationMs > policy.maxAvgDurationMs * 2 ? "critical" : "high",
        metrics: { avgDurationMs: snapshot.avgEpisodeDurationMs, threshold: policy.maxAvgDurationMs },
        evidence: [`avg_duration=${snapshot.avgEpisodeDurationMs.toFixed(0)}ms`, `episodes=${snapshot.episodeCount}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "execution",
        title: "Parallelize Independent Execution Steps",
        description: "Identify execution steps without dependencies and run them in parallel.",
        justification: `${snapshot.avgEpisodeDurationMs.toFixed(0)}ms average execution is ${((snapshot.avgEpisodeDurationMs / policy.maxAvgDurationMs - 1) * 100).toFixed(0)}% above threshold.`,
        evidence: [`avg_duration=${snapshot.avgEpisodeDurationMs.toFixed(0)}ms`],
        priority: "high", risk: "medium",
        expectedImpact: 0.35, confidence: 0.70,
        affectedComponents: ["ExecutionDispatcher", "ConnectorRuntime"],
        estimatedGain: `Up to ${((1 - policy.maxAvgDurationMs / snapshot.avgEpisodeDurationMs) * 100).toFixed(0)}% execution time reduction`,
        isAutomatic: false,
      }));
    }

    // High failure rate
    const failureRate = 1 - snapshot.avgEpisodeSuccess;
    if (failureRate > 0.25) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "execution",
        category: "high_failure_rate",
        title: "High Execution Failure Rate",
        description: `${(failureRate * 100).toFixed(1)}% of executions fail.`,
        severity: failureRate > 0.50 ? "critical" : "high",
        metrics: { failureRate, successRate: snapshot.avgEpisodeSuccess },
        evidence: [`failure_rate=${(failureRate * 100).toFixed(1)}%`, `episodes=${snapshot.episodeCount}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "execution",
        title: "Implement Retry Strategy with Exponential Backoff",
        description: "Add structured retry logic to handle transient failures without complete plan failure.",
        justification: `${(failureRate * 100).toFixed(1)}% failure rate significantly impacts user experience.`,
        evidence: [`failure_rate=${(failureRate * 100).toFixed(1)}%`],
        priority: failureRate > 0.50 ? "critical" : "high", risk: "low",
        expectedImpact: 0.45, confidence: 0.75,
        affectedComponents: ["ExecutionDispatcher", "ConnectorRuntime"],
        estimatedGain: `Up to ${(failureRate * 50).toFixed(0)}% failure reduction via retry`,
        isAutomatic: false,
      }));
    }

    return { findings, recommendations };
  }
}