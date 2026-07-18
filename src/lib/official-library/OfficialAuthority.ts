/**
 * OfficialAuthority.ts — Sprint EF-7.2.0
 *
 * Centralized authority management.
 * Resolves authority from document metadata.
 * Provides authority-based ranking boost for UCME fusion.
 */

import { MemoryAuthority, AUTHORITY_RANK } from "./OfficialLibraryTypes";

// ── Confidence boost per authority tier ──────────────────────────────────────
// Applied by OfficialLibraryProvider when building MemoryEvidence.
// These are additive boosts ON TOP of base content confidence.

const AUTHORITY_CONFIDENCE_BOOST: Record<MemoryAuthority, number> = {
  [MemoryAuthority.OFFICIAL]:  0.20,
  [MemoryAuthority.VERIFIED]:  0.10,
  [MemoryAuthority.LEARNED]:   0.00,
  [MemoryAuthority.USER]:      0.00,
  [MemoryAuthority.EXTERNAL]:  0.00,
};

export const OfficialAuthority = {

  /** Parse authority from a path or tag string. */
  fromPath(path: string): MemoryAuthority {
    if (path.includes("00-official-library")) return MemoryAuthority.OFFICIAL;
    if (path.includes("foundation"))          return MemoryAuthority.VERIFIED;
    return MemoryAuthority.EXTERNAL;
  },

  /** Parse authority from a document title prefix. */
  fromTitle(title: string): MemoryAuthority {
    const upper = title.toUpperCase();
    if (upper.startsWith("MV-")  || upper.startsWith("MPS-") || upper.startsWith("MAS-") ||
        upper.startsWith("MDS-") || upper.startsWith("MES-") || upper.startsWith("MCS-") ||
        upper.startsWith("MEMORYOS") || upper.includes("OFFICIAL")) {
      return MemoryAuthority.OFFICIAL;
    }
    if (upper.startsWith("ADR-") || upper.startsWith("RFC-") || upper.startsWith("FOUNDATION")) {
      return MemoryAuthority.VERIFIED;
    }
    return MemoryAuthority.EXTERNAL;
  },

  /** Rank comparison: positive if a > b, negative if a < b. */
  compare(a: MemoryAuthority, b: MemoryAuthority): number {
    return AUTHORITY_RANK[a] - AUTHORITY_RANK[b];
  },

  /** Is authority a more authoritative than b? */
  isMoreAuthoritative(a: MemoryAuthority, b: MemoryAuthority): boolean {
    return AUTHORITY_RANK[a] > AUTHORITY_RANK[b];
  },

  /** Confidence boost for this authority level. */
  confidenceBoost(authority: MemoryAuthority): number {
    return AUTHORITY_CONFIDENCE_BOOST[authority];
  },

  /** Human label for authority level. */
  label(authority: MemoryAuthority): string {
    const labels: Record<MemoryAuthority, string> = {
      [MemoryAuthority.OFFICIAL]:  "Official Library",
      [MemoryAuthority.VERIFIED]:  "Verified Source",
      [MemoryAuthority.LEARNED]:   "Learned Knowledge",
      [MemoryAuthority.USER]:      "User Provided",
      [MemoryAuthority.EXTERNAL]:  "External Source",
    };
    return labels[authority];
  },

  /** All authority values ranked highest first. */
  rankedValues(): MemoryAuthority[] {
    return Object.entries(AUTHORITY_RANK)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k as MemoryAuthority);
  },
};