/**
 * OperationalKnowledgeIndex.ts
 * Inverted index for fast lookup across the Operational Knowledge Base.
 *
 * Authority: ENGINEERING
 * SRP: Index construction and lookup only.
 */

import { OperationalKnowledgeRegistry } from "./OperationalKnowledgeRegistry";
import type { OKIndexEntry, OKDocumentCategory } from "./OperationalKnowledgeTypes";

function buildIndex(): Map<string, OKIndexEntry[]> {
  const index = new Map<string, OKIndexEntry[]>();

  for (const doc of OperationalKnowledgeRegistry.getAll()) {
    const entry: OKIndexEntry = {
      id:       doc.id,
      category: doc.category,
      keywords: doc.keywords,
      tags:     doc.tags,
      path:     doc.path,
    };

    const terms = [
      ...doc.keywords,
      ...doc.tags,
      ...doc.components,
      ...doc.sprints,
      doc.name,
      doc.category,
    ].map(t => t.toLowerCase().trim());

    for (const term of terms) {
      if (!index.has(term)) index.set(term, []);
      const existing = index.get(term)!;
      if (!existing.find(e => e.id === entry.id)) {
        existing.push(entry);
      }
    }
  }

  return index;
}

let _index: Map<string, OKIndexEntry[]> | null = null;

function getIndex(): Map<string, OKIndexEntry[]> {
  if (!_index) _index = buildIndex();
  return _index;
}

export const OperationalKnowledgeIndex = Object.freeze({
  /**
   * Look up all documents containing a specific term (exact or partial).
   */
  lookup(term: string): OKIndexEntry[] {
    const idx = getIndex();
    const q   = term.toLowerCase().trim();
    const results: OKIndexEntry[] = [];

    for (const [key, entries] of idx.entries()) {
      if (key === q || key.includes(q) || q.includes(key)) {
        for (const entry of entries) {
          if (!results.find(r => r.id === entry.id)) {
            results.push(entry);
          }
        }
      }
    }

    return results;
  },

  /**
   * All indexed terms (sorted).
   */
  allTerms(): string[] {
    return [...getIndex().keys()].sort();
  },

  /**
   * All documents in the index for a given category.
   */
  byCategory(category: OKDocumentCategory): OKIndexEntry[] {
    const seen = new Set<string>();
    const results: OKIndexEntry[] = [];

    for (const entries of getIndex().values()) {
      for (const entry of entries) {
        if (entry.category === category && !seen.has(entry.id)) {
          seen.add(entry.id);
          results.push(entry);
        }
      }
    }

    return results;
  },

  /**
   * Total number of indexed terms.
   */
  size(): number {
    return getIndex().size;
  },

  /**
   * Reset the index (used in testing to force rebuild).
   */
  reset(): void {
    _index = null;
  },
});