// KnowledgeStoreTypes.ts — Sprint EF-38.0
// All DTOs and result objects for the Universal Knowledge Store

import type { MemoryType } from "@/lib/ingestion/KipTypes";
import type { KnowledgeEvidence } from "@/lib/ingestion/KnowledgeEvidence";

// ── Core DTOs ─────────────────────────────────────────────────────────────────

export interface KnowledgeRecord {
  readonly id:        string;
  readonly type:      MemoryType;
  readonly content:   string;
  readonly version:   number;
  readonly summary:   string;
  readonly tags:      readonly string[];
  readonly evidence:  KnowledgeEvidence;
  readonly status:    KnowledgeRecordStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type KnowledgeRecordStatus = "active" | "archived" | "deleted" | "pending";

export interface KnowledgeRecordDraft {
  type:     MemoryType;
  content:  string;
  summary?: string;
  tags?:    string[];
  evidence: KnowledgeEvidence;
}

export interface KnowledgeRecordPatch {
  content?:  string;
  summary?:  string;
  tags?:     string[];
  status?:   KnowledgeRecordStatus;
}

// ── Query / Search ────────────────────────────────────────────────────────────

export interface KnowledgeQuery {
  types?:            MemoryType[];
  tags?:             string[];
  status?:           KnowledgeRecordStatus[];
  sourceTypes?:      string[];
  conversationIds?:  string[];
  minConfidence?:    number;
  createdAfter?:     number;
  createdBefore?:    number;
  limit?:            number;
  offset?:           number;
}

export interface KnowledgeSearchQuery {
  text:           string;
  types?:         MemoryType[];
  minConfidence?: number;
  limit?:         number;
  semantic?:      boolean;  // future: enable vector search
}

// ── Result objects (all immutable) ───────────────────────────────────────────

export interface StoreResult {
  readonly ok:      boolean;
  readonly id:      string;
  readonly version: number;
  readonly record?: KnowledgeRecord;
  readonly error?:  string;
}

export interface GetResult {
  readonly ok:     boolean;
  readonly record?: KnowledgeRecord;
  readonly error?:  string;
}

export interface QueryResult {
  readonly ok:      boolean;
  readonly records: readonly KnowledgeRecord[];
  readonly total:   number;
  readonly hasMore: boolean;
  readonly error?:  string;
}

export interface SearchResult {
  readonly ok:      boolean;
  readonly records: readonly KnowledgeRecord[];
  readonly scores:  readonly number[];        // relevance score per record
  readonly total:   number;
  readonly error?:  string;
}

export interface ExistsResult {
  readonly ok:     boolean;
  readonly exists: boolean;
  readonly id?:    string;
  readonly error?: string;
}

export interface DeleteResult {
  readonly ok:      boolean;
  readonly deleted: boolean;
  readonly error?:  string;
}

export interface ArchiveResult {
  readonly ok:       boolean;
  readonly archived: boolean;
  readonly record?:  KnowledgeRecord;
  readonly error?:   string;
}

export interface RestoreResult {
  readonly ok:       boolean;
  readonly restored: boolean;
  readonly record?:  KnowledgeRecord;
  readonly error?:   string;
}

export interface StoreStats {
  readonly totalRecords:   number;
  readonly activeRecords:  number;
  readonly archivedRecords:number;
  readonly totalSources:   number;
  readonly oldestRecord?:  number;
  readonly newestRecord?:  number;
  readonly storageEngine:  string;
  readonly version:        string;
}

export interface HealthResult {
  readonly ok:          boolean;
  readonly status:      "healthy" | "degraded" | "unavailable";
  readonly latencyMs:   number;
  readonly storageEngine: string;
  readonly details?:    string;
}