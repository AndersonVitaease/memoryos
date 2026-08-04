/**
 * InvestigatorTypes.ts — EI-06 (RFC-008 / ADR-015)
 *
 * Contrato dos Investigators: componentes puros que INSPECTIONAM a ExecutionRequest
 * e produzem findings (gaps + risks) sem despachar nem bloquear.
 *
 * Restricoes do EI-06 (genericos):
 *  - Sem iteracao (single pass — cada investigator roda 1x).
 *  - Sem LLM.
 *  - Sem chamadas cross-connector.
 *  - Registraveis/desativaveis (Open/Closed) via InvestigatorRegistry.
 *
 * Invariant ADR-015: investigators so PRODUZEM informacao. Decidir (freiar) e
 * papel do Safety Gate; despachar e papel do Runtime. Um investigator nunca
 * lanca, nunca rejeita, nunca enriquece params (so sinaliza gaps/risks).
 */

import type { ExecutionGap, ExecutionRequest } from "../ExecutionTypes";

/**
 * Achados de um investigator: gaps (campos faltantes/invalidos) e risks (notas
 * de risco nao-bloqueantes). Ambos opcionais — um investigator pode so reportar
 * gaps, so risks, ou ambos.
 */
export interface InvestigationFinding {
  readonly gaps: readonly ExecutionGap[];
  readonly risks: readonly string[];
}

/**
 * Um investigator generico. Puro: mesma request → mesmos findings (sem side
 * effects, sem estado). `appliesTo` opcional limita a quais requests ele roda
 * (undefined = roda sempre). EI-07 adiciona investigators de dominio com
 * `appliesTo` mais especifico (ex: so para connector "gmail" capability "sendEmail").
 */
export interface Investigator {
  readonly id: string;
  readonly description: string;
  /** Se presente, so roda quando retorna true. Undefined = sempre. */
  readonly appliesTo?: (request: ExecutionRequest) => boolean;
  /** Inspeciona a request e devolve findings. Puro, sincrono (EI-06). */
  investigate(request: ExecutionRequest): InvestigationFinding;
}