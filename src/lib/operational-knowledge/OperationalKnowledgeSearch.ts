/**
 * OperationalKnowledgeSearch.ts
 * Simple semantic search over the Operational Knowledge Base.
 *
 * Authority: ENGINEERING
 * SRP: Search only — no registry mutations, no document loading.
 * Supports search by: problem, error, file, component, sprint, category, keyword.
 */

import { OperationalKnowledgeRegistry } from "./OperationalKnowledgeRegistry";
import type { OKSearchQuery, OKSearchResult, OKSearchField, OKDocumentCategory } from "./OperationalKnowledgeTypes";

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(/[\s,._\-/]+/).filter(Boolean);
}

function scoreMatch(query: string, targets: readonly string[]): number {
  const q = normalize(query);
  const qTokens = tokenize(query);
  let score = 0;

  for (const target of targets) {
    const t = normalize(target);
    if (t === q) { score += 10; continue; }
    if (t.includes(q)) { score += 5; continue; }
    if (q.includes(t)) { score += 3; continue; }
    for (const token of qTokens) {
      if (t.includes(token)) score += 1;
    }
  }

  return score;
}

// ── Field resolvers ───────────────────────────────────────────────────────────

function getSearchTargets(field: OKSearchField, doc: ReturnType<typeof OperationalKnowledgeRegistry.getAll>[number]): readonly string[] {
  switch (field) {
    case "problem":
    case "error":
      return [...doc.keywords, ...doc.tags];
    case "file":
      return [doc.path, ...doc.components];
    case "component":
      return doc.components;
    case "sprint":
      return doc.sprints;
    case "category":
      return [doc.category, doc.name];
    case "keyword":
      return [...doc.keywords, ...doc.tags, doc.name];
    default:
      return [...doc.keywords, ...doc.tags, doc.name, ...doc.components];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const OperationalKnowledgeSearch = Object.freeze({
  /**
   * Search for documents matching the query.
   * Returns results sorted by relevance score descending.
   */
  search(query: OKSearchQuery): OKSearchResult[] {
    const docs = query.category
      ? OperationalKnowledgeRegistry.getByCategory(query.category)
      : OperationalKnowledgeRegistry.getAll();

    const results: OKSearchResult[] = [];

    for (const doc of docs) {
      const targets = getSearchTargets(query.field, doc);
      const score   = scoreMatch(query.value, targets);
      if (score > 0) {
        results.push({
          documentId:   doc.id,
          documentName: doc.name,
          category:     doc.category,
          matchField:   query.field,
          matchValue:   query.value,
          score,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  },

  /**
   * Free-text search across all fields and all documents.
   */
  searchAll(text: string): OKSearchResult[] {
    const fields: OKSearchField[] = ["keyword", "component", "file", "sprint", "category"];
    const allResults = new Map<string, OKSearchResult>();

    for (const field of fields) {
      const results = OperationalKnowledgeSearch.search({ field, value: text });
      for (const r of results) {
        const existing = allResults.get(r.documentId);
        if (!existing || existing.score < r.score) {
          allResults.set(r.documentId, r);
        }
      }
    }

    return [...allResults.values()].sort((a, b) => b.score - a.score);
  },

  /**
   * Find all documents related to a specific component.
   */
  findByComponent(componentName: string): OKSearchResult[] {
    return OperationalKnowledgeSearch.search({ field: "component", value: componentName });
  },

  /**
   * Find all documents for a specific sprint.
   */
  findBySprint(sprint: string): OKSearchResult[] {
    return OperationalKnowledgeSearch.search({ field: "sprint", value: sprint });
  },

  /**
   * Find all documents in a category.
   */
  findByCategory(category: OKDocumentCategory): OKSearchResult[] {
    return OperationalKnowledgeSearch.search({ field: "category", value: category, category });
  },
});