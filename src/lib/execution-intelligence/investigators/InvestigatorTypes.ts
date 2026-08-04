/**
 * InvestigatorTypes.ts — EI-07 (RFC-008 / ADR-015)
 *
 * Contrato dos Investigators: componentes puros que INSPECTIONAM a
 * ExecutionRequest e produzem findings (gaps + risks + paramPatches) sem
 * despachar nem bloquear.
 *
 * EI-06: validators genericos (presenca, formato) — sync, single-pass.
 * EI-07: investigators de dominio (Travel, Email) + iteracao balanceada.
 *   - investigate pode ser async (LLM/cross-connector futuros).
 *   - paramPatches enriquece enrichedParams (merge parcial); se altera params,
 *     a Intelligence itera novamente.
 *   - provides/requires declara o grafo de dependencias (aciclivo, via registry).
 *   - cost reporta consumo de LLM/API para o API/LLM Budget.
 *
 * Invariant ADR-015: investigators so PRODUZEM informacao/enriquecimento. Decidir
 * (freiar) e papel do Safety Gate; despachar e papel do Runtime.
 */

import type { ExecutionGap, ExecutionRequest } from "../ExecutionTypes";

/**
 * Achados de um investigator.
 *  - gaps: campos faltantes/invalidos (nao-bloqueantes; SafetyGate pode exibi-los).
 *  - risks: notas de risco nao-bloqueantes.
 *  - paramPatches (EI-07): overrides parciais mergeados em enrichedParams. Se
 *    non-empty e altera params, a Intelligence itera novamente.
 *  - cost (EI-07): consumo de LLM/API desta chamada (para budget enforcement).
 */
export interface InvestigationFinding {
  readonly gaps: readonly ExecutionGap[];
  readonly risks: readonly string[];
  readonly paramPatches?: Readonly<Record<string, unknown>>;
  readonly cost?: { readonly llmCalls?: number; readonly apiCalls?: number };
}

/**
 * Um investigator. Puro: mesma request (e params correntes) → mesmos findings.
 *  - appliesTo: limita a quais requests roda (undefined = sempre).
 *  - provides/requires (EI-07): declara enriquecimento/dependencia de campos
 *    para o grafo aciclivo do InvestigatorRegistry. B.requires campo X → B roda
 *    depois de qualquer A que A.provides X.
 *  - investigate: sync (EI-06) ou async (EI-07, se chamar LLM/connector).
 */
export interface Investigator {
  readonly id: string;
  readonly description: string;
  readonly appliesTo?: (request: ExecutionRequest) => boolean;
  readonly provides?: readonly string[];
  readonly requires?: readonly string[];
  investigate(request: ExecutionRequest): InvestigationFinding | Promise<InvestigationFinding>;
}