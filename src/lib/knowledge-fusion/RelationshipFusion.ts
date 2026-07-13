/**
 * RelationshipFusion.ts — Cross-provider relationship correlation
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { KnowledgeRelationship } from "../knowledge-reconstruction/KRETypes";
import type { FusedRelationship } from "./FusionTypes";
import { makeFusionId } from "./FusionTypes";

export class RelationshipFusion {
  /**
   * Fuse relationships from multiple providers.
   * Applies the mergeMap so IDs point to fused entities.
   * Deduplicates equivalent relationships (same from+to+type).
   */
  fuse(
    relationships: KnowledgeRelationship[],
    mergeMap: Map<string, string>,
  ): { fused: FusedRelationship[]; duplicatesRemoved: number } {
    // Remap IDs
    const remapped: Array<{ fromId: string; toId: string; type: string; weight: number; provider: string }> = [];
    for (const rel of relationships) {
      const fromId = mergeMap.get(rel.fromId) ?? rel.fromId;
      const toId = mergeMap.get(rel.toId) ?? rel.toId;
      if (fromId === toId) continue; // self-loop after merge — skip
      remapped.push({
        fromId,
        toId,
        type: rel.relationshipType,
        weight: rel.weight,
        provider: rel.provenance.sourceId,
      });
    }

    // Deduplicate by (fromId, toId, type)
    const seen = new Map<string, { providers: Set<string>; maxWeight: number; count: number }>();
    for (const r of remapped) {
      const key = `${r.fromId}|${r.toId}|${r.type}`;
      const existing = seen.get(key);
      if (existing) {
        existing.providers.add(r.provider);
        existing.maxWeight = Math.max(existing.maxWeight, r.weight);
        existing.count++;
      } else {
        seen.set(key, { providers: new Set([r.provider]), maxWeight: r.weight, count: 1 });
      }
    }

    const fused: FusedRelationship[] = [];
    let duplicatesRemoved = 0;

    for (const [key, meta] of seen) {
      const [fromId, toId, type] = key.split("|");
      duplicatesRemoved += meta.count - 1;
      fused.push(Object.freeze({
        id: makeFusionId("frel"),
        fromId,
        toId,
        relationshipType: type,
        weight: parseFloat(Math.min(1.0, meta.maxWeight * (1 + 0.02 * (meta.providers.size - 1))).toFixed(4)),
        supportingProviders: Object.freeze([...meta.providers]),
        evidenceCount: meta.count,
        fusedAt: Date.now(),
      }));
    }

    return { fused, duplicatesRemoved };
  }
}