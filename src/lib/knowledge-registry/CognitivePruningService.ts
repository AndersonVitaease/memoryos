/**
 * CognitivePruningService.ts — Fase 3: Poda Cognitiva
 *
 * Responsabilidades:
 *   1. Arquiva Hypotheses nao confirmadas apos TTL (dias configuravel)
 *   2. Detecta pares de Evidence conflitantes e emite CONFLICT_ALERT
 *   3. Nunca deleta — apenas marca is_refuted=true ou emite nova observacao
 *
 * EXECUCAO: fire-and-forget via runBackgroundProcessing (a cada N mensagens).
 * ROLLBACK: remover a chamada de runPruning() no ConversationBackgroundProcessor.
 *
 * FASE 3 (esta fase):
 *   - Poda de Hypotheses por TTL
 *   - Deteccao basica de conflitos por targetObjectId + payloadType
 */

import { base44 } from "@/api/base44Client";
import { knowledgeRegistry } from "./KnowledgeRegistry";

// ── Config ────────────────────────────────────────────────────────────────────

const HYPOTHESIS_TTL_DAYS = 7;  // Hypotheses expiram em 7 dias sem confirmacao

// ── CognitivePruningService ───────────────────────────────────────────────────

class CognitivePruningServiceClass {

  private _totalArchived  = 0;
  private _totalConflicts = 0;
  private _lastRunAt: number | null = null;

  /**
   * Executa um ciclo de poda para uma sessao especifica.
   * Fire-and-forget — nunca lanca excecao.
   */
  async runForSession(sessionId: string, projectId?: string | null): Promise<void> {
    try {
      await Promise.all([
        this._pruneExpiredHypotheses(sessionId),
        this._detectConflicts(sessionId, projectId),
      ]);
      this._lastRunAt = Date.now();
    } catch { /* nunca bloqueia */ }
  }

  getMetrics() {
    return Object.freeze({
      totalArchived:  this._totalArchived,
      totalConflicts: this._totalConflicts,
      lastRunAt:      this._lastRunAt,
    });
  }

  // ── Poda de Hypotheses por TTL ────────────────────────────────────────────

  private async _pruneExpiredHypotheses(sessionId: string): Promise<void> {
    const cutoffDate = new Date(Date.now() - HYPOTHESIS_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const expiredHyps = await base44.entities.KnowledgeObservation.filter({
      session_id:   sessionId,
      nature:       "Hypothesis",
      is_refuted:   false,
      created_date: { $lte: cutoffDate },
    }, "created_date", 50);

    if (!expiredHyps || expiredHyps.length === 0) return;

    // Marca cada uma como refutada por TTL
    for (const hyp of expiredHyps) {
      try {
        // Cria observacao de refutacao (append-only)
        await knowledgeRegistry.commit({
          targetObjectId:   String(hyp.target_object_id),
          targetObjectType: String(hyp.target_object_type),
          nature:           "Evidence",
          payloadType:      "resolution",
          data: {
            reason:          "hypothesis_ttl_expired",
            refutedId:       String(hyp.id),
            ttlDays:         HYPOTHESIS_TTL_DAYS,
            originalPayload: hyp.payload_type,
          },
          contextScope:  (hyp.context_scope as "session"),
          sessionId,
          confidence:    1.0,
          producerId:    "CognitivePruningService",
          dependencyIds: [String(hyp.id)],
        });

        // Marca a hypothesis original como refutada
        await base44.entities.KnowledgeObservation.update(hyp.id, {
          is_refuted:    true,
          refuted_by_id: "ttl_expired",
        });

        this._totalArchived++;
      } catch { /* melhor esforco — continua para proxima */ }
    }
  }

  // ── Deteccao de Conflitos ─────────────────────────────────────────────────

  private async _detectConflicts(sessionId: string, projectId?: string | null): Promise<void> {
    // Busca pares de Evidence com mesmo targetObjectId + payloadType + valores diferentes
    // Estrategia simples Fase 3: goal_execution com goalValid=true e goalValid=false
    // no mesmo objeto indica inconsistencia de intent.

    const recentEvidence = await base44.entities.KnowledgeObservation.filter({
      session_id:  sessionId,
      nature:      "Evidence",
      payload_type: "goal_execution",
      is_refuted:  false,
    }, "-created_date", 20);

    if (!recentEvidence || recentEvidence.length < 2) return;

    // Agrupa por targetObjectId
    const byObject = new Map<string, typeof recentEvidence>();
    for (const obs of recentEvidence) {
      const key = String(obs.target_object_id);
      if (!byObject.has(key)) byObject.set(key, []);
      byObject.get(key)!.push(obs);
    }

    for (const [objectId, obsArr] of byObject) {
      if (obsArr.length < 2) continue;

      // Checa se existe conflito: goalType diferente para mesmo objeto na mesma sessao
      const goalTypes = new Set(
        obsArr.map((o) => {
          try {
            const d = typeof o.data === "string" ? JSON.parse(o.data) : o.data;
            return d?.goalType ?? null;
          } catch { return null; }
        }).filter(Boolean)
      );

      if (goalTypes.size > 2) {
        // Mais de 2 goalTypes diferentes para o mesmo objeto — conflito de intent
        const existingAlert = await base44.entities.KnowledgeObservation.filter({
          session_id:   sessionId,
          target_object_id: objectId,
          payload_type: "conflict_alert",
          is_refuted:   false,
        }, "-created_date", 1);

        if (existingAlert && existingAlert.length > 0) continue; // ja existe alerta

        await knowledgeRegistry.commit({
          targetObjectId:   objectId,
          targetObjectType: "session",
          nature:           "Inference",
          payloadType:      "conflict_alert",
          data: {
            reason:      "multiple_goal_types_same_object",
            goalTypes:   [...goalTypes],
            observationCount: obsArr.length,
          },
          contextScope:  "session",
          sessionId,
          projectId:     projectId ?? undefined,
          confidence:    0.7,
          producerId:    "CognitivePruningService",
        });

        this._totalConflicts++;
      }
    }
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__COGNITIVE_PRUNING__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CognitivePruningServiceClass();
}

export const cognitivePruningService: CognitivePruningServiceClass = (
  globalThis as unknown as Record<string, CognitivePruningServiceClass>
)[_KEY];