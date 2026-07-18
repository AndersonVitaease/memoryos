/**
 * ConflictResolver.ts — MRE v1.0
 * Sprint 7.1.0
 *
 * Resolves conflicts between evidence items.
 * Never silently discards evidence.
 * Never invents facts.
 * Always explains.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { ReasoningConflict } from "./MRETypes";

let _seq = 1;
function cid() { return `conflict-${Date.now()}-${_seq++}`; }

function parseDate(iso: string): number {
  try { return new Date(iso).getTime(); } catch { return 0; }
}

export const ConflictResolver = {

  /**
   * Given a detected conflict pair, decide resolution strategy and produce a conflict record.
   * Strategies (in priority order):
   *   1. higher_confidence — prefer the evidence with higher confidence
   *   2. more_recent       — if confidence is close, prefer more recent
   *   3. more_sources      — if timing is close, prefer evidence with more sources
   *   4. unresolved        — cannot determine winner
   */
  resolve(
    a: MemoryEvidence,
    b: MemoryEvidence,
    description: string,
  ): ReasoningConflict {
    const confDiff = Math.abs(a.confidence - b.confidence);
    const dateA    = parseDate(a.lastUpdated);
    const dateB    = parseDate(b.lastUpdated);
    const dateDiff = Math.abs(dateA - dateB);

    // 1. Clear confidence advantage (>0.1 gap)
    if (confDiff > 0.1) {
      const winner = a.confidence >= b.confidence ? a : b;
      return {
        id: cid(),
        evidenceIds:  [a.memoryId, b.memoryId],
        description,
        resolution:   "higher_confidence",
        winner:       winner.memoryId,
        explanation:  `"${winner.providerName}" has higher confidence (${(winner.confidence * 100).toFixed(0)}%) vs "${(winner === a ? b : a).providerName}" (${((winner === a ? b : a).confidence * 100).toFixed(0)}%)`,
      };
    }

    // 2. Clear recency advantage (>1 hour)
    if (dateDiff > 3600000) {
      const winner = dateA >= dateB ? a : b;
      return {
        id: cid(),
        evidenceIds:  [a.memoryId, b.memoryId],
        description,
        resolution:   "more_recent",
        winner:       winner.memoryId,
        explanation:  `"${winner.providerName}" is more recent`,
      };
    }

    // 3. Source count (tags as proxy)
    if (a.tags.length !== b.tags.length) {
      const winner = a.tags.length >= b.tags.length ? a : b;
      return {
        id: cid(),
        evidenceIds:  [a.memoryId, b.memoryId],
        description,
        resolution:   "more_sources",
        winner:       winner.memoryId,
        explanation:  `"${winner.providerName}" has more source metadata`,
      };
    }

    // 4. Unresolved
    return {
      id:           cid(),
      evidenceIds:  [a.memoryId, b.memoryId],
      description,
      resolution:   "unresolved",
      winner:       null,
      explanation:  `Both "${a.providerName}" and "${b.providerName}" have similar confidence and recency. Both preserved.`,
    };
  },
};