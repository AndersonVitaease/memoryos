/**
 * ConfidenceOptimizer.ts — Sprint EF-53
 *
 * SRP: avaliar confidence media, calibration error e confiança prevista vs real.
 * Nunca modifica scores de confidence.
 */

import type { OptimizationFinding, OptimizationRecommendation, OptimizationSnapshot } from "./SOTypes";
import { makeSOId } from "./SOTypes";

export class ConfidenceOptimizer {
  analyze(
    snapshot: OptimizationSnapshot,
  ): { findings: OptimizationFinding[]; recommendations: OptimizationRecommendation[] } {
    const findings: OptimizationFinding[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    // Calibration error: predicted confidence vs actual success rate
    const calibrationError = Math.abs(snapshot.avgEpisodeConfidence - snapshot.avgEpisodeSuccess);
    if (calibrationError > 0.20) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "confidence",
        category: "calibration_error",
        title: "High Confidence Calibration Error",
        description: `Confidence (${(snapshot.avgEpisodeConfidence * 100).toFixed(1)}%) deviates ${(calibrationError * 100).toFixed(1)}pp from actual success rate (${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}%).`,
        severity: calibrationError > 0.35 ? "critical" : "high",
        metrics: { confidence: snapshot.avgEpisodeConfidence, successRate: snapshot.avgEpisodeSuccess, calibrationError },
        evidence: [`confidence=${(snapshot.avgEpisodeConfidence * 100).toFixed(1)}%`, `success=${(snapshot.avgEpisodeSuccess * 100).toFixed(1)}%`, `error=${(calibrationError * 100).toFixed(1)}pp`],
      }));
      const overconfident = snapshot.avgEpisodeConfidence > snapshot.avgEpisodeSuccess;
      recommendations.push(Object.freeze({
        id: makeSOId("r"), createdAt: Date.now(), target: "confidence",
        title: overconfident ? "Reduce Overconfidence Bias" : "Address Underconfidence",
        description: overconfident
          ? "The system is systematically overconfident. Apply Platt scaling or isotonic calibration."
          : "The system is underconfident. Review confidence computation to reflect actual success rates.",
        justification: `${(calibrationError * 100).toFixed(1)}pp calibration error degrades decision reliability.`,
        evidence: [`calibration_error=${(calibrationError * 100).toFixed(1)}pp`, `episodes=${snapshot.episodeCount}`],
        priority: "high", risk: "medium",
        expectedImpact: 0.35, confidence: 0.70,
        affectedComponents: ["CapabilityReasoningEngine", "StrategySelectionEngine"],
        estimatedGain: `Up to ${(calibrationError * 100).toFixed(0)}pp calibration error reduction`,
        isAutomatic: false,
      }));
    }

    // Very low confidence overall
    if (snapshot.avgEpisodeConfidence < 0.50) {
      findings.push(Object.freeze({
        id: makeSOId("f"), detectedAt: Date.now(), target: "confidence",
        category: "low_confidence",
        title: "Systemically Low Confidence",
        description: `Average episode confidence ${(snapshot.avgEpisodeConfidence * 100).toFixed(1)}% is below 50%.`,
        severity: "high",
        metrics: { avgConfidence: snapshot.avgEpisodeConfidence },
        evidence: [`avg_confidence=${(snapshot.avgEpisodeConfidence * 100).toFixed(1)}%`],
      }));
    }

    return { findings, recommendations };
  }
}