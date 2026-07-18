/**
 * KnowledgeReviewRegistry.ts
 * Central store for all review, promotion, merge, and audit records.
 *
 * Authority: ENGINEERING
 * SRP: Storage only — get/set reviews, promotions, merges, audits.
 * Sprint: KB-04
 *
 * Append-only. Nothing is deleted.
 */

import type {
  KnowledgeReview, PromotionRecord, MergeRecord, AuditEntry,
  ReviewStatus, ReviewDecision,
} from "./KnowledgeReviewTypes";

// ── Counters ──────────────────────────────────────────────────────────────────
const counters = { KRV: 0, KPR: 0, KMR: 0, KAU: 0 };
function nextId(prefix: keyof typeof counters): string {
  counters[prefix]++;
  return `${prefix}-${String(counters[prefix]).padStart(3, "0")}`;
}
function nowIso(): string { return new Date().toISOString().split("T")[0]; }

// ── Internal stores ───────────────────────────────────────────────────────────
const reviews:    Map<string, KnowledgeReview>  = new Map();
const promotions: Map<string, PromotionRecord>  = new Map();
const merges:     Map<string, MergeRecord>      = new Map();
const audits:     AuditEntry[]                  = [];

export const KnowledgeReviewRegistry = Object.freeze({

  // ── Reviews ────────────────────────────────────────────────────────────────

  createReview(partial: Omit<KnowledgeReview, "id" | "createdAt" | "updatedAt">): KnowledgeReview {
    const id  = nextId("KRV");
    const now = nowIso();
    const review: KnowledgeReview = { ...partial, id, createdAt: now, updatedAt: now };
    reviews.set(id, review);
    return review;
  },

  updateReview(id: string, patch: Partial<Pick<KnowledgeReview, "status" | "decision" | "reason" | "resolvedAt">>): KnowledgeReview | null {
    const existing = reviews.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: nowIso() };
    reviews.set(id, updated);
    return updated;
  },

  getReview(id: string): KnowledgeReview | undefined { return reviews.get(id); },
  getAllReviews(): KnowledgeReview[] { return [...reviews.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
  getReviewsByStatus(status: ReviewStatus): KnowledgeReview[] { return KnowledgeReviewRegistry.getAllReviews().filter(r => r.status === status); },
  getReviewByCaptureId(captureId: string): KnowledgeReview | undefined { return [...reviews.values()].find(r => r.captureId === captureId); },

  // ── Promotions ─────────────────────────────────────────────────────────────

  createPromotion(partial: Omit<PromotionRecord, "id">): PromotionRecord {
    const id = nextId("KPR");
    const promo = { ...partial, id };
    promotions.set(id, promo);
    return promo;
  },

  getPromotion(id: string): PromotionRecord | undefined { return promotions.get(id); },
  getAllPromotions(): PromotionRecord[] { return [...promotions.values()]; },
  getPromotionByReviewId(reviewId: string): PromotionRecord | undefined { return [...promotions.values()].find(p => p.reviewId === reviewId); },

  // ── Merges ─────────────────────────────────────────────────────────────────

  createMerge(partial: Omit<MergeRecord, "id">): MergeRecord {
    const id    = nextId("KMR");
    const merge = { ...partial, id };
    merges.set(id, merge);
    return merge;
  },

  getMerge(id: string): MergeRecord | undefined { return merges.get(id); },
  getAllMerges(): MergeRecord[] { return [...merges.values()]; },

  // ── Audits ─────────────────────────────────────────────────────────────────

  appendAudit(partial: Omit<AuditEntry, "id">): AuditEntry {
    const id    = nextId("KAU");
    const entry = { ...partial, id };
    audits.push(entry);
    return entry;
  },

  getAllAudits(): AuditEntry[] { return [...audits]; },
  getAuditsByReview(reviewId: string): AuditEntry[] { return audits.filter(a => a.reviewId === reviewId); },

  // ── Reset (testing only) ──────────────────────────────────────────────────
  reset(): void {
    reviews.clear(); promotions.clear(); merges.clear(); audits.length = 0;
    counters.KRV = 0; counters.KPR = 0; counters.KMR = 0; counters.KAU = 0;
  },
});