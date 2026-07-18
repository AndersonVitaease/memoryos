/**
 * KnowledgeQueryFilter.ts
 * Filters knowledge result items based on a KnowledgeFilter spec.
 *
 * SRP: Filtering only.
 * Sprint: INTEGRATION-02
 */

import type { KnowledgeResultItem, KnowledgeFilter } from "./KnowledgeQueryTypes";

export interface QueryFilterResult {
  readonly kept:     KnowledgeResultItem[];
  readonly discarded:Array<{ item: KnowledgeResultItem; reason: string }>;
}

function overlaps(a: string[], b: string[]): boolean {
  const setB = new Set(b.map(s => s.toLowerCase()));
  return a.some(s => setB.has(s.toLowerCase()));
}

export const KnowledgeQueryFilter = Object.freeze({

  apply(items: KnowledgeResultItem[], filter: KnowledgeFilter): QueryFilterResult {
    const kept:     KnowledgeResultItem[] = [];
    const discarded:Array<{ item: KnowledgeResultItem; reason: string }> = [];

    for (const item of items) {
      // Evidence floor
      if (filter.minEvidence && item.evidenceScore < filter.minEvidence) {
        discarded.push({ item, reason: `Evidence ${item.evidenceScore} < ${filter.minEvidence}` });
        continue;
      }
      // Confidence floor
      if (filter.minConfidence && item.confidence < filter.minConfidence) {
        discarded.push({ item, reason: `Confidence ${item.confidence} < ${filter.minConfidence}` });
        continue;
      }
      // Category filter
      if (filter.category && filter.category !== "ANY") {
        if (!item.category.toUpperCase().includes(filter.category)) {
          discarded.push({ item, reason: `Category mismatch: ${item.category} vs ${filter.category}` });
          continue;
        }
      }
      // Priority filter
      if (filter.priority && filter.priority !== "ANY") {
        if (item.priority !== filter.priority && item.source !== "GOVERNANCE") {
          discarded.push({ item, reason: `Priority mismatch: ${item.priority} vs ${filter.priority}` });
          continue;
        }
      }
      // Component filter (soft — governance always passes)
      if (filter.components?.length && item.components.length && item.source !== "GOVERNANCE") {
        if (!overlaps(item.components, filter.components) && !overlaps(item.tags, filter.components)) {
          // keep but mark lower relevance — handled by ranking
        }
      }
      kept.push(item);
    }

    return { kept, discarded };
  },

  describe(filter: KnowledgeFilter): string[] {
    const parts: string[] = [];
    if (filter.minEvidence)   parts.push(`evidence >= ${filter.minEvidence}`);
    if (filter.minConfidence) parts.push(`confidence >= ${filter.minConfidence}`);
    if (filter.category && filter.category !== "ANY") parts.push(`category = ${filter.category}`);
    if (filter.priority && filter.priority !== "ANY") parts.push(`priority = ${filter.priority}`);
    if (filter.components?.length) parts.push(`components ∈ [${filter.components.join(",")}]`);
    if (filter.sprint)   parts.push(`sprint = ${filter.sprint}`);
    if (filter.tags?.length) parts.push(`tags ∈ [${filter.tags.join(",")}]`);
    return parts;
  },
});