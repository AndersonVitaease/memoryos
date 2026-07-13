/**
 * VersionResolver.ts — Version evolution detection
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Detects when multiple entities represent different versions of the same thing.
 * Builds a version history chain: previousVersion ↔ nextVersion.
 */

import type { VersionEntry } from "./IRTypes";
import type { FusedEntity } from "../knowledge-fusion/FusionTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract version token from a name.
 * Matches: "v1.0", "v2.3.1", "1.0", "2.0" at end of string.
 */
function extractVersion(name: string): string | null {
  const m = name.match(/\b(v?\d+\.\d+(?:\.\d+)?)\s*$/i);
  return m ? m[1].toLowerCase().replace(/^v/, "") : null;
}

/** Remove version suffix, return base name */
function baseName(name: string): string {
  return name.replace(/\s+v?\d+(\.\d+)*\s*$/i, "").trim().toLowerCase();
}

/** Compare version strings: "1.0" < "1.1" < "2.0" */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ── VersionResolver ───────────────────────────────────────────────────────────

export interface VersionGroup {
  baseName: string;
  entityType: string;
  versions: Array<{ entity: FusedEntity; version: string }>;
}

export class VersionResolver {
  /**
   * Detect version groups among fused entities.
   * Returns groups where ≥ 2 items share the same base name with different version tags.
   */
  detectGroups(entities: FusedEntity[]): VersionGroup[] {
    // Group by (type, baseName) where a version can be extracted
    const buckets = new Map<string, Array<{ entity: FusedEntity; version: string }>>();

    for (const e of entities) {
      const v = extractVersion(e.canonicalTitle);
      if (!v) continue;
      const base = baseName(e.canonicalTitle);
      const key = `${e.type}::${base}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push({ entity: e, version: v });
      buckets.set(key, bucket);
    }

    const groups: VersionGroup[] = [];
    for (const [key, bucket] of buckets) {
      if (bucket.length < 2) continue;
      const [type, ...nameParts] = key.split("::");
      groups.push({
        baseName: nameParts.join("::"),
        entityType: type,
        versions: bucket.sort((a, b) => cmpVersion(a.version, b.version)),
      });
    }
    return groups;
  }

  /**
   * Build VersionEntry chain from a sorted VersionGroup.
   */
  buildChain(group: VersionGroup): VersionEntry[] {
    const sorted = group.versions; // already sorted by cmpVersion
    return sorted.map((v, i) => Object.freeze({
      versionLabel: `v${v.version}`,
      entityId: v.entity.id,
      previousVersion: i > 0 ? sorted[i - 1].entity.id : null,
      nextVersion: i < sorted.length - 1 ? sorted[i + 1].entity.id : null,
      detectedAt: Date.now(),
    }));
  }
}