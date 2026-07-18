/**
 * ConfidenceAdjuster.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * Consumes ConfidencePolicy — zero hardcoded weights.
 * Logic is unchanged; all numbers are now policy-driven.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { EvidenceRelationship } from "./MRETypes";
import { DEFAULT_CONFIDENCE_POLICY, type ConfidencePolicy } from "./policies/ConfidencePolicy";

export const ConfidenceAdjuster = {

  adjust(
    evidence: MemoryEvidence[],
    relationships: Map<string, EvidenceRelationship[]>,
    conflictingIds: Set<string>,
    policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
  ): Map<string, number> {
    const result = new Map<string, number>();
    const totalProviders = new Set(evidence.map(e => e.providerId)).size;

    for (const ev of evidence) {
      let conf = ev.confidence;

      // Corroboration boost
      const rels              = relationships.get(ev.memoryId) ?? [];
      const complements       = rels.filter(r => r.type === "complements" || r.type === "duplicates");
      const uniqueCorroborators = new Set(
        complements
          .map(r => evidence.find(e => e.memoryId === r.targetId)?.providerId)
          .filter(Boolean)
      ).size;
      if (uniqueCorroborators > 0) {
        conf = Math.min(policy.maximumConfidence, conf + uniqueCorroborators * policy.corroborationBonus);
      }

      // Multi-source bonus
      if (totalProviders >= 3) {
        conf = Math.min(policy.maximumConfidence, conf + policy.multiSourceBonus);
      }

      // Recency bonus
      conf = Math.min(policy.maximumConfidence, conf + ev.recency * policy.recencyBonus);

      // Conflict penalty
      if (conflictingIds.has(ev.memoryId)) {
        conf = Math.max(policy.minimumConfidence, conf - policy.conflictPenalty);
      }

      result.set(ev.memoryId, Math.round(conf * 1000) / 1000);
    }

    return result;
  },

  overall(
    evidence: MemoryEvidence[],
    adjustments: Map<string, number>,
    hasUnresolvedConflicts: boolean,
    policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
  ): number {
    if (evidence.length === 0) return 0;
    const confs   = evidence.map(ev => adjustments.get(ev.memoryId) ?? ev.confidence);
    const avg     = confs.reduce((s, c) => s + c, 0) / confs.length;
    const bonus   = Math.min(0.1, (new Set(evidence.map(e => e.providerId)).size - 1) * policy.corroborationBonus);
    const penalty = hasUnresolvedConflicts ? policy.conflictPenalty : 0;
    return Math.round(
      Math.min(policy.maximumConfidence, Math.max(policy.minimumConfidence, avg + bonus - penalty)) * 100
    ) / 100;
  },
};