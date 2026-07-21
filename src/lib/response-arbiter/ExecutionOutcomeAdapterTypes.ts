/**
 * ExecutionOutcomeAdapterTypes.ts — Execution Outcome Adapter
 *
 * SRP: contratos puros da camada de adaptacao ExecutionOutcome → ResponseCandidate.
 *
 * Sem logica. Sem rede. Sem efeitos colaterais.
 * Conhece ambos os lados (ExecutionOutcome e ResponseCandidate) apenas como tipos.
 */

import type { ExecutionOutcome, ExecutionDomain } from "./ExecutionOutcomeTypes";
import type { ResponseCandidate, ResponseSource, ExplicitDomain } from "./ResponseCandidate";

// ── Re-exports para conveniencia dos consumidores ─────────────────────────────
export type { ExecutionOutcome, ExecutionDomain, ResponseCandidate, ResponseSource, ExplicitDomain };

// ── AdaptationResult ──────────────────────────────────────────────────────────
// Resultado da adaptacao de um ExecutionOutcome para um ResponseCandidate.

export interface AdaptationResult {
  /** Candidato gerado (null se adaptacao falhou). */
  readonly candidate:        ResponseCandidate | null;
  /** true = adaptacao bem-sucedida. */
  readonly ok:               boolean;
  /** Outcome de origem (referencia para observabilidade). */
  readonly sourceOutcome:    ExecutionOutcome;
  /** Erros ocorridos durante a adaptacao (vazio = sucesso). */
  readonly errors:           readonly AdaptationError[];
  /** Duracao da adaptacao em ms. */
  readonly durationMs:       number;
}

// ── AdaptationError ────────────────────────────────────────────────────────────

export interface AdaptationError {
  readonly field:   string;
  readonly message: string;
}

// ── AdaptationHint ────────────────────────────────────────────────────────────
// Contexto opcional que o caller pode fornecer ao Adapter para enriquecer
// o candidato sem que o Adapter precise conhecer o Pipeline.

export interface AdaptationHint {
  /**
   * Texto da resposta ja sintetizado pelo produtor (ex: pelo ConnectorResultSynthesizer).
   * Quando presente, o Adapter usa este texto como `answer` do candidato.
   * Quando ausente, o Adapter extrai o texto do payload do outcome (best-effort).
   */
  readonly synthesizedAnswer?: string | null;

  /**
   * Override de ResponseSource declarado pelo caller.
   * Quando ausente, o Adapter deriva a source a partir de outcome.producer.
   */
  readonly sourceOverride?: ResponseSource;
}

// ── DomainMapping ─────────────────────────────────────────────────────────────
// Contrato de mapeamento de ExecutionDomain → ExplicitDomain.
// O Adapter usa este contrato para converter sem hardcode.

export type DomainMapping = Readonly<Record<ExecutionDomain, ExplicitDomain>>;