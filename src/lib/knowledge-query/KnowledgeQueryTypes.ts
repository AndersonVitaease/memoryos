/**
 * KnowledgeQueryTypes.ts
 * All type contracts for the Knowledge Query Engine.
 *
 * SRP: Types only — no logic.
 * Sprint: INTEGRATION-02
 */

// ── Source kinds ───────────────────────────────────────────────────────────────

export type KnowledgeSource =
  | "LESSONS"       | "BEST_PRACTICES" | "KNOWN_ISSUES"
  | "ANTI_PATTERNS" | "JOURNAL"        | "GOVERNANCE"
  | "ALL";

export type KnowledgePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "ANY";

export type KnowledgeCategory =
  | "ARCHITECTURE" | "CONNECTOR"  | "RUNTIME"   | "SECURITY"
  | "GOVERNANCE"   | "TESTING"    | "DEVOPS"    | "GENERAL"
  | "ANY";

// ── Ranking ────────────────────────────────────────────────────────────────────

export interface RankingWeights {
  readonly evidence:    number;   // 0–1
  readonly confidence:  number;   // 0–1
  readonly recency:     number;   // 0–1
  readonly occurrences: number;   // 0–1
  readonly approvals:   number;   // 0–1
  readonly governance:  number;   // 0–1
}

export interface RankingProfile {
  readonly id:       string;
  readonly name:     string;
  readonly weights:  RankingWeights;
}

export interface RankingPolicy {
  readonly profileId:    string;
  readonly topN:         number;
  readonly minScore:     number;
  readonly tieBreaker:   "RECENCY" | "CONFIDENCE" | "EVIDENCE";
}

// ── Query ──────────────────────────────────────────────────────────────────────

export interface KnowledgeFilter {
  readonly sources?:       KnowledgeSource[];
  readonly category?:      KnowledgeCategory;
  readonly components?:    string[];
  readonly tags?:          string[];
  readonly sprint?:        string;
  readonly project?:       string;
  readonly domain?:        string;
  readonly priority?:      KnowledgePriority;
  readonly minEvidence?:   number;   // 0–100
  readonly minConfidence?: number;   // 0–1
  readonly limit?:         number;
}

export interface KnowledgeQuery {
  readonly id:        string;     // KQ-NNN
  readonly intent:    string;
  readonly filter:    KnowledgeFilter;
  readonly policy:    RankingPolicy;
  readonly createdAt: string;
}

export interface KnowledgeQueryRequest {
  readonly intent:    string;
  readonly filter?:   Partial<KnowledgeFilter>;
  readonly profileId?:string;     // ranking profile to use
  readonly limit?:    number;
}

// ── Execution plan ─────────────────────────────────────────────────────────────

export interface KnowledgeExecutionStep {
  readonly order:    number;
  readonly source:   KnowledgeSource;
  readonly reason:   string;
}

export interface KnowledgeExecutionPlan {
  readonly queryId: string;
  readonly steps:   KnowledgeExecutionStep[];
  readonly policy:  RankingPolicy;
}

// ── Result & Response ─────────────────────────────────────────────────────────

export interface KnowledgeResultItem {
  readonly id:            string;
  readonly source:        KnowledgeSource;
  readonly title:         string;
  readonly summary:       string;
  readonly category:      string;
  readonly components:    string[];
  readonly tags:          string[];
  readonly evidenceScore: number;
  readonly confidence:    number;
  readonly occurrences:   number;
  readonly priority:      string;
  readonly sprint:        string;
  readonly createdAt:     string;
  readonly score:         number;     // composite ranking score
}

export interface KnowledgeConflict {
  readonly winner:  KnowledgeResultItem;
  readonly loser:   KnowledgeResultItem;
  readonly reason:  string;
}

export interface KnowledgeExplanation {
  readonly queryId:     string;
  readonly intent:      string;
  readonly steps:       string[];
  readonly filtersUsed: string[];
  readonly profileUsed: string;
  readonly totalItems:  number;
  readonly keptItems:   number;
  readonly conflicts:   number;
}

export interface KnowledgeQueryResponse {
  readonly queryId:      string;
  readonly intent:       string;
  readonly results:      KnowledgeResultItem[];
  readonly discarded:    Array<{ item: KnowledgeResultItem; reason: string }>;
  readonly conflicts:    KnowledgeConflict[];
  readonly explanation:  KnowledgeExplanation;
  readonly cacheHit:     boolean;
  readonly durationMs:   number;
  readonly timestamp:    string;
}

// ── Metrics ────────────────────────────────────────────────────────────────────

export interface KnowledgeQueryMetrics {
  readonly totalQueries:      number;
  readonly avgDurationMs:     number;
  readonly cacheHitRate:      number;
  readonly totalKept:         number;
  readonly totalDiscarded:    number;
  readonly totalConflicts:    number;
  readonly topSources:        Array<{ source: string; count: number }>;
  readonly topCategories:     Array<{ category: string; count: number }>;
  readonly topComponents:     Array<{ component: string; count: number }>;
}

// ── Audit ──────────────────────────────────────────────────────────────────────

export interface KnowledgeAuditEntry {
  readonly id:           string;    // KQA-NNN
  readonly queryId:      string;
  readonly timestamp:    string;
  readonly intent:       string;
  readonly sources:      string[];
  readonly filtersUsed:  string[];
  readonly profileUsed:  string;
  readonly kept:         number;
  readonly discarded:    number;
  readonly conflicts:    number;
  readonly durationMs:   number;
  readonly cacheHit:     boolean;
}