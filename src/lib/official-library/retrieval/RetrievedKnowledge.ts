/**
 * RetrievedKnowledge.ts — Sprint EF-42
 *
 * Official contract for retrieval output.
 * Every object is deeply readonly — no mutation after construction.
 *
 * Consumed by: OfficialRetrievalEngine (output)
 * Future consumers: Planner (context injection), Prompt Composer (EF-43+)
 *
 * SRP: data contract only — no logic, no construction, no storage.
 */

import type { OfficialDocumentCategory } from "../index/OfficialDocumentMetadata";

// ── Chunk-level result ────────────────────────────────────────────────────────

export interface MatchedChunk {
  readonly chunkId:    string;
  readonly content:    string;
  readonly tags:       readonly string[];
  readonly score:      number;
  readonly matchReason: string;
}

// ── Relationship reference ────────────────────────────────────────────────────

export interface RetrievedRelationship {
  readonly targetId:    string;
  readonly targetTitle: string;
  readonly type:        string;
}

// ── Per-document result ───────────────────────────────────────────────────────

export interface RetrievedDocument {
  readonly documentId:    string;
  readonly title:         string;
  readonly version:       string;
  readonly category:      OfficialDocumentCategory;
  readonly relevanceScore: number;
  readonly matchedChunks: readonly MatchedChunk[];
  readonly relationships: readonly RetrievedRelationship[];
  readonly metadata: {
    readonly path:      string;
    readonly status:    string;
    readonly keywords:  readonly string[];
    readonly updatedAt: string;
  };
}

// ── Top-level retrieval result ────────────────────────────────────────────────

export interface RetrievedKnowledge {
  readonly query:            string;
  readonly normalizedQuery:  string;
  readonly documents:        readonly RetrievedDocument[];
  readonly totalDocuments:   number;
  readonly totalChunks:      number;
  readonly topScore:         number;
  readonly retrievedAt:      string;
  readonly durationMs:       number;
}

// ── Empty result factory ──────────────────────────────────────────────────────

export function emptyKnowledge(query: string, normalizedQuery: string, durationMs: number): RetrievedKnowledge {
  return Object.freeze({
    query,
    normalizedQuery,
    documents:      Object.freeze([]),
    totalDocuments: 0,
    totalChunks:    0,
    topScore:       0,
    retrievedAt:    new Date().toISOString(),
    durationMs,
  });
}