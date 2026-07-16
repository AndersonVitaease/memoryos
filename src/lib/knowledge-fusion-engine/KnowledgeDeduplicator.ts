/**
 * KnowledgeDeduplicator.ts — Sprint 8.12
 * SRP: eliminate duplicate knowledge units across sources.
 * No LLM. No network. No side effects. Deterministic.
 * MDS v2.0 compliant.
 */

import type { RawKnowledgeUnit, FusedEntity, EvidenceRecord, KnowledgeSourceId } from "./KFETypes";

// ── Deduplication result ──────────────────────────────────────────────────────

export interface DeduplicationResult {
  readonly groups:           readonly DeduplicationGroup[];
  readonly duplicatesRemoved: number;
}

export interface DeduplicationGroup {
  readonly canonicalUnit:  RawKnowledgeUnit;   // highest-confidence unit wins
  readonly merged:         readonly RawKnowledgeUnit[];  // all units in group (incl. canonical)
  readonly duplicateIds:   readonly string[];  // IDs of units folded into canonical
}

// ── KnowledgeDeduplicator ────────────────────────────────────────────────────

export class KnowledgeDeduplicator {
  /**
   * Groups raw units by normalized value + type.
   * Within each group, the unit with the highest confidence is canonical.
   * All others are recorded as duplicates.
   * O(n) grouping, O(k log k) sort per group.
   */
  deduplicate(units: readonly RawKnowledgeUnit[]): DeduplicationResult {
    // Group key: type + normalized value
    const map = new Map<string, RawKnowledgeUnit[]>();
    for (const unit of units) {
      const key = `${unit.type}::${this._normalize(unit.value)}`;
      const group = map.get(key) ?? [];
      group.push(unit);
      map.set(key, group);
    }

    let duplicatesRemoved = 0;
    const groups: DeduplicationGroup[] = [];

    for (const groupUnits of map.values()) {
      // Sort descending by confidence; stable tie-break by sourceId (alphabetical)
      const sorted = [...groupUnits].sort((a, b) => {
        const diff = b.confidence - a.confidence;
        if (diff !== 0) return diff;
        return a.sourceId.localeCompare(b.sourceId);
      });

      const canonical = sorted[0];
      const rest      = sorted.slice(1);
      duplicatesRemoved += rest.length;

      groups.push(Object.freeze({
        canonicalUnit: canonical,
        merged:        Object.freeze(sorted),
        duplicateIds:  Object.freeze(rest.map((u) => u.id)),
      }));
    }

    return Object.freeze({ groups: Object.freeze(groups), duplicatesRemoved });
  }

  /**
   * Convert a DeduplicationGroup into a FusedEntity.
   * Called by KnowledgeFusionEngine after deduplication.
   */
  toFusedEntity(group: DeduplicationGroup, fusedId: string): FusedEntity {
    const canon = group.canonicalUnit;
    const sources = Array.from(
      new Set(group.merged.map((u) => u.sourceId))
    ) as KnowledgeSourceId[];

    const evidence: EvidenceRecord[] = group.merged.map((u) =>
      Object.freeze({
        sourceId:   u.sourceId,
        excerpt:    u.context ?? u.rawValue,
        confidence: u.confidence,
        capturedAt: Date.now(),
      })
    );

    return Object.freeze({
      fusedId,
      canonicalValue: canon.rawValue,
      type:           canon.type,
      confidence:     canon.confidence,
      sources:        Object.freeze(sources),
      evidence:       Object.freeze(evidence),
      duplicatesOf:   group.duplicateIds,
      context:        canon.context,
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }
}

// Singleton
const _KEY = "__KFE_DEDUPLICATOR__";
const g    = globalThis as Record<string, unknown>;
if (!g[_KEY]) g[_KEY] = new KnowledgeDeduplicator();
export const knowledgeDeduplicator = g[_KEY] as KnowledgeDeduplicator;