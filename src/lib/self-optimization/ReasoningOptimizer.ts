/**
 * ReasoningOptimizer.ts — Sprint EF-53
 *
 * SRP: avaliar depth, inference count, conflict rate e qualidade das decisões.
 * Nunca modifica o KnowledgeReasoningEngine.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";
import type { OptimizationPolicyConfig } from "./OptimizationPolicy";

export class ReasoningOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
    policy: OptimizationPolicyConfig,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    // Low reasoning confidence
    if (snapshot.reasoningAvgConfidence < policy.minReasoningConfidence) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "reasoning",
        category: "low_reasoning_confidence",
        title: "Low Reasoning Confidence",
        description: `Average reasoning confidence is ${(snapshot.reasoningAvgConfidence * 100).toFixed(1)}%, below ${(policy.minReasoningConfidence * 100).toFixed(0)}% threshold.`,
        severity: "high",
        metrics: { avgConfidence: snapshot.reasoningAvgConfidence, threshold: policy.minReasoningConfidence },
        evidence: [`avg_confidence=${(snapshot.reasoningAvgConfidence * 100).toFixed(1)}%`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "reasoning",
        title: "Improve Knowledge Quality to Boost Reasoning Confidence",
        description: "Reasoning confidence is driven by rule quality. Improve the Knowledge Store via EF-51.",
        justification: `${(snapshot.reasoningAvgConfidence * 100).toFixed(1)}% average confidence produces unreliable decisions.`,
        evidence: [`avg_confidence=${(snapshot.reasoningAvgConfidence * 100).toFixed(1)}%`, `threshold=${(policy.minReasoningConfidence * 100).toFixed(0)}%`],
        priority: "high", risk: "none",
        expectedImpact: 0.40, confidence: 0.75,
        affectedComponents: ["KnowledgeReasoningEngine", "KnowledgeStore"],
        estimatedGain: `${((policy.minReasoningConfidence - snapshot.reasoningAvgConfidence) * 100).toFixed(0)}pp confidence improvement`,
        isAutomatic: false,
      }));
    }

    // High conflict rate
    if (snapshot.reasoningConflictRate > policy.maxConflictRate) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "reasoning",
        category: "high_conflict_rate",
        title: "High Reasoning Conflict Rate",
        description: `${(snapshot.reasoningConflictRate * 100).toFixed(1)}% of reasoning runs produce conflicts, above ${(policy.maxConflictRate * 100).toFixed(0)}% threshold.`,
        severity: snapshot.reasoningConflictRate > 0.50 ? "critical" : "high",
        metrics: { conflictRate: snapshot.reasoningConflictRate, threshold: policy.maxConflictRate },
        evidence: [`conflict_rate=${(snapshot.reasoningConflictRate * 100).toFixed(1)}%`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "reasoning",
        title: "Reduce Conflicting Rules in Knowledge Base",
        description: "Deprecate contradictory rules in the Knowledge Store to lower conflict rate.",
        justification: `${(snapshot.reasoningConflictRate * 100).toFixed(1)}% conflicts slow resolution and reduce decision quality.`,
        evidence: [`conflict_rate=${(snapshot.reasoningConflictRate * 100).toFixed(1)}%`, `threshold=${(policy.maxConflictRate * 100).toFixed(0)}%`],
        priority: "high", risk: "medium",
        expectedImpact: 0.30, confidence: 0.70,
        affectedComponents: ["KnowledgeReasoningEngine", "ConflictResolver", "KnowledgeStore"],
        estimatedGain: `${((snapshot.reasoningConflictRate - policy.maxConflictRate) * 100).toFixed(0)}pp conflict rate reduction`,
        isAutomatic: false,
      }));
    }

    // Excessive inference depth
    if (snapshot.reasoningAvgDepth > 4) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "reasoning",
        category: "deep_inference",
        title: "Excessive Inference Depth",
        description: `Average inference depth is ${snapshot.reasoningAvgDepth.toFixed(1)} steps — may indicate circular or redundant reasoning.`,
        severity: "medium",
        metrics: { avgDepth: snapshot.reasoningAvgDepth, recommended: 4 },
        evidence: [`avg_depth=${snapshot.reasoningAvgDepth.toFixed(1)}`, `recommended_max=4`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "reasoning",
        title: "Optimize Inference Chain Depth",
        description: "Limit inference types or improve rule specificity to reduce redundant reasoning steps.",
        justification: `Depth ${snapshot.reasoningAvgDepth.toFixed(1)} adds latency and risks over-inference.`,
        evidence: [`avg_depth=${snapshot.reasoningAvgDepth.toFixed(1)}`],
        priority: "medium", risk: "low",
        expectedImpact: 0.20, confidence: 0.60,
        affectedComponents: ["KnowledgeReasoningEngine", "InferenceEngine"],
        estimatedGain: "Faster reasoning, lower latency",
        isAutomatic: false,
      }));
    }

    return { findings, recommendations };
  }
}