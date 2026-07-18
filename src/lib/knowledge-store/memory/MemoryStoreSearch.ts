// MemoryStoreSearch.ts — Sprint EF-39.1 (hardened)
// EF-39.1: all field accesses now use ?? "" guards — search never throws on undefined/null fields.

import type { KnowledgeRecord, KnowledgeSearchQuery, SearchResult } from "../KnowledgeStoreTypes";

function scoreRecord(record: KnowledgeRecord, lower: string): number {
  let score = 0;
  // EF-39.1: guard every field with ?? "" to prevent exceptions on optional/undefined values
  if ((record.content ?? "").toLowerCase().includes(lower))  score += 3;
  if ((record.summary ?? "").toLowerCase().includes(lower))  score += 2;
  if ((record.tags ?? []).some(t => (t ?? "").toLowerCase().includes(lower))) score += 1;
  return score;
}

export const MemoryStoreSearch = {
  execute(records: KnowledgeRecord[], q: KnowledgeSearchQuery): SearchResult {
    const lower = (q.text ?? "").toLowerCase().trim();

    let candidates = records.filter(r => r.status === "active");

    if (q.types && q.types.length > 0) {
      const types = new Set(q.types);
      candidates = candidates.filter(r => types.has(r.type));
    }
    if (q.minConfidence !== undefined) {
      candidates = candidates.filter(r => r.evidence.confidence >= q.minConfidence!);
    }

    const scored: Array<{ record: KnowledgeRecord; score: number }> = [];
    for (const r of candidates) {
      const s = scoreRecord(r, lower);
      if (s > 0) scored.push({ record: r, score: s });
    }

    // Deterministic sort: score desc, then id asc for tie-breaking
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));

    const limit   = q.limit ?? 20;
    const limited = scored.slice(0, limit);

    return Object.freeze({
      ok:      true,
      records: Object.freeze(limited.map(x => x.record)),
      scores:  Object.freeze(limited.map(x => Math.min(1, x.score / 3))),
      total:   scored.length,
    });
  },
};