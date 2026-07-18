/**
 * KnowledgeReviewEngine.ts
 * Evaluates captured knowledge and produces a review record.
 *
 * Authority: ENGINEERING
 * SRP: Review evaluation only — delegates duplicate detection and scoring.
 * Sprint: KB-04
 *
 * Flow: Capture → Duplicate Detection → Evidence Score → Validation → Decision
 */

import { KnowledgeReviewRegistry }    from "./KnowledgeReviewRegistry";
import { KnowledgeDuplicateDetector } from "./KnowledgeDuplicateDetector";
import { KnowledgeEvidenceEngine }    from "./KnowledgeEvidenceEngine";
import { KCECaptureStore }            from "../capture/KCECaptureStore";
import type { KnowledgeReview, ReviewDecision, ApprovalLevel } from "./KnowledgeReviewTypes";
import type { KCECapture } from "../capture/KCETypes";

function decideAction(evidenceScore: number, duplicateCount: number, capture: KCECapture): ReviewDecision {
  if (duplicateCount > 0) return "MERGE";
  if (evidenceScore >= 70) return "APPROVE";
  if (evidenceScore >= 40) return "APPROVE";
  if (evidenceScore >= 20) return "REQUEST_REVIEW";
  return "REJECT";
}

export const KnowledgeReviewEngine = Object.freeze({

  /**
   * Evaluate a single capture and produce a KnowledgeReview.
   */
  review(captureId: string): KnowledgeReview | null {
    const capture = KCECaptureStore.getById(captureId);
    if (!capture) return null;

    // Check if already reviewed
    const existing = KnowledgeReviewRegistry.getReviewByCaptureId(captureId);
    if (existing) return existing;

    // 1. Duplicate detection against all other captures
    const pool      = KCECaptureStore.getAll().filter(c => c.id !== captureId);
    const duplicates = KnowledgeDuplicateDetector.findDuplicates(capture, pool);

    // 2. Evidence score
    const evidenceScore = KnowledgeEvidenceEngine.calculate(capture);

    // 3. Approval level
    const approvalLevel = KnowledgeEvidenceEngine.approvalLevel(evidenceScore.score);

    // 4. Decision
    const decision = decideAction(evidenceScore.score, duplicates.length, capture);

    // 5. Status
    const status = decision === "APPROVE"   ? "APPROVED"
                 : decision === "MERGE"     ? "DUPLICATE"
                 : decision === "REJECT"    ? "REJECTED"
                 : "UNDER_REVIEW";

    const reason =
      decision === "APPROVE"        ? `Auto-approved: evidence score ${evidenceScore.score}/100`
      : decision === "MERGE"        ? `${duplicates.length} duplicate(s) detected (max similarity ${Math.round((duplicates[0]?.overallScore ?? 0) * 100)}%)`
      : decision === "REJECT"       ? `Low evidence score (${evidenceScore.score}/100) — insufficient detail`
      : `Score ${evidenceScore.score}/100 — manual review required`;

    return KnowledgeReviewRegistry.createReview({
      captureId,
      title:        capture.raw.title,
      status,
      decision,
      approvalLevel,
      reviewer:     approvalLevel === "AUTO" ? "SYSTEM" : "ENGINEERING",
      evidenceScore,
      duplicates,
      reason,
      resolvedAt:   status === "UNDER_REVIEW" ? null : new Date().toISOString().split("T")[0],
    });
  },

  /**
   * Manually override a review decision.
   */
  override(reviewId: string, decision: ReviewDecision, reason: string, reviewer = "Engineering"): KnowledgeReview | null {
    const status = decision === "APPROVE" ? "APPROVED"
                 : decision === "MERGE"   ? "MERGED"
                 : decision === "REJECT"  ? "REJECTED"
                 : decision === "ARCHIVE" ? "ARCHIVED"
                 : "UNDER_REVIEW";

    return KnowledgeReviewRegistry.updateReview(reviewId, {
      status,
      decision,
      reason,
      resolvedAt: new Date().toISOString().split("T")[0],
    });
  },
});