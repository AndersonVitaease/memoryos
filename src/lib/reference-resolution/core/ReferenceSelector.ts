/**
 * ReferenceSelector.ts — Sprint C-02.4
 * Responsabilidade unica: selecionar o candidato vencedor.
 *
 * Recebe candidatos ja ordenados.
 * Aplica minimumConfidence e determina confirmationRequired.
 * Nao calcula score. Nao ordena. Nao conhece Connectors.
 */

import type { ScoredCandidate } from "./ReferenceScoringResult";
import type { ReferenceResolutionReason } from "./ReferenceResolutionReason";

export interface SelectionResult {
  readonly winner:              ScoredCandidate | null;
  readonly reason:              ReferenceResolutionReason;
  readonly confirmationRequired: boolean;
}

export class ReferenceSelector {
  /**
   * Seleciona o primeiro candidato da lista ordenada.
   * Se confidence < minimumConfidence → confirmationRequired=true,
   * reason=USER_CONFIRMATION_REQUIRED.
   * Se lista vazia → reason=NO_MATCH.
   */
  select(
    sortedCandidates: ScoredCandidate[],
    minimumConfidence: number,
  ): SelectionResult {
    const winner = sortedCandidates[0] ?? null;

    if (!winner) {
      return Object.freeze({ winner: null, reason: "NO_MATCH", confirmationRequired: false });
    }

    const confirmationRequired = winner.confidence < minimumConfidence;
    const reason: ReferenceResolutionReason = confirmationRequired
      ? "USER_CONFIRMATION_REQUIRED"
      : winner.reason;

    return Object.freeze({ winner, reason, confirmationRequired });
  }
}

/** Singleton — stateless, safe to share */
export const referenceSelector = new ReferenceSelector();