/**
 * ReferenceEvaluation.ts — Sprint C-02.3
 * Relatorio de avaliacao de candidatos — base para o Trust Panel futuro.
 *
 * SRP: registrar todos os candidatos avaliados com seus scores e razoes.
 * Imutavel. Sem logica de negocio.
 */

import type { ReferenceResolutionReason } from "./ReferenceResolutionReason";

export interface EvaluatedCandidate {
  /** Identificador tecnico do recurso */
  readonly resourceId: string;
  /** Nome legivel */
  readonly displayName: string;
  /** Score de confianca [0, 1] */
  readonly score: number;
  /** Razao que determinou este score */
  readonly reason: ReferenceResolutionReason;
  /** Se este candidato foi selecionado como resultado principal */
  readonly selected: boolean;
}

export interface ReferenceEvaluation {
  /** Total de recursos/mensagens avaliados */
  readonly totalEvaluated: number;
  /** Candidatos que obtiveram score > 0 */
  readonly candidateCount: number;
  /** Lista completa de candidatos avaliados (ordenada por score desc) */
  readonly candidates: readonly EvaluatedCandidate[];
  /** Score maximo observado (0 se nenhum match) */
  readonly topScore: number;
  /** Se o limiar minimo foi atingido pelo melhor candidato */
  readonly thresholdMet: boolean;
}