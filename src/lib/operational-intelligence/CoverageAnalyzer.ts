/**
 * CoverageAnalyzer.ts — OIE Fase 3 (Sprint 4)
 *
 * Responsabilidade unica: para uma execucao (executionId), juntar tres fontes
 * e produzir assinaturas de comportamento (behavior signatures) que indicam
 * falhas silenciosas — casos onde o sistema "terminou com sucesso" do ponto
 * de vista do pipeline, mas nao cumpriu o que o usuario pediu.
 *
 * TRES FONTES:
 *   1. InteractionEvent (actor=user, correlation_id=executionId) — o que o
 *      usuario PEDIU (raw_text + quantifiers).
 *   2. ExecutionObservation (execution_id=executionId) — o que o sistema FEZ
 *      (connector + capability + status por step).
 *   3. ArchitectureMap (opcional, via ArchitectureIndexer) — o que DEVERIA
 *      ter rodado dado o Goal (coverage gap). Usado so quando goal_type esta
 *      disponivel nas observacoes (Fase 1 deixou null; Fase 1.5+ popula).
 *
 * ASSINATURAS DETECTADAS (deterministicas, sem LLM):
 *   - NoConnectorExecution: intent registrada, ZERO ExecutionObservation.
 *     O Planner caiu em fallback LLM/memoria sem nenhum connector. Sinal de
 *     SilentFallback / PlannerFallbackLoop.
 *   - QuantifierMismatch: intent tem quantifier "all"/"all_repository"/"all_the"
 *     mas nenhuma capability de list/search executou. Sinal de
 *     PartialRepositoryTraversal (pediu "todo", leu um).
 *   - AllExecutionsFailed: todas as observacoes terminaram failed/timeout.
 *     O pipeline provavelmente entregou uma resposta generica — SilentFallback.
 *   - PartialSuccess: mistura de success + failed na mesma execucao — sinal de
 *     execucao parcial/quebrada (UnexpectedEarlyTermination candidate).
 *
 * PRINCIPIOS:
 *  - Read-only: so le entidades. Nunca escreve, nunca altera execucao.
 *  - Deterministico: regras explicitas, sem LLM.
 *  - Shadow mode: nada no sistema consome estas assinaturas ainda (Fase 3).
 *    Promocao para ativo so apos validacao cross-fase.
 */

import { base44 } from "@/api/base44Client";
import { ArchitectureIndexer, type ExpectedCapability } from "./ArchitectureIndexer";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface IntentProjection {
  readonly raw_text: string | null;
  readonly intent_hash: string | null;
  readonly quantifiers: readonly string[];
}

export interface ActualExecution {
  readonly connector: string;
  readonly capability: string;
  readonly status: string;
}

export interface CoverageAnalysis {
  readonly executionId: string;
  readonly intent: IntentProjection | null;
  readonly actual: readonly ActualExecution[];
  readonly behaviorSignatures: readonly string[];
  readonly goalType: string | null;
  readonly expectedCapabilities: readonly ExpectedCapability[] | null;
  readonly coverageGap: readonly ExpectedCapability[] | null;
  readonly analyzedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SINGULAR_CAPABILITY_HINTS = ["get", "read", "download", "fetch"];
const LIST_CAPABILITY_HINTS = ["list", "search", "bulk"];

function isListOrSearch(capability: string): boolean {
  const c = capability.toLowerCase();
  return LIST_CAPABILITY_HINTS.some((h) => c.includes(h));
}

function isSingular(capability: string): boolean {
  const c = capability.toLowerCase();
  return SINGULAR_CAPABILITY_HINTS.some((h) => c.includes(h)) && !isListOrSearch(c);
}

function parseQuantifiers(payload: string | null | undefined): string[] {
  if (!payload) return [];
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed?.quantifiers) ? parsed.quantifiers : [];
  } catch {
    return [];
  }
}

// ── CoverageAnalyzer ──────────────────────────────────────────────────────────

export const CoverageAnalyzer = {
  /**
   * Analisa uma unica execucao. Fire-and-forget friendly (caller pode
   * invocar em background). Nunca rejeita — erros de leitura viram
   * analysis parcial com behaviorSignatures vazias.
   */
  async analyzeExecution(executionId: string): Promise<CoverageAnalysis> {
    // Busca intent + observacoes em paralelo.
    const [intentEvents, observations] = await Promise.all([
      this._fetchIntent(executionId),
      this._fetchObservations(executionId),
    ]);

    const intent: IntentProjection | null = intentEvents.length > 0
      ? {
          raw_text: intentEvents[0].raw_text ?? null,
          intent_hash: intentEvents[0].intent_hash ?? null,
          quantifiers: parseQuantifiers(intentEvents[0].payload),
        }
      : null;

    const actual: ActualExecution[] = observations.map((o) => ({
      connector: o.connector,
      capability: o.capability,
      status: o.status,
    }));

    const goalType: string | null = observations.find((o) => o.goal_type)?.goal_type ?? null;

    // Coverage gap (so se goal_type disponivel em alguma observacao).
    let expectedCapabilities: readonly ExpectedCapability[] | null = null;
    let coverageGap: readonly ExpectedCapability[] | null = null;
    if (goalType) {
      try {
        expectedCapabilities = await ArchitectureIndexer.expectedCapabilitiesFor(goalType);
        if (expectedCapabilities.length > 0) {
          const actualKeys = new Set(actual.map((a) => `${a.connector}::${a.capability}`));
          coverageGap = expectedCapabilities.filter((e) => !actualKeys.has(`${e.connector}::${e.capability}`));
        }
      } catch { /* ArchitectureIndexer indisponivel — pula gap */ }
    }

    const behaviorSignatures = this._detectSignatures(intent, actual, coverageGap);

    return Object.freeze({
      executionId,
      intent,
      actual,
      behaviorSignatures: Object.freeze(behaviorSignatures),
      goalType,
      expectedCapabilities,
      coverageGap,
      analyzedAt: Date.now(),
    });
  },

  /**
   * Analisa as N execucoes mais recentes de uma sessao. Util para
   * dashboards e para o Decision Analyzer (Fase 2.5) detectar
   * inconsistencia de roteamento (mesmo intent_hash → goals diferentes).
   */
  async analyzeRecent(sessionId: string, limit = 20): Promise<CoverageAnalysis[]> {
    const intents = await base44.entities.InteractionEvent.filter(
      { session_id: sessionId, actor: "user", event_type: "message_sent" },
      "-created_date",
      limit,
    );
    const executionIds = intents.map((i) => i.correlation_id).filter(Boolean) as string[];
    // Dedup mantendo ordem (mais recente primeiro).
    const uniqueIds = [...new Set(executionIds)];
    return Promise.all(uniqueIds.map((id) => this.analyzeExecution(id)));
  },

  // ── Internos ─────────────────────────────────────────────────────────────

  async _fetchIntent(executionId: string) {
    try {
      return await base44.entities.InteractionEvent.filter(
        { correlation_id: executionId, actor: "user", event_type: "message_sent" },
        "-created_date",
        5,
      );
    } catch {
      return [];
    }
  },

  async _fetchObservations(executionId: string) {
    try {
      return await base44.entities.ExecutionObservation.filter(
        { execution_id: executionId },
        "-created_date",
        50,
      );
    } catch {
      return [];
    }
  },

  _detectSignatures(
    intent: IntentProjection | null,
    actual: readonly ActualExecution[],
    coverageGap: readonly ExpectedCapability[] | null,
  ): string[] {
    const signatures: string[] = [];

    // 1. NoConnectorExecution: intent registrada, zero executions.
    if (intent && actual.length === 0) {
      signatures.push("NoConnectorExecution");
    }

    // 2. QuantifierMismatch: intent pediu "todo/all" mas nada de list/search rodou.
    if (intent && actual.length > 0) {
      const totalQuantifiers = ["all", "all_the", "all_repository", "all_library", "complete", "whole"];
      const askedForAll = intent.quantifiers.some((q) => totalQuantifiers.includes(q));
      const anyListRan = actual.some((a) => isListOrSearch(a.capability));
      const onlySingular = actual.every((a) => isSingular(a.capability));
      if (askedForAll && !anyListRan && onlySingular) {
        signatures.push("PartialRepositoryTraversal");
      }
    }

    // 3. AllExecutionsFailed: todas as observacoes terminaram em falha.
    if (actual.length > 0) {
      const failureStatuses = ["failed", "timeout", "blocked"];
      const allFailed = actual.every((a) => failureStatuses.includes(a.status));
      if (allFailed) signatures.push("AllExecutionsFailed");
    }

    // 4. PartialSuccess: mix de sucesso + falha na mesma execucao.
    if (actual.length > 1) {
      const successStatuses = ["success", "completed"];
      const hasSuccess = actual.some((a) => successStatuses.includes(a.status));
      const failureStatuses = ["failed", "timeout", "blocked"];
      const hasFailure = actual.some((a) => failureStatuses.includes(a.status));
      if (hasSuccess && hasFailure) signatures.push("PartialSuccess");
    }

    // 5. CoverageGap: ArchitectureMap esperava capabilities que nao rodaram.
    if (coverageGap && coverageGap.length > 0) {
      signatures.push("CoverageGap");
    }

    return signatures;
  },
};