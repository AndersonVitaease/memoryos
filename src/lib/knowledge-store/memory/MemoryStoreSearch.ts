// MemoryStoreSearch.ts — Sprint EF-39
// Case-insensitive full-text search over content, summary, and tags.
// Future semantic search compatible via score field.

import type { KnowledgeRecord, KnowledgeSearchQuery, SearchResult } from "../KnowledgeStoreTypes";

function scoreRecord(record: KnowledgeRecord, lower: string): number {
  let score = 0;
  // Content match (highest weight)
  if (record.content.toLowerCase().includes(lower))  score += 3;
  // Summary match
  if (record.summary.toLowerCase().includes(lower))  score += 2;
  // Tag match
  if (record.tags.some(t => t.toLowerCase().includes(lower))) score += 1;
  return score;
}

export const MemoryStoreSearch = {
  execute(records: KnowledgeRecord[], q: KnowledgeSearchQuery): SearchResult {
    const lower = q.text.toLowerCase().trim();

    // Filter to active records only (unless overridden in future)
    let candidates = records.filter(r => r.status === "active");

    if (q.types && q.types.length > 0) {
      const types = new Set(q.types);
      candidates = candidates.filter(r => types.has(r.type));
    }
    if (q.minConfidence !== undefined) {
      candidates = candidates.filter(r => r.evidence.confidence >= q.minConfidence!);
    }

    // Score and filter
    const scored: Array<{ record: KnowledgeRecord; score: number }> = [];
    for (const r of candidates) {
      const s = scoreRecord(r, lower);
      if (s > 0) scored.push({ record: r, score: s });
    }

    // Sort by score descending, then id for determinism
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));

    const limit   = q.limit ?? 20;
    const limited = scored.slice(0, limit);

    return Object.freeze({
      ok:      true,
      records: Object.freeze(limited.map(x => x.record)),
      scores:  Object.freeze(limited.map(x => x.score / 3)), // normalize to 0–1
      total:   scored.length,
    });
  },
};