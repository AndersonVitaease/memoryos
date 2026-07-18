/**
 * KnowledgeReviewTypes.ts
 * Type contracts for the Knowledge Review & Governance Engine.
 *
 * Authority: ENGINEERING
 * SRP: Types only — no logic.
 * Sprint: KB-04
 */

// ── Status ─────────────────────────────────────────────────────────────────────

export type ReviewStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "DUPLICATE"
  | "MERGED"
  | "ARCHIVED";

// ── Approval Level ────────────────────────────────────────────────────────────

export type ApprovalLevel = "AUTO" | "ENGINEERING" | "SPECIALIST" | "FINAL";

// ── Decision ──────────────────────────────────────────────────────────────────

export type ReviewDecision =
  | "APPROVE"
  | "REJECT"
  | "MERGE"
  | "REQUEST_REVIEW"
  | "ARCHIVE";

// ── Evidence Score ─────────────────────────────────────────────────────────────

export interface EvidenceScore {
  readonly captureId:       string;
  readonly occurrences:     number;
  readonly successfulFixes: number;
  readonly regressionCount: number;
  readonly approvalCount:   number;
  readonly confidence:      number;   // 0–1
  readonly recency:         number;   // days since capture (lower = more recent)
  readonly usageFrequency:  number;   // 0–1
  readonly score:           number;   // 0–100 composite
}

// ── Duplicate Match ────────────────────────────────────────────────────────────

export interface DuplicateMatch {
  readonly originalId:       string;
  readonly duplicateId:      string;
  readonly titleSimilarity:  number;
  readonly keywordOverlap:   number;
  readonly componentOverlap: number;
  readonly fileSimilarity:   number;
  readonly rootCauseSimilarity: number;
  readonly solutionSimilarity:  number;
  readonly overallScore:     number;   // 0–1
  readonly mergeRecommended: boolean;
}

// ── Knowledge Review ──────────────────────────────────────────────────────────

export interface KnowledgeReview {
  readonly id:             string;    // KRV-NNN
  readonly captureId:      string;
  readonly title:          string;
  readonly status:         ReviewStatus;
  readonly decision:       ReviewDecision | null;
  readonly approvalLevel:  ApprovalLevel;
  readonly reviewer:       string;
  readonly evidenceScore:  EvidenceScore;
  readonly duplicates:     DuplicateMatch[];
  readonly reason:         string;
  readonly createdAt:      string;
  readonly updatedAt:      string;
  readonly resolvedAt:     string | null;
}

// ── Promotion Record ──────────────────────────────────────────────────────────

export type PromotionTarget =
  | "LESSONS_LEARNED"
  | "BEST_PRACTICES"
  | "KNOWN_ISSUES"
  | "ANTI_PATTERNS"
  | "TROUBLESHOOTING_GUIDE"
  | "ENGINEERING_JOURNAL";

export interface PromotionRecord {
  readonly id:             string;    // KPR-NNN
  readonly reviewId:       string;
  readonly captureId:      string;
  readonly targets:        PromotionTarget[];
  readonly generatedIds:   string[];
  readonly promotedAt:     string;
  readonly promotedBy:     string;
  readonly rollbackRef:    string;    // reference to undo if needed
  readonly summary:        string;
}

// ── Merge Record ──────────────────────────────────────────────────────────────

export interface MergeRecord {
  readonly id:              string;   // KMR-NNN
  readonly primaryId:       string;
  readonly mergedIds:       string[];
  readonly mergedKeywords:  string[];
  readonly mergedComponents:string[];
  readonly mergedFiles:     string[];
  readonly mergedReferences:string[];
  readonly historyRefs:     string[]; // original capture IDs preserved
  readonly mergedAt:        string;
  readonly mergedBy:        string;
  readonly reason:          string;
}

// ── Audit Entry ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  readonly id:            string;     // KAU-NNN
  readonly timestamp:     string;
  readonly reviewId:      string;
  readonly captureId:     string;
  readonly reviewer:      string;
  readonly decision:      ReviewDecision | "SYSTEM";
  readonly reason:        string;
  readonly evidenceScore: number;
  readonly confidence:    number;
  readonly duplicatesFound: number;
  readonly promotionRef:  string | null;
  readonly rollbackRef:   string | null;
  readonly metadata:      Record<string, string | number | boolean>;
}

// ── Review Statistics ─────────────────────────────────────────────────────────

export interface ReviewStatistics {
  readonly totalCaptures:       number;
  readonly approved:            number;
  readonly rejected:            number;
  readonly duplicated:          number;
  readonly merged:              number;
  readonly pending:             number;
  readonly avgReviewTimeMs:     number;
  readonly avgEvidenceScore:    number;
  readonly avgConfidence:       number;
  readonly approvalRate:        number;   // 0–1
  readonly duplicateRate:       number;   // 0–1
  readonly mergeRate:           number;   // 0–1
  readonly promotionRate:       number;   // 0–1
  readonly topComponents:       Array<{ component: string; count: number }>;
  readonly topCategories:       Array<{ category: string;  count: number }>;
  readonly topProblems:         string[];
  readonly topSolutions:        string[];
  readonly knowledgeGrowthByDay:Array<{ date: string; count: number }>;
}