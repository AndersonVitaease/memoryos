/**
 * ExecutionIntelligence.ts — EI-07 (RFC-008 / ADR-015)
 *
 * Camada que enriquece a requisicao ANTES do Safety Gate, produzindo a melhor
 * execucao possivel com o contexto disponivel.
 *
 * Hoje (EI-07): iteracao balanceada. Cada iteracao resolve os investigators
 * ativos aplicaveis (em ordem topologica — grafo aciclico), executa-os, agrega
 * gaps/risks e mergeia paramPatches em enrichedParams. Se params mudaram, itera
 * novamente (novos params podem destravar novos investigators). 3 travas:
 *  - Convergence Budget: max N iteracoes (budget.maxIterations).
 *  - API/LLM Budget: max LLM/API calls acumulados (cost reportado pelos
 *    investigators; budget.maxLlmCalls/maxApiCalls). Esgotado, para e pede o
 *    que falta ao usuario (via risks).
 *  - Dependency Graph aciclico: garantido no InvestigatorRegistry (register).
 *
 * Com registry vazio, behavior == pass-through (gaps=[], risks=[],
 * enrichedParams = copia de request.params) — paridade com EI-06 preservada.
 *
 * EI-07 investigators de dominio (Travel, Email) sao deterministicos hoje (sem
 * LLM/cross-connector); o hook cost/paramPatches fica pronto para enriquecimento
 * real pos-migracao de callers. A assinatura publica `prepare(request) →
 * Promise<PreparedExecution>` (async desde EI-07) e estavel.
 *
 * Invariant ADR-015: a Intelligence NUNCA despacha e NUNCA bloqueia — so
 * enriquece e sinaliza. Decidir e papel do Safety Gate; despachar e papel do
 * Runtime.
 */

import { DEFAULT_BUDGET } from "./ExecutionTypes";
import type { ExecutionGap, ExecutionRequest, IntelligenceBudget, PreparedExecution } from "./ExecutionTypes";
import { investigatorRegistry } from "./investigators/InvestigatorRegistry";

/**
 * EF — Unified Step Intelligence: helper reutilizavel que produz enrichedParams
 * a partir de uma ExecutionRequest, iterando investigators ativos ate convergir
 * ou esgotar budget. Reutilizado por:
 *   - ExecutionIntelligence.prepare() (single-step, em ExecutionRuntime.processCapability)
 *   - ExecutionDispatcher._enrichStepOnce() (multi-step, per-step no dispatch)
 * Garante que o enriquecimento roda EXATAMENTE UMA vez por step, em ambos os paths,
 * sem duplicar a logica de investigators/convergence/gaps/risks.
 *
 * Com registry vazio: pass-through (enrichedParams = copia de request.params,
 * gaps=[], risks=[]). Assincrona desde EI-07 (investigators podem ser async).
 */
export async function enrichExecutionRequest(
  request: ExecutionRequest,
  budget: IntelligenceBudget = DEFAULT_BUDGET,
): Promise<{
  enrichedParams: Record<string, unknown>;
  gaps: readonly ExecutionGap[];
  risks: readonly string[];
}> {
  let currentParams: Record<string, unknown> = { ...request.params };
  let llmUsed = 0;
  let apiUsed = 0;
  const risks: string[] = [];
  let finalGaps: ExecutionGap[] = [];
  let budgetExhausted = false;

  for (let iter = 0; iter < budget.maxIterations && !budgetExhausted; iter++) {
    const workingRequest: ExecutionRequest = { ...request, params: currentParams };
    const investigators = investigatorRegistry.resolve(workingRequest);

    const iterGaps: ExecutionGap[] = [];
    let changed = false;

    for (const inv of investigators) {
      const finding = await inv.investigate(workingRequest);

      // API/LLM Budget: acumula e verifica.
      if (finding.cost) {
        llmUsed += finding.cost.llmCalls ?? 0;
        apiUsed += finding.cost.apiCalls ?? 0;
      }
      if (llmUsed > budget.maxLlmCalls || apiUsed > budget.maxApiCalls) {
        risks.push(
          "API/LLM Budget esgotado — investigacao interrompida; gaps remanescentes exigidos ao usuario.",
        );
        budgetExhausted = true;
        break;
      }

      for (const g of finding.gaps) {
        if (!iterGaps.some((x) => x.field === g.field && x.reason === g.reason)) iterGaps.push(g);
      }
      for (const r of finding.risks) {
        if (!risks.includes(r)) risks.push(r);
      }

      if (finding.paramPatches) {
        const next = { ...currentParams, ...finding.paramPatches };
        if (JSON.stringify(next) !== JSON.stringify(currentParams)) {
          currentParams = next;
          changed = true;
        }
      }
    }

    finalGaps = iterGaps;
    if (!changed) break; // convergiu
  }

  return { enrichedParams: currentParams, gaps: finalGaps, risks };
}

export class ExecutionIntelligence {
  private _prepareCount = 0;
  private readonly _budget: IntelligenceBudget;

  constructor(budget: IntelligenceBudget = DEFAULT_BUDGET) {
    this._budget = budget;
  }

  /**
   * Produz o PreparedExecution a partir da request, iterando investigators ativos
   * ate convergir (sem patches) ou esgotar Convergence/API/LLM Budget.
   */
  async prepare(request: ExecutionRequest): Promise<PreparedExecution> {
    this._prepareCount += 1;
    // EF — delega ao helper compartilhado (usado tambem pelo Dispatcher per-step).
    // Single-step: enriquece UMA vez aqui; o Dispatcher fara bypass via origin.
    const { enrichedParams, gaps, risks } = await enrichExecutionRequest(request, this._budget);
    return { request, enrichedParams, gaps, risks };
  }

  /** Estatistica de instrumentation (diagnostico local). */
  stats(): { prepareCount: number } {
    return { prepareCount: this._prepareCount };
  }
}