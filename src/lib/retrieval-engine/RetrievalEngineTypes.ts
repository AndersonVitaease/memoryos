// Retrieval Engine v1.0 -- Types
// Foundation v1.0 · Engineering First · Sprint EF-13

import type { MemoryType, MemoryImportance, MemoryConfidence } from "@/lib/memory-engine-v1/MemoryEngineTypes";

export type RetrievalType       = MemoryType;
export type RetrievalImportance = MemoryImportance;
export type RetrievalConfidence = MemoryConfidence;

export type RetrievalStrategy = "EXACT" | "FUZZY" | "SEMANTIC" | "COMPOSITE";
export type RetrievalStatus   = "HIT" | "MISS" | "PARTIAL";
export type SortOrder         = "SCORE_DESC" | "SCORE_ASC" | "RECENCY_DESC" | "IMPORTANCE_DESC";

// ── Query ──────────────────────────────────────────────────────────────────────

export interface RetrievalQuery {
  queryId:    string;
  goalId?:    string;
  keywords?:  string[];
  types?:     RetrievalType[];
  minScore?:  number;
  minImportance?: RetrievalImportance;
  minConfidence?: RetrievalConfidence;
  limit?:     number;
  sortBy?:    SortOrder;
  strategy?:  RetrievalStrategy;
  createdAt:  number;
}

// ── Result ─────────────────────────────────────────────────────────────────────

export interface RetrievalHit {
  memoryId:    string;
  goalId:      string;
  memoryType:  RetrievalType;
  importance:  RetrievalImportance;
  confidence:  RetrievalConfidence;
  memoryScore: number;
  relevanceScore: number;
  title:       string;
  summary:     string;
  insights:    ReadonlyArray<string>;
  patterns:    ReadonlyArray<string>;
  recommendations: ReadonlyArray<string>;
  matchedKeywords: ReadonlyArray<string>;
  retrievedAt: number;
}

export interface RetrievalResult {
  retrievalId: string;
  queryId:     string;
  status:      RetrievalStatus;
  hits:        ReadonlyArray<Readonly<RetrievalHit>>;
  totalFound:  number;
  totalReturned: number;
  strategy:    RetrievalStrategy;
  durationMs:  number;
  createdAt:   number;
}

// ── Log / Metrics / Statistics / Health ───────────────────────────────────────

export interface RetrievalLog {
  executionId:  string;
  retrievalId:  string;
  queryId:      string;
  operation:    string;
  status:       "SUCCESS" | "FAILED";
  hitsReturned: number;
  timestamp:    number;
  duration:     number;
  error?:       string;
}

export interface RetrievalMetrics {
  queryTotal:      number;
  hitTotal:        number;
  missTotal:       number;
  partialTotal:    number;
  avgDurationMs:   number;
  avgHitsPerQuery: number;
}

export interface RetrievalStatistics {
  totalQueries:       number;
  totalHits:          number;
  totalMisses:        number;
  totalPartial:       number;
  hitRate:            number;
  avgRelevanceScore:  number;
  avgHitsPerQuery:    number;
  queryByStrategy:    Readonly<Record<RetrievalStrategy, number>>;
  queryByType:        Readonly<Record<RetrievalType, number>>;
}

export interface RetrievalHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    indexIntegrity:    boolean;
    queryIntegrity:    boolean;
    resultIntegrity:   boolean;
    consistencyCheck:  boolean;
  };
  details: string;
}

// ── Threshold ──────────────────────────────────────────────────────────────────

export const RETRIEVAL_MIN_SCORE    = 55;
export const RETRIEVAL_DEFAULT_LIMIT = 10;
export const RETRIEVAL_MAX_LIMIT     = 100;

export const IMPORTANCE_RANK: Record<RetrievalImportance, number> = Object.freeze({
  CRITICAL: 4,
  HIGH:     3,
  MEDIUM:   2,
  LOW:      1,
});