/**
 * Long-Term Memory Retrieval Engine (Sprint 25 — LTM Retrieval)
 *
 * Camada responsável pela recuperação determinística de memórias permanentes.
 *
 * O QUE FAZ:
 *   - retrieve()            — filtra coleção por request, retorna result
 *   - retrieveByMemoryId()  — filtra por IDs
 *   - retrieveByType()      — filtra por tipos
 *   - retrieveByTag()       — filtra por tags
 *   - retrieveByStatus()    — filtra por statuses
 *   - retrieveBySource()    — filtra por origens
 *   - describeResult()     — descrição legível
 *   - validateRequest()    — valida request
 *   - validateResult()     — valida result
 *   - getStats()            — estatísticas
 *   - _resetForTests()      — reseta contadores
 *
 * O QUE NÃO FAZ:
 *   - IA, embeddings, vetores, similaridade, ranking, busca semântica
 *   - LLM, banco de dados, persistência, algoritmos cognitivos
 *   - Heurísticas
 *   - Ordenação por relevância
 */

import {
  buildRetrievalRequest,
  buildRetrievalResult,
  validateRetrievalRequest,
  validateRetrievalResult,
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  _resetIdsForTests,
} from "./longTermRetrieval";

// === Observability ===

const _stats = {
  retrievals: 0,
  validatedRequests: 0,
  validatedResults: 0,
  rejectedRequests: 0,
  returnedMemories: 0,
  totalProcessingTimeMs: 0,
  eventLog: [],
};

function _log(event, data) {
  _stats.eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Internal filter helpers ===

function _matchesMemoryIds(mem, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  return ids.includes(mem.memoryId) || ids.includes(mem.memoryRecordId);
}

function _matchesMemoryTypes(mem, types) {
  if (!Array.isArray(types) || types.length === 0) return true;
  return types.includes(mem.memoryType);
}

function _matchesTags(mem, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return true;
  if (!Array.isArray(mem.tags) || mem.tags.length === 0) return false;
  return tags.some((t) => mem.tags.includes(t));
}

function _matchesStatuses(mem, statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return true;
  return statuses.includes(mem.status);
}

function _matchesSources(mem, sources) {
  if (!Array.isArray(sources) || sources.length === 0) return true;
  return sources.includes(mem.source);
}

function _matchesQuery(mem, query) {
  if (!query || typeof query !== "string" || query.length === 0) return true;
  if (typeof mem.content !== "string") return false;
  return mem.content.toLowerCase().includes(query.toLowerCase());
}

function _buildFiltersApplied(req) {
  const filters = [];
  if (req.query) filters.push("query");
  if (req.memoryIds.length > 0) filters.push("memoryIds");
  if (req.memoryTypes.length > 0) filters.push("memoryTypes");
  if (req.tags.length > 0) filters.push("tags");
  if (req.statuses.length > 0) filters.push("statuses");
  if (req.sources.length > 0) filters.push("sources");
  if (req.limit !== DEFAULT_LIMIT) filters.push("limit");
  if (req.offset !== DEFAULT_OFFSET) filters.push("offset");
  return filters;
}

// === retrieve() ===

/**
 * Recebe um LongTermRetrievalRequest e uma coleção de memórias.
 * Aplica filtros determinísticos e retorna LongTermRetrievalResult.
 *
 * @param {Object} request — LongTermRetrievalRequest
 * @param {Array}  memories — coleção de memórias
 * @returns {Object} LongTermRetrievalResult
 */
export function retrieve(request, memories = []) {
  const startTime = Date.now();

  if (!Array.isArray(memories)) {
    memories = [];
  }

  // If request is already built (has requestId), use directly; otherwise build it
  let req = request;
  if (!req || !req.requestId || typeof req.requestId !== "string") {
    req = buildRetrievalRequest(request || {});
  }

  // Validate request
  const validation = validateRetrievalRequest(req);
  _stats.validatedRequests++;
  if (!validation.valid) {
    _stats.rejectedRequests++;
    _log("retrieveRejected", { error: validation.error });
    const result = buildRetrievalResult({
      requestId: req.requestId || null,
      matchedMemories: [],
      totalMatches: 0,
      filtersApplied: [],
      metadata: { error: validation.error },
    });
    _stats.retrievals++;
    _stats.totalProcessingTimeMs += Date.now() - startTime;
    return result;
  }

  // Apply deterministic filters
  const filtered = memories.filter((mem) =>
    mem &&
    typeof mem === "object" &&
    _matchesQuery(mem, req.query) &&
    _matchesMemoryIds(mem, req.memoryIds) &&
    _matchesMemoryTypes(mem, req.memoryTypes) &&
    _matchesTags(mem, req.tags) &&
    _matchesStatuses(mem, req.statuses) &&
    _matchesSources(mem, req.sources)
  );

  const totalMatches = filtered.length;
  const offset = req.offset;
  const limit = req.limit;

  // Apply offset + limit
  const paged = filtered.slice(offset, offset + limit);

  const filtersApplied = _buildFiltersApplied(req);

  const result = buildRetrievalResult({
    requestId: req.requestId,
    matchedMemories: paged,
    totalMatches,
    filtersApplied,
    metadata: {
      query: req.query || null,
      collectionSize: memories.length,
      offset,
      limit,
    },
  });

  _stats.retrievals++;
  _stats.returnedMemories += paged.length;
  _stats.totalProcessingTimeMs += Date.now() - startTime;
  _log("retrieved", {
    requestId: req.requestId,
    retrievalId: result.retrievalId,
    totalMatches,
    returned: paged.length,
  });

  return result;
}

// === retrieveByMemoryId() ===

export function retrieveByMemoryId(memoryIds, memories = [], limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET) {
  const ids = Array.isArray(memoryIds) ? memoryIds : [memoryIds];
  const req = buildRetrievalRequest({ memoryIds: ids, limit, offset });
  return retrieve(req, memories);
}

// === retrieveByType() ===

export function retrieveByType(memoryTypes, memories = [], limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET) {
  const types = Array.isArray(memoryTypes) ? memoryTypes : [memoryTypes];
  const req = buildRetrievalRequest({ memoryTypes: types, limit, offset });
  return retrieve(req, memories);
}

// === retrieveByTag() ===

export function retrieveByTag(tags, memories = [], limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET) {
  const t = Array.isArray(tags) ? tags : [tags];
  const req = buildRetrievalRequest({ tags: t, limit, offset });
  return retrieve(req, memories);
}

// === retrieveByStatus() ===

export function retrieveByStatus(statuses, memories = [], limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET) {
  const s = Array.isArray(statuses) ? statuses : [statuses];
  const req = buildRetrievalRequest({ statuses: s, limit, offset });
  return retrieve(req, memories);
}

// === retrieveBySource() ===

export function retrieveBySource(sources, memories = [], limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET) {
  const src = Array.isArray(sources) ? sources : [sources];
  const req = buildRetrievalRequest({ sources: src, limit, offset });
  return retrieve(req, memories);
}

// === describeResult() ===

export function describeResult(result) {
  if (!result) return null;

  _stats.described = (_stats.described || 0) + 1;

  const lines = [
    `Recuperação ${result.retrievalId}`,
    `  Request: ${result.requestId || "—"}`,
    `  Criada em: ${result.createdAt}`,
    `  Total de matches: ${result.totalMatches}`,
    `  Retornadas: ${result.returnedCount}`,
  ];

  if (result.filtersApplied.length > 0) {
    lines.push(`  Filtros: ${result.filtersApplied.join(", ")}`);
  } else {
    lines.push(`  Filtros: —`);
  }

  if (result.matchedMemories.length > 0) {
    lines.push(`  Memórias:`);
    for (const m of result.matchedMemories) {
      const mid = m?.memoryId ?? "—";
      const content = m?.content ?? "—";
      lines.push(`    • [${mid}] ${content}`);
    }
  }

  if (result.metadata && Object.keys(result.metadata).length > 0) {
    lines.push(`  Metadados:`);
    for (const [k, v] of Object.entries(result.metadata)) {
      lines.push(`    ${k}: ${v ?? "—"}`);
    }
  }

  return lines.join("\n");
}

// === validateRequest() ===

export function validateRequest(req) {
  const result = validateRetrievalRequest(req);
  _stats.validatedRequests++;
  if (!result.valid) {
    _stats.rejectedRequests++;
    _log("validateRequestRejected", { error: result.error });
  }
  return result;
}

// === validateResult() ===

export function validateResult(res) {
  const result = validateRetrievalResult(res);
  _stats.validatedResults++;
  return result;
}

// === getStats() ===

export function getStats() {
  return {
    retrievals: _stats.retrievals,
    validatedRequests: _stats.validatedRequests,
    validatedResults: _stats.validatedResults,
    rejectedRequests: _stats.rejectedRequests,
    returnedMemories: _stats.returnedMemories,
    averageProcessingTime:
      _stats.retrievals > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.retrievals)
        : 0,
    eventLog: [..._stats.eventLog],
  };
}

// === _resetForTests() ===

export function _resetForTests() {
  _stats.retrievals = 0;
  _stats.validatedRequests = 0;
  _stats.validatedResults = 0;
  _stats.rejectedRequests = 0;
  _stats.returnedMemories = 0;
  _stats.described = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.eventLog.length = 0;
  _resetIdsForTests();
}

export {
  buildRetrievalRequest,
  buildRetrievalResult,
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
};

export default {
  retrieve,
  retrieveByMemoryId,
  retrieveByType,
  retrieveByTag,
  retrieveByStatus,
  retrieveBySource,
  describeResult,
  validateRequest,
  validateResult,
  getStats,
  _resetForTests,
};