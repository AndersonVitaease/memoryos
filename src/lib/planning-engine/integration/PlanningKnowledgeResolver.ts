/**
 * PlanningKnowledgeResolver.ts
 * Resolves conflicts between contradictory knowledge items.
 *
 * SRP: Conflict resolution only.
 * Sprint: INTEGRATION-01
 *
 * Resolution strategy: higher composite score wins; ties broken by recency.
 * Contradictory items share the same category + opposing conclusions (heuristic).
 */

import type { RankedItem } from "./PlanningKnowledgeRanking";

export interface ConflictRecord {
  readonly winner:   RankedItem;
  readonly loser:    RankedItem;
  readonly reason:   string;
}

export interface ResolvedBundle {
  readonly accepted:  RankedItem[];
  readonly conflicts: ConflictRecord[];
}

const CONTRADICTION_THRESHOLD = 0.05; // scores within 5% may conflict

function mayContradict(a: RankedItem, b: RankedItem): boolean {
  if (a.item.kind !== b.item.kind) return false;
  if (a.item.id   === b.item.id)   return false;
  // Same category + very similar score → potential conflict
  return (
    a.item.category === b.item.category &&
    Math.abs(a.score - b.score) < CONTRADICTION_THRESHOLD
  );
}

export const PlanningKnowledgeResolver = Object.freeze({

  resolve(ranked: RankedItem[]): ResolvedBundle {
    const accepted:  RankedItem[]     = [];
    const conflicts: ConflictRecord[] = [];
    const rejected   = new Set<string>();

    for (let i = 0; i < ranked.length; i++) {
      const a = ranked[i];
      if (rejected.has(a.item.id)) continue;

      for (let j = i + 1; j < ranked.length; j++) {
        const b = ranked[j];
        if (rejected.has(b.item.id)) continue;

        if (mayContradict(a, b)) {
          // a has higher score (ranked desc), so a wins
          rejected.add(b.item.id);
          conflicts.push({
            winner: a,
            loser:  b,
            reason: `Conflicting ${a.item.kind} in category "${a.item.category}" — winner has higher composite score (${a.score} vs ${b.score})`,
          });
        }
      }

      accepted.push(a);
    }

    return { accepted, conflicts };
  },
});