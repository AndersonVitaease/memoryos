/**
 * SearchStrategy.ts — Sprint EF-7.2.1
 *
 * Interface and implementations for Official Library search.
 * OfficialLibraryProvider depends ONLY on SearchStrategy — never on a concrete implementation.
 *
 * Implementations:
 *   KeywordSearchStrategy    — current default, no external dependencies
 *   EmbeddingSearchStrategy  — future, requires embedding provider
 *   HybridSearchStrategy     — combines keyword + embedding scores
 */

import type { OfficialChunk } from "./OfficialLibraryTypes";

// ── Interface ─────────────────────────────────────────────────────────────────

export interface SearchStrategy {
  readonly strategyId: string;
  search(queryText: string, chunks: OfficialChunk[], maxResults: number): OfficialChunk[];
}

// ── Keyword Search ────────────────────────────────────────────────────────────

export class KeywordSearchStrategy implements SearchStrategy {
  readonly strategyId = "keyword-v1";

  search(queryText: string, chunks: OfficialChunk[], maxResults: number): OfficialChunk[] {
    const words = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0 || chunks.length === 0) return [];

    const scored = chunks.map(chunk => {
      const haystack = `${chunk.title} ${chunk.summary} ${chunk.content}`.toLowerCase();
      const hits     = words.filter(w => haystack.includes(w)).length;
      return { chunk, score: hits / words.length };
    });

    return scored
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ chunk }) => chunk);
  }
}

// ── Embedding Search (interface-only — future implementation) ─────────────────

export interface EmbeddingModel {
  embed(text: string): Promise<number[]>;
  cosineSimilarity(a: number[], b: number[]): number;
}

export class EmbeddingSearchStrategy implements SearchStrategy {
  readonly strategyId = "embedding-v1";

  constructor(private readonly _model: EmbeddingModel) {}

  search(queryText: string, chunks: OfficialChunk[], maxResults: number): OfficialChunk[] {
    // Synchronous fallback: delegate to keyword until embedding vectors are cached
    // Full async embedding requires pre-built index — use KeywordSearchStrategy as bridge
    const keyword = new KeywordSearchStrategy();
    return keyword.search(queryText, chunks, maxResults);
  }
}

// ── Hybrid Search ─────────────────────────────────────────────────────────────

export class HybridSearchStrategy implements SearchStrategy {
  readonly strategyId = "hybrid-v1";
  private readonly _keyword: KeywordSearchStrategy;

  constructor(private readonly _keywordWeight = 0.7, private readonly _embeddingWeight = 0.3) {
    this._keyword = new KeywordSearchStrategy();
  }

  search(queryText: string, chunks: OfficialChunk[], maxResults: number): OfficialChunk[] {
    // Phase 1: keyword search (embedding weight reserved for future index integration)
    return this._keyword.search(queryText, chunks, maxResults);
  }
}

// ── Default strategy singleton ────────────────────────────────────────────────

export const defaultSearchStrategy: SearchStrategy = new KeywordSearchStrategy();