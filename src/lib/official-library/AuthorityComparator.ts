/**
 * AuthorityComparator.ts — Sprint EF-7.2.1
 *
 * Single responsibility: compare MemoryAuthority levels.
 * All authority comparisons in the system MUST go through here.
 * No comparison logic scattered across other modules.
 */

import { MemoryAuthority, AUTHORITY_RANK } from "./OfficialLibraryTypes";
import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";

export const AuthorityComparator = {

  /** Compare two authority levels. Returns >0 if a is higher, <0 if lower, 0 if equal. */
  compare(a: MemoryAuthority, b: MemoryAuthority): number {
    return AUTHORITY_RANK[a] - AUTHORITY_RANK[b];
  },

  /** True if a is strictly more authoritative than b. */
  isHigher(a: MemoryAuthority, b: MemoryAuthority): boolean {
    return AUTHORITY_RANK[a] > AUTHORITY_RANK[b];
  },

  /** True if a is at least as authoritative as b. */
  isAtLeast(a: MemoryAuthority, b: MemoryAuthority): boolean {
    return AUTHORITY_RANK[a] >= AUTHORITY_RANK[b];
  },

  /** Extract authority from a MemoryEvidence metadata field (safe, backward-compatible). */
  fromEvidence(ev: MemoryEvidence): MemoryAuthority {
    const raw = (ev.metadata?.authority ?? "") as string;
    return (raw in MemoryAuthority)
      ? (raw as MemoryAuthority)
      : MemoryAuthority.EXTERNAL;
  },

  /**
   * Authority-first sort comparator for MemoryEvidence[].
   * Primary: Authority (highest first)
   * Secondary: Confidence
   * Tertiary: Relevance
   * Quaternary: Recency
   *
   * Authority is PRIORITY, not a bonus score.
   */
  sortEvidence(a: MemoryEvidence, b: MemoryEvidence): number {
    const authA = AuthorityComparator.fromEvidence(a);
    const authB = AuthorityComparator.fromEvidence(b);
    const authDiff = AUTHORITY_RANK[authB] - AUTHORITY_RANK[authA];
    if (authDiff !== 0) return authDiff;

    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.01) return confDiff;

    const relDiff = b.relevance - a.relevance;
    if (Math.abs(relDiff) > 0.01) return relDiff;

    return b.recency - a.recency;
  },

  /** Rank value (0–100) for display. */
  rank(authority: MemoryAuthority): number {
    return AUTHORITY_RANK[authority];
  },

  /** All values ordered highest→lowest. */
  allRanked(): MemoryAuthority[] {
    return Object.entries(AUTHORITY_RANK)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k as MemoryAuthority);
  },
};