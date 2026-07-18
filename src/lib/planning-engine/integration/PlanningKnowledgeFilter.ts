/**
 * PlanningKnowledgeFilter.ts
 * Eliminates irrelevant knowledge from the raw bundle.
 *
 * SRP: Filtering only — no ranking, no resolution.
 * Sprint: INTEGRATION-01
 */

import type { KnowledgeItem } from "./PlanningKnowledgeProvider";
import type { PlanningKnowledgeContext } from "./PlanningKnowledgeContext";

export interface FilterResult {
  readonly kept:     KnowledgeItem[];
  readonly removed:  Array<{ item: KnowledgeItem; reason: string }>;
}

function overlaps(a: string[], b: string[]): boolean {
  const setB = new Set(b.map(s => s.toLowerCase()));
  return a.some(s => setB.has(s.toLowerCase()));
}

export const PlanningKnowledgeFilter = Object.freeze({

  filter(items: KnowledgeItem[], ctx: PlanningKnowledgeContext): FilterResult {
    const kept:    KnowledgeItem[] = [];
    const removed: Array<{ item: KnowledgeItem; reason: string }> = [];

    for (const item of items) {
      // Always keep governance items
      if (item.kind === "GOVERNANCE") { kept.push(item); continue; }

      // Evidence score floor
      if (item.evidenceScore < 20) {
        removed.push({ item, reason: "Evidence score below threshold (< 20)" });
        continue;
      }

      // Confidence floor
      if (item.confidence < 0.30) {
        removed.push({ item, reason: "Confidence below threshold (< 0.30)" });
        continue;
      }

      // Component relevance (if context has components)
      if (ctx.components.length > 0 && item.components.length > 0) {
        if (!overlaps(item.components, ctx.components) && !overlaps(item.tags, ctx.components)) {
          // Don't remove — just mark lower relevance; still keep
        }
      }

      // Tag relevance (if context has tags, prefer matching)
      // We keep all passing the floor thresholds; ranking handles ordering
      kept.push(item);
    }

    return { kept, removed };
  },
});