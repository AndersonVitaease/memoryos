/**
 * GoalContextBuilder.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASE 8
 *
 * Context Builder orientado por objetivos.
 * Enriquece o contexto com:
 *   - Objetivo principal detectado
 *   - Objetivos relacionados (do grafo)
 *   - Objetivos concluídos relevantes
 *   - Especialistas históricos
 *   - Resultados anteriores
 *   - Lições aprendidas
 *
 * Não substitui EnrichedContextBuilder — adiciona uma camada de objetivo
 * ao contexto gerado pelo MIP.
 */

import { listGoals, searchGoals } from "./GoalMemoryIndex";
import { getNeighbors, getNodesByType } from "./PersistentKnowledgeGraph";
import { getLearningRecord } from "./MemoryLearningEngine";

/**
 * Detecta o objetivo mais provável para uma query.
 * Usa busca textual simples — sem LLM extra.
 */
export function detectActiveGoal(query) {
  if (!query || !query.trim()) return null;
  const results = searchGoals(query);
  return results[0] ?? null;
}

/**
 * Constrói o bloco de contexto orientado por objetivos.
 *
 * @param {string} query          - Mensagem do usuário
 * @param {string} [goalId]       - ID de objetivo explícito (opcional)
 * @returns {string}              - Bloco de texto para injeção no prompt
 */
export function buildGoalContext(query, goalId = null) {
  const parts = [];

  // 1. Detectar objetivo ativo
  const activeGoal = goalId
    ? listGoals().find((g) => g.goalId === goalId)
    : detectActiveGoal(query);

  if (!activeGoal) return "";

  parts.push(`### OBJETIVO ATIVO: ${activeGoal.goalTitle}`);

  // 2. Sessões relacionadas
  if (activeGoal.sessions?.length > 0) {
    parts.push(`Conversas sob este objetivo: ${activeGoal.sessions.length}`);
  }

  // 3. Decisões do objetivo
  if (activeGoal.decisions?.length > 0) {
    const recent = activeGoal.decisions.slice(-5);
    parts.push(`Decisões tomadas:\n${recent.map((d) => `- ${d.title}`).join("\n")}`);
  }

  // 4. Especialistas históricos
  if (activeGoal.specialists?.length > 0) {
    parts.push(`Especialistas consultados: ${activeGoal.specialists.join(", ")}`);
  }

  // 5. Resultados anteriores
  if (activeGoal.results?.length > 0) {
    const latest = activeGoal.results.slice(-3);
    parts.push(`Resultados anteriores:\n${latest.map((r) => `- ${r.summary}`).join("\n")}`);
  }

  // 6. Lições aprendidas
  if (activeGoal.lessons?.length > 0) {
    const recent = activeGoal.lessons.slice(-3);
    parts.push(`Lições aprendidas:\n${recent.map((l) => `- ${l.text}`).join("\n")}`);
  }

  // 7. Objetivos relacionados via grafo
  const neighbors = getNeighbors(activeGoal.goalId);
  const relatedGoals = neighbors
    .filter((n) => n.relation === "related_to" || n.relation === "depends_on")
    .slice(0, 3);
  if (relatedGoals.length > 0) {
    parts.push(`Objetivos relacionados (${relatedGoals.length}): ${relatedGoals.map((n) => n.nodeId).join(", ")}`);
  }

  // 8. Documentos do objetivo
  if (activeGoal.documents?.length > 0) {
    const recent = activeGoal.documents.slice(-5);
    parts.push(`Documentos indexados: ${recent.map((d) => d.name).join(", ")}`);
  }

  return `## CONTEXTO DO OBJETIVO\n${parts.join("\n\n")}`;
}

/**
 * Retorna os objetivos mais relevantes para uma query (para o ranking).
 */
export function getRelevantGoals(query, limit = 3) {
  const all = listGoals();
  if (!query) return all.slice(0, limit);
  return searchGoals(query).slice(0, limit);
}

/**
 * Constrói resumo de todos os objetivos ativos para o contexto geral.
 */
export function buildAllGoalsSummary() {
  const all = listGoals().slice(0, 5);
  if (all.length === 0) return "";
  const lines = all.map((g) =>
    `- **${g.goalTitle}**: ${g.decisions.length} decisões, ${g.sessions.length} sessões, ${g.lessons.length} lições`
  );
  return `## OBJETIVOS ATIVOS (${all.length})\n${lines.join("\n")}`;
}