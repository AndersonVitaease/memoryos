/**
 * ResponseArbiter.ts — Response Arbiter Foundation
 *
 * SRP: recebe multiplos ResponseCandidates e decide qual sera entregue
 *      ao usuario, sem conhecer os detalhes de nenhum produtor.
 *
 * Estrategia de selecao (por precedencia, em ordem decrescente):
 *
 *   1. DOMAIN_MATCH — candidato com explicitDomain que corresponde ao
 *      dominio detectado na requisicao + handled=true + executionSucceeded=true.
 *      Garante que uma resposta do GitHub nunca e substituida por Drive, etc.
 *
 *   2. HANDLED_HIGH_CONFIDENCE — candidato com handled=true e confidence >= 0.7.
 *      Producao deterministica independente de dominio.
 *
 *   3. HANDLED_ANY — qualquer candidato com handled=true, ordenado por confidence
 *      descrescente.
 *
 *   4. NULL_CANDIDATE — nenhum produtor tratou a requisicao.
 *
 * Principios:
 *   - Sem efeitos colaterais. Funcao pura: mesmos inputs => mesmo output.
 *   - Sem conhecimento de Connector, Pipeline ou Gateway.
 *   - Sem chamadas de rede.
 *   - Imutabilidade: o candidato selecionado nao e modificado.
 *
 * Nao altera ConversationPipeline, GoalRegistry, Planner, Runtime ou Gateway.
 */

import type { ResponseCandidate, ExplicitDomain } from "./ResponseCandidate";
import { NULL_CANDIDATE } from "./ResponseCandidate";

// ── ArbitrationResult ─────────────────────────────────────────────────────────

export type SelectionReason =
  | "domain_match"          // candidato com dominio explicitamente correspondente
  | "handled_high_confidence" // handled=true + confidence >= 0.7
  | "handled_any"           // handled=true, melhor confidence disponivel
  | "null_fallback";        // nenhum candidato elegivel

export interface ArbitrationResult {
  /** Candidato selecionado (nunca undefined — pode ser NULL_CANDIDATE). */
  readonly selected:   ResponseCandidate;
  /** Razao pela qual este candidato foi escolhido. */
  readonly reason:     SelectionReason;
  /** Todos os candidatos recebidos, para observabilidade. */
  readonly candidates: readonly ResponseCandidate[];
  /** Quantos candidatos foram recebidos. */
  readonly totalCount: number;
  /** Quantos candidatos tinham handled=true. */
  readonly handledCount: number;
  /** Duracao da arbitragem em ms. */
  readonly durationMs: number;
}

// ── ArbitrationContext ────────────────────────────────────────────────────────
// Contexto opcional que o Pipeline pode fornecer ao Arbiter.
// Permite arbitragem ciente de dominio sem acoplar o Arbiter ao Pipeline.

export interface ArbitrationContext {
  /**
   * Dominio esperado para esta requisicao (detectado por router/gateway).
   * null = desconhecido / nao aplicavel.
   */
  readonly preferredDomain: ExplicitDomain;
  /** Mensagem original do usuario (para logs/observabilidade). */
  readonly userMessage?: string;
  /** Session ID (para correlacao de traces). */
  readonly sessionId?: string;
}

// ── ResponseArbiter ───────────────────────────────────────────────────────────

export class ResponseArbiter {

  /**
   * Seleciona o melhor candidato entre os fornecidos.
   *
   * @param candidates  Lista de candidatos produzidos pelo pipeline.
   *                    Pode ser vazia — retorna NULL_CANDIDATE.
   * @param context     Contexto opcional para arbitragem ciente de dominio.
   * @returns           ArbitrationResult imutavel com o candidato selecionado.
   */
  arbitrate(
    candidates: readonly ResponseCandidate[],
    context: ArbitrationContext = { preferredDomain: null },
  ): ArbitrationResult {
    const t0 = Date.now();

    const handledCandidates = candidates.filter((c) => c.handled);
    const totalCount        = candidates.length;
    const handledCount      = handledCandidates.length;

    // ── 1. DOMAIN_MATCH ──────────────────────────────────────────────────────
    if (context.preferredDomain !== null) {
      const domainMatch = handledCandidates
        .filter(
          (c) =>
            c.explicitDomain === context.preferredDomain &&
            c.executionSucceeded === true,
        )
        .sort(_byConfidenceDesc)[0] ?? null;

      if (domainMatch) {
        return _result(domainMatch, "domain_match", candidates, totalCount, handledCount, t0);
      }
    }

    // ── 2. HANDLED_HIGH_CONFIDENCE ───────────────────────────────────────────
    const highConfidence = handledCandidates
      .filter((c) => c.confidence >= 0.7)
      .sort(_byConfidenceDesc)[0] ?? null;

    if (highConfidence) {
      return _result(highConfidence, "handled_high_confidence", candidates, totalCount, handledCount, t0);
    }

    // ── 3. HANDLED_ANY ───────────────────────────────────────────────────────
    const bestHandled = handledCandidates.sort(_byConfidenceDesc)[0] ?? null;

    if (bestHandled) {
      return _result(bestHandled, "handled_any", candidates, totalCount, handledCount, t0);
    }

    // ── 4. NULL_FALLBACK ─────────────────────────────────────────────────────
    return _result(NULL_CANDIDATE, "null_fallback", candidates, totalCount, handledCount, t0);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _byConfidenceDesc(a: ResponseCandidate, b: ResponseCandidate): number {
  return b.confidence - a.confidence;
}

function _result(
  selected:     ResponseCandidate,
  reason:       SelectionReason,
  candidates:   readonly ResponseCandidate[],
  totalCount:   number,
  handledCount: number,
  t0:           number,
): ArbitrationResult {
  return Object.freeze({
    selected,
    reason,
    candidates,
    totalCount,
    handledCount,
    durationMs: Date.now() - t0,
  });
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// HMR-safe via globalThis.

const _KEY = "__RESPONSE_ARBITER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ResponseArbiter();
}

export const responseArbiter: ResponseArbiter = (
  globalThis as unknown as Record<string, ResponseArbiter>
)[_KEY];