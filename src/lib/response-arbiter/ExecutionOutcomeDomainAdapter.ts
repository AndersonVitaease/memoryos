/**
 * ExecutionOutcomeDomainAdapter.ts — Domain Adapter Implementations
 *
 * Implementacoes minimas embutidas (builtin):
 *   - GeneralAdapter  → dominio "general" e "memory"
 *   - UnknownAdapter  → dominio "unknown" e fallback catch-all
 *
 * GitHub, Drive e Gmail serao implementados em Sprints futuras
 * e registrados via ExecutionOutcomeAdapterRegistry.register().
 *
 * Principios:
 *   - Cada adapter e puro e imutavel.
 *   - Sem efeitos colaterais, sem rede.
 *   - Logica de extracao de answer encapsulada por adapter.
 */

import type { ExecutionOutcome, ExecutionDomain } from "./ExecutionOutcomeTypes";
import type { AdaptationResult, AdaptationHint } from "./ExecutionOutcomeAdapterTypes";
import type { IExecutionOutcomeDomainAdapter } from "./ExecutionOutcomeAdapterRegistryTypes";
import type { ResponseSource, ExplicitDomain } from "./ResponseCandidate";
import { createResponseCandidate } from "./ResponseCandidate";

// ── Shared helpers ────────────────────────────────────────────────────────────
// Internos a este modulo — nao exportados.

/** Extrai texto legivel de um payload generico. Nunca lanca excecao. */
function extractAnswer(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    for (const key of ["answer", "response", "text", "content", "message", "narrative"]) {
      if (typeof p[key] === "string" && (p[key] as string).trim()) {
        return (p[key] as string).trim();
      }
    }
  }
  return null;
}

const PRODUCER_SOURCE: Record<ExecutionOutcome["producer"], ResponseSource> = Object.freeze({
  cognitive_gateway: "cognitive_gateway",
  connector_runtime: "connector_runtime",
  llm_reasoning:     "llm_reasoning",
  static_analysis:   "static_analysis",
  goal_bridge:       "goal_bridge_fallback",
  unknown:           "unknown",
});

const DOMAIN_TO_EXPLICIT: Partial<Record<ExecutionDomain, ExplicitDomain>> = Object.freeze({
  github:          "github",
  gmail:           "gmail",
  google_drive:    "google_drive",
  google_calendar: "google_calendar",
  memory:          "memory",
  general:         "general",
  unknown:         null,
});

/** Constroi um AdaptationResult a partir dos valores resolvidos. */
function buildResult(
  outcome:    ExecutionOutcome,
  hint:       AdaptationHint,
  t0:         number,
  explicitDomain: ExplicitDomain,
): AdaptationResult {
  const source: ResponseSource =
    hint.sourceOverride ?? PRODUCER_SOURCE[outcome.producer] ?? "unknown";

  const synthesized = hint.synthesizedAnswer?.trim() || null;
  const fromPayload = extractAnswer(outcome.payload);
  const rawAnswer   = synthesized ?? fromPayload;

  let handled:            boolean;
  let answer:             string | null;
  let executionSucceeded: boolean | null;

  if (!outcome.success) {
    answer             = rawAnswer ?? outcome.errorMessage ?? "Operacao nao concluida.";
    handled            = true;
    executionSucceeded = false;
  } else if (rawAnswer) {
    answer             = rawAnswer;
    handled            = true;
    executionSucceeded = true;
  } else {
    answer             = null;
    handled            = false;
    executionSucceeded = true;
  }

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

// ── GeneralAdapter ────────────────────────────────────────────────────────────
// Cobre dominios "general" e "memory" (LLM puro, memoria interna).

export class GeneralAdapter implements IExecutionOutcomeDomainAdapter {
  readonly domains: readonly ExecutionDomain[] = ["general", "memory"];

  supports(outcome: ExecutionOutcome): boolean {
    return outcome.domain === "general" || outcome.domain === "memory";
  }

  adapt(outcome: ExecutionOutcome, hint: AdaptationHint): AdaptationResult {
    const t0     = Date.now();
    const domain = DOMAIN_TO_EXPLICIT[outcome.domain] ?? null;
    return buildResult(outcome, hint, t0, domain);
  }
}

// ── UnknownAdapter ────────────────────────────────────────────────────────────
// Fallback catch-all: cobre "unknown" e qualquer dominio sem adapter registrado.
// Preserva o explicitDomain mapeado via DOMAIN_TO_EXPLICIT para que o
// ResponseArbiter possa aplicar DOMAIN_MATCH corretamente.

export class UnknownAdapter implements IExecutionOutcomeDomainAdapter {
  readonly domains: readonly ExecutionDomain[] = ["unknown"];

  /** Always returns true — funciona como fallback universal. */
  supports(_outcome: ExecutionOutcome): boolean {
    return true;
  }

  adapt(outcome: ExecutionOutcome, hint: AdaptationHint): AdaptationResult {
    const t0 = Date.now();
    // Resolve explicitDomain from the outcome's domain so DOMAIN_MATCH works.
    // Falls back to null only for truly unknown domains.
    const explicitDomain = DOMAIN_TO_EXPLICIT[outcome.domain] ?? null;
    return buildResult(outcome, hint, t0, explicitDomain);
  }
}

// ── Instancias singleton (imutaveis) ──────────────────────────────────────────

export const generalAdapter  = Object.freeze(new GeneralAdapter());
export const unknownAdapter  = Object.freeze(new UnknownAdapter());