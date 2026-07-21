/**
 * KnowledgeOptimizer.ts — Sprint EF-53
 *
 * SRP: detectar conhecimento duplicado, obsoleto, contraditório ou de baixa qualidade.
 * Nunca modifica o KnowledgeStore.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";
import type { OptimizationPolicyConfig } from "./OptimizationPolicy";

export class KnowledgeOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
    policy: OptimizationPolicyConfig,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    if (snapshot.knowledgeRuleCount === 0) return { findings, recommendations };

    // Low average confidence
    if (snapshot.knowledgeAvgConfidence < policy.minKnowledgeConfidence) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "knowledge",
        category: "low_knowledge_confidence",
        title: "Low Knowledge Base Confidence",
        description: `Average rule confidence is ${(snapshot.knowledgeAvgConfidence * 100).toFixed(1)}%, below ${(policy.minKnowledgeConfidence * 100).toFixed(0)}% threshold.`,
        severity: "high",
        metrics: { avgConfidence: snapshot.knowledgeAvgConfidence, threshold: policy.minKnowledgeConfidence, ruleCount: snapshot.knowledgeRuleCount },
        evidence: [`avg_confidence=${(snapshot.knowledgeAvgConfidence * 100).toFixed(1)}%`, `rules=${snapshot.knowledgeRuleCount}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "knowledge",
        title: "Improve Knowledge Quality through More Episodes",
        description: "Feed more successful episodes into the EF-51 Learning Engine to raise rule confidence.",
        justification: `Avg confidence ${(snapshot.knowledgeAvgConfidence * 100).toFixed(1)}% below policy minimum ${(policy.minKnowledgeConfidence * 100).toFixed(0)}%.`,
        evidence: [`avg_confidence=${(snapshot.knowledgeAvgConfidence * 100).toFixed(1)}%`, `rule_count=${snapshot.knowledgeRuleCount}`],
        priority: "high", risk: "none",
        expectedImpact: 0.35, confidence: 0.70,
        affectedComponents: ["KnowledgeStore", "LearningEngine"],
        estimatedGain: `${((policy.minKnowledgeConfidence - snapshot.knowledgeAvgConfidence) * 100).toFixed(0)}pp confidence gain via more episodes`,
        isAutomatic: false,
      }));
    }

    // Low success rate in knowledge base
    if (snapshot.knowledgeAvgSuccessRate < policy.minSuccessRateWarning) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "knowledge",
        category: "low_knowledge_success",
        title: "Knowledge Base Has Low Success Rate Rules",
        description: `Average rule success rate is ${(snapshot.knowledgeAvgSuccessRate * 100).toFixed(1)}%.`,
        severity: "medium",
        metrics: { avgSuccessRate: snapshot.knowledgeAvgSuccessRate },
        evidence: [`avg_success=${(snapshot.knowledgeAvgSuccessRate * 100).toFixed(1)}%`, `rules=${snapshot.knowledgeRuleCount}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "knowledge",
        title: "Deprecate Low-Success-Rate Rules",
        description: "Review and deprecate rules with consistently low success rates via the EF-51 Learning Engine.",
        justification: `Rules with low success rates degrade reasoning quality in EF-52.`,
        evidence: [`avg_success_rate=${(snapshot.knowledgeAvgSuccessRate * 100).toFixed(1)}%`],
        priority: "medium", risk: "medium",
        expectedImpact: 0.25, confidence: 0.65,
        affectedComponents: ["KnowledgeStore", "KnowledgeValidator"],
        estimatedGain: "Cleaner knowledge base, higher reasoning accuracy",
        isAutomatic: false,
      }));
    }

    // Very small knowledge base
    if (snapshot.knowledgeRuleCount < 5) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "knowledge",
        category: "sparse_knowledge",
        title: "Sparse Knowledge Base",
        description: `Only ${snapshot.knowledgeRuleCount} knowledge rules — insufficient for high-quality reasoning.`,
        severity: "high",
        metrics: { ruleCount: snapshot.knowledgeRuleCount, recommended: 10 },
        evidence: [`rules=${snapshot.knowledgeRuleCount}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "knowledge",
        title: "Expand Episodic Training Data",
        description: "Run more diverse goal episodes to populate the Knowledge Store via EF-51.",
        justification: `${snapshot.knowledgeRuleCount} rules is insufficient for reliable EF-52 reasoning.`,
        evidence: [`current_rules=${snapshot.knowledgeRuleCount}`, `minimum_recommended=10`],
        priority: "critical", risk: "none",
        expectedImpact: 0.60, confidence: 0.90,
        affectedComponents: ["LearningEngine", "KnowledgeStore"],
        estimatedGain: "Significant reasoning quality improvement",
        isAutomatic: false,
      }));
    }

    return { findings, recommendations };
  }
}