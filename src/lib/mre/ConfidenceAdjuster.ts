/**
 * ConfidenceAdjuster.ts — MRE v1.0
 * Sprint 7.1.0
 *
 * Adjusts evidence confidence based on multi-source consistency,
 * corroboration, recency, and conflict penalties.
 * Does NOT invent facts or alter content.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { EvidenceRelationship } from "./MRETypes";

export const ConfidenceAdjuster = {

  /**
   * Compute adjusted confidence for each evidence item.
   * Factors:
   *   +boost  when corroborated by other sources
   *   -penalty when involved in unresolved conflicts
   *   +recency bonus for fresh evidence
   *   capped at [0.05, 0.99]
   */
  adjust(
    evidence: MemoryEvidence[],
    relationships: Map<string, EvidenceRelationship[]>,
    conflictingIds: Set<string>,
  ): Map<string, number> {
    const result = new Map<string, number>();
    const totalProviders = new Set(evidence.map(e => e.providerId)).size;

    for (const ev of evidence) {
      let conf = ev.confidence;

      // 1. Corroboration boost: other providers agree
      const rels     = relationships.get(ev.memoryId) ?? [];
      const complements = rels.filter(r => r.type === "complements" || r.type === "duplicates");
      const uniqueCorroborators = new Set(
        complements.map(r => evidence.find(e => e.memoryId === r.targetId)?.providerId).filter(Boolean)
      ).size;
      if (uniqueCorroborators > 0) {
        conf = Math.min(0.99, conf + uniqueCorroborators * 0.05);
      }

      // 2. Multi-source bonus: evidence exists in multiple providers
      if (totalProviders >= 3) conf = Math.min(0.99, conf + 0.03);

      // 3. Recency bonus
      conf = Math.min(0.99, conf + ev.recency * 0.05);

      // 4. Conflict penalty
      if (conflictingIds.has(ev.memoryId)) {
        conf = Math.max(0.05, conf - 0.1);
      }

      result.set(ev.memoryId, Math.round(conf * 1000) / 1000);
    }

    return result;
  },

  /** Compute the overall confidence for a consolidated result. */
  overall(
    evidence: MemoryEvidence[],
    adjustments: Map<string, number>,
    hasUnresolvedConflicts: boolean,
  ): number {
    if (evidence.length === 0) return 0;
    const confs = evidence.map(ev => adjustments.get(ev.memoryId) ?? ev.confidence);
    const avg   = confs.reduce((s, c) => s + c, 0) / confs.length;
    const bonus = Math.min(0.1, (new Set(evidence.map(e => e.providerId)).size - 1) * 0.03);
    const penalty = hasUnresolvedConflicts ? 0.1 : 0;
    return Math.round(Math.min(0.99, Math.max(0.05, avg + bonus - penalty)) * 100) / 100;
  },
};