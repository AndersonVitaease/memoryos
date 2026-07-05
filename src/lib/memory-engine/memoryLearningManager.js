/**
 * Memory Learning Manager (Sprint 13)
 *
 * Responsabilidade única: OBSERVAR o comportamento do sistema e
 * produzir Learning Insights. Aprende padrões — nunca age sobre eles.
 *
 * O QUE FAZ:
 *   - Recebe eventos (access logs, lifecycle, retrieval, consolidation, version)
 *   - Detecta padrões de uso
 *   - Gera Learning Insights
 *   - Persiste apenas os Insights (nunca Memory Records)
 *
 * O QUE NÃO FAZ:
 *   - Modificar Memory Records
 *   - Alterar Ranking / Retrieval / Lifecycle
 *   - Alterar Version History / Embeddings / Relationships
 *   - Responder ao usuário
 *   - Aprendizado automático / Reforço / Fine-tuning
 *   - Auto atualização / Auto arquivamento / Auto ranking
 *   - LLM
 *
 * Arquitetura:
 *   Memory Engine → Learning Manager → Learning Insights → Consumidores futuros
 */

import {
  buildLearningInsight,
  INSIGHT_TYPES,
} from "./memoryLearningInsight";

// === Thresholds ===
const THRESHOLDS = {
  frequentAccess: 5,
  rareAccessMax: 1,
  coRetrieval: 3,
  archiveDays: 60,
};

// === Insight Store (temporary, in-memory) ===
const _insights = new Map();

// === Observability ===
const _stats = {
  learningStarted: 0,
  learningCompleted: 0,
  insightCreated: 0,
  insightDismissed: 0,
  duplicatesAvoided: 0,
  eventsAnalyzed: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

const _decisionLog = [];

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[LearningManager:${event}]`, data);
}

// === Internal: create insight with dedup ===
function _tryCreateInsight(type, memoryId, confidence, reason) {
  for (const insight of _insights.values()) {
    if (
      insight.type === type &&
      insight.memoryId === memoryId &&
      insight.status === "active"
    ) {
      return { created: false, insight: null };
    }
  }
  const insight = buildLearningInsight({ type, memoryId, confidence, reason });
  _insights.set(insight.insightId, insight);
  _stats.insightCreated++;
  _decisionLog.push({ event: "insightCreated", type, memoryId });
  return { created: true, insight };
}

// === Public API ===

/**
 * Analisa eventos e gera Learning Insights.
 *
 * @param {Array} events — lista de eventos:
 *   { type: "access", memoryId, timestamp }
 *   { type: "retrieval", results: [{memoryId, score}], tags, timestamp }
 *   { type: "consolidation", action, candidateId, newRecordId, timestamp }
 *   { type: "lifecycle", memoryId, action, timestamp }
 *   { type: "version", memoryId, revision, action }
 * @returns {Object} { created, duplicatesAvoided, eventsAnalyzed, processingTimeMs }
 */
export function generateInsights(events) {
  _stats.learningStarted++;
  _stats.operations++;
  const startTime = Date.now();

  const accessCounts = {};
  const lastAccess = {};
  const coRetrievals = {};
  const topicCounts = {};
  const consolidationUpdates = [];
  const knownMemoryIds = new Set();

  const eventList = Array.isArray(events) ? events : [];

  for (const event of eventList) {
    if (!event || !event.type) continue;

    if (event.type === "access") {
      const mid = event.memoryId;
      if (!mid) continue;
      accessCounts[mid] = (accessCounts[mid] || 0) + 1;
      lastAccess[mid] = event.timestamp || new Date().toISOString();
      knownMemoryIds.add(mid);
    } else if (event.type === "retrieval") {
      const results = Array.isArray(event.results) ? event.results : [];
      const ids = [];
      for (const r of results) {
        if (r && r.memoryId) {
          ids.push(r.memoryId);
          accessCounts[r.memoryId] = (accessCounts[r.memoryId] || 0) + 1;
          lastAccess[r.memoryId] = event.timestamp || new Date().toISOString();
          knownMemoryIds.add(r.memoryId);
        }
      }
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const pair = [ids[i], ids[j]].sort().join("::");
          coRetrievals[pair] = (coRetrievals[pair] || 0) + 1;
        }
      }
      if (Array.isArray(event.tags)) {
        for (const tag of event.tags) {
          topicCounts[tag] = (topicCounts[tag] || 0) + 1;
        }
      }
    } else if (event.type === "consolidation") {
      if (event.action === "IGNORE" || event.action === "UPDATE") {
        const targetId = event.candidateId || event.newRecordId;
        if (targetId) {
          consolidationUpdates.push(targetId);
          knownMemoryIds.add(targetId);
        }
      }
    } else if (event.type === "lifecycle") {
      if (event.memoryId) knownMemoryIds.add(event.memoryId);
    } else if (event.type === "version") {
      if (event.memoryId) knownMemoryIds.add(event.memoryId);
    }
  }

  let created = 0;
  let duplicatesAvoided = 0;

  // FREQUENTLY_ACCESSED
  for (const [mid, count] of Object.entries(accessCounts)) {
    if (count >= THRESHOLDS.frequentAccess) {
      const r = _tryCreateInsight("FREQUENTLY_ACCESSED", mid, "high",
        `Memory accessed ${count} times`);
      if (r.created) created++;
      else duplicatesAvoided++;
    }
  }

  // RARELY_ACCESSED
  for (const [mid, count] of Object.entries(accessCounts)) {
    if (count <= THRESHOLDS.rareAccessMax) {
      const r = _tryCreateInsight("RARELY_ACCESSED", mid, "low",
        `Memory accessed only ${count} time(s)`);
      if (r.created) created++;
      else duplicatesAvoided++;
    }
  }

  // UNUSED_MEMORY — known but never accessed
  for (const mid of knownMemoryIds) {
    if (!accessCounts[mid] || accessCounts[mid] === 0) {
      const r = _tryCreateInsight("UNUSED_MEMORY", mid, "medium",
        `Memory exists but was never accessed`);
      if (r.created) created++;
      else duplicatesAvoided++;
    }
  }

  // POSSIBLE_ARCHIVE — not accessed in a long time
  const now = Date.now();
  const archiveMs = THRESHOLDS.archiveDays * 86400000;
  for (const [mid, ts] of Object.entries(lastAccess)) {
    if (ts) {
      const elapsed = now - new Date(ts).getTime();
      if (elapsed > archiveMs) {
        const r = _tryCreateInsight("POSSIBLE_ARCHIVE", mid, "medium",
          `Memory not accessed in ${THRESHOLDS.archiveDays}+ days`);
        if (r.created) created++;
        else duplicatesAvoided++;
      }
    }
  }

  // POSSIBLE_UPDATE
  for (const targetId of consolidationUpdates) {
    const r = _tryCreateInsight("POSSIBLE_UPDATE", targetId, "medium",
      `Consolidation suggested possible update — duplicate content detected`);
    if (r.created) created++;
    else duplicatesAvoided++;
  }

  // POSSIBLE_RELATIONSHIP
  for (const [pair, count] of Object.entries(coRetrievals)) {
    if (count >= THRESHOLDS.coRetrieval) {
      const [id1, id2] = pair.split("::");
      const r = _tryCreateInsight("POSSIBLE_RELATIONSHIP", id1, "medium",
        `Frequently co-retrieved with ${id2} (${count} times)`);
      if (r.created) created++;
      else duplicatesAvoided++;
    }
  }

  // POPULAR_TOPIC
  for (const [tag, count] of Object.entries(topicCounts)) {
    if (count >= THRESHOLDS.frequentAccess) {
      const r = _tryCreateInsight("POPULAR_TOPIC", tag, "medium",
        `Topic "${tag}" appeared ${count} times in retrievals`);
      if (r.created) created++;
      else duplicatesAvoided++;
    }
  }

  const elapsed = Date.now() - startTime;
  _stats.learningCompleted++;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.eventsAnalyzed += eventList.length;
  _stats.duplicatesAvoided += duplicatesAvoided;

  _decisionLog.push({
    event: "learningCompleted",
    created,
    duplicatesAvoided,
    eventsAnalyzed: eventList.length,
    processingTimeMs: elapsed,
  });

  return {
    created,
    duplicatesAvoided,
    eventsAnalyzed: eventList.length,
    processingTimeMs: elapsed,
  };
}

/**
 * Lista insights, opcionalmente filtrados.
 * @param {Object} filter — { type, status, memoryId }
 */
export function listInsights(filter = {}) {
  _stats.operations++;
  let results = Array.from(_insights.values());
  if (filter.type) results = results.filter((i) => i.type === filter.type);
  if (filter.status) results = results.filter((i) => i.status === filter.status);
  if (filter.memoryId) results = results.filter((i) => i.memoryId === filter.memoryId);
  return results;
}

/**
 * Retorna todos os insights de uma memória específica.
 */
export function getInsights(memoryId) {
  _stats.operations++;
  if (!memoryId) return [];
  return Array.from(_insights.values()).filter((i) => i.memoryId === memoryId);
}

/**
 * Descarta um insight (status → "dismissed").
 */
export function dismissInsight(insightId) {
  _stats.operations++;
  const insight = _insights.get(insightId);
  if (!insight) return false;
  insight.status = "dismissed";
  _stats.insightDismissed++;
  _decisionLog.push({ event: "insightDismissed", insightId });
  return true;
}

/**
 * Conta insights, opcionalmente filtrados.
 */
export function countInsights(filter = {}) {
  return listInsights(filter).length;
}

// === Observability ===

export function getStats() {
  const typeDist = {};
  for (const t of INSIGHT_TYPES) typeDist[t] = 0;
  for (const insight of _insights.values()) {
    if (insight.status === "active") {
      typeDist[insight.type] = (typeDist[insight.type] || 0) + 1;
    }
  }
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.learningCompleted > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.learningCompleted)
        : 0,
    totalInsights: _insights.size,
    activeInsights: Array.from(_insights.values()).filter((i) => i.status === "active").length,
    dismissedInsights: Array.from(_insights.values()).filter((i) => i.status === "dismissed").length,
    insightTypeDistribution: typeDist,
    decisionLog: [..._decisionLog],
  };
}

export function getDecisionLog() {
  return [..._decisionLog];
}

export function _resetForTests() {
  _insights.clear();
  _stats.learningStarted = 0;
  _stats.learningCompleted = 0;
  _stats.insightCreated = 0;
  _stats.insightDismissed = 0;
  _stats.duplicatesAvoided = 0;
  _stats.eventsAnalyzed = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _decisionLog.length = 0;
}

export default {
  generateInsights,
  listInsights,
  getInsights,
  dismissInsight,
  countInsights,
  getStats,
  getDecisionLog,
  _resetForTests,
};