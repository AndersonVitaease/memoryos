/**
 * ExecutionOutcomeFactory.ts — Execution Outcome Foundation
 *
 * SRP: unico ponto de criacao de ExecutionOutcome.
 *
 * Responsabilidades:
 *   - Gerar id unico
 *   - Calcular durationMs a partir de startedAt/finishedAt
 *   - Normalizar ExecutionCost (clamp, defaults, estimatedCost calculado)
 *   - Normalizar ExecutionConfidence (clamp score e producerConfidence)
 *   - Garantir coerencia de invariants (success/errorType, handled/payload)
 *   - Retornar Object.freeze() em todos os niveis
 *   - Validar invariants e retornar erros sem lancar excecoes
 *
 * Sem efeitos colaterais. Sem rede. Sem dependencias de Pipeline ou Connector.
 */

import type {
  ExecutionOutcome,
  ExecutionOutcomeInput,
  ExecutionCost,
  ExecutionConfidence,
  OutcomeValidationError,
} from "./ExecutionOutcomeTypes";

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
function makeOutcomeId(): string {
  return `eo-${Date.now()}-${(++_seq).toString(36)}`;
}

// ── Normalization helpers ─────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, isFinite(v) ? v : 0));
}

function clampNonNeg(v: number): number {
  return Math.max(0, isFinite(v) ? v : 0);
}

/**
 * Calcula estimatedCost adimensional:
 *   cacheHit           → 0
 *   apiCalls === 0     → 0
 *   apiCalls === 1     → 1
 *   apiCalls > 1       → apiCalls (chamadas encadeadas custam proporcional)
 */
function calcEstimatedCost(apiCalls: number, cacheHit: boolean): number {
  if (cacheHit) return 0;
  return clampNonNeg(apiCalls);
}

function normalizeCost(input: ExecutionOutcomeInput["cost"]): ExecutionCost {
  const apiCalls           = clampNonNeg(input.apiCalls ?? 0);
  const cacheHit           = input.cacheHit ?? false;
  const estimatedLatencyMs = clampNonNeg(input.estimatedLatencyMs ?? 0);
  const estimatedCost      = calcEstimatedCost(apiCalls, cacheHit);

  return Object.freeze<ExecutionCost>({
    apiCalls,
    cacheHit,
    estimatedCost,
    estimatedLatencyMs,
  });
}

function normalizeConfidence(input: ExecutionOutcomeInput["confidence"]): ExecutionConfidence {
  return Object.freeze<ExecutionConfidence>({
    score:              clamp01(input.score),
    reason:             input.reason?.trim() || "unspecified",
    producerConfidence: clamp01(input.producerConfidence),
  });
}

// ── Invariant validation ──────────────────────────────────────────────────────

function validate(input: ExecutionOutcomeInput): OutcomeValidationError[] {
  const errors: OutcomeValidationError[] = [];

  if (!input.producer) {
    errors.push({ field: "producer", message: "producer is required" });
  }
  if (!isFinite(input.startedAt) || input.startedAt <= 0) {
    errors.push({ field: "startedAt", message: "startedAt must be a positive epoch ms" });
  }
  if (!isFinite(input.finishedAt) || input.finishedAt <= 0) {
    errors.push({ field: "finishedAt", message: "finishedAt must be a positive epoch ms" });
  }
  if (isFinite(input.startedAt) && isFinite(input.finishedAt) && input.finishedAt < input.startedAt) {
    errors.push({ field: "finishedAt", message: "finishedAt must be >= startedAt" });
  }
  if (input.success && input.errorType !== "none") {
    errors.push({ field: "errorType", message: "errorType must be 'none' when success=true" });
  }
  if (!input.success && input.errorType === "none") {
    errors.push({ field: "errorType", message: "errorType must not be 'none' when success=false" });
  }
  if (!input.success && !input.errorMessage?.trim()) {
    errors.push({ field: "errorMessage", message: "errorMessage is required when success=false" });
  }

  return errors;
}

// ── ExecutionOutcomeFactory ───────────────────────────────────────────────────

export interface OutcomeCreationResult {
  /** O outcome criado (null se validacao falhou). */
  readonly outcome:          ExecutionOutcome | null;
  /** Erros de validacao (vazio = sucesso). */
  readonly validationErrors: readonly OutcomeValidationError[];
  /** true = outcome foi criado com sucesso. */
  readonly ok:               boolean;
}

export class ExecutionOutcomeFactory {

  /**
   * Cria um ExecutionOutcome imutavel a partir do input fornecido.
   *
   * Nunca lanca excecao.
   * Se o input violar invariants, retorna ok=false com validationErrors.
   */
  create(input: ExecutionOutcomeInput): OutcomeCreationResult {
    const errors = validate(input);
    if (errors.length > 0) {
      return Object.freeze({ outcome: null, validationErrors: errors, ok: false });
    }

    const startedAt  = input.startedAt;
    const finishedAt = input.finishedAt;
    const durationMs = finishedAt - startedAt;

    const outcome: ExecutionOutcome = Object.freeze({
      id:            makeOutcomeId(),
      producer:      input.producer,
      startedAt,
      finishedAt,
      durationMs:    clampNonNeg(durationMs),
      success:       input.success,
      errorType:     input.errorType,
      errorMessage:  input.success ? null : (input.errorMessage ?? null),
      executionCost: normalizeCost(input.cost),
      domain:        input.domain,
      capability:    input.capability ?? null,
      confidence:    normalizeConfidence(input.confidence),
      payload:       input.payload ?? null,
      metadata:      Object.freeze({ ...input.metadata }),
    });

    return Object.freeze({ outcome, validationErrors: [], ok: true });
  }

  /**
   * Cria um outcome de sucesso com defaults convenientes.
   * Util para produtores que nao precisam preencher todos os campos.
   */
  createSuccess(
    partial: Pick<ExecutionOutcomeInput, "producer" | "domain" | "payload"> &
      Partial<ExecutionOutcomeInput>,
  ): OutcomeCreationResult {
    const now = Date.now();
    return this.create({
      producer:     partial.producer,
      startedAt:    partial.startedAt ?? now,
      finishedAt:   partial.finishedAt ?? now,
      success:      true,
      errorType:    "none",
      errorMessage: null,
      domain:       partial.domain,
      capability:   partial.capability ?? null,
      payload:      partial.payload,
      metadata:     partial.metadata ?? {},
      cost: {
        apiCalls:           partial.cost?.apiCalls ?? 1,
        cacheHit:           partial.cost?.cacheHit ?? false,
        estimatedLatencyMs: partial.cost?.estimatedLatencyMs ?? 0,
      },
      confidence: {
        score:              partial.confidence?.score ?? 0.9,
        reason:             partial.confidence?.reason ?? "execution succeeded",
        producerConfidence: partial.confidence?.producerConfidence ?? 0.9,
      },
    });
  }

  /**
   * Cria um outcome de falha com defaults convenientes.
   */
  createFailure(
    partial: Pick<ExecutionOutcomeInput, "producer" | "domain"> &
      Partial<ExecutionOutcomeInput> & {
        errorType:    ExecutionOutcomeInput["errorType"];
        errorMessage: string;
      },
  ): OutcomeCreationResult {
    const now = Date.now();
    return this.create({
      producer:     partial.producer,
      startedAt:    partial.startedAt ?? now,
      finishedAt:   partial.finishedAt ?? now,
      success:      false,
      errorType:    partial.errorType,
      errorMessage: partial.errorMessage,
      domain:       partial.domain,
      capability:   partial.capability ?? null,
      payload:      null,
      metadata:     partial.metadata ?? {},
      cost: {
        apiCalls:           partial.cost?.apiCalls ?? 1,
        cacheHit:           false,
        estimatedLatencyMs: partial.cost?.estimatedLatencyMs ?? 0,
      },
      confidence: {
        score:              partial.confidence?.score ?? 0,
        reason:             partial.confidence?.reason ?? `error: ${partial.errorType}`,
        producerConfidence: partial.confidence?.producerConfidence ?? 0,
      },
    });
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__EXECUTION_OUTCOME_FACTORY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ExecutionOutcomeFactory();
}

export const executionOutcomeFactory: ExecutionOutcomeFactory = (
  globalThis as unknown as Record<string, ExecutionOutcomeFactory>
)[_KEY];