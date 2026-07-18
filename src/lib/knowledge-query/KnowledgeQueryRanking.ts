/**
 * KnowledgeQueryRanking.ts
 * Configurable ranking with pluggable RankingProfile.
 *
 * SRP: Ranking only — no filtering, no resolution.
 * Sprint: INTEGRATION-02
 *
 * Weights are fully configurable via RankingProfile — nothing hardcoded.
 */

import { KnowledgeQueryRegistry } from "./KnowledgeQueryRegistry";
import type { KnowledgeResultItem, RankingPolicy, RankingWeights } from "./KnowledgeQueryTypes";

function recencyScore(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (ageDays <= 30)  return 1.0;
  if (ageDays <= 90)  return 0.8;
  if (ageDays <= 180) return 0.6;
  if (ageDays <= 365) return 0.4;
  return 0.2;
}

function occurrenceScore(n: number): number {
  return Math.min(1, Math.log10(n + 1) / Math.log10(20));
}

function governanceScore(item: KnowledgeResultItem): number {
  if (item.source !== "GOVERNANCE") return 0.5;
  const pMap: Record<string, number> = { P0: 1.0, P1: 0.8, P2: 0.6, P3: 0.4, P4: 0.2 };
  return pMap[String(item.priority)] ?? 0.5;
}

function computeScore(item: KnowledgeResultItem, w: RankingWeights): number {
  const e = (item.evidenceScore / 100) * w.evidence;
  const c = item.confidence          * w.confidence;
  const r = recencyScore(item.createdAt) * w.recency;
  const o = occurrenceScore(item.occurrences) * w.occurrences;
  const a = Math.min(1, (item.occurrences / 10)) * w.approvals;  // approvals ~ reuse
  const g = governanceScore(item) * w.governance;
  return Math.round((e + c + r + o + a + g) * 1000) / 1000;
}

export const KnowledgeQueryRanking = Object.freeze({

  rank(items: KnowledgeResultItem[], policy: RankingPolicy): KnowledgeResultItem[] {
    const profile = KnowledgeQueryRegistry.getProfile(policy.profileId);
    const w       = profile.weights;

    const scored = items.map(item => ({ ...item, score: computeScore(item, w) }));

    // Sort desc, apply minScore, topN
    const filtered = scored
      .filter(i => i.score >= policy.minScore)
      .sort((a, b) => {
        if (Math.abs(a.score - b.score) > 0.001) return b.score - a.score;
        // Tie-break
        switch (policy.tieBreaker) {
          case "RECENCY":    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case "CONFIDENCE": return b.confidence - a.confidence;
          case "EVIDENCE":   return b.evidenceScore - a.evidenceScore;
          default:           return 0;
        }
      });

    return filtered.slice(0, policy.topN);
  },
});