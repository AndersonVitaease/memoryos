/**
 * Memory Retrieval (Sprint 3)
 *
 * Primeiro mecanismo de recuperação de memória do Memory Engine.
 *
 * Responsabilidade única: RECUPERAR memórias relevantes.
 *
 * O QUE FAZ:
 *   - findById(id)         → busca por ID
 *   - findByTag(tag)       → busca por tag
 *   - findByType(type)     → busca por memoryType
 *   - findByIntent(intent) → busca por memoryIntent
 *   - search(query, opts)  → busca textual + filtros + ranking
 *
 * O QUE NÃO FAZ:
 *   - Interpretar memórias
 *   - Responder ao usuário
 *   - Alterar ou reclassificar Memory Records
 *   - Embeddings, vetores, semantic search
 *   - Versioning, relationships, lifecycle, consolidation, merge
 *
 * O Retrieval lê do Memory Store (Sprint 2, congelado) via list().
 * Nunca escreve. Nunca modifica.
 *
 * Ranking inicial:
 *   importance (high > medium > low)
 *   confidence (high > medium > low)
 *   createdAt (mais recente primeiro)
 */

import { list as _storeList, getById as _storeGetById } from "./memoryStore";
import { normalizeLegacyRecord, MEMORY_STATUSES, MEMORY_SOURCES } from "./memoryRecord";

// === Observabilidade interna ===
const _stats = {
  retrievalStarted: 0,
  retrievalCompleted: 0,
  recordsFound: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[MemoryRetrieval:${event}]`, data);
}

/**
 * Carrega todos os registros do Store e normaliza campos legados.
 * O Retrieval nunca altera o Store — apenas lê e normaliza em memória.
 */
function _loadAndNormalize() {
  return _storeList().map(normalizeLegacyRecord);
}

// === RANKING ===

const IMPORTANCE_WEIGHT = { high: 3, medium: 2, low: 1 };
const CONFIDENCE_WEIGHT = { high: 3, medium: 2, low: 1 };

/**
 * Calcula um score de ranking para um Memory Record.
 *
 * Critérios (maior = maior prioridade):
 *   1. importance: high=3, medium=2, low=1  (peso 1000)
 *   2. confidence: high=3, medium=2, low=1  (peso 100)
 *   3. createdAt: mais recente = maior       (peso 1, normalizado)
 *
 * @param {Object} record
 * @returns {number}
 */
function _rankScore(record) {
  const imp = IMPORTANCE_WEIGHT[record.importance] || 1;
  const conf = CONFIDENCE_WEIGHT[record.confidence] || 1;
  const ts = record.createdAt ? new Date(record.createdAt).getTime() : 0;
  // Normaliza timestamp para não dominar o score: usa segundos desde epoch
  return imp * 1000 + conf * 100 + Math.floor(ts / 1000);
}

/**
 * Ordena uma lista de Memory Records por ranking.
 * Maior importance primeiro, depois maior confidence, depois mais recente.
 *
 * @param {Object[]} records
 * @returns {Object[]} - Nova lista ordenada (não muta a original)
 */
function _rank(records) {
  return [...records].sort((a, b) => _rankScore(b) - _rankScore(a));
}

// === FILTROS ===

/**
 * Aplica filtros a uma lista de registros.
 *
 * Filtros suportados:
 *   - memoryType: string | string[]
 *   - memoryIntent: string | string[]
 *   - tags: string | string[]  (qualquer tag que corresponda)
 *   - status: string | string[]
 *   - source: string | string[]
 *
 * @param {Object[]} records
 * @param {Object} filters
 * @returns {Object[]}
 */
function _applyFilters(records, filters = {}) {
  if (!filters || typeof filters !== "object") return records;

  let result = records;

  if (filters.memoryType) {
    const vals = Array.isArray(filters.memoryType) ? filters.memoryType : [filters.memoryType];
    result = result.filter((r) => vals.includes(r.memoryType));
  }

  if (filters.memoryIntent) {
    const vals = Array.isArray(filters.memoryIntent) ? filters.memoryIntent : [filters.memoryIntent];
    result = result.filter((r) => vals.includes(r.memoryIntent));
  }

  if (filters.tags) {
    const vals = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
    result = result.filter((r) =>
      Array.isArray(r.tags) && vals.some((t) => r.tags.includes(t))
    );
  }

  if (filters.status) {
    const vals = Array.isArray(filters.status) ? filters.status : [filters.status];
    result = result.filter((r) => vals.includes(r.status || "active"));
  }

  if (filters.source) {
    const vals = Array.isArray(filters.source) ? filters.source : [filters.source];
    result = result.filter((r) => vals.includes(r.source || "conversation"));
  }

  return result;
}

// === API PÚBLICA ===

/**
 * Busca um Memory Record pelo ID.
 *
 * @param {string} id
 * @returns {Object|null} - Memory Record normalizado, ou null
 */
export function findById(id) {
  const startTime = Date.now();
  _stats.retrievalStarted++;
  _log("retrievalStarted", { method: "findById", id });

  if (!id) {
    _stats.retrievalCompleted++;
    return null;
  }

  const record = _storeGetById(id);
  const result = record ? normalizeLegacyRecord(record) : null;

  const elapsed = Date.now() - startTime;
  _stats.retrievalCompleted++;
  _stats.recordsFound += result ? 1 : 0;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.operations++;
  _log("retrievalCompleted", { method: "findById", found: !!result, processingTimeMs: elapsed });

  return result;
}

/**
 * Busca Memory Records por tag.
 *
 * @param {string} tag
 * @param {Object} [options] - Filtros opcionais + limit
 * @returns {Object[]} - Lista ranqueada
 */
export function findByTag(tag, options = {}) {
  const startTime = Date.now();
  _stats.retrievalStarted++;
  _log("retrievalStarted", { method: "findByTag", tag });

  if (!tag) {
    _stats.retrievalCompleted++;
    return [];
  }

  let records = _loadAndNormalize();
  records = _applyFilters(records, options);
  records = records.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag));
  records = _rank(records);
  if (options.limit) records = records.slice(0, options.limit);

  const elapsed = Date.now() - startTime;
  _stats.retrievalCompleted++;
  _stats.recordsFound += records.length;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.operations++;
  _log("retrievalCompleted", { method: "findByTag", found: records.length, processingTimeMs: elapsed });

  return records;
}

/**
 * Busca Memory Records por memoryType.
 *
 * @param {string} memoryType
 * @param {Object} [options] - Filtros opcionais + limit
 * @returns {Object[]} - Lista ranqueada
 */
export function findByType(memoryType, options = {}) {
  const startTime = Date.now();
  _stats.retrievalStarted++;
  _log("retrievalStarted", { method: "findByType", memoryType });

  if (!memoryType) {
    _stats.retrievalCompleted++;
    return [];
  }

  let records = _loadAndNormalize();
  records = _applyFilters(records, { ...options, memoryType });
  records = _rank(records);
  if (options.limit) records = records.slice(0, options.limit);

  const elapsed = Date.now() - startTime;
  _stats.retrievalCompleted++;
  _stats.recordsFound += records.length;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.operations++;
  _log("retrievalCompleted", { method: "findByType", found: records.length, processingTimeMs: elapsed });

  return records;
}

/**
 * Busca Memory Records por memoryIntent.
 *
 * @param {string} memoryIntent
 * @param {Object} [options] - Filtros opcionais + limit
 * @returns {Object[]} - Lista ranqueada
 */
export function findByIntent(memoryIntent, options = {}) {
  const startTime = Date.now();
  _stats.retrievalStarted++;
  _log("retrievalStarted", { method: "findByIntent", memoryIntent });

  if (!memoryIntent) {
    _stats.retrievalCompleted++;
    return [];
  }

  let records = _loadAndNormalize();
  records = _applyFilters(records, { ...options, memoryIntent });
  records = _rank(records);
  if (options.limit) records = records.slice(0, options.limit);

  const elapsed = Date.now() - startTime;
  _stats.retrievalCompleted++;
  _stats.recordsFound += records.length;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.operations++;
  _log("retrievalCompleted", { method: "findByIntent", found: records.length, processingTimeMs: elapsed });

  return records;
}

/**
 * Busca textual simples em Memory Records.
 *
 * Procura em: normalizedContent, suggestedTitle, originalMessage, tags, reason.
 * Não usa embeddings nem vetores — apenas substring (case-insensitive).
 *
 * @param {string} query - Texto de busca
 * @param {Object} [options] - Filtros + limit
 * @returns {Object[]} - Lista filtrada e ranqueada
 */
export function search(query, options = {}) {
  const startTime = Date.now();
  _stats.retrievalStarted++;
  _log("retrievalStarted", { method: "search", query, filters: options });

  let records = _loadAndNormalize();
  records = _applyFilters(records, options);

  if (query && typeof query === "string") {
    const q = query.toLowerCase().trim();
    if (q) {
      records = records.filter((r) => {
        const fields = [
          r.normalizedContent || "",
          r.suggestedTitle || "",
          r.originalMessage || "",
          r.reason || "",
          Array.isArray(r.tags) ? r.tags.join(" ") : "",
        ];
        return fields.some((f) => f.toLowerCase().includes(q));
      });
    }
  }

  records = _rank(records);
  if (options.limit) records = records.slice(0, options.limit);

  const elapsed = Date.now() - startTime;
  _stats.retrievalCompleted++;
  _stats.recordsFound += records.length;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.operations++;
  _log("retrievalCompleted", { method: "search", found: records.length, processingTimeMs: elapsed });

  return records;
}

/**
 * Retorna estatísticas de observabilidade do Retrieval.
 * Apenas logs internos — nenhum evento externo.
 */
export function getRetrievalStats() {
  return {
    ..._stats,
    averageProcessingTimeMs: _stats.operations > 0
      ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
      : 0,
  };
}

/**
 * Reseta as estatísticas de observabilidade (para testes).
 */
export function _resetRetrievalStats() {
  _stats.retrievalStarted = 0;
  _stats.retrievalCompleted = 0;
  _stats.recordsFound = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
}

export default {
  findById,
  findByTag,
  findByType,
  findByIntent,
  search,
  getRetrievalStats,
  _resetRetrievalStats,
};