/**
 * ExecutionIntelligence.ts — EI-05 (RFC-008 / ADR-015)
 *
 * Camada que enriquece a requisicao ANTES do Safety Gate, produzindo a melhor
 * execucao possivel com o contexto disponivel.
 *
 * Hoje (EI-06): roda os investigators ativos aplicaveis (InvestigatorRegistry)
 * e agrega seus findings (gaps + risks) no PreparedExecution. Nao enriquece
 * params (isso sera EI-07) — so sinaliza. Com registry vazio, behavior ==
 * EI-05 (gaps=[], risks=[]) — paridade preservada.
 *
 * EI-07 adicionara investigators de dominio (Travel, Email) + iteracao
 * balanceada (Convergence/API/LLM Budget, Dependency Graph aciclico). A
 * assinatura publica `prepare(request) → PreparedExecution` nao muda.
 *
 * Componente puro: stateless, sem dependencias externas (so o registry). A
 * Intelligence nunca despacha nem bloqueia — so coleta informacao. Decidir
 * e papel do Safety Gate; despachar e papel do Runtime.
 *
 * Invariant ADR-015: a Intelligence NUNCA despacha e NUNCA bloqueia — so
 * enriquece. Decidir (freiar) e papel do Safety Gate; despachar e papel do
 * Runtime. A Intelligence produz informacao; os outros dois consomem.
 */

import type { ExecutionGap, ExecutionRequest, PreparedExecution } from "./ExecutionTypes";
import { investigatorRegistry } from "./investigators/InvestigatorRegistry";

export class ExecutionIntelligence {
  /** Contador de instrumentation (in-memory, so para observabilidade local). */
  private _prepareCount = 0;

  /**
   * Produz o PreparedExecution a partir da request.
   *
   * EI-06: resolve os investigators ativos aplicaveis a request, executa cada
   * um (single pass, sincrono), agrega gaps + risks. enrichedParams continua
   * request.params (EI-06 nao enriquece — so sinaliza). Com registry vazio,
   * devolve o PreparedExecution identico ao EI-05 (paridade).
   *
   * Invariant: nunca despacha, nunca bloqueia. Os gaps/risks ficam no
   * PreparedExecution; o SafetyGate pode inclui-los no resumo de
   * needs_confirmation; policies futuras podem transforma-los em `blocked`.
   */
  prepare(request: ExecutionRequest): PreparedExecution {
    this._prepareCount += 1;
    const investigators = investigatorRegistry.resolve(request);
    const gaps: ExecutionGap[] = [];
    const risks: string[] = [];
    for (const inv of investigators) {
      const finding = inv.investigate(request);
      for (const g of finding.gaps) gaps.push(g);
      for (const r of finding.risks) risks.push(r);
    }
    return {
      request,
      enrichedParams: request.params,
      gaps,
      risks,
    };
  }

  /** Estatistica de instrumentation (diagnostico local). */
  stats(): { prepareCount: number } {
    return { prepareCount: this._prepareCount };
  }
}