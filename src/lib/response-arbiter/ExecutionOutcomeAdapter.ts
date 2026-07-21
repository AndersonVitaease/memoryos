/**
 * ExecutionOutcomeAdapter.ts — Execution Outcome Adapter
 *
 * SRP: converte um ExecutionOutcome em um ResponseCandidate.
 *
 * Esta e a unica camada que conhece ambos os contratos.
 * Encapsula todo o mapeamento entre ExecutionOutcome e ResponseCandidate,
 * eliminando logica de conversao dispersa no Pipeline.
 *
 * Principios:
 *   - Funcao pura: mesmos inputs => mesmo output.
 *   - Sem efeitos colaterais.
 *   - Sem chamadas de rede.
 *   - Sem conhecimento de Pipeline, Connector, Gateway ou Runtime.
 *   - Imutabilidade: todos os outputs sao Object.freeze().
 *
 * Estrategia de mapeamento:
 *
 *   outcome.success=true  + payload presente  → handled=true,  executionSucceeded=true
 *   outcome.success=false                      → handled=true,  executionSucceeded=false
 *                                                (erro e uma resposta valida para o Arbiter)
 *   outcome.success=true  + payload=null       → handled=false, executionSucceeded=true
 *                                                (execucao ok mas sem dados = nao tratado)
 *
 *   answer = hint.synthesizedAnswer ?? _extractFromPayload(outcome.payload)
 */

import type {
  AdaptationResult,
  AdaptationError,
  AdaptationHint,
  DomainMapping,
} from "./ExecutionOutcomeAdapterTypes";
import type { ExecutionOutcome, ExecutionDomain } from "./ExecutionOutcomeTypes";
import type { ResponseSource, ExplicitDomain } from "./ResponseCandidate";
import { createResponseCandidate } from "./ResponseCandidate";

// ── Domain mapping ────────────────────────────────────────────────────────────
// ExecutionDomain → ExplicitDomain
// "unknown" em ExecutionOutcome → null em ResponseCandidate (sem dominio declarado)

const DOMAIN_MAP: DomainMapping = Object.freeze({
  github:          "github",
  gmail:           "gmail",
  google_drive:    "google_drive",
  google_calendar: "google_calendar",
  memory:          "memory",
  general:         "general",
  unknown:         null,
} as Record<ExecutionDomain, ExplicitDomain>);

// ── Producer → ResponseSource mapping ────────────────────────────────────────

const PRODUCER_SOURCE_MAP: Record<ExecutionOutcome["producer"], ResponseSource> = Object.freeze({
  cognitive_gateway: "cognitive_gateway",
  connector_runtime: "connector_runtime",
  llm_reasoning:     "llm_reasoning",
  static_analysis:   "static_analysis",
  goal_bridge:       "goal_bridge_fallback",
  unknown:           "unknown",
});

// ── Answer extraction ─────────────────────────────────────────────────────────
// Best-effort: tenta extrair texto legivel do payload bruto.
// Nunca lanca excecao.

function _extractAnswer(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    // Campos comuns de resposta sintetizada
    for (const key of ["answer", "response", "text", "content", "message", "narrative"]) {
      if (typeof p[key] === "string" && (p[key] as string).trim()) {
        return (p[key] as string).trim();
      }
    }
  }
  return null;
}

// ── Handled/answer resolution ─────────────────────────────────────────────────

function _resolveHandledAndAnswer(
  outcome: ExecutionOutcome,
  hint:    AdaptationHint,
): { handled: boolean; answer: string | null; executionSucceeded: boolean | null } {
  const synthesized = hint.synthesizedAnswer?.trim() || null;
  const fromPayload = _extractAnswer(outcome.payload);
  const answer      = synthesized ?? fromPayload;

  if (!outcome.success) {
    // Execucao falhou: resposta de erro e uma resposta valida
    const errorAnswer = answer ?? outcome.errorMessage ?? "Operacao nao concluida.";
    return { handled: true, answer: errorAnswer, executionSucceeded: false };
  }

  if (answer) {
    // Execucao bem-sucedida com resposta disponivel
    return { handled: true, answer, executionSucceeded: true };
  }

  // Execucao bem-sucedida mas sem dados para apresentar
  return { handled: false, answer: null, executionSucceeded: true };
}

// ── ExecutionOutcomeAdapter ───────────────────────────────────────────────────

export class ExecutionOutcomeAdapter {

  /**
   * Converte um ExecutionOutcome em um ResponseCandidate.
   *
   * @param outcome  O outcome produzido por qualquer executor do sistema.
   * @param hint     Contexto opcional do caller (resposta sintetizada, source override).
   * @returns        AdaptationResult imutavel.
   */
  adapt(
    outcome: ExecutionOutcome,
    hint: AdaptationHint = {},
  ): AdaptationResult {
    const t0 = Date.now();

    // ── Validacao minima ──────────────────────────────────────────────────────
    const errors: AdaptationError[] = [];
    if (!outcome?.id) {
      errors.push({ field: "outcome.id", message: "outcome.id is required" });
    }
    if (!outcome?.producer) {
      errors.push({ field: "outcome.producer", message: "outcome.producer is required" });
    }

    if (errors.length > 0) {
      return Object.freeze({
        candidate:     null,
        ok:            false,
        sourceOutcome: outcome,
        errors,
        durationMs:    Date.now() - t0,
      });
    }

    // ── Mapeamento de campos ──────────────────────────────────────────────────
    const source: ResponseSource =
      hint.sourceOverride ?? PRODUCER_SOURCE_MAP[outcome.producer] ?? "unknown";

    const explicitDomain: ExplicitDomain = DOMAIN_MAP[outcome.domain] ?? null;

    const { handled, answer, executionSucceeded } = _resolveHandledAndAnswer(outcome, hint);

    const candidate = createResponseCandidate({
      source,
      explicitDomain,
      confidence:         outcome.confidence.score,
      handled,
      executionSucceeded,
      executionCost:      outcome.executionCost.estimatedCost,
      answer,
    });

    return Object.freeze({
      candidate,
      ok:            true,
      sourceOutcome: outcome,
      errors:        [],
      durationMs:    Date.now() - t0,
    });
  }

  /**
   * Converte um array de ExecutionOutcomes em ResponseCandidates.
   * Outcomes que falham na adaptacao sao omitidos do resultado (nao lancam excecao).
   *
   * @param outcomes  Lista de outcomes.
   * @param hint      Hint compartilhado aplicado a todos os outcomes.
   * @returns         Array de AdaptationResults (um por outcome).
   */
  adaptMany(
    outcomes: readonly ExecutionOutcome[],
    hint: AdaptationHint = {},
  ): readonly AdaptationResult[] {
    return Object.freeze(outcomes.map((o) => this.adapt(o, hint)));
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__EXECUTION_OUTCOME_ADAPTER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ExecutionOutcomeAdapter();
}

export const executionOutcomeAdapter: ExecutionOutcomeAdapter = (
  globalThis as unknown as Record<string, ExecutionOutcomeAdapter>
)[_KEY];