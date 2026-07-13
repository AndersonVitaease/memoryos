/**
 * TimelineBuilder.ts — Chronological Event Timeline Engine
 * EF-36A · Project Independence · Foundation v1.0
 *
 * Reconstructs a chronological timeline from knowledge items loaded
 * across multiple sources. Supports deduplication and merging.
 */

import type { KnowledgeTimelineEvent, TimelineEventType, KnowledgeProvenance } from "./KRETypes";
import { makeKREId } from "./KRETypes";

export class TimelineBuilder {
  private readonly events = new Map<string, KnowledgeTimelineEvent>();

  // ── Add event ──────────────────────────────────────────────────────────────

  addEvent(
    eventType: TimelineEventType,
    title: string,
    description: string,
    occurredAt: number,
    relatedItemIds: string[],
    provenance: KnowledgeProvenance,
    existingId?: string,
  ): KnowledgeTimelineEvent {
    const id = existingId ?? makeKREId("evt");
    const event: KnowledgeTimelineEvent = Object.freeze({
      id,
      eventType,
      title,
      description,
      occurredAt,
      relatedItemIds: Object.freeze([...relatedItemIds]),
      provenance: Object.freeze({ ...provenance }),
    });
    this.events.set(id, event);
    return event;
  }

  /** Add events from a KnowledgeLoadResult */
  mergeFrom(events: readonly KnowledgeTimelineEvent[]): number {
    let added = 0;
    for (const ev of events) {
      if (!this.events.has(ev.id)) {
        this.events.set(ev.id, ev);
        added++;
      }
    }
    return added;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Returns all events sorted chronologically (oldest first) */
  getChronological(): KnowledgeTimelineEvent[] {
    return Array.from(this.events.values()).sort((a, b) => a.occurredAt - b.occurredAt);
  }

  /** Returns events of a specific type */
  getByType(type: TimelineEventType): KnowledgeTimelineEvent[] {
    return Array.from(this.events.values())
      .filter(e => e.eventType === type)
      .sort((a, b) => a.occurredAt - b.occurredAt);
  }

  /** Returns events in a time range */
  getInRange(fromMs: number, toMs: number): KnowledgeTimelineEvent[] {
    return Array.from(this.events.values())
      .filter(e => e.occurredAt >= fromMs && e.occurredAt <= toMs)
      .sort((a, b) => a.occurredAt - b.occurredAt);
  }

  /** Returns events related to a specific item ID */
  getRelatedTo(itemId: string): KnowledgeTimelineEvent[] {
    return Array.from(this.events.values())
      .filter(e => e.relatedItemIds.includes(itemId))
      .sort((a, b) => a.occurredAt - b.occurredAt);
  }

  /** Returns events from a specific source */
  getBySource(sourceId: string): KnowledgeTimelineEvent[] {
    return Array.from(this.events.values())
      .filter(e => e.provenance.sourceId === sourceId)
      .sort((a, b) => a.occurredAt - b.occurredAt);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  get count(): number { return this.events.size; }

  stats(): Record<string, number> {
    const typeCounts: Record<string, number> = {};
    for (const ev of this.events.values()) {
      typeCounts[ev.eventType] = (typeCounts[ev.eventType] ?? 0) + 1;
    }
    return { total: this.events.size, ...typeCounts };
  }

  clear(): void { this.events.clear(); }
}