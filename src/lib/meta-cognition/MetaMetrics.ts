/**
 * MetaMetrics.ts — Sprint EF-54
 *
 * SRP: calcular MetaMetrics a partir dos outputs do pipeline meta-cognitivo.
 */

import type { MetaMetrics, DetectedBias, Alternative, ConsistencyIssue, EvidenceEvaluation, ReasoningReview, ConfidenceReview } from "./MCTypes";

export class MetaMetricsEngine {
  compute(opts: {
    biases:          readonly DetectedBias[];
    alternatives:    readonly Alternative[];
    consistencyIssues: readonly ConsistencyIssue[];
    evidence:        EvidenceEvaluation;
    reasoningReview: ReasoningReview;
    confidenceReview: ConfidenceReview;
    cognitiveFlowQuality: number;
  }): MetaMetrics {
    const { biases, alternatives, consistencyIssues, evidence, reasoningReview, confidenceReview, cognitiveFlowQuality } = opts;

    const reasoningQuality = reasoningReview.overallQuality;

    const reflectionQuality = Math.max(0, 1 - (biases.length * 0.05 + consistencyIssues.length * 0.10));

    const biasCount = biases.length;

    // How many alternatives could improve outcome
    const improvingAlts = alternatives.filter(a => a.couldImprove).length;
    const alternativeCoverage = alternatives.length > 0
      ? Math.min(improvingAlts / Math.max(alternatives.length, 1) + 0.30, 1)
      : 0.10;

    const evidenceCoverage = evidence.coverageScore;

    const consistencyScore = Math.max(0, 1 - consistencyIssues.length * 0.15);

    const confidenceCalibration = Math.max(0, 1 - confidenceReview.calibrationError);

    const metaConfidence = (
      cognitiveFlowQuality * 0.25 +
      reasoningQuality     * 0.25 +
      consistencyScore     * 0.20 +
      confidenceCalibration* 0.15 +
      evidenceCoverage     * 0.15
    );

    return Object.freeze({
      reasoningQuality,
      reflectionQuality,
      biasCount,
      alternativeCoverage,
      evidenceCoverage,
      consistencyScore,
      confidenceCalibration,
      metaConfidence,
    });
  }
}