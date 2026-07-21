/**
 * StrategyReinforcement.ts — Sprint EF-51
 *
 * SRP: manter histórico de aprendizado por Strategy.
 * Produz StrategyLearningRecord[] usáveis pelo Planner futuramente.
 */

import type { AnalyzedEpisode, StrategyLearningRecord } from "./CLTypes";

export class StrategyReinforcement {
  private _store: Map<string, {
    success: number; failure: number;
    costs: number[]; durations: number[]; lastSeenAt: number;
  }> = new Map();

  ingest(episodes: readonly AnalyzedEpisode[]): void {
    for (const ep of episodes) {
      if (!ep.strategy) continue;
      const entry = this._store.get(ep.strategy) ?? {
        success: 0, failure: 0, costs: [], durations: [], lastSeenAt: 0,
      };
      if (ep.outcomeLabel === "success") entry.success++;
      if (ep.outcomeLabel === "failure") entry.failure++;
      entry.costs.push(ep.cost);
      entry.durations.push(ep.durationMs);
      entry.lastSeenAt = Math.max(entry.lastSeenAt, ep.analyzedAt);
      this._store.set(ep.strategy, entry);
    }
  }

  getAll(): readonly StrategyLearningRecord[] {
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return [...this._store.entries()].map(([strategy, data]) => {
      const total = data.success + data.failure;
      const successRate = total > 0 ? data.success / total : 0;
      const learningScore = Math.round(successRate * 80 + Math.min(total / 10, 1) * 20);
      return Object.freeze({
        strategy,
        learningScore,
        executionSuccess: data.success,
        executionFailure: data.failure,
        avgCost:          avg(data.costs),
        avgDurationMs:    avg(data.durations),
        weight:           Math.min(total / 10, 1) * successRate,
        lastSeenAt:       data.lastSeenAt,
      });
    });
  }
}