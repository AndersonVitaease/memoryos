/**
 * KnowledgeAuditEngine.ts
 * Appends immutable audit entries for every review action.
 *
 * Authority: ENGINEERING
 * SRP: Audit logging only — append-only, never delete, never modify.
 * Sprint: KB-04
 */

import { KnowledgeReviewRegistry } from "./KnowledgeReviewRegistry";
import type { AuditEntry, KnowledgeReview, ReviewDecision } from "./KnowledgeReviewTypes";

export const KnowledgeAuditEngine = Object.freeze({

  /**
   * Log a review decision.
   */
  logReviewDecision(review: KnowledgeReview): AuditEntry {
    return KnowledgeReviewRegistry.appendAudit({
      timestamp:      new Date().toISOString(),
      reviewId:       review.id,
      captureId:      review.captureId,
      reviewer:       review.reviewer,
      decision:       review.decision ?? "SYSTEM",
      reason:         review.reason,
      evidenceScore:  review.evidenceScore.score,
      confidence:     review.evidenceScore.confidence,
      duplicatesFound:review.duplicates.length,
      promotionRef:   null,
      rollbackRef:    null,
      metadata: {
        status:        review.status,
        approvalLevel: review.approvalLevel,
        targetCount:   review.evidenceScore.usageFrequency,
      },
    });
  },

  /**
   * Log a promotion event.
   */
  logPromotion(reviewId: string, captureId: string, promotionId: string, targets: string[]): AuditEntry {
    return KnowledgeReviewRegistry.appendAudit({
      timestamp:      new Date().toISOString(),
      reviewId,
      captureId,
      reviewer:       "SYSTEM",
      decision:       "APPROVE",
      reason:         `Promoted to [${targets.join(", ")}]`,
      evidenceScore:  0,
      confidence:     0,
      duplicatesFound:0,
      promotionRef:   promotionId,
      rollbackRef:    null,
      metadata:       { promotionId, targets: targets.join(",") },
    });
  },

  /**
   * Log a merge event.
   */
  logMerge(reviewId: string, captureId: string, mergeId: string, mergedCount: number): AuditEntry {
    return KnowledgeReviewRegistry.appendAudit({
      timestamp:      new Date().toISOString(),
      reviewId,
      captureId,
      reviewer:       "SYSTEM",
      decision:       "MERGE",
      reason:         `Merged with ${mergedCount} duplicate(s)`,
      evidenceScore:  0,
      confidence:     0,
      duplicatesFound:mergedCount,
      promotionRef:   null,
      rollbackRef:    mergeId,
      metadata:       { mergeId, mergedCount },
    });
  },

  /**
   * Get a readable timeline of audit events.
   */
  getTimeline(): Array<{ id: string; timestamp: string; event: string; reviewer: string; result: string }> {
    return KnowledgeReviewRegistry.getAllAudits().map(a => ({
      id:        a.id,
      timestamp: a.timestamp,
      event:     `${a.decision} · ${a.captureId}`,
      reviewer:  a.reviewer,
      result:    a.reason,
    })).reverse();
  },
});