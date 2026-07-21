/**
 * ConnectorOptimizer.ts — Sprint EF-53
 *
 * SRP: avaliar latência, falhas, disponibilidade e ranking de conectores.
 * Nunca modifica nenhum conector.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";
import type { OptimizationPolicyConfig } from "./OptimizationPolicy";

export class ConnectorOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
    policy: OptimizationPolicyConfig,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    const connectors = Object.entries(snapshot.connectorUsage);
    const total = connectors.reduce((s, [, v]) => s + v, 0);

    if (total === 0) return { findings, recommendations };

    // Low overall success → connectors may be degrading
    if (snapshot.avgEpisodeSuccess < policy.minConnectorSuccessRate) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "connector",
        category: "connector_degradation",
        title: "Potential Connector Degradation",
        description: `Overall success rate ${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}% is below connector health threshold ${(policy.minConnectorSuccessRate * 100).toFixed(0)}%.`,
        severity: "high",
        metrics: { successRate: snapshot.avgEpisodeSuccess, threshold: policy.minConnectorSuccessRate },
        evidence: [`success_rate=${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}%`, `${connectors.length} connectors active`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "connector",
        title: "Investigate Connector Health",
        description: "Run connector health checks to identify OAuth failures, timeouts, or rate limits.",
        justification: `Success rate ${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}% below healthy threshold.`,
        evidence: [`success_rate=${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}%`, `threshold=${(policy.minConnectorSuccessRate * 100).toFixed(0)}%`],
        priority: "high", risk: "low",
        expectedImpact: 0.40, confidence: 0.70,
        affectedComponents: connectors.map(([k]) => k),
        estimatedGain: `Up to ${((policy.minConnectorSuccessRate - snapshot.avgEpisodeSuccess) * 100).toFixed(0)}pp success rate recovery`,
        isAutomatic: false,
      }));
    }

    // High execution time → connector latency
    if (snapshot.avgEpisodeDurationMs > policy.maxAvgDurationMs) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "connector",
        category: "connector_latency",
        title: "High Connector Latency",
        description: `Average execution time ${snapshot.avgEpisodeDurationMs.toFixed(0)}ms likely includes connector latency spikes.`,
        severity: "medium",
        metrics: { avgDurationMs: snapshot.avgEpisodeDurationMs, threshold: policy.maxAvgDurationMs },
        evidence: [`avg_duration=${snapshot.avgEpisodeDurationMs.toFixed(0)}ms`, `${connectors.length} connectors`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "connector",
        title: "Add Connector Response Caching",
        description: "Cache connector results for repeated queries within the same session to reduce latency.",
        justification: `${snapshot.avgEpisodeDurationMs.toFixed(0)}ms avg latency exceeds policy threshold.`,
        evidence: [`avg_duration=${snapshot.avgEpisodeDurationMs.toFixed(0)}ms`, `policy_max=${policy.maxAvgDurationMs}ms`],
        priority: "medium", risk: "low",
        expectedImpact: 0.30, confidence: 0.65,
        affectedComponents: ["ConnectorRuntime", "UniversalConnectorRouter"],
        estimatedGain: "20–40% latency reduction for repeated queries",
        isAutomatic: false,
      }));
    }

    // Unused connectors
    const unused = connectors.filter(([, v]) => v / total < policy.minCapabilityUsageRate);
    if (unused.length > 0) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "connector",
        category: "unused_connectors",
        title: "Underutilized Connectors",
        description: `${unused.length} connector(s) have <${(policy.minCapabilityUsageRate * 100).toFixed(0)}% usage.`,
        severity: "info",
        metrics: { unusedCount: unused.length },
        evidence: unused.map(([k, v]) => `${k}=${((v / total) * 100).toFixed(1)}%`),
      }));
    }

    return { findings, recommendations };
  }
}