/**
 * DecisionAnalyzer.ts — OIE Fase 2.5 (Sprint 5)
 *
 * Responsabilidade unica: detectar INCONSISTENCIA DE ROTEAMENTO — casos onde
 * o Planner (ou fallback) levou a MESMA intencao do usuario (mesmo intent_hash)
 * a goals/capabilities DIFERENTES em execucoes distintas, e REPETICAO de
 * pergunta (mesmo intent_hash aparece N vezes numa sessao).
 *
 * POR QUE IMPORTA:
 *   - Mesma intencao → goals diferentes = Planner nao-deterministico. Sinal de
 *     IdentityBypass / WrongConnectorSelection / PlannerFallbackLoop. O usuario
 *     pergunta a mesma coisa, o sistema responde de formas diferentes — perde
 *     confianca e repetibilidade.
 *   - Repeticao de pergunta = insatisfacao. O usuario re-perguntou porque a
 *     resposta anterior nao resolveu. Sinal de SilentFallback / resposta
 *     generica que nao cumpriu o pedido.
 *
 * FONTES:
 *   1. InteractionEvent (actor=user, event_type=message_sent, session_id) —
 *      cada evento tem correlation_id (=executionId) + intent_hash.
 *   2. ExecutionObservation (execution_id=correlation_id) — tem goal_type
 *      (populado a partir da Fase 1.5 quando disponivel; null na Fase 1).
 *
 * ASSINATURAS DETECTADAS (deterministicas):
 *   - SameIntentMultipleGoals: grupo com mesmo intent_hash levou a >1
 *     goal_type distinto.
 *   - RepeatedQuestion: grupo com mesmo intent_hash apareceu >= threshold
 *     vezes (default 2) na sessao.
 *
 * PRINCIPIOS:
 *  - Read-only: so le. Nunca escreve, nunca altera roteamento.
 *  - Deterministico: agrupamento por hash, sem LLM.
 *  - Shadow mode: nada consome estas assinaturas ainda. Promocao para ativo
 *    so apos validacao cross-fase (Fase 4/5).
 */

import { base44 } from "@/api/base44Client";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface IntentGroup {
  readonly intent_hash: string;
  readonly occurrences: number;
  readonly executionIds: readonly string[];
  readonly goalTypes: readonly string[];
  readonly signatures: readonly string[];
}

export interface DecisionAnalysis {
  readonly sessionId: string;
  readonly totalIntents: number;
  readonly uniqueIntentHashes: number;
  readonly groups: readonly IntentGroup[];
  readonly flaggedGroups: readonly IntentGroup[];
  readonly analyzedAt: number;
}

// ── DecisionAnalyzer ──────────────────────────────────────────────────────────

export const DecisionAnalyzer = {
  /**
   * Analisa a consistencia de roteamento para uma sessao.
   * Agrupa InteractionEvents por intent_hash, resolve o goal_type de cada
   * execucao via ExecutionObservation, e flaga grupos anomalos.
   *
   * @param sessionId sessao alvo
   * @param repeatedThreshold minimo de ocorrencias para RepeatedQuestion
   * @param limit max de eventos a varrer (default 100)
   */
  async analyzeSession(
    sessionId: string,
    repeatedThreshold = 2,
    limit = 100,
  ): Promise<DecisionAnalysis> {
    // 1. Busca intents de usuario da sessao.
    const intents = await this._fetchIntents(sessionId, limit);

    // 2. Agrupa por intent_hash (ignora null — eventos sem hash nao tem intencao).
    const hashToGroup = new Map<string, { executionIds: string[]; goalTypes: Set<string> }>();
    for (const ev of intents) {
      if (!ev.intent_hash) continue;
      let g = hashToGroup.get(ev.intent_hash);
      if (!g) {
        g = { executionIds: [], goalTypes: new Set() };
        hashToGroup.set(ev.intent_hash, g);
      }
      if (ev.correlation_id) g.executionIds.push(ev.correlation_id);
    }

    // 3. Resolve goal_type de cada execucao (em paralelo, com teto de concorrencia).
    const executionIds = [...new Set(
      [...hashToGroup.values()].flatMap((g) => g.executionIds),
    )];
    const goalByExecution = await this._resolveGoalTypes(executionIds);
    for (const g of hashToGroup.values()) {
      for (const execId of g.executionIds) {
        const gt = goalByExecution.get(execId);
        if (gt) g.goalTypes.add(gt);
      }
    }

    // 4. Monta grupos + detecta assinaturas.
    const groups: IntentGroup[] = [];
    for (const [hash, g] of hashToGroup) {
      const goalTypes = [...g.goalTypes];
      const signatures: string[] = [];
      if (goalTypes.length > 1) signatures.push("SameIntentMultipleGoals");
      if (g.executionIds.length >= repeatedThreshold) signatures.push("RepeatedQuestion");
      groups.push(Object.freeze({
        intent_hash: hash,
        occurrences: g.executionIds.length,
        executionIds: Object.freeze(g.executionIds),
        goalTypes: Object.freeze(goalTypes),
        signatures: Object.freeze(signatures),
      }));
    }

    groups.sort((a, b) => b.occurrences - a.occurrences);
    const flaggedGroups = groups.filter((g) => g.signatures.length > 0);

    return Object.freeze({
      sessionId,
      totalIntents: intents.length,
      uniqueIntentHashes: hashToGroup.size,
      groups: Object.freeze(groups),
      flaggedGroups: Object.freeze(flaggedGroups),
      analyzedAt: Date.now(),
    });
  },

  // ── Internos ─────────────────────────────────────────────────────────────

  async _fetchIntents(sessionId: string, limit: number) {
    try {
      return await base44.entities.InteractionEvent.filter(
        { session_id: sessionId, actor: "user", event_type: "message_sent" },
        "-created_date",
        limit,
      );
    } catch {
      return [];
    }
  },

  async _resolveGoalTypes(executionIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (executionIds.length === 0) return result;
    // Resolve em lotes de 20 para nao estourar payloads.
    const BATCH = 20;
    for (let i = 0; i < executionIds.length; i += BATCH) {
      const batch = executionIds.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (execId) => {
          const obs = await base44.entities.ExecutionObservation.filter(
            { execution_id: execId },
            "-created_date",
            50,
          );
          for (const o of obs) {
            if (o.goal_type) return { execId, goalType: o.goal_type };
          }
          return { execId, goalType: null };
        }),
      );
      for (const s of settled) {
        if (s.status === "fulfilled" && s.value.goalType) {
          result.set(s.value.execId, s.value.goalType);
        }
      }
    }
    return result;
  },
};