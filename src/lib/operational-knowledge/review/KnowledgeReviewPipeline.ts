/**
 * KnowledgeReviewPipeline.ts
 * Orchestrates the complete Review & Governance pipeline.
 *
 * Authority: ENGINEERING
 * SRP: Pipeline orchestration only — delegates to each engine.
 * Sprint: KB-04
 *
 * Pipeline (deterministic):
 *   Capture → Duplicate Detection → Evidence Score → Review → Promotion → Audit → Metrics
 */

import { KnowledgeReviewEngine }    from "./KnowledgeReviewEngine";
import { KnowledgePromotionEngine } from "./KnowledgePromotionEngine";
import { KnowledgeMergeEngine }     from "./KnowledgeMergeEngine";
import { KnowledgeAuditEngine }     from "./KnowledgeAuditEngine";
import { KnowledgeMetricsEngine }   from "./KnowledgeMetricsEngine";
import type { KnowledgeReview, PromotionRecord, MergeRecord, AuditEntry, ReviewStatistics } from "./KnowledgeReviewTypes";

export interface ReviewPipelineResult {
  readonly review:      KnowledgeReview;
  readonly promotion:   PromotionRecord | null;
  readonly merge:       MergeRecord     | null;
  readonly auditEntry:  AuditEntry;
  readonly durationMs:  number;
  readonly success:     boolean;
  readonly errors:      string[];
}

export const KnowledgeReviewPipeline = Object.freeze({

  /**
   * Run the full review pipeline for a single capture.
   */
  run(captureId: string): ReviewPipelineResult {
    const start  = Date.now();
    const errors: string[] = [];

    // 1. Review (includes duplicate detection + evidence score internally)
    const review = KnowledgeReviewEngine.review(captureId);
    if (!review) {
      const stub = { id: "KRV-000", captureId, title: "", status: "REJECTED" as any, decision: "REJECT" as any,
        approvalLevel: "FINAL" as any, reviewer: "SYSTEM", evidenceScore: { captureId, occurrences: 0,
        successfulFixes: 0, regressionCount: 0, approvalCount: 0, confidence: 0, recency: 0,
        usageFrequency: 0, score: 0 }, duplicates: [], reason: `Capture ${captureId} not found`,
        createdAt: "", updatedAt: "", resolvedAt: "" };
      return { review: stub, promotion: null, merge: null,
        auditEntry: KnowledgeAuditEngine.logReviewDecision(stub),
        durationMs: Date.now() - start, success: false, errors: [`Capture ${captureId} not found`] };
    }

    // 2. Audit the review decision
    const auditEntry = KnowledgeAuditEngine.logReviewDecision(review);

    // 3. Promote if approved
    let promotion: PromotionRecord | null = null;
    if (review.status === "APPROVED") {
      promotion = KnowledgePromotionEngine.promote(review.id);
      if (promotion) {
        KnowledgeAuditEngine.logPromotion(review.id, captureId, promotion.id, promotion.targets);
      }
    }

    // 4. Merge if duplicates found
    let merge: MergeRecord | null = null;
    if (review.status === "DUPLICATE" && review.duplicates.length > 0) {
      const mergedIds = review.duplicates.map(d => d.duplicateId);
      merge = KnowledgeMergeEngine._merge(captureId, mergedIds, review.reason);
      if (merge) {
        KnowledgeAuditEngine.logMerge(review.id, captureId, merge.id, mergedIds.length);
      }
    }

    return {
      review,
      promotion,
      merge,
      auditEntry,
      durationMs: Date.now() - start,
      success:    errors.length === 0,
      errors,
    };
  },

  /**
   * Run the pipeline for multiple captures in batch.
   */
  runBatch(captureIds: string[]): ReviewPipelineResult[] {
    return captureIds.map(id => KnowledgeReviewPipeline.run(id));
  },

  /**
   * Get current governance metrics.
   */
  getMetrics(): ReviewStatistics {
    return KnowledgeMetricsEngine.generate();
  },
});