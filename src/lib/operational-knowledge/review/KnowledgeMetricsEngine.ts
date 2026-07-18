/**
 * KnowledgeMetricsEngine.ts
 * Generates governance metrics for the Review & Promotion pipeline.
 *
 * Authority: ENGINEERING
 * SRP: Metrics generation only — read-only aggregation.
 * Sprint: KB-04
 */

import { KnowledgeReviewRegistry } from "./KnowledgeReviewRegistry";
import type { ReviewStatistics }   from "./KnowledgeReviewTypes";

export const KnowledgeMetricsEngine = Object.freeze({

  generate(): ReviewStatistics {
    const reviews   = KnowledgeReviewRegistry.getAllReviews();
    const promotions = KnowledgeReviewRegistry.getAllPromotions();
    const merges    = KnowledgeReviewRegistry.getAllMerges();
    const total     = reviews.length;

    if (total === 0) {
      return {
        totalCaptures: 0, approved: 0, rejected: 0, duplicated: 0, merged: 0,
        pending: 0, avgReviewTimeMs: 0, avgEvidenceScore: 0, avgConfidence: 0,
        approvalRate: 0, duplicateRate: 0, mergeRate: 0, promotionRate: 0,
        topComponents: [], topCategories: [], topProblems: [], topSolutions: [],
        knowledgeGrowthByDay: [],
      };
    }

    const approved   = reviews.filter(r => r.status === "APPROVED").length;
    const rejected   = reviews.filter(r => r.status === "REJECTED").length;
    const duplicated = reviews.filter(r => r.status === "DUPLICATE").length;
    const merged     = reviews.filter(r => r.status === "MERGED").length;
    const pending    = reviews.filter(r => r.status === "PENDING" || r.status === "UNDER_REVIEW").length;

    const avgEvidenceScore = reviews.reduce((s, r) => s + r.evidenceScore.score, 0) / total;
    const avgConfidence    = reviews.reduce((s, r) => s + r.evidenceScore.confidence, 0) / total;

    // Component frequency
    const compCount: Record<string, number> = {};
    for (const r of reviews) {
      for (const c of (r.evidenceScore as any).components ?? []) {
        compCount[c] = (compCount[c] ?? 0) + 1;
      }
    }
    const topComponents = Object.entries(compCount)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([component, count]) => ({ component, count }));

    // Growth by day
    const dayCount: Record<string, number> = {};
    for (const r of reviews) {
      const d = r.createdAt.split("T")[0];
      dayCount[d] = (dayCount[d] ?? 0) + 1;
    }
    const knowledgeGrowthByDay = Object.entries(dayCount)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      totalCaptures:    total,
      approved,
      rejected,
      duplicated,
      merged,
      pending,
      avgReviewTimeMs:  0,  // no timestamps yet for duration
      avgEvidenceScore: Math.round(avgEvidenceScore),
      avgConfidence:    Math.round(avgConfidence * 100) / 100,
      approvalRate:     total > 0 ? Math.round((approved / total) * 100) / 100 : 0,
      duplicateRate:    total > 0 ? Math.round((duplicated / total) * 100) / 100 : 0,
      mergeRate:        total > 0 ? Math.round((merged / total) * 100) / 100 : 0,
      promotionRate:    total > 0 ? Math.round((promotions.length / total) * 100) / 100 : 0,
      topComponents,
      topCategories:    [],
      topProblems:      reviews.slice(0, 3).map(r => r.title),
      topSolutions:     promotions.slice(0, 3).map(p => p.summary),
      knowledgeGrowthByDay,
    };
  },
});