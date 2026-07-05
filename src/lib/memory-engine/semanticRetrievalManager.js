/**
 * Semantic Retrieval Manager (Sprint 9)
 *
 * Recupera conhecimento contextual de forma determinística.
 * Não utiliza IA, Embeddings ou Vetores.
 *
 * Arquitetura:
 *   Memory Retrieval
 *     ↓
 *   Semantic Retrieval
 *     ↓
 *   Memory Context Builder
 *     ↓
 *   Core
 *
 * Recebe:
 *   Consulta + Memory Records + Relationships + Version History
 *
 * Retorna:
 *   Lista ordenada de Memory Records relevantes.
 *
 * Nunca modifica:
 *   Memory Records, Relationships, Lifecycle, Version History
 *
 * Pipeline de expansão:
 *   1) Encontrar Memory Record principal
 *   2) Expandir relações diretas
 *   3) Eliminar duplicidade
 *   4) Priorizar revisões ativas
 *   5) Enviar ao Context Builder
 *
 * Ranking usa apenas:
 *   Memory Relationships, Version Chain, Memory Intent,
 *   Tags, Tipo, Status, Importance
 */

import { expand as expandRelationships } from "./memoryRelationshipsManager";
import { getLatest as getLatestRevision } from "./memoryVersioningManager";

// === Tabela de pontuação (configurável) ===
export const DEFAULT_SCORE_TABLE = {
  SAME_MEMORY_INTENT: 40,
  SAME_PROJECT: 30,
  DIRECT_RELATIONSHIP: 20,
  SAME_TYPE: 10,
  EXPIRED: -20,
  ARCHIVED: -10,
  HIGH_IMPORTANCE: 15,
  MEDIUM_IMPORTANCE: 5,
  ACTIVE_STATUS: 10,
  LATEST_REVISION: 10,
};

let _scoreTable = { ...DEFAULT_SCORE_TABLE };

/**
 * Permite configurar a tabela de pontuação.
 * @param {Object} table
 */
export function setScoreTable(table) {
  _scoreTable = { ...DEFAULT_SCORE_TABLE, ...table };
}

export function getScoreTable() {
  return { ..._scoreTable };
}

// === Observabilidade ===
const _stats = {
  semanticStarted: 0,
  semanticExpanded: 0,
  semanticRanked: 0,
  semanticCompleted: 0,
  totalExpanded: 0,
  duplicatesRemoved: 0,
  memoriesDiscarded: 0,
  latestRevisionsUsed: 0,
  totalSearches: 0,
  totalProcessingTimeMs: 0,
  totalRankingScore: 0,
  rankedCount: 0,
  noAIUsed: true,
};

const _decisionLog = [];

function _recordTime(startTime) {
  _stats.totalProcessingTimeMs += Date.now() - startTime;
}

function _deepCopy(obj) {
  if (!obj || typeof obj !== "object") return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Normaliza texto para comparação determinística.
 */
function _normalize(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function _tokenize(text) {
  const n = _normalize(text);
  if (!n) return [];
  return n.split(" ").filter((w) => w.length > 1);
}

/**
 * Verifica se um Memory Record expirou.
 */
function _isExpired(record) {
  if (!record.expires) return false;
  try {
    return new Date(record.expires).getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Pontua um Memory Record individual contra a consulta e contexto.
 *
 * @param {Object} record — Memory Record
 * @param {Object} context — { query, queryIntent, queryProjectId, relatedIds, latestRevisions }
 * @returns {{ score: number, reasons: string[] }}
 */
export function scoreMemory(record, context = {}) {
  const reasons = [];
  let score = 0;

  // Mesmo Memory Intent
  if (
    context.queryIntent &&
    record.memoryIntent &&
    record.memoryIntent === context.queryIntent
  ) {
    score += _scoreTable.SAME_MEMORY_INTENT;
    reasons.push("SAME_MEMORY_INTENT");
  }

  // Mesmo Projeto (via metadata.project_id ou tags)
  if (
    context.queryProjectId &&
    (record.metadata?.project_id === context.queryProjectId ||
      (Array.isArray(record.tags) && record.tags.includes(context.queryProjectId)))
  ) {
    score += _scoreTable.SAME_PROJECT;
    reasons.push("SAME_PROJECT");
  }

  // Relacionamento direto
  if (
    context.relatedIds &&
    Array.isArray(context.relatedIds) &&
    context.relatedIds.includes(record.id)
  ) {
    score += _scoreTable.DIRECT_RELATIONSHIP;
    reasons.push("DIRECT_RELATIONSHIP");
  }

  // Mesmo Tipo
  if (context.queryType && record.memoryType === context.queryType) {
    score += _scoreTable.SAME_TYPE;
    reasons.push("SAME_TYPE");
  }

  // Status
  const status = record.status || "active";
  if (status === "active") {
    score += _scoreTable.ACTIVE_STATUS;
    reasons.push("ACTIVE_STATUS");
  }

  // Expirado
  if (_isExpired(record) || status === "expired") {
    score += _scoreTable.EXPIRED;
    reasons.push("EXPIRED");
  }

  // Arquivado
  if (status === "archived") {
    score += _scoreTable.ARCHIVED;
    reasons.push("ARCHIVED");
  }

  // Importance
  if (record.importance === "high") {
    score += _scoreTable.HIGH_IMPORTANCE;
    reasons.push("HIGH_IMPORTANCE");
  } else if (record.importance === "medium") {
    score += _scoreTable.MEDIUM_IMPORTANCE;
    reasons.push("MEDIUM_IMPORTANCE");
  }

  // Última revisão
  if (
    context.latestRevisions &&
    context.latestRevisions[record.id] === true
  ) {
    score += _scoreTable.LATEST_REVISION;
    reasons.push("LATEST_REVISION");
  }

  return { score, reasons };
}

/**
 * Ordena resultados por pontuação (decrescente).
 *
 * @param {Array} scoredResults — [{ record, score, reasons }]
 * @returns {Array}
 */
export function rankResults(scoredResults) {
  _stats.semanticRanked++;
  return [...scoredResults].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Desempate: importance
    const imp = { high: 3, medium: 2, low: 1 };
    return (imp[b.record.importance] || 0) - (imp[a.record.importance] || 0);
  });
}

/**
 * Busca semântica determinística.
 *
 * @param {Object} params
 * @param {string} params.query — texto da consulta
 * @param {Array} params.memories — Memory Records disponíveis
 * @param {string} [params.queryIntent] — Memory Intent da consulta
 * @param {string} [params.queryType] — Memory Type da consulta
 * @param {string} [params.queryProjectId] — Project ID da consulta
 * @param {Object} [params.options] — { maxResults, minScore, useRelationships, useVersionHistory }
 * @returns {{ results: Array, stats: Object, expanded: Array, duplicatesRemoved: number }}
 */
export function semanticSearch({
  query,
  memories,
  queryIntent = null,
  queryType = null,
  queryProjectId = null,
  options = {},
}) {
  const startTime = Date.now();
  _stats.semanticStarted++;
  _stats.totalSearches++;
  _stats.noAIUsed = true;

  const opts = {
    maxResults: options.maxResults || 50,
    minScore: options.minScore ?? -Infinity,
    useRelationships: options.useRelationships !== false,
    useVersionHistory: options.useVersionHistory !== false,
  };

  const allMemories = Array.isArray(memories) ? memories : [];
  if (allMemories.length === 0) {
    _stats.semanticCompleted++;
    _recordTime(startTime);
    return { results: [], stats: { total: 0, expanded: 0, duplicatesRemoved: 0 }, expanded: [], duplicatesRemoved: 0 };
  }

  // === Passo 1: Encontrar Memory Records principais (para expansão) ===
  // Tokens identificam quais memórias são "primárias" para expansão,
  // mas TODAS as memórias são incluídas no ranking final.
  const queryTokens = _tokenize(query || "");

  let primaryMatches = [];
  if (queryTokens.length > 0) {
    primaryMatches = allMemories.filter((m) => {
      const contentTokens = new Set(_tokenize(m.normalizedContent || m.originalMessage || ""));
      const tagTokens = new Set((m.tags || []).map((t) => _normalize(t)));
      return queryTokens.some((qt) => contentTokens.has(qt) || tagTokens.has(qt));
    });
  }
  if (primaryMatches.length === 0) {
    primaryMatches = [...allMemories];
  }

  // === Passo 2: Expandir relações diretas (a partir das primárias) ===
  let expandedIds = new Set();
  const expandedRecords = [];

  if (opts.useRelationships) {
    for (const m of primaryMatches) {
      const expansion = expandRelationships(m.id);
      _stats.totalExpanded += expansion.directCount;
      _stats.semanticExpanded++;
      for (const rel of expansion.relationships) {
        const otherId = rel.sourceMemoryId === m.id ? rel.targetMemoryId : rel.sourceMemoryId;
        expandedIds.add(otherId);
      }
    }
    for (const id of expandedIds) {
      const found = allMemories.find((m) => m.id === id);
      if (found) {
        expandedRecords.push(found);
      }
    }
  }

  // Combinar TODAS as memórias + expandidas (todas são ranqueadas)
  let combined = [...allMemories];
  for (const r of expandedRecords) {
    if (!combined.find((m) => m.id === r.id)) {
      combined.push(r);
    }
  }

  // === Passo 3: Eliminar duplicidade ===
  const seen = new Set();
  const deduped = [];
  for (const m of combined) {
    if (seen.has(m.id)) {
      _stats.duplicatesRemoved++;
      continue;
    }
    seen.add(m.id);
    deduped.push(m);
  }

  // === Passo 4: Priorizar revisões ativas ===
  let latestRevisionsMap = {};
  if (opts.useVersionHistory) {
    for (const m of deduped) {
      const latest = getLatestRevision(m.id);
      if (latest && latest.revision > (m.revision || 1)) {
        // Existe uma revisão mais nova — marcar
        latestRevisionsMap[m.id] = false;
      } else {
        latestRevisionsMap[m.id] = true;
      }
    }
  }

  // Contar revisões ativas usadas
  const activeCount = Object.values(latestRevisionsMap).filter((v) => v === true).length;
  _stats.latestRevisionsUsed += activeCount;

  // === Passo 5: Pontuar e ranquear ===
  const context = {
    query,
    queryIntent,
    queryType,
    queryProjectId,
    relatedIds: [...expandedIds],
    latestRevisions: latestRevisionsMap,
  };

  const scored = deduped.map((record) => {
    const result = scoreMemory(record, context);
    _stats.totalRankingScore += result.score;
    _stats.rankedCount++;
    return { record: _deepCopy(record), score: result.score, reasons: result.reasons };
  });

  const ranked = rankResults(scored);

  // Filtrar por minScore e limitar
  const filtered = ranked
    .filter((r) => r.score >= opts.minScore)
    .slice(0, opts.maxResults);

  // Memórias descartadas (abaixo do minScore ou além do limite)
  _stats.memoriesDiscarded += ranked.length - filtered.length;

  _stats.semanticCompleted++;
  _recordTime(startTime);

  _decisionLog.push({
    action: "SEARCH",
    query: query?.substring(0, 50),
    primaryMatches: primaryMatches.length,
    expanded: expandedRecords.length,
    duplicatesRemoved: combined.length - deduped.length,
    ranked: ranked.length,
    returned: filtered.length,
    elapsed: Date.now() - startTime,
  });

  return {
    results: filtered,
    stats: {
      total: filtered.length,
      primary: primaryMatches.length,
      expanded: expandedRecords.length,
      duplicatesRemoved: combined.length - deduped.length,
    },
    expanded: expandedRecords.map((r) => _deepCopy(r)),
    duplicatesRemoved: combined.length - deduped.length,
  };
}

/**
 * Expande o contexto semântico de uma memória.
 *
 * @param {Object} params
 * @param {string} params.memoryId — ID da memória principal
 * @param {Array} params.memories — Memory Records disponíveis
 * @param {Object} [params.options]
 * @returns {{ primary: Object|null, related: Array, results: Array }}
 */
export function expandSemanticContext({ memoryId, memories, options = {} }) {
  const startTime = Date.now();
  _stats.semanticStarted++;
  _stats.totalSearches++;
  _stats.noAIUsed = true;

  const allMemories = Array.isArray(memories) ? memories : [];
  const primary = allMemories.find((m) => m.id === memoryId) || null;

  if (!primary) {
    _stats.semanticCompleted++;
    _recordTime(startTime);
    return { primary: null, related: [], results: [] };
  }

  // Expandir relações diretas
  const expansion = expandRelationships(memoryId);
  _stats.totalExpanded += expansion.directCount;
  _stats.semanticExpanded++;

  const relatedIds = new Set();
  const relatedRecords = [];
  for (const rel of expansion.relationships) {
    const otherId = rel.sourceMemoryId === memoryId ? rel.targetMemoryId : rel.sourceMemoryId;
    relatedIds.add(otherId);
    const found = allMemories.find((m) => m.id === otherId);
    if (found) relatedRecords.push(_deepCopy(found));
  }

  // Combinar primária + relacionadas
  let combined = [primary, ...relatedRecords];

  // Deduplicação
  const seen = new Set();
  const deduped = [];
  for (const m of combined) {
    if (seen.has(m.id)) {
      _stats.duplicatesRemoved++;
      continue;
    }
    seen.add(m.id);
    deduped.push(m);
  }

  // Pontuar
  const context = {
    query: primary.originalMessage || "",
    queryIntent: primary.memoryIntent,
    queryType: primary.memoryType,
    queryProjectId: primary.metadata?.project_id,
    relatedIds: [...relatedIds],
    latestRevisions: {},
  };

  const scored = deduped.map((record) => {
    const result = scoreMemory(record, context);
    _stats.totalRankingScore += result.score;
    _stats.rankedCount++;
    return { record: _deepCopy(record), score: result.score, reasons: result.reasons };
  });

  const ranked = rankResults(scored);

  _stats.semanticCompleted++;
  _recordTime(startTime);

  _decisionLog.push({
    action: "EXPAND_CONTEXT",
    memoryId,
    related: relatedRecords.length,
    duplicatesRemoved: combined.length - deduped.length,
    returned: ranked.length,
    elapsed: Date.now() - startTime,
  });

  return {
    primary: _deepCopy(primary),
    related: relatedRecords,
    results: ranked,
  };
}

// === Observabilidade ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.totalSearches > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.totalSearches)
        : 0,
    averageRankingScore:
      _stats.rankedCount > 0
        ? Math.round(_stats.totalRankingScore / _stats.rankedCount)
        : 0,
  };
}

export function getDecisionLog() {
  return [..._decisionLog];
}

export function _resetForTests() {
  _stats.semanticStarted = 0;
  _stats.semanticExpanded = 0;
  _stats.semanticRanked = 0;
  _stats.semanticCompleted = 0;
  _stats.totalExpanded = 0;
  _stats.duplicatesRemoved = 0;
  _stats.memoriesDiscarded = 0;
  _stats.latestRevisionsUsed = 0;
  _stats.totalSearches = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.totalRankingScore = 0;
  _stats.rankedCount = 0;
  _stats.noAIUsed = true;
  _decisionLog.length = 0;
}

export default {
  semanticSearch,
  expandSemanticContext,
  scoreMemory,
  rankResults,
  setScoreTable,
  getScoreTable,
  getStats,
  getDecisionLog,
  _resetForTests,
  DEFAULT_SCORE_TABLE,
};