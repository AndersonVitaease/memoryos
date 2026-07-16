/**
 * KnowledgeConflictResolver.ts — Sprint 8.12
 * SRP: detect and record conflicts between knowledge sources.
 * Does NOT resolve conflicts — records only (audit trail).
 * No LLM. No network. No side effects. Deterministic.
 * MDS v2.0 compliant.
 */

import type { FusedEntity, ConflictRecord } from "./KFETypes";

let _conflictSeq = 0;
function makeConflictId(): string {
  return `conflict-${Date.now()}-${++_conflictSeq}`;
}

// ── Conflict detection rules ──────────────────────────────────────────────────

interface ConflictRule {
  readonly name:   string;
  detect(a: FusedEntity, b: FusedEntity): string | null;  // returns reason or null
}

const CONFLICT_RULES: readonly ConflictRule[] = [
  {
    name: "confidence_gap",
    detect(a, b) {
      // Two sources disagree on confidence by >0.4 for the same canonical value
      const delta = Math.abs(a.confidence - b.confidence);
      if (delta >= 0.4) {
        return `Confidence gap of ${delta.toFixed(2)} between sources`;
      }
      return null;
    },
  },
  {
    name: "canonical_value_mismatch",
    detect(a, b) {
      // Same normalized value but different raw casing/spelling (minor conflict)
      const normA = a.canonicalValue.toLowerCase().replace(/\s+/g, " ").trim();
      const normB = b.canonicalValue.toLowerCase().replace(/\s+/g, " ").trim();
      if (normA === normB && a.canonicalValue !== b.canonicalValue) {
        return `Canonical label mismatch: "${a.canonicalValue}" vs "${b.canonicalValue}"`;
      }
      return null;
    },
  },
  {
    name: "source_exclusivity",
    detect(a, b) {
      // GitHub source contradicts Official Library for the same entity
      const hasGitHub   = (e: FusedEntity) => e.sources.includes("github_connector");
      const hasOfficial = (e: FusedEntity) => e.sources.includes("official_library");
      if (hasGitHub(a) && hasOfficial(b) && a.canonicalValue === b.canonicalValue &&
          a.confidence > 0.6 && b.confidence > 0.6) {
        return "GitHub source and Official Library both claim high-confidence knowledge about the same entity";
      }
      return null;
    },
  },
];

// ── KnowledgeConflictResolver ────────────────────────────────────────────────

export class KnowledgeConflictResolver {
  /**
   * Scan all fused entities for pairwise conflicts.
   * O(n²) over deduplicated entity list — bounded by the number of entities.
   * Returns immutable ConflictRecord[]. Never throws.
   */
  detect(entities: readonly FusedEntity[]): readonly ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];

        // Only compare entities of the same type
        if (a.type !== b.type) continue;

        // Must share a normalized value to be in conflict
        const normA = this._norm(a.canonicalValue);
        const normB = this._norm(b.canonicalValue);
        if (normA !== normB) continue;

        for (const rule of CONFLICT_RULES) {
          const reason = rule.detect(a, b);
          if (reason) {
            // Use the best source from each entity for the conflict record
            const srcA = a.sources[0] ?? "unknown";
            const srcB = b.sources[0] ?? "unknown";
            if (srcA === srcB) continue; // same source — not a conflict

            conflicts.push(Object.freeze({
              conflictId:  makeConflictId(),
              value:       a.canonicalValue,
              sourceA:     srcA,
              sourceB:     srcB,
              claimA:      `${srcA}: confidence=${a.confidence.toFixed(2)}`,
              claimB:      `${srcB}: confidence=${b.confidence.toFixed(2)}`,
              reason,
              confidence:  Math.min(a.confidence, b.confidence),
              detectedAt:  Date.now(),
            }));
          }
        }
      }
    }

    return Object.freeze(conflicts);
  }

  private _norm(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }
}

// Singleton
const _KEY = "__KFE_CONFLICT_RESOLVER__";
const g    = globalThis as Record<string, unknown>;
if (!g[_KEY]) g[_KEY] = new KnowledgeConflictResolver();
export const knowledgeConflictResolver = g[_KEY] as KnowledgeConflictResolver;