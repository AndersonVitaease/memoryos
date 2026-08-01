/**
 * KnowledgeRegistry.ts — Knowledge Registry v1.0 (Fase 1: Shadow Mode)
 *
 * SRP: Unica responsabilidade — receber ObservationInput, validar,
 *      detectar ciclos e persistir no banco Base44 como KnowledgeObservation.
 *
 * GARANTIAS:
 *   - Nunca lanca excecao para o caller (sempre retorna CommitResult)
 *   - Nunca bloqueia a pipeline (deve ser chamado via fire-and-forget)
 *   - Append-only: nenhuma observacao e deletada ou alterada
 *   - Imutabilidade: todos os records retornados sao Object.freeze()
 *   - Singleton HMR-safe via globalThis
 *
 * FASE 1 (Shadow Mode):
 *   - Apenas persiste observacoes.
 *   - Nenhum outro modulo le essas observacoes ainda.
 *   - A pipeline oficial nao e alterada.
 */

import { base44 } from "@/api/base44Client";
import type {
  ObservationInput,
  ObservationRecord,
  CommitResult,
  CommitErrorType,
  RegistryMetrics,
  ObservationNature,
} from "./KnowledgeRegistryTypes";
import {
  REGISTERED_SCOPES,
  REGISTERED_PAYLOAD_TYPES,
} from "./KnowledgeRegistryTypes";

// ── ID generator ──────────────────────────────────────────────────────────────

function makeObsId(): string {
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── KnowledgeRegistry ─────────────────────────────────────────────────────────

class KnowledgeRegistryClass {
  private _metrics: {
    totalCommitted: number;
    totalRefuted:   number;
    totalFailed:    number;
    byNature:       Record<ObservationNature, number>;
    byScope:        Record<string, number>;
    lastCommitAt:   number | null;
  } = {
    totalCommitted: 0,
    totalRefuted:   0,
    totalFailed:    0,
    byNature:       { Evidence: 0, Inference: 0, Hypothesis: 0 },
    byScope:        {},
    lastCommitAt:   null,
  };

  // ── Grafo de dependencias (in-memory para deteccao de ciclos nesta sessao) ──
  // Apenas IDs da sessao atual. Nao persiste entre reloads — aceitavel na Fase 1.
  private _depGraph: Map<string, Set<string>> = new Map();

  // ── Commit ────────────────────────────────────────────────────────────────

  async commit(input: ObservationInput): Promise<CommitResult> {
    const t0  = Date.now();
    const id  = makeObsId();

    // ── Validacao 1: scope ────────────────────────────────────────────────
    if (!REGISTERED_SCOPES.has(input.contextScope)) {
      return this._fail(id, "unknown_scope", `Scope desconhecido: "${input.contextScope}"`, t0);
    }

    // ── Validacao 2: payloadType ──────────────────────────────────────────
    if (!REGISTERED_PAYLOAD_TYPES.has(input.payloadType)) {
      return this._fail(id, "unknown_payload_type", `PayloadType desconhecido: "${input.payloadType}"`, t0);
    }

    // ── Validacao 3: confidence ───────────────────────────────────────────
    if (input.confidence < 0 || input.confidence > 1) {
      return this._fail(id, "invalid_confidence", `Confidence fora do range [0,1]: ${input.confidence}`, t0);
    }

    // ── Validacao 4: campos obrigatorios ──────────────────────────────────
    if (!input.targetObjectId || !input.targetObjectType || !input.producerId) {
      return this._fail(id, "missing_required_field", "targetObjectId, targetObjectType e producerId sao obrigatorios", t0);
    }

    // ── Validacao 5: deteccao de ciclos ───────────────────────────────────
    const deps = input.dependencyIds ?? [];
    if (deps.length > 0) {
      const cycleDetected = this._hasCycle(id, deps);
      if (cycleDetected) {
        return this._fail(id, "circular_dependency", `Ciclo detectado: observacao ${id} cria dependencia circular`, t0);
      }
      // Registra no grafo local
      this._depGraph.set(id, new Set(deps));
    }

    // ── Persiste no banco ─────────────────────────────────────────────────
    try {
      await base44.entities.KnowledgeObservation.create({
        target_object_id:   input.targetObjectId,
        target_object_type: input.targetObjectType,
        nature:             input.nature,
        payload_type:       input.payloadType,
        data:               JSON.stringify(input.data),
        dependency_ids:     deps,
        context_scope:      input.contextScope,
        session_id:         input.sessionId ?? null,
        project_id:         input.projectId ?? null,
        confidence:         input.confidence,
        is_refuted:         false,
        refuted_by_id:      null,
        producer_id:        input.producerId,
        execution_id:       input.executionId ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido ao persistir";
      return this._fail(id, "persist_failed", msg, t0);
    }

    // ── Atualiza metricas ─────────────────────────────────────────────────
    this._metrics.totalCommitted++;
    this._metrics.byNature[input.nature]++;
    this._metrics.byScope[input.contextScope] = (this._metrics.byScope[input.contextScope] ?? 0) + 1;
    this._metrics.lastCommitAt = Date.now();

    return Object.freeze({
      ok:             true,
      observationId:  id,
      errorType:      null,
      errorMessage:   null,
      durationMs:     Date.now() - t0,
    });
  }

  // ── Metricas ───────────────────────────────────────────────────────────────

  getMetrics(): RegistryMetrics {
    return Object.freeze({ ...this._metrics });
  }

  // ── Privados ───────────────────────────────────────────────────────────────

  private _fail(
    id: string,
    errorType: CommitErrorType,
    errorMessage: string,
    t0: number,
  ): CommitResult {
    this._metrics.totalFailed++;
    console.warn(`[KnowledgeRegistry][FAIL][${errorType}] ${errorMessage}`);
    return Object.freeze({
      ok:             false,
      observationId:  null,
      errorType,
      errorMessage,
      durationMs:     Date.now() - t0,
    });
  }

  /**
   * Deteccao de ciclos via DFS no grafo in-memory da sessao.
   * Retorna true se adicionar `newId -> deps` criaria um ciclo.
   */
  private _hasCycle(newId: string, deps: readonly string[]): boolean {
    // Simula adicao temporaria
    const visited  = new Set<string>();
    const stack    = [...deps];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === newId) return true;   // ciclo encontrado
      if (visited.has(current)) continue;
      visited.add(current);
      const children = this._depGraph.get(current);
      if (children) {
        for (const child of children) stack.push(child);
      }
    }
    return false;
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__KNOWLEDGE_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new KnowledgeRegistryClass();
}

export const knowledgeRegistry: KnowledgeRegistryClass = (
  globalThis as unknown as Record<string, KnowledgeRegistryClass>
)[_KEY];

export { KnowledgeRegistryClass };
export type { ObservationInput, ObservationRecord, CommitResult, RegistryMetrics };