/**
 * AuthorityOptimizer.ts — Sprint EF-53
 *
 * SRP: analisar authority scores, distribuição e sugerir recalibração.
 * Nunca modifica authority values.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";

export class AuthorityOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    // Low average authority from episodes
    if (snapshot.avgEpisodeAuthority < 0.55) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "authority",
        category: "low_authority",
        title: "Low Average Authority Score",
        description: `Average episode authority is ${(snapshot.avgEpisodeAuthority * 100).toFixed(1)}% — decisions may lack sufficient grounding.`,
        severity: "medium",
        metrics: { avgAuthority: snapshot.avgEpisodeAuthority },
        evidence: [`avg_authority=${(snapshot.avgEpisodeAuthority * 100).toFixed(1)}%`, `episodes=${snapshot.episodeCount}`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "authority",
        title: "Recalibrate Authority Scores",
        description: "Review authority assignment logic in EF-49 to ensure scores accurately reflect rule reliability.",
        justification: `Authority avg ${(snapshot.avgEpisodeAuthority * 100).toFixed(1)}% is below the healthy 55% baseline.`,
        evidence: [`avg_authority=${(snapshot.avgEpisodeAuthority * 100).toFixed(1)}%`],
        priority: "medium", risk: "medium",
        expectedImpact: 0.25, confidence: 0.60,
        affectedComponents: ["AuthorityEngine", "CapabilityBindingEngine"],
        estimatedGain: "More reliable conflict resolution and decision confidence",
        isAutomatic: false,
      }));
    }

    // Authority and confidence misalignment
    if (Math.abs(snapshot.avgEpisodeAuthority - snapshot.avgEpisodeConfidence) > 0.25) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "authority",
        category: "authority_confidence_mismatch",
        title: "Authority-Confidence Misalignment",
        description: `Authority (${(snapshot.avgEpisodeAuthority * 100).toFixed(1)}%) and confidence (${(snapshot.avgEpisodeConfidence * 100).toFixed(1)}%) diverge by >${((Math.abs(snapshot.avgEpisodeAuthority - snapshot.avgEpisodeConfidence)) * 100).toFixed(0)}pp.`,
        severity: "medium",
        metrics: { authority: snapshot.avgEpisodeAuthority, confidence: snapshot.avgEpisodeConfidence, gap: Math.abs(snapshot.avgEpisodeAuthority - snapshot.avgEpisodeConfidence) },
        evidence: [`authority=${(snapshot.avgEpisodeAuthority * 100).toFixed(1)}%`, `confidence=${(snapshot.avgEpisodeConfidence * 100).toFixed(1)}%`],
      }));
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "authority",
        title: "Align Authority and Confidence Calibration",
        description: "Ensure authority and confidence are computed from the same evidence sources.",
        justification: `A large gap between authority and confidence indicates calibration drift.`,
        evidence: [`gap=${((Math.abs(snapshot.avgEpisodeAuthority - snapshot.avgEpisodeConfidence)) * 100).toFixed(1)}pp`],
        priority: "medium", risk: "low",
        expectedImpact: 0.20, confidence: 0.65,
        affectedComponents: ["AuthorityEngine", "CapabilityReasoningEngine"],
        estimatedGain: "More consistent decision quality",
        isAutomatic: false,
      }));
    }

    return { findings, recommendations };
  }
}