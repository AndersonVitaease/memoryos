/**
 * KnowledgeEvidenceEngine.ts
 * Calculates a composite evidence quality score for captured knowledge.
 *
 * Authority: ENGINEERING
 * SRP: Evidence scoring only — no review decisions, no promotion.
 * Sprint: KB-04
 *
 * Score range: 0–100. Deterministic. No external dependencies.
 */

import type { EvidenceScore } from "./KnowledgeReviewTypes";
import type { KCECapture }   from "../capture/KCETypes";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now  = Date.now();
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

function recencyScore(days: number): number {
  // Recent (0–7 days) → 1.0; older decreases logarithmically
  if (days <= 7)   return 1.0;
  if (days <= 30)  return 0.8;
  if (days <= 90)  return 0.6;
  if (days <= 180) return 0.4;
  return 0.2;
}

export const KnowledgeEvidenceEngine = Object.freeze({

  /**
   * Calculate evidence score for a capture.
   *
   * Factors:
   *  - Classifier confidence           (30%)
   *  - Number of suggested targets     (20%)
   *  - Whether root cause is detailed  (20%)
   *  - Priority signal                 (15%)
   *  - Recency                         (10%)
   *  - Metadata completeness           (5%)
   */
  calculate(capture: KCECapture): EvidenceScore {
    const conf      = capture.classification?.confidence ?? 0;
    const targets   = capture.classification?.suggestedTargets?.length ?? 0;
    const recency   = recencyScore(daysSince(capture.createdAt));
    const days      = daysSince(capture.createdAt);

    // Root cause detail signal
    const rcDetail  = (capture.raw.why?.length ?? 0) > 80 ? 1 : (capture.raw.why?.length ?? 0) > 40 ? 0.5 : 0.2;

    // Priority signal
    const priorityMap: Record<string, number> = { CRITICAL: 1, HIGH: 0.8, MEDIUM: 0.5, LOW: 0.2 };
    const prioritySig = priorityMap[capture.raw.priority] ?? 0.5;

    // Metadata completeness
    const hasComponents = (capture.raw.components?.length ?? 0) > 0 ? 1 : 0;
    const hasTags       = (capture.raw.tags?.length ?? 0) > 0 ? 1 : 0;
    const hasSprint     = capture.raw.sprint ? 1 : 0;
    const completeness  = (hasComponents + hasTags + hasSprint) / 3;

    // Composite
    const raw =
      conf         * 30 +
      clamp(targets / 5, 0, 1) * 20 +
      rcDetail     * 20 +
      prioritySig  * 15 +
      recency      * 10 +
      completeness * 5;

    const score = Math.round(clamp(raw, 0, 100));

    return {
      captureId:       capture.id,
      occurrences:     1,
      successfulFixes: capture.status === "PROMOTED" ? 1 : 0,
      regressionCount: 0,
      approvalCount:   capture.status === "PROMOTED" ? 1 : 0,
      confidence:      conf,
      recency:         days,
      usageFrequency:  clamp(targets / 7, 0, 1),
      score,
    };
  },

  /**
   * Determine auto-approval eligibility from score.
   * >= 70  → AUTO approve
   * 40–69  → ENGINEERING review required
   * 20–39  → SPECIALIST review required
   * < 20   → FINAL review required
   */
  approvalLevel(score: number): "AUTO" | "ENGINEERING" | "SPECIALIST" | "FINAL" {
    if (score >= 70) return "AUTO";
    if (score >= 40) return "ENGINEERING";
    if (score >= 20) return "SPECIALIST";
    return "FINAL";
  },
});