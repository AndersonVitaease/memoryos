/**
 * CapabilityReinforcement.ts — Sprint EF-51
 *
 * SRP: manter histórico de aprendizado por Capability.
 * Produz CapabilityLearningRecord[] usáveis pelo Planner futuramente.
 */

import type { AnalyzedEpisode, CapabilityLearningRecord } from "./CLTypes";

export class CapabilityReinforcement {
  private _store: Map<string, {
    success: number; total: number;
    confidences: number[]; lastSeenAt: number;
  }> = new Map();

  /** Ingest analyzed episodes to update reinforcement scores. */
  ingest(episodes: readonly AnalyzedEpisode[]): void {
    for (const ep of episodes) {
      const caps = ep.capabilitySignature.split("|").filter(Boolean);
      for (const cap of caps) {
        const entry = this._store.get(cap) ?? { success: 0, total: 0, confidences: [], lastSeenAt: 0 };
        entry.total++;
        if (ep.outcomeLabel === "success") entry.success++;
        entry.confidences.push(ep.confidence);
        entry.lastSeenAt = Math.max(entry.lastSeenAt, ep.analyzedAt);
        this._store.set(cap, entry);
      }
    }
  }

  /** Get current reinforcement records. */
  getAll(): readonly CapabilityLearningRecord[] {
    return [...this._store.entries()].map(([cap, data]) => {
      const successRate   = data.total > 0 ? data.success / data.total : 0;
      const avgConf       = data.confidences.length > 0
        ? data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length : 0;
      const score         = Math.round(successRate * 70 + avgConf * 30);
      const learningWeight = Math.min(data.total / 10, 1);

      return Object.freeze({
        capability:    cap,
        score,
        confidence:    avgConf,
        successRate,
        learningWeight,
        occurrences:   data.total,
        lastSeenAt:    data.lastSeenAt,
      });
    });
  }

  get(capability: string): CapabilityLearningRecord | undefined {
    const data = this._store.get(capability);
    if (!data) return undefined;
    const successRate    = data.total > 0 ? data.success / data.total : 0;
    const avgConf        = data.confidences.length > 0
      ? data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length : 0;
    return Object.freeze({
      capability,
      score:          Math.round(successRate * 70 + avgConf * 30),
      confidence:     avgConf,
      successRate,
      learningWeight: Math.min(data.total / 10, 1),
      occurrences:    data.total,
      lastSeenAt:     data.lastSeenAt,
    });
  }
}