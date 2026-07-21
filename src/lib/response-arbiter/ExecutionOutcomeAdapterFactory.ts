/**
 * ExecutionOutcomeAdapterFactory.ts — Execution Outcome Adapter
 *
 * SRP: ponto unico de construcao de AdaptationResults a partir de
 *      inputs de alto nivel, sem que o caller precise montar
 *      ExecutionOutcome e AdaptationHint manualmente.
 *
 * Casos de uso:
 *   - Pipeline quer adaptar resultado do ConnectorRuntime → candidato
 *   - Gateway quer adaptar resposta cognitiva → candidato
 *   - LLM path quer registrar resposta → candidato
 *
 * O Factory orquestra:
 *   1. ExecutionOutcomeFactory.create()  →  ExecutionOutcome
 *   2. ExecutionOutcomeAdapter.adapt()   →  AdaptationResult
 *
 * Sem efeitos colaterais. Sem rede. Sem dependencias de Pipeline ou Connector.
 */

import type { ExecutionOutcomeInput } from "./ExecutionOutcomeTypes";
import type { AdaptationHint, AdaptationResult } from "./ExecutionOutcomeAdapterTypes";
import { executionOutcomeFactory } from "./ExecutionOutcomeFactory";
import { executionOutcomeAdapter }  from "./ExecutionOutcomeAdapter";

// ── AdapterFactoryInput ───────────────────────────────────────────────────────
// Input unificado: campos do ExecutionOutcomeInput + hint opcional.

export type AdapterFactoryInput = ExecutionOutcomeInput & {
  readonly hint?: AdaptationHint;
};

// ── AdapterFactoryResult ──────────────────────────────────────────────────────

export interface AdapterFactoryResult extends AdaptationResult {
  /** true = tanto a criacao do outcome quanto a adaptacao foram bem-sucedidas. */
  readonly ok: boolean;
  /** Erros da criacao do outcome (validacao do factory). */
  readonly outcomeErrors: readonly { field: string; message: string }[];
}

// ── ExecutionOutcomeAdapterFactory ────────────────────────────────────────────

export class ExecutionOutcomeAdapterFactory {

  /**
   * Caminho completo: input bruto → ExecutionOutcome → ResponseCandidate.
   *
   * Nunca lanca excecao.
   * Se a criacao do outcome falhar, ok=false com outcomeErrors preenchido.
   * Se a adaptacao falhar, ok=false com errors preenchido.
   */
  fromInput(input: AdapterFactoryInput): AdapterFactoryResult {
    // ── Passo 1: criar o ExecutionOutcome ────────────────────────────────────
    const { hint, ...outcomeInput } = input;
    const outcomeResult = executionOutcomeFactory.create(outcomeInput as ExecutionOutcomeInput);

    if (!outcomeResult.ok || !outcomeResult.outcome) {
      // Fabricacao falhou — retorna resultado de falha sem tentar adaptar
      return Object.freeze({
        candidate:     null,
        ok:            false,
        sourceOutcome: null as never, // outcome nao existe
        errors:        [],
        outcomeErrors: outcomeResult.validationErrors,
        durationMs:    0,
      });
    }

    // ── Passo 2: adaptar para ResponseCandidate ───────────────────────────────
    const adaptResult = executionOutcomeAdapter.adapt(outcomeResult.outcome, hint ?? {});

    return Object.freeze({
      ...adaptResult,
      ok:            adaptResult.ok,
      outcomeErrors: [],
    });
  }

  /**
   * Atalho para outcomes de sucesso com conector.
   * O caller fornece apenas o essencial; o Factory preenche os defaults.
   */
  fromConnectorSuccess(args: {
    producer:          ExecutionOutcomeInput["producer"];
    domain:            ExecutionOutcomeInput["domain"];
    capability:        string;
    payload:           unknown;
    durationMs:        number;
    synthesizedAnswer: string;
    metadata?:         Record<string, unknown>;
  }): AdapterFactoryResult {
    const now = Date.now();
    return this.fromInput({
      producer:     args.producer,
      startedAt:    now - args.durationMs,
      finishedAt:   now,
      success:      true,
      errorType:    "none",
      errorMessage: null,
      domain:       args.domain,
      capability:   args.capability,
      payload:      args.payload,
      metadata:     args.metadata ?? {},
      cost: { apiCalls: 1, cacheHit: false, estimatedLatencyMs: args.durationMs },
      confidence: { score: 0.95, reason: "connector returned data", producerConfidence: 0.95 },
      hint: { synthesizedAnswer: args.synthesizedAnswer },
    });
  }

  /**
   * Atalho para outcomes de falha de conector.
   */
  fromConnectorFailure(args: {
    producer:     ExecutionOutcomeInput["producer"];
    domain:       ExecutionOutcomeInput["domain"];
    capability:   string | null;
    errorType:    ExecutionOutcomeInput["errorType"];
    errorMessage: string;
    durationMs:   number;
    metadata?:    Record<string, unknown>;
  }): AdapterFactoryResult {
    const now = Date.now();
    return this.fromInput({
      producer:     args.producer,
      startedAt:    now - args.durationMs,
      finishedAt:   now,
      success:      false,
      errorType:    args.errorType,
      errorMessage: args.errorMessage,
      domain:       args.domain,
      capability:   args.capability,
      payload:      null,
      metadata:     args.metadata ?? {},
      cost: { apiCalls: 1, cacheHit: false, estimatedLatencyMs: args.durationMs },
      confidence: { score: 0, reason: `error: ${args.errorType}`, producerConfidence: 0 },
      hint: { synthesizedAnswer: args.errorMessage },
    });
  }

  /**
   * Atalho para respostas LLM puro (sem conector externo).
   */
  fromLLMReasoning(args: {
    answer:      string;
    durationMs:  number;
    confidence?: number;
    metadata?:   Record<string, unknown>;
  }): AdapterFactoryResult {
    const now = Date.now();
    return this.fromInput({
      producer:     "llm_reasoning",
      startedAt:    now - args.durationMs,
      finishedAt:   now,
      success:      true,
      errorType:    "none",
      errorMessage: null,
      domain:       "general",
      capability:   null,
      payload:      null,
      metadata:     args.metadata ?? {},
      cost: { apiCalls: 0, cacheHit: false, estimatedLatencyMs: args.durationMs },
      confidence: {
        score:              args.confidence ?? 0.7,
        reason:             "llm inference",
        producerConfidence: args.confidence ?? 0.7,
      },
      hint: { synthesizedAnswer: args.answer, sourceOverride: "llm_reasoning" },
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__EXECUTION_OUTCOME_ADAPTER_FACTORY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ExecutionOutcomeAdapterFactory();
}

export const executionOutcomeAdapterFactory: ExecutionOutcomeAdapterFactory = (
  globalThis as unknown as Record<string, ExecutionOutcomeAdapterFactory>
)[_KEY];