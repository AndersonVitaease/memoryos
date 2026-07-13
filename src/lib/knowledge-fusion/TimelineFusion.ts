/**
 * TimelineFusion.ts — Cross-provider timeline event fusion
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { KnowledgeTimelineEvent } from "../knowledge-reconstruction/KRETypes";
import type { FusedTimelineEvent, FusionConflict } from "./FusionTypes";
import { makeFusionId } from "./FusionTypes";

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const TITLE_SIM_THRESHOLD = 0.75;

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 3));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

export class TimelineFusion {
  fuse(
    events: KnowledgeTimelineEvent[],
    mergeMap: Map<string, string>,
  ): { fused: FusedTimelineEvent[]; conflicts: FusionConflict[]; duplicatesFound: number } {
    // Remap relatedItemIds
    const remapped = events.map(e => ({
      ...e,
      relatedItemIds: e.relatedItemIds.map(id => mergeMap.get(id) ?? id),
    }));

    // Sort chronologically
    const sorted = [...remapped].sort((a, b) => a.occurredAt - b.occurredAt);

    const fused: FusedTimelineEvent[] = [];
    const conflicts: FusionConflict[] = [];
    const usedAsCanonical = new Set<string>();
    const duplicateOf = new Map<string, string>(); // dup id → canonical id
    let duplicatesFound = 0;

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      if (duplicateOf.has(ev.id)) continue;

      let isDuplicate = false;
      let dupOfId: string | null = null;

      // Check against previous events within time window
      for (let j = i - 1; j >= 0; j--) {
        const prev = sorted[j];
        if (Math.abs(ev.occurredAt - prev.occurredAt) > DUPLICATE_WINDOW_MS) break;
        if (prev.eventType !== ev.eventType) continue;
        if (ev.provenance.sourceId === prev.provenance.sourceId) continue;
        const sim = tokenOverlap(ev.title, prev.title);
        if (sim >= TITLE_SIM_THRESHOLD) {
          isDuplicate = true;
          dupOfId = prev.id;
          duplicateOf.set(ev.id, prev.id);
          duplicatesFound++;
          break;
        }
      }

      // Conflict detection: same time ± 1min, same type, different content from different providers
      let hasConflict = false;
      for (let j = i - 1; j >= 0; j--) {
        const prev = sorted[j];
        if (Math.abs(ev.occurredAt - prev.occurredAt) > 60_000) break;
        if (prev.eventType !== ev.eventType) continue;
        if (ev.provenance.sourceId === prev.provenance.sourceId) continue;
        const sim = tokenOverlap(ev.title, prev.title);
        // Low similarity + same time = conflict
        if (sim < 0.3) {
          hasConflict = true;
          conflicts.push(Object.freeze({
            id: makeFusionId("fcon"),
            type: "timeline_inconsistency" as const,
            description: `Conflicting "${ev.eventType}" events near ${new Date(ev.occurredAt).toISOString().slice(0, 10)}`,
            entityAId: prev.id,
            entityBId: ev.id,
            providerA: prev.provenance.sourceId,
            providerB: ev.provenance.sourceId,
            severity: "medium" as const,
            detectedAt: Date.now(),
            resolved: false,
          }));
        }
      }

      // Accumulate providers across duplicates
      const sameGroup = sorted.filter(e =>
        (duplicateOf.get(e.id) === ev.id || e.id === ev.id) && !duplicateOf.has(ev.id),
      );
      const providers = [...new Set(sameGroup.map(e => e.provenance.sourceId))];

      fused.push(Object.freeze({
        id: ev.id,
        eventType: ev.eventType,
        title: ev.title,
        description: ev.description,
        occurredAt: ev.occurredAt,
        relatedItemIds: Object.freeze(ev.relatedItemIds),
        sourceProviders: Object.freeze(providers),
        isDuplicate,
        duplicateOf: dupOfId,
        hasConflict,
      }));
    }

    return { fused, conflicts, duplicatesFound };
  }
}