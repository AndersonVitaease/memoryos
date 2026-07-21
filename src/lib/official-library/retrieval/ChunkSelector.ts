/**
 * ChunkSelector.ts — Sprint EF-42
 *
 * Selects only the relevant chunks from a document — never returns full docs.
 *
 * Selection criteria (applied in order, any match qualifies):
 *   1. Keyword/tag overlap with query tokens
 *   2. Content text match
 *   3. Category match (if query tokens match category name)
 *
 * SRP: chunk selection only. Never scores documents, never queries Index.
 *
 * What this does NOT do:
 *   - Re-rank across documents
 *   - Embed or vectorize
 *   - Return document-level metadata
 */

import type { OfficialChunk }    from "../OfficialLibraryTypes";
import type { MatchedChunk }     from "./RetrievedKnowledge";
import { scoreAgainstKeywords, scoreAgainstText, tokenize } from "./KeywordMatcher";

// ── Config ────────────────────────────────────────────────────────────────────

const MIN_CHUNK_SCORE = 0.15; // chunks below this are discarded
const MAX_CHUNKS_PER_DOC = 8; // cap to avoid overwhelming the Planner

// ── Selection weights per criterion ──────────────────────────────────────────

const TAG_WEIGHT     = 0.5;
const CONTENT_WEIGHT = 0.4;
const INDEX_WEIGHT   = 0.1; // proximity bonus for earlier chunks

// ── Public API ────────────────────────────────────────────────────────────────

export interface ChunkSelectionResult {
  readonly chunks:       readonly MatchedChunk[];
  readonly totalScanned: number;
  readonly selectedCount: number;
}

/**
 * Select relevant chunks from a document's chunk list.
 * @param query      Original user query
 * @param chunks     All chunks for a given documentId
 */
export function selectChunks(query: string, chunks: OfficialChunk[]): ChunkSelectionResult {
  const queryTokens = tokenize(query);
  if (chunks.length === 0 || queryTokens.length === 0) {
    return Object.freeze({ chunks: Object.freeze([]), totalScanned: chunks.length, selectedCount: 0 });
  }

  const scored: Array<{ chunk: OfficialChunk; score: number; reason: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const tags  = chunk.tags ?? [];

    const tagResult     = scoreAgainstKeywords(query, tags);
    const contentResult = scoreAgainstText(query, chunk.content);
    const indexBonus    = Math.max(0, 1 - i / chunks.length); // earlier chunks slight bonus

    const score =
      tagResult.score     * TAG_WEIGHT +
      contentResult.score * CONTENT_WEIGHT +
      indexBonus          * INDEX_WEIGHT;

    if (score >= MIN_CHUNK_SCORE) {
      const reasons: string[] = [];
      if (tagResult.matchedTokens.length > 0)     reasons.push(`tags: ${tagResult.matchedAgainst.join(", ")}`);
      if (contentResult.matchedTokens.length > 0) reasons.push(`content: ${contentResult.matchedTokens.join(", ")}`);
      scored.push({ chunk, score, reason: reasons.join(" | ") || "proximity" });
    }
  }

  // Sort by score descending, cap at MAX_CHUNKS_PER_DOC
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, MAX_CHUNKS_PER_DOC);

  const matchedChunks: MatchedChunk[] = selected.map(({ chunk, score, reason }) =>
    Object.freeze({
      chunkId:     chunk.id,
      content:     chunk.content,
      tags:        Object.freeze([...(chunk.tags ?? [])]),
      score:       Math.round(score * 1000) / 1000,
      matchReason: reason,
    })
  );

  return Object.freeze({
    chunks:         Object.freeze(matchedChunks),
    totalScanned:   chunks.length,
    selectedCount:  matchedChunks.length,
  });
}