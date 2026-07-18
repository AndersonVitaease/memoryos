/**
 * EvidenceIndex.ts
 * Inverted index for fast evidence lookups — no external dependencies.
 *
 * Authority: ENGINEERING
 * SRP: Index construction and lookup only.
 * Sprint: KB-02
 */

import { EvidenceRegistry } from "./EvidenceRegistry";
import type { EvidenceIndexEntry } from "./EvidenceTypes";

type TermMap = Map<string, EvidenceIndexEntry[]>;

function buildTermMap(): TermMap {
  const map: TermMap = new Map();

  const add = (term: string, entry: EvidenceIndexEntry) => {
    const key = term.toLowerCase().trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const arr = map.get(key)!;
    if (!arr.find(e => e.id === entry.id)) arr.push(entry);
  };

  for (const e of EvidenceRegistry.getAll()) {
    const entry: EvidenceIndexEntry = {
      id:       e.id,
      type:     e.type,
      category: e.category,
      severity: e.severity,
      status:   e.status,
      sprint:   e.sprint,
      title:    e.title,
      keywords: e.keywords,
      tags:     e.tags,
    };

    const terms = [
      e.id, e.title, e.category, e.severity, e.status, e.sprint, e.type,
      ...e.keywords,
      ...e.tags,
      ...(e.components     ?? []),
      ...(e.filesChanged   ?? []),
      ...(e.links.adrs     ?? []),
      ...(e.links.rfcs     ?? []),
      ...(e.links.officialDocs ?? []),
      ...(e.links.components   ?? []),
    ];

    for (const term of terms) add(term, entry);

    // Tokenize title and problem for partial-match indexing
    const textTerms = [e.title, e.problem, e.description ?? ""]
      .join(" ")
      .toLowerCase()
      .split(/[\s,._\-/]+/)
      .filter(t => t.length > 3);

    for (const term of textTerms) add(term, entry);
  }

  return map;
}

let _termMap: TermMap | null = null;

function getTermMap(): TermMap {
  if (!_termMap) _termMap = buildTermMap();
  return _termMap;
}

export const EvidenceIndex = Object.freeze({
  /**
   * Look up evidence index entries containing a term (exact or partial).
   */
  lookup(term: string): EvidenceIndexEntry[] {
    const map = getTermMap();
    const q   = term.toLowerCase().trim();
    const out: EvidenceIndexEntry[] = [];
    const seen = new Set<string>();

    for (const [key, entries] of map.entries()) {
      if (key === q || key.includes(q) || q.includes(key)) {
        for (const e of entries) {
          if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
        }
      }
    }

    return out;
  },

  /**
   * All indexed terms (sorted).
   */
  allTerms(): string[] {
    return [...getTermMap().keys()].sort();
  },

  /**
   * Total term count in the index.
   */
  size(): number {
    return getTermMap().size;
  },

  /**
   * Force rebuild of the index (for testing).
   */
  reset(): void {
    _termMap = null;
  },

  /**
   * Get a summary of the index.
   */
  summary(): { termCount: number; evidenceCount: number } {
    return {
      termCount:     getTermMap().size,
      evidenceCount: EvidenceRegistry.getAll().length,
    };
  },
});