/**
 * Long-Term Memory Retrieval Contract (Sprint 25 — LTM Retrieval)
 *
 * Contratos imutáveis para recuperação determinística de memórias permanentes.
 *
 * NÃO utiliza IA, embeddings, vetores, similaridade, ranking, busca semântica,
 * LLM, banco de dados, persistência ou algoritmos cognitivos.
 *
 * Apenas filtros determinísticos.
 */

// === Long-Term Memory Retrieval Request Fields ===

export const LTM_RETRIEVAL_REQUEST_FIELDS = [
  "requestId",
  "createdAt",
  "query",
  "memoryIds",
  "memoryTypes",
  "tags",
  "statuses",
  "sources",
  "limit",
  "offset",
  "metadata",
];

// === Long-Term Memory Retrieval Result Fields ===

export const LTM_RETRIEVAL_RESULT_FIELDS = [
  "requestId",
  "retrievalId",
  "createdAt",
  "matchedMemories",
  "totalMatches",
  "returnedCount",
  "filtersApplied",
  "metadata",
];

// === Defaults ===

export const DEFAULT_LIMIT = 50;
export const DEFAULT_OFFSET = 0;

// === Deterministic ID generation ===

let _requestIdCounter = 0;
let _retrievalIdCounter = 0;

function generateRequestId() {
  _requestIdCounter++;
  return `ltr-req-${_requestIdCounter}`;
}

function generateRetrievalId() {
  _retrievalIdCounter++;
  return `ltr-res-${_retrievalIdCounter}`;
}

export function _resetIdsForTests() {
  _requestIdCounter = 0;
  _retrievalIdCounter = 0;
}

// === Builder: LongTermRetrievalRequest ===

/**
 * Constrói uma LongTermRetrievalRequest imutável.
 * Nenhuma regra de negócio. Nenhuma recuperação.
 */
export function buildRetrievalRequest({
  query,
  memoryIds,
  memoryTypes,
  tags,
  statuses,
  sources,
  limit,
  offset,
  metadata,
} = {}) {
  const lim = typeof limit === "number" && limit >= 0 ? limit : DEFAULT_LIMIT;
  const off = typeof offset === "number" && offset >= 0 ? offset : DEFAULT_OFFSET;

  return Object.freeze({
    requestId: generateRequestId(),
    createdAt: new Date().toISOString(),
    query: typeof query === "string" ? query : "",
    memoryIds: Array.isArray(memoryIds) ? Object.freeze([...memoryIds]) : Object.freeze([]),
    memoryTypes: Array.isArray(memoryTypes) ? Object.freeze([...memoryTypes]) : Object.freeze([]),
    tags: Array.isArray(tags) ? Object.freeze([...tags]) : Object.freeze([]),
    statuses: Array.isArray(statuses) ? Object.freeze([...statuses]) : Object.freeze([]),
    sources: Array.isArray(sources) ? Object.freeze([...sources]) : Object.freeze([]),
    limit: lim,
    offset: off,
    metadata: metadata && typeof metadata === "object"
      ? Object.freeze({ ...metadata })
      : Object.freeze({}),
  });
}

// === Builder: LongTermRetrievalResult ===

/**
 * Constrói uma LongTermRetrievalResult imutável.
 */
export function buildRetrievalResult({
  requestId,
  matchedMemories,
  totalMatches,
  filtersApplied,
  metadata,
} = {}) {
  const matched = Array.isArray(matchedMemories) ? matchedMemories : [];
  const total = typeof totalMatches === "number" ? totalMatches : matched.length;

  return Object.freeze({
    requestId: requestId || null,
    retrievalId: generateRetrievalId(),
    createdAt: new Date().toISOString(),
    matchedMemories: Object.freeze([...matched]),
    totalMatches: total,
    returnedCount: matched.length,
    filtersApplied: Array.isArray(filtersApplied)
      ? Object.freeze([...filtersApplied])
      : Object.freeze([]),
    metadata: metadata && typeof metadata === "object"
      ? Object.freeze({ ...metadata })
      : Object.freeze({}),
  });
}

// === Validator: LongTermRetrievalRequest ===

export function validateRetrievalRequest(req) {
  if (!req || typeof req !== "object") {
    return { valid: false, error: "request is not an object" };
  }
  if (!req.requestId || typeof req.requestId !== "string") {
    return { valid: false, error: "missing requestId" };
  }
  if (!req.createdAt || typeof req.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (typeof req.query !== "string") {
    return { valid: false, error: "query must be a string" };
  }
  if (!Array.isArray(req.memoryIds)) {
    return { valid: false, error: "memoryIds must be an array" };
  }
  if (!Array.isArray(req.memoryTypes)) {
    return { valid: false, error: "memoryTypes must be an array" };
  }
  if (!Array.isArray(req.tags)) {
    return { valid: false, error: "tags must be an array" };
  }
  if (!Array.isArray(req.statuses)) {
    return { valid: false, error: "statuses must be an array" };
  }
  if (!Array.isArray(req.sources)) {
    return { valid: false, error: "sources must be an array" };
  }
  if (typeof req.limit !== "number" || req.limit < 0) {
    return { valid: false, error: "limit must be a non-negative number" };
  }
  if (typeof req.offset !== "number" || req.offset < 0) {
    return { valid: false, error: "offset must be a non-negative number" };
  }
  if (!req.metadata || typeof req.metadata !== "object") {
    return { valid: false, error: "missing metadata" };
  }
  if (!LTM_RETRIEVAL_REQUEST_FIELDS.every((f) => f in req)) {
    return { valid: false, error: "missing required request fields" };
  }
  return { valid: true, error: null };
}

// === Validator: LongTermRetrievalResult ===

export function validateRetrievalResult(res) {
  if (!res || typeof res !== "object") {
    return { valid: false, error: "result is not an object" };
  }
  if (!res.requestId || typeof res.requestId !== "string") {
    return { valid: false, error: "missing requestId" };
  }
  if (!res.retrievalId || typeof res.retrievalId !== "string") {
    return { valid: false, error: "missing retrievalId" };
  }
  if (!res.createdAt || typeof res.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (!Array.isArray(res.matchedMemories)) {
    return { valid: false, error: "matchedMemories must be an array" };
  }
  if (typeof res.totalMatches !== "number") {
    return { valid: false, error: "totalMatches must be a number" };
  }
  if (typeof res.returnedCount !== "number") {
    return { valid: false, error: "returnedCount must be a number" };
  }
  if (!Array.isArray(res.filtersApplied)) {
    return { valid: false, error: "filtersApplied must be an array" };
  }
  if (!res.metadata || typeof res.metadata !== "object") {
    return { valid: false, error: "missing metadata" };
  }
  if (!LTM_RETRIEVAL_RESULT_FIELDS.every((f) => f in res)) {
    return { valid: false, error: "missing required result fields" };
  }
  return { valid: true, error: null };
}