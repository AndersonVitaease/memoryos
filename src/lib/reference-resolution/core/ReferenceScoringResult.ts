/**
 * ReferenceScoringResult.ts — Sprint C-02.4
 * Contrato de saida do ReferenceScoringEngine.
 *
 * Independente de Connector, Telemetria e ResolutionResult.
 * Imutavel.
 */

import type { ReferenceResolutionReason } from "./ReferenceResolutionReason";
import type { ReferenceEvaluation, EvaluatedCandidate } from "./ReferenceEvaluation";

export interface ScoredCandidate {
  readonly resourceId:   string;
  readonly displayName:  string;
  readonly confidence:   number;
  readonly reason:       ReferenceResolutionReason;
}

export interface ReferenceScoringResult {
  /** Candidato vencedor, ou null se nenhum encontrado */
  readonly selected:            ScoredCandidate | null;
  /** Lista ordenada de candidatos com score > 0 */
  readonly candidates:          readonly ScoredCandidate[];
  /** Relatorio detalhado para auditoria (Trust Panel) */
  readonly evaluation:          Readonly<ReferenceEvaluation>;
  /** Razao da selecao — Explainability */
  readonly reason:              ReferenceResolutionReason;
  /** Score do candidato vencedor (0 se nenhum) */
  readonly confidence:          number;
  /** true quando confidence < minimumConfidence */
  readonly confirmationRequired: boolean;
}