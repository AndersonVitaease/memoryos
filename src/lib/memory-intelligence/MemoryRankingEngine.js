/**
 * MemoryRankingEngine.js — Memory Intelligence Platform (MIP)
 * Sprint 7.1.1A: Motor de ranking unificado.
 *
 * Toda memória passa por aqui antes de ser enviada ao contexto.
 * Nenhum registro entra no prompt sem FinalScore + Confidence + Reason + Priority.
 */

import { rankRecords } from "./MemoryScorer";

// Limites por tipo (máximo de registros no contexto)
const TYPE_LIMITS = {
  decisions:  8,
  tasks:     10,
  entities:  20,
  topics:     8,
  documents:  6,
  sessions:   5,
  keywords:  15,
  messages:   5,
};

/**
 * Classifica prioridade com base no score.
 */
function priority(score) {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.50) return "MEDIUM";
  if (score >= 0.30) return "LOW";
  return "DISCARD";
}

/**
 * Confiança baseada no score e riqueza.
 */
function confidence(score, richness) {
  const combined = score * 0.7 + richness * 0.3;
  if (combined >= 0.7) return "HIGH";
  if (combined >= 0.4) return "MEDIUM";
  return "LOW";
}

/**
 * Gera razão legível para a escolha.
 */
function reason(breakdown, type) {
  const parts = [];
  if (breakdown.semantic > 0.6) parts.push("alta relevância semântica");
  if (breakdown.recency > 0.7)  parts.push("recente");
  if (breakdown.importance > 0.8) parts.push(`tipo prioritário (${type})`);
  if (breakdown.richness > 0.6) parts.push("conteúdo rico");
  return parts.length > 0 ? parts.join(", ") : "score composto";
}

/**
 * Ranqueia todos os tipos de memória e retorna resultado enriquecido.
 *
 * @param {Object} data        - Dados brutos do pipeline (decisions, tasks, ...)
 * @param {string[]} keywords  - Keywords da query atual
 * @returns {Object} ranked    - Dados ranqueados por tipo, cada item com { record, score, priority, confidence, reason }
 */
export function rankAllMemory(data, keywords = []) {
  const ranked = {};

  // Decisões
  if (data.decisions?.length > 0) {
    ranked.decisions = rankRecords(
      data.decisions,
      { keywords, fields: ["title", "description", "rationale"], primaryField: "description", dateField: "decided_date", kind: "decision" },
      TYPE_LIMITS.decisions
    ).filter((r) => priority(r.score) !== "DISCARD")
      .map((r) => ({
        ...r,
        priority: priority(r.score),
        confidence: confidence(r.score, r.breakdown.richness),
        reason: reason(r.breakdown, "decision"),
      }));
  }

  // Tarefas
  if (data.tasks?.length > 0) {
    ranked.tasks = rankRecords(
      data.tasks,
      { keywords, fields: ["title", "description", "assignee"], primaryField: "title", dateField: "created_date",
        kind: data.tasks[0]?.status === "pending" ? "task_pending" : "task_done" },
      TYPE_LIMITS.tasks
    ).filter((r) => priority(r.score) !== "DISCARD")
      .map((r) => ({
        ...r,
        priority: priority(r.score),
        confidence: confidence(r.score, r.breakdown.richness),
        reason: reason(r.breakdown, "task"),
      }));
  }

  // Entidades
  if (data.entities?.length > 0) {
    ranked.entities = rankRecords(
      data.entities,
      { keywords, fields: ["value", "context", "type"], primaryField: "value", dateField: "created_date",
        kind: `entity_${data.entities[0]?.type || "other"}` },
      TYPE_LIMITS.entities
    ).filter((r) => priority(r.score) !== "DISCARD")
      .map((r) => ({
        ...r,
        priority: priority(r.score),
        confidence: confidence(r.score, r.breakdown.richness),
        reason: reason(r.breakdown, r.record.type),
      }));
  }

  // Tópicos
  if (data.topics?.length > 0) {
    ranked.topics = rankRecords(
      data.topics,
      { keywords, fields: ["name", "description"], primaryField: "name", dateField: "created_date", kind: "topic" },
      TYPE_LIMITS.topics
    ).filter((r) => priority(r.score) !== "DISCARD")
      .map((r) => ({
        ...r,
        priority: priority(r.score),
        confidence: confidence(r.score, r.breakdown.richness),
        reason: reason(r.breakdown, "topic"),
      }));
  }

  // Documentos
  if (data.documents?.length > 0) {
    ranked.documents = rankRecords(
      data.documents,
      { keywords, fields: ["name", "summary", "extracted_text", "category"], primaryField: "summary",
        dateField: "created_date", kind: `doc_${data.documents[0]?.category || "other"}` },
      TYPE_LIMITS.documents
    ).filter((r) => priority(r.score) !== "DISCARD")
      .map((r) => ({
        ...r,
        priority: priority(r.score),
        confidence: confidence(r.score, r.breakdown.richness),
        reason: reason(r.breakdown, "document"),
      }));
  }

  // Sessões
  if (data.sessions?.length > 0) {
    ranked.sessions = rankRecords(
      data.sessions,
      { keywords, fields: ["title", "summary"], primaryField: "summary", dateField: "updated_date", kind: "session" },
      TYPE_LIMITS.sessions
    ).map((r) => ({
      ...r,
      priority: priority(r.score),
      confidence: confidence(r.score, r.breakdown.richness),
      reason: reason(r.breakdown, "session"),
    }));
  }

  // Mensagens
  if (data.messages?.length > 0) {
    ranked.messages = rankRecords(
      data.messages,
      { keywords, fields: ["content"], primaryField: "content", dateField: "created_date", kind: "message" },
      TYPE_LIMITS.messages
    ).filter((r) => priority(r.score) !== "DISCARD")
      .map((r) => ({
        ...r,
        priority: priority(r.score),
        confidence: confidence(r.score, r.breakdown.richness),
        reason: reason(r.breakdown, "message"),
      }));
  }

  return ranked;
}

/**
 * Calcula métricas de saúde da memória ranqueada.
 */
export function computeMemoryHealth(ranked, rawData) {
  const totalRaw = Object.values(rawData).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
  );
  const totalRanked = Object.values(ranked).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
  );
  const highPriority = Object.values(ranked).flat()
    .filter((r) => r.priority === "HIGH").length;

  return {
    totalRaw,
    totalRanked,
    highPriority,
    retrievalRate: totalRaw > 0 ? Math.round((totalRanked / totalRaw) * 100) : 0,
    avgScore: totalRanked > 0
      ? Math.round(
          Object.values(ranked).flat().reduce((s, r) => s + r.score, 0) / totalRanked * 100
        ) / 100
      : 0,
  };
}