/**
 * ExecutionOutcomeAdapter.ts — Execution Outcome Adapter (Registry-delegating)
 *
 * SRP: ponto de entrada publico para adaptacao de ExecutionOutcome.
 *
 * Responsabilidades apos introducao do Registry:
 *   1. Validar o outcome de entrada.
 *   2. Resolver o adapter especializado via ExecutionOutcomeAdapterRegistry.
 *   3. Delegar a adaptacao ao adapter resolvido.
 *
 * O que foi removido (agora vive nos DomainAdapters):
 *   - DOMAIN_MAP
 *   - PRODUCER_SOURCE_MAP
 *   - _extractAnswer()
 *   - _resolveHandledAndAnswer()
 *
 * Sem efeitos colaterais. Sem rede. Sem conhecimento de Pipeline ou Connector.
 */

import type { AdaptationResult, AdaptationError, AdaptationHint } from "./ExecutionOutcomeAdapterTypes";
import type { ExecutionOutcome } from "./ExecutionOutcomeTypes";
import { executionOutcomeAdapterRegistry } from "./ExecutionOutcomeAdapterRegistry";

// ── ExecutionOutcomeAdapter ───────────────────────────────────────────────────

export class ExecutionOutcomeAdapter {

  /**
   * Converte um ExecutionOutcome em um ResponseCandidate.
   *
   * Fluxo:
   *   1. Valida outcome.
   *   2. Resolve adapter especializado via Registry.
   *   3. Delega adapt() ao adapter resolvido.
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

    // ── Resolver adapter especializado ────────────────────────────────────────
    const { adapter } = executionOutcomeAdapterRegistry.resolve(outcome);

    // ── Delegar ───────────────────────────────────────────────────────────────
    // O adapter resolvido (General, Unknown ou futuro GitHub/Drive/Gmail)
    // e responsavel por todo o mapeamento de campos.
    return adapter!.adapt(outcome, hint);
  }

  /**
   * Converte um array de ExecutionOutcomes em AdaptationResults.
   * Cada outcome e resolvido individualmente pelo Registry.
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