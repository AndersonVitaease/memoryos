/**
 * EvidenceSearch.ts
 * Semantic search over evidence records.
 *
 * Authority: ENGINEERING
 * SRP: Search only — no registry mutation, no validation.
 * Sprint: KB-02
 *
 * Supports search by: id, file, component, sprint, error, problem,
 *                     keyword, adr, rfc, document, category, severity, status.
 */

import { EvidenceRegistry } from "./EvidenceRegistry";
import type { Evidence, EvidenceSearchQuery, EvidenceSearchResult, EvidenceSearchField } from "./EvidenceTypes";

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(/[\s,._\-/]+/).filter(Boolean);
}

function scoreMatch(query: string, targets: string[]): number {
  const q  = normalize(query);
  const qt = tokenize(query);
  let score = 0;

  for (const target of targets) {
    const t = normalize(target);
    if (t === q)          { score += 10; continue; }
    if (t.includes(q))    { score += 5;  continue; }
    if (q.includes(t))    { score += 3;  continue; }
    for (const tok of qt) {
      if (t.includes(tok)) score += 1;
    }
  }
  return score;
}

function getTargets(field: EvidenceSearchField, e: Evidence): string[] {
  switch (field) {
    case "id":
      return [e.id];
    case "file":
      return [...(e.filesChanged ?? []), ...(e.components ?? [])];
    case "component":
      return [...(e.components ?? []), ...(e.links.components ?? [])];
    case "sprint":
      return [e.sprint, ...(e.links.sprints ?? [])];
    case "error":
    case "problem":
      return [e.problem, e.description, e.rootCause, ...e.keywords];
    case "keyword":
      return [...e.keywords, ...e.tags, e.title, e.description];
    case "adr":
      return [...(e.links.adrs ?? [])];
    case "rfc":
      return [...(e.links.rfcs ?? [])];
    case "document":
      return [...(e.links.officialDocs ?? [])];
    case "category":
      return [e.category];
    case "severity":
      return [e.severity];
    case "status":
      return [e.status];
    default:
      return [...e.keywords, ...e.tags, e.title, e.problem, ...(e.components ?? [])];
  }
}

export const EvidenceSearch = Object.freeze({
  /**
   * Search evidence records by a specific field.
   */
  search(query: EvidenceSearchQuery): EvidenceSearchResult[] {
    const results: EvidenceSearchResult[] = [];

    for (const e of EvidenceRegistry.getAll()) {
      const targets = getTargets(query.field, e);
      const score   = scoreMatch(query.value, targets);
      if (score > 0) {
        results.push({
          evidenceId: e.id,
          title:      e.title,
          category:   e.category,
          severity:   e.severity,
          matchField: query.field,
          score,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  },

  /**
   * Free-text search across all fields.
   */
  searchAll(text: string): EvidenceSearchResult[] {
    const FIELDS: EvidenceSearchField[] = [
      "keyword","component","problem","file","sprint","adr","rfc","document",
    ];
    const best = new Map<string, EvidenceSearchResult>();

    for (const field of FIELDS) {
      for (const r of EvidenceSearch.search({ field, value: text })) {
        const existing = best.get(r.evidenceId);
        if (!existing || existing.score < r.score) best.set(r.evidenceId, r);
      }
    }

    return [...best.values()].sort((a, b) => b.score - a.score);
  },

  /**
   * Find all evidences mentioning a specific file path.
   */
  findByFile(filePath: string): EvidenceSearchResult[] {
    return EvidenceSearch.search({ field: "file", value: filePath });
  },

  /**
   * Find all evidences for a specific component.
   */
  findByComponent(component: string): EvidenceSearchResult[] {
    return EvidenceSearch.search({ field: "component", value: component });
  },

  /**
   * Find all evidences related to a specific ADR.
   */
  findByAdr(adrId: string): EvidenceSearchResult[] {
    return EvidenceSearch.search({ field: "adr", value: adrId });
  },
});