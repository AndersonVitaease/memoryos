/**
 * ConflictResolver.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * Sprint 7.1.1 change: uses explicit corroborationCount / providerAgreement
 * instead of tags.length as a proxy for source count.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { ReasoningConflict } from "./MRETypes";

let _seq = 1;
function cid() { return `conflict-${Date.now()}-${_seq++}`; }

function parseDate(iso: string): number {
  try { return new Date(iso).getTime(); } catch { return 0; }
}

export const ConflictResolver = {

  resolve(
    a: MemoryEvidence,
    b: MemoryEvidence,
    description: string,
    /** Explicit corroboration counts — never inferred from tags. */
    corroboration?: { aCount: number; bCount: number },
  ): ReasoningConflict {
    const confDiff = Math.abs(a.confidence - b.confidence);
    const dateA    = parseDate(a.lastUpdated);
    const dateB    = parseDate(b.lastUpdated);
    const dateDiff = Math.abs(dateA - dateB);

    // 1. Clear confidence advantage (> 0.1 gap)
    if (confDiff > 0.1) {
      const winner = a.confidence >= b.confidence ? a : b;
      const loser  = winner === a ? b : a;
      return {
        id: cid(), evidenceIds: [a.memoryId, b.memoryId], description,
        resolution: "higher_confidence", winner: winner.memoryId,
        explanation: `"${winner.providerName}" has higher confidence (${(winner.confidence * 100).toFixed(0)}%) vs "${loser.providerName}" (${(loser.confidence * 100).toFixed(0)}%)`,
      };
    }

    // 2. Clear recency advantage (> 1 hour)
    if (dateDiff > 3600000) {
      const winner = dateA >= dateB ? a : b;
      return {
        id: cid(), evidenceIds: [a.memoryId, b.memoryId], description,
        resolution: "more_recent", winner: winner.memoryId,
        explanation: `"${winner.providerName}" is more recent`,
      };
    }

    // 3. Explicit corroboration count (Sprint 7.1.1 — replaces tags.length)
    if (corroboration && corroboration.aCount !== corroboration.bCount) {
      const winner = corroboration.aCount >= corroboration.bCount ? a : b;
      return {
        id: cid(), evidenceIds: [a.memoryId, b.memoryId], description,
        resolution: "more_sources", winner: winner.memoryId,
        explanation: `"${winner.providerName}" has more corroborating sources`,
      };
    }

    // 4. Unresolved
    return {
      id: cid(), evidenceIds: [a.memoryId, b.memoryId], description,
      resolution: "unresolved", winner: null,
      explanation: `Both "${a.providerName}" and "${b.providerName}" have similar confidence and recency. Both preserved.`,
    };
  },
};