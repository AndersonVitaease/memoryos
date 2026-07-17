/**
 * ReferenceSorter.ts — Sprint C-02.4
 * Responsabilidade unica: ordenar candidatos de forma deterministica.
 *
 * Nao calcula score. Nao conhece Connectors. Nao aplica politica.
 * Criterios de ordenacao:
 *   1. score desc
 *   2. ordem original (indice de insercao) asc — garante estabilidade
 */

import type { ScoredCandidate } from "./ReferenceScoringResult";

export class ReferenceSorter {
  /**
   * Retorna nova array ordenada — nunca muta a entrada.
   * Ordenacao estavel: mesmos scores preservam ordem original.
   */
  sort(candidates: ScoredCandidate[]): ScoredCandidate[] {
    return candidates
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        if (b.c.confidence !== a.c.confidence) return b.c.confidence - a.c.confidence;
        return a.i - b.i; // preserva ordem original para empates
      })
      .map(({ c }) => c);
  }
}

/** Singleton — stateless, safe to share */
export const referenceSorter = new ReferenceSorter();