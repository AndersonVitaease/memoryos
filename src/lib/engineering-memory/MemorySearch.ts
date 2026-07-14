/**
 * MemorySearch.ts — Sprint 6.2.4
 * Searches all memory stores before any implementation begins.
 */
import type { AnyMemoryEntry, MemorySearchResult } from "./MEMTypes";
import type { MemoryIndexer } from "./MemoryIndexer";

export class MemorySearch {
  constructor(
    private readonly _indexer: MemoryIndexer,
    private readonly _allEntries: () => AnyMemoryEntry[],
  ) {}

  search(query: string, limit = 10): MemorySearchResult[] {
    const words   = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const scores  = new Map<string, number>();

    for (const word of words) {
      const hits = this._indexer.lookupKeyword(word);
      hits.forEach(h => scores.set(h.entryId, (scores.get(h.entryId) ?? 0) + 10));
    }

    const entries = this._allEntries();
    const results: MemorySearchResult[] = [];

    for (const [entryId, score] of scores) {
      const entry = entries.find(e => e.id === entryId);
      if (!entry) continue;
      results.push({ entry, score: Math.min(100, score), matchedOn: "keyword" });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  searchByComponent(component: string): MemorySearchResult[] {
    const hits    = this._indexer.lookupComponent(component);
    const entries = this._allEntries();
    return hits.map(h => {
      const entry = entries.find(e => e.id === h.entryId);
      return entry ? { entry, score: 80, matchedOn: "component" } : null;
    }).filter(Boolean) as MemorySearchResult[];
  }
}