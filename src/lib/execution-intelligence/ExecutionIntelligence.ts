/**
 * ExecutionIntelligence.ts — EI-05 (RFC-008 / ADR-015)
 *
 * Camada que enriquece a requisicao ANTES do Safety Gate, produzindo a melhor
 * execucao possivel com o contexto disponivel.
 *
 * Hoje (EI-05): PASS-THROUGH PURO. Recebe a ExecutionRequest e devolve um
 * PreparedExecution identico (enrichedParams = request.params, gaps = [], risks = []).
 * Nao enriquece, nao valida, nao chama LLM, nao chama connectors. So instrumenta.
 *
 * O valor diferencial real vem em EI-06 (investigators genericos) e EI-07
 * (investigators de dominio + iteracao balanceada). EI-05 existe so para
 * ocupar o slot na cadeia com contratos uniformes — quando os investigators
 * chegarem, o Runtime ja estara chamando prepare() → guard() no lugar certo.
 *
 * Componente puro: stateless, sem dependencias. Recebe a request e devolve o
 * PreparedExecution. Investigadores (EI-06/EI-07) serao registraveis/
 * desativaveis (Open/Closed) num InvestigatorRegistry futuro — este modulo
 * sera o orquestrador deles, sem mudar a assinatura publica `prepare()`.
 *
 * Invariant ADR-015: a Intelligence NUNCA despacha e NUNCA bloqueia — so
 * enriquece. Decidir (freiar) e papel do Safety Gate; despachar e papel do
 * Runtime. A Intelligence produz informacao; os outros dois consomem.
 */

import type { ExecutionRequest, PreparedExecution } from "./ExecutionTypes";

export class ExecutionIntelligence {
  /** Contador de instrumentation (in-memory, so para observabilidade local). */
  private _prepareCount = 0;

  /**
   * Produz o PreparedExecution a partir da request.
   *
   * EI-05: pass-through puro. enrichedParams = request.params (mesma ref),
   * gaps = [], risks = []. Nenhuma transformacao.
   *
   * EI-06+ substituira o corpo por chamadas ao InvestigatorRegistry; a
   * assinatura publica `prepare(request) → PreparedExecution` nao muda.
   */
  prepare(request: ExecutionRequest): PreparedExecution {
    this._prepareCount += 1;
    return {
      request,
      enrichedParams: request.params,
      gaps: [],
      risks: [],
    };
  }

  /** Estatistica de instrumentation (diagnostico local). */
  stats(): { prepareCount: number } {
    return { prepareCount: this._prepareCount };
  }
}