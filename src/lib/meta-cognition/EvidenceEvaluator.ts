/**
 * EvidenceEvaluator.ts — Sprint EF-54
 *
 * SRP: avaliar quantidade, qualidade, diversidade, autoridade e cobertura das evidências.
 */

import type { EvidenceEvaluation } from "./MCTypes";
import type { ThoughtSnapshot } from "./ThoughtAnalyzer";

export class EvidenceEvaluator {
  evaluate(snap: ThoughtSnapshot): EvidenceEvaluation {
    const totalCount = snap.knowledgeRules + snap.capabilities.length + snap.connectors.length;

    // Quality: based on confidence and authority of used knowledge
    const qualityScore = (snap.confidence * 0.5 + snap.authority * 0.5);

    // Diversity: different types of evidence (rules, capabilities, connectors)
    const evidenceTypes = [
      snap.knowledgeRules > 0 ? 1 : 0,
      snap.capabilities.length > 0 ? 1 : 0,
      snap.connectors.length > 0 ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    const diversityScore = evidenceTypes / 3;

    // Authority: direct from snapshot
    const authorityScore = snap.authority;

    // Contradictions: conflicts from inference
    const contradictionCount = snap.conflictCount;

    // Coverage: how well the evidence covers the goal (proxy: rules vs expected 5)
    const coverageScore = Math.min(snap.knowledgeRules / 5, 1) * 0.5 + Math.min(snap.capabilities.length / 3, 1) * 0.5;

    const overallScore = (qualityScore + diversityScore + authorityScore + coverageScore) / 4;

    const weaknesses: string[] = [];
    if (snap.knowledgeRules === 0) weaknesses.push("No knowledge rules — evidence entirely from episodic patterns");
    if (snap.knowledgeRules < 3)   weaknesses.push("Few knowledge rules — evidence may be insufficient");
    if (diversityScore < 0.5)      weaknesses.push("Low evidence diversity — only one type of source used");
    if (snap.conflictCount > 2)    weaknesses.push(`${snap.conflictCount} conflicts indicate contradictory evidence`);
    if (coverageScore < 0.4)       weaknesses.push("Evidence coverage is low for the stated goal");

    return Object.freeze({
      totalCount,
      qualityScore,
      diversityScore,
      authorityScore,
      contradictionCount,
      coverageScore,
      overallScore,
      weaknesses: Object.freeze(weaknesses),
    });
  }
}