/**
 * LearningScheduler.ts — Sprint EF-51
 *
 * SRP: determinar quando e com quais episódios o LearningEngine deve rodar.
 *
 * Stateless. Sem efeitos colaterais.
 */

import type { Episode } from "./CLTypes";

export interface ScheduleDecision {
  readonly shouldRun: boolean;
  readonly reason: string;
  readonly selectedEpisodes: readonly Episode[];
}

export class LearningScheduler {
  private readonly _minEpisodes: number;
  private readonly _maxBatchSize: number;

  constructor(minEpisodes = 3, maxBatchSize = 100) {
    this._minEpisodes = minEpisodes;
    this._maxBatchSize = maxBatchSize;
  }

  /**
   * Decide whether learning should run given the available episodes.
   */
  schedule(episodes: readonly Episode[]): ScheduleDecision {
    if (episodes.length < this._minEpisodes) {
      return Object.freeze({
        shouldRun: false,
        reason: `Insufficient episodes: ${episodes.length} < ${this._minEpisodes}`,
        selectedEpisodes: Object.freeze([]),
      });
    }

    // Select the most recent batch up to maxBatchSize
    const selected = [...episodes]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, this._maxBatchSize);

    return Object.freeze({
      shouldRun:        true,
      reason:           `Running with ${selected.length} episodes (batch limit: ${this._maxBatchSize})`,
      selectedEpisodes: Object.freeze(selected),
    });
  }
}