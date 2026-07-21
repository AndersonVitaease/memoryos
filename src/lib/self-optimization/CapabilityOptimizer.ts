/**
 * CapabilityOptimizer.ts — Sprint EF-53
 *
 * SRP: detectar capabilities subutilizadas, redundantes, lentas ou obsoletas.
 * Nunca modifica o CapabilityReasoningEngine ou CapabilityBindingEngine.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";
import type { OptimizationPolicyConfig } from "./OptimizationPolicy";

export class CapabilityOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
    policy: OptimizationPolicyConfig,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    const caps = Object.entries(snapshot.capabilityUsage);
    const total = caps.reduce((s, [, v]) => s + v, 0);

    if (total === 0 || caps.length === 0) return { findings, recommendations };

    // Unused/underused capabilities
    const unused = caps.filter(([, v]) => v / total < policy.minCapabilityUsageRate);
    if (unused.length > 0) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "capability",
        category: "unused_capabilities",
        title: "Underutilized Capabilities",
        description: `${unused.length} capability(ies) used in <${(policy.minCapabilityUsageRate * 100).toFixed(0)}% of executions.`,
        severity: "low",
        metrics: { unusedCount: unused.length, threshold: policy.minCapabilityUsageRate },
        evidence: unused.map(([k, v]) => `${k}=${((v / total) * 100).toFixed(1)}%`),
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "capability",
        title: "Audit Underutilized Capabilities",
        description: "Review whether low-usage capabilities are correctly mapped to goals, or can be deprecated.",
        justification: `${unused.length} capabilities have usage <${(policy.minCapabilityUsageRate * 100).toFixed(0)}%.`,
        evidence: unused.slice(0, 5).map(([k, v]) => `${k}=${((v / total) * 100).toFixed(1)}%`),
        priority: "low", risk: "none",
        expectedImpact: 0.15, confidence: 0.65,
        affectedComponents: ["CapabilityReasoningEngine", "CapabilityRegistry"],
        estimatedGain: "Cleaner capability surface, reduced selection overhead",
        isAutomatic: false,
      }));
    }

    // Capability concentration (single capability >60%)
    const dominant = caps.find(([, v]) => v / total > 0.60);
    if (dominant) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "capability",
        category: "capability_concentration",
        title: "Capability Overconcentration",
        description: `"${dominant[0]}" is used in ${((dominant[1] / total) * 100).toFixed(0)}% of executions.`,
        severity: "medium",
        metrics: { capability: 1, usageRate: dominant[1] / total },
        evidence: [`capability=${dominant[0]}`, `usage_rate=${((dominant[1] / total) * 100).toFixed(0)}%`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "capability",
        title: "Diversify Capability Usage",
        description: `Evaluate whether "${dominant[0]}" can be split or alternatives promoted for specific scenarios.`,
        justification: `Over-reliance on one capability creates a single point of failure.`,
        evidence: [`dominant=${dominant[0]}`, `rate=${((dominant[1] / total) * 100).toFixed(0)}%`],
        priority: "medium", risk: "low",
        expectedImpact: 0.20, confidence: 0.65,
        affectedComponents: ["CapabilityReasoningEngine", "CapabilityBindingEngine"],
        estimatedGain: "More resilient capability selection",
        isAutomatic: false,
      }));
    }

    return { findings, recommendations };
  }
}