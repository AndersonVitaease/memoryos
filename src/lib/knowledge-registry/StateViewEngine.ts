/**
 * StateViewEngine.ts — Read Model do Knowledge Registry v1.0 (Fase 2)
 *
 * SRP: Unica responsabilidade — projetar KnowledgeObservations persistidas
 *      em KnowledgeObjectState para consumo pelo contexto do LLM.
 *
 * GARANTIAS:
 *   - Read-only: nunca escreve no Registry nem no banco
 *   - Nunca lanca excecao (retorna StateViewQueryResult mesmo em falha)
 *   - Singleton HMR-safe via globalThis
 *   - Feature-flag controlado: PHASE2_READ e PHASE2_INJECT
 *
 * FASE 2:
 *   - readEnabled=true:   le observacoes do banco e constroi StateView
 *   - injectEnabled=false: nao injeta no LLM ainda (Fase 3)
 *
 * ROLLBACK: setar PHASE2_READ=false desativa completamente sem remover codigo.
 */

import { base44 } from "@/api/base44Client";
import type {
  KnowledgeObjectState,
  StateObservation,
  StateViewQueryResult,
  StateViewFeatureFlags,
} from "./StateViewTypes";
import type { ObservationNature, PayloadType, ContextScope } from "./KnowledgeRegistryTypes";
import {
  makeSessionToken,
  makeProjectToken,
  isScopeAuthorized,
  type StateViewContextToken,
} from "./StateViewContextToken";

// ── Feature flags (alterar aqui para ativar/desativar) ────────────────────────

const PHASE2_FLAGS: StateViewFeatureFlags = Object.freeze({
  readEnabled:   true,   // le observacoes do banco e constroi StateView
  injectEnabled: false,  // NAO injeta no LLM ainda (Fase 3)
});

export function getStateViewFlags(): StateViewFeatureFlags {
  return PHASE2_FLAGS;
}

// ── StateViewEngine ───────────────────────────────────────────────────────────

class StateViewEngineClass {

  private _totalBuilds   = 0;
  private _totalFailed   = 0;
  private _lastBuildAt: number | null = null;

  // ── Query principal ────────────────────────────────────────────────────────

  /**
   * Constroi o StateView para uma sessao especifica.
   * Retorna sempre — nunca lanca excecao.
   */
  async buildForSession(
    sessionId: string,
    projectId?: string | null,
    limitDays = 30,
    contextToken?: StateViewContextToken,
  ): Promise<StateViewQueryResult> {
    const t0 = Date.now();

    if (!PHASE2_FLAGS.readEnabled) {
      return this._empty(sessionId, t0, "feature_flag_disabled");
    }

    // Cria contextToken se não fornecido (CRS-01 §2.2)
    const token = contextToken ?? (
      projectId ? makeProjectToken(sessionId, projectId) : makeSessionToken(sessionId)
    );

    try {
      // Janela temporal: observacoes dos ultimos N dias
      const cutoffMs   = Date.now() - limitDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(cutoffMs).toISOString();

      // Busca observacoes ativas (nao refutadas) desta sessao
      const rawObs = await base44.entities.KnowledgeObservation.filter({
        session_id:  sessionId,
        is_refuted:  false,
        created_date: { $gte: cutoffDate },
      }, "-created_date", 200);

      // Filtra por scopes autorizados pelo contextToken (CRS-01 §2.2)
      const authorizedObs = (rawObs ?? []).filter(
        (o) => isScopeAuthorized(token, (o.context_scope as ContextScope) ?? "session")
      );

      if (!authorizedObs || authorizedObs.length === 0) {
        return this._empty(sessionId, t0, "no_observations");
      }

      // Agrupa por targetObjectId
      const grouped = this._groupByObject(authorizedObs);
      const objects = this._buildObjectStates(grouped);

      const llmContext = PHASE2_FLAGS.injectEnabled
        ? this._formatLLMContext(objects, sessionId)
        : null;

      this._totalBuilds++;
      this._lastBuildAt = Date.now();

      return Object.freeze({
        sessionId,
        objects,
        totalObjects:  objects.length,
        builtAt:       Date.now(),
        durationMs:    Date.now() - t0,
        llmContext,
      });

    } catch (err) {
      this._totalFailed++;
      console.warn("[StateViewEngine][FAIL]", err instanceof Error ? err.message : err);
      return this._empty(sessionId, t0, "query_failed");
    }
  }

  getMetrics() {
    return Object.freeze({
      totalBuilds:   this._totalBuilds,
      totalFailed:   this._totalFailed,
      lastBuildAt:   this._lastBuildAt,
      flags:         PHASE2_FLAGS,
    });
  }

  // ── Privados ───────────────────────────────────────────────────────────────

  private _groupByObject(rawObs: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const obs of rawObs) {
      const key = String(obs.target_object_id ?? "unknown");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(obs);
    }
    return map;
  }

  private _buildObjectStates(
    grouped: Map<string, Record<string, unknown>[]>,
  ): readonly KnowledgeObjectState[] {
    const states: KnowledgeObjectState[] = [];

    for (const [objectId, obsArr] of grouped) {
      const first = obsArr[0];
      const hasConflict = obsArr.some(
        (o) => o.payload_type === "conflict_alert",
      );

      const observations: StateObservation[] = obsArr.map((o) => ({
        id:          String(o.id ?? ""),
        nature:      (o.nature as ObservationNature) ?? "Evidence",
        payloadType: (o.payload_type as PayloadType) ?? "conversation_turn",
        data:        this._parseData(o.data),
        confidence:  Number(o.confidence ?? 0),
        producerId:  String(o.producer_id ?? ""),
        executionId: o.execution_id ? String(o.execution_id) : null,
        createdAt:   new Date(String(o.created_date ?? 0)).getTime(),
      }));

      const avgConfidence = observations.length > 0
        ? observations.reduce((s, o) => s + o.confidence, 0) / observations.length
        : 0;

      states.push(Object.freeze({
        objectId,
        objectType:    String(first?.target_object_type ?? "unknown"),
        scope:         (first?.context_scope as ContextScope) ?? "session",
        sessionId:     first?.session_id ? String(first.session_id) : null,
        projectId:     first?.project_id ? String(first.project_id) : null,
        observations:  Object.freeze(observations),
        confidence:    Math.round(avgConfidence * 100) / 100,
        lastUpdatedAt: observations[0]?.createdAt ?? Date.now(),
        hasConflict,
      }));
    }

    // Ordena por lastUpdatedAt desc
    return Object.freeze(states.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt));
  }

  private _parseData(raw: unknown): Record<string, unknown> {
    if (typeof raw === "object" && raw !== null) return raw as Record<string, unknown>;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { /* ignore */ }
    }
    return {};
  }

  private _formatLLMContext(objects: readonly KnowledgeObjectState[], sessionId: string): string {
    if (objects.length === 0) return "";

    const lines: string[] = ["[StateView — Contexto da Sessao]"];

    // Agrupa por payloadType para ter um resumo compacto
    const goalTypes = new Set<string>();
    const producers = new Set<string>();
    let turnCount   = 0;

    for (const obj of objects) {
      for (const obs of obj.observations) {
        if (obs.payloadType === "conversation_turn") turnCount++;
        if (obs.payloadType === "goal_execution") {
          const gt = obs.data?.goalType;
          if (typeof gt === "string") goalTypes.add(gt);
        }
        producers.add(obs.producerId);
      }
    }

    if (turnCount > 0)        lines.push(`- Turnos na sessao: ${turnCount}`);
    if (goalTypes.size > 0)   lines.push(`- Goals executados: ${[...goalTypes].join(", ")}`);
    if (objects.some(o => o.hasConflict)) lines.push("- ATENCAO: Conflitos detectados nesta sessao");

    return lines.join("\n");
  }

  private _empty(sessionId: string, t0: number, reason: string): StateViewQueryResult {
    return Object.freeze({
      sessionId,
      objects:      Object.freeze([]),
      totalObjects: 0,
      builtAt:      Date.now(),
      durationMs:   Date.now() - t0,
      llmContext:   null,
      _reason:      reason,  // para observabilidade interna
    } as StateViewQueryResult & { _reason: string });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__STATE_VIEW_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new StateViewEngineClass();
}

export const stateViewEngine: StateViewEngineClass = (
  globalThis as unknown as Record<string, StateViewEngineClass>
)[_KEY];

export { StateViewEngineClass };