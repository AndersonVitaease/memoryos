/**
 * ConfidenceReviewer.ts — Sprint EF-54
 *
 * SRP: comparar confidence prevista, usada e realizada; calcular calibration error.
 */

import type { ConfidenceReview } from "./MCTypes";
import type { ThoughtSnapshot } from "./ThoughtAnalyzer";

export class ConfidenceReviewer {
  review(snap: ThoughtSnapshot): ConfidenceReview {
    const predictedConfidence = snap.confidence;
    const usedConfidence      = snap.decisionConf;
    const realizedSuccess     = snap.success ? 1.0 : 0.0;

    const calibrationError = Math.abs(predictedConfidence - realizedSuccess);
    const confidenceDrift  = Math.abs(predictedConfidence - usedConfidence);

    const isOverconfident  = predictedConfidence > realizedSuccess + 0.20;
    const isUnderconfident = predictedConfidence < realizedSuccess - 0.20;

    let assessment: string;
    if (calibrationError < 0.10) {
      assessment = "Well-calibrated — predicted confidence closely matches realized outcome.";
    } else if (isOverconfident) {
      assessment = `Overconfident by ${(calibrationError * 100).toFixed(1)}pp — system predicted more success than achieved.`;
    } else if (isUnderconfident) {
      assessment = `Underconfident by ${(calibrationError * 100).toFixed(1)}pp — system performed better than its confidence suggested.`;
    } else {
      assessment = `Moderate calibration error (${(calibrationError * 100).toFixed(1)}pp) — acceptable but improvable.`;
    }

    return Object.freeze({
      predictedConfidence,
      usedConfidence,
      realizedSuccess,
      calibrationError,
      confidenceDrift,
      isOverconfident,
      isUnderconfident,
      assessment,
    });
  }
}