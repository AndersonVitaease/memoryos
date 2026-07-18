/**
 * PlanningKnowledgeRanking.ts
 * Ranks knowledge items by composite score.
 *
 * SRP: Ranking only — no filtering, no resolution.
 * Sprint: INTEGRATION-01
 *
 * Score composition:
 *  40% evidence score (normalized 0–1)
 *  25% confidence
 *  20% recency (items < 30 days get full score)
 *  10% occurrences (log-normalized)
 *   5% governance priority boost
 */

import type { KnowledgeItem } from "./PlanningKnowledgeProvider";
import type { PlanningKnowledgeContext } from "./PlanningKnowledgeContext";

export interface RankedItem {
  readonly item:         KnowledgeItem;
  readonly score:        number;
  readonly breakdown:    { evidence: number; confidence: number; recency: number; occurrences: number; governance: number };
}

function recencyScore(createdAt: string): number {
  const ageMs  = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 30)  return 1.0;
  if (ageDays <= 90)  return 0.8;
  if (ageDays <= 180) return 0.6;
  if (ageDays <= 365) return 0.4;
  return 0.2;
}

function occurrenceScore(n: number): number {
  return Math.min(1, Math.log10(n + 1) / Math.log10(20));
}

function governanceBoost(item: KnowledgeItem): number {
  if (item.kind !== "GOVERNANCE") return 0.5;
  const pMap: Record<string, number> = { P0: 1.0, P1: 0.8, P2: 0.6, P3: 0.4, P4: 0.2 };
  return pMap[String(item.priority)] ?? 0.5;
}

export const PlanningKnowledgeRanking = Object.freeze({

  rank(items: KnowledgeItem[], _ctx: PlanningKnowledgeContext): RankedItem[] {
    const scored = items.map(item => {
      const evidence    = (item.evidenceScore / 100) * 0.40;
      const confidence  = item.confidence * 0.25;
      const recency     = recencyScore(item.createdAt) * 0.20;
      const occurrences = occurrenceScore(item.occurrences) * 0.10;
      const governance  = governanceBoost(item) * 0.05;
      const score       = Math.round((evidence + confidence + recency + occurrences + governance) * 1000) / 1000;
      return { item, score, breakdown: { evidence, confidence, recency, occurrences, governance } };
    });

    return scored.sort((a, b) => b.score - a.score);
  },

  top(items: KnowledgeItem[], ctx: PlanningKnowledgeContext, n = 5): RankedItem[] {
    return PlanningKnowledgeRanking.rank(items, ctx).slice(0, n);
  },
});