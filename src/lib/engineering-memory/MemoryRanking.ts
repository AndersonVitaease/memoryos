/**
 * MemoryRanking.ts — Sprint 6.2.4
 * Ranks every memory entry by frequency, success, reuse, age, and confidence.
 */
import type { AnyMemoryEntry } from "./MEMTypes";

const NOW = () => Date.now();
const AGE_DECAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class MemoryRanking {
  rankAll(entries: AnyMemoryEntry[]): AnyMemoryEntry[] {
    const ranked = entries.map(e => ({ ...e, rank: this._score(e) }));
    return ranked.sort((a, b) => b.rank - a.rank);
  }

  private _score(e: AnyMemoryEntry): number {
    let score = 0;
    // Frequency / use count
    score += Math.min(30, e.useCount * 5);
    // Confidence
    score += e.confidence * 30;
    // Recency (decays over 7 days)
    const ageRatio = Math.max(0, 1 - (NOW() - e.createdAt) / AGE_DECAY_MS);
    score += ageRatio * 20;
    // Status bonus
    if (e.status === "ACTIVE") score += 10;
    if (e.status === "SUPERSEDED") score -= 20;
    // Success bonus for implementations
    if ("outcome" in e && (e as any).outcome === "PASS") score += 10;
    return Math.min(100, Math.max(0, Math.round(score)));
  }
}