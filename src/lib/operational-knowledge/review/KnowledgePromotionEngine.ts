/**
 * KnowledgePromotionEngine.ts
 * Promotes approved knowledge to Operational KB targets.
 *
 * Authority: ENGINEERING
 * SRP: Promotion records only — never modifies actual documents.
 * Sprint: KB-04
 *
 * Promotion creates records that describe what SHOULD be added to KB docs.
 * It does NOT write to any document file. Zero document mutations.
 */

import { KnowledgeReviewRegistry } from "./KnowledgeReviewRegistry";
import { KCECaptureStore }         from "../capture/KCECaptureStore";
import type { PromotionRecord, PromotionTarget } from "./KnowledgeReviewTypes";

const targetCounters: Record<string, number> = {};
function nextTargetId(prefix: string): string {
  targetCounters[prefix] = (targetCounters[prefix] ?? 100) + 1;
  return `${prefix}-${targetCounters[prefix]}`;
}

function inferTargets(captureId: string): PromotionTarget[] {
  const capture = KCECaptureStore.getById(captureId);
  if (!capture?.classification) return ["LESSONS_LEARNED"];

  const c = capture.classification;
  const targets: PromotionTarget[] = [];
  if (c.isLesson)       targets.push("LESSONS_LEARNED");
  if (c.isAntiPattern)  targets.push("ANTI_PATTERNS");
  if (c.isBestPractice) targets.push("BEST_PRACTICES");
  if (c.isKnownIssue)   targets.push("KNOWN_ISSUES");
  if (capture.raw.sprint) targets.push("ENGINEERING_JOURNAL");

  return targets.length > 0 ? targets : ["LESSONS_LEARNED"];
}

const TARGET_PREFIX: Record<PromotionTarget, string> = {
  LESSONS_LEARNED:     "LL",
  BEST_PRACTICES:      "BP",
  KNOWN_ISSUES:        "KI",
  ANTI_PATTERNS:       "AP",
  TROUBLESHOOTING_GUIDE: "TG",
  ENGINEERING_JOURNAL: "EJ",
};

export const KnowledgePromotionEngine = Object.freeze({

  /**
   * Promote an approved review. Creates a PromotionRecord — does NOT write to docs.
   */
  promote(reviewId: string, promotedBy = "Engineering"): PromotionRecord | null {
    const review = KnowledgeReviewRegistry.getReview(reviewId);
    if (!review || review.status !== "APPROVED") return null;

    const existing = KnowledgeReviewRegistry.getPromotionByReviewId(reviewId);
    if (existing) return existing;

    const targets      = inferTargets(review.captureId);
    const generatedIds = targets.map(t => nextTargetId(TARGET_PREFIX[t]));
    const rollbackRef  = `ROLLBACK-${reviewId}-${Date.now()}`;
    const now          = new Date().toISOString().split("T")[0];

    return KnowledgeReviewRegistry.createPromotion({
      reviewId,
      captureId:    review.captureId,
      targets,
      generatedIds,
      promotedAt:   now,
      promotedBy,
      rollbackRef,
      summary:      `Promoted "${review.title}" → [${targets.join(", ")}] on ${now}`,
    });
  },
});