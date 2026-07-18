/**
 * KnowledgeQueryResolver.ts
 * Resolves conflicts between contradictory knowledge items.
 *
 * SRP: Conflict resolution only.
 * Sprint: INTEGRATION-02
 *
 * Conflict criteria: same source + same category + score gap < 5%
 * Resolution: higher composite score wins; ties broken by recency, then evidence.
 */

import type { KnowledgeResultItem, KnowledgeConflict } from "./KnowledgeQueryTypes";

export interface ResolvedQueryResult {
  readonly accepted:  KnowledgeResultItem[];
  readonly conflicts: KnowledgeConflict[];
}

const CONFLICT_THRESHOLD = 0.05;

function mayConflict(a: KnowledgeResultItem, b: KnowledgeResultItem): boolean {
  return (
    a.source   === b.source   &&
    a.category === b.category &&
    a.id       !== b.id       &&
    Math.abs(a.score - b.score) < CONFLICT_THRESHOLD
  );
}

export const KnowledgeQueryResolver = Object.freeze({

  resolve(items: KnowledgeResultItem[]): ResolvedQueryResult {
    const accepted:  KnowledgeResultItem[] = [];
    const conflicts: KnowledgeConflict[]   = [];
    const rejected   = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (rejected.has(a.id)) continue;

      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (rejected.has(b.id)) continue;
        if (!mayConflict(a, b)) continue;

        // a has higher or equal score (items sorted desc by rank)
        rejected.add(b.id);
        conflicts.push({
          winner: a,
          loser:  b,
          reason: `Conflicting ${a.source}/${a.category}: winner score ${a.score} vs ${b.score} — resolved by composite score`,
        });
      }

      accepted.push(a);
    }

    return { accepted, conflicts };
  },
});