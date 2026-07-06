/**
 * Memory Update Result Contract (Sprint 22 — Memory Engine)
 *
 * Contrato oficial do resultado de atualização de memória.
 * O Memory Engine recebe uma Memory Update Proposal e produz um
 * Memory Update Result contendo o resultado da persistência.
 *
 * Campos imutáveis:
 *   resultId           — ID determinístico do resultado
 *   proposalId        — ID da proposta de origem
 *   action             — "CREATE" | "UPDATE" | "MERGE" | "IGNORE"
 *   status             — "PERSISTED" | "SKIPPED" | "REJECTED" | "DEFERRED"
 *   persistedMemories  — memórias efetivamente persistidas
 *   duplicatesFound    — número de duplicidades detectadas
 *   conflictsResolved  — número de conflitos resolvidos
 *   conflictsUnresolved— número de conflitos não resolvidos
 *   policyDecisions    — decisões de política aplicadas
 *   auditTrail         — trilha de auditoria
 *   confidence         — "LOW" | "MEDIUM" | "HIGH"
 *   requiresReview     — boolean
 *   createdAt           — timestamp ISO
 */

export const RESULT_ACTIONS = ["CREATE", "UPDATE", "MERGE", "IGNORE"];
export const RESULT_STATUSES = ["PERSISTED", "SKIPPED", "REJECTED", "DEFERRED"];
export const RESULT_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"];

// Sprint 22.1 — Storage policies (hints for Sprint 23, never executed here)
export const STORAGE_POLICIES = [
  "WORKING_MEMORY",
  "SHORT_TERM_MEMORY",
  "LONG_TERM_MEMORY",
  "SEMANTIC_MEMORY",
  "EPISODIC_MEMORY",
];

// Sprint 22.1 — Retention policies
export const RETENTION_POLICIES = [
  "PERMANENT",
  "TEMPORARY",
  "ARCHIVE",
  "DELETE_AFTER_X_DAYS",
];

export const MEMORY_UPDATE_RESULT_FIELDS = [
  "resultId",
  "proposalId",
  "action",
  "status",
  "persistedMemories",
  "duplicatesFound",
  "conflictsResolved",
  "conflictsUnresolved",
  "policyDecisions",
  "auditTrail",
  "confidence",
  "requiresReview",
  "createdAt",
];

export const PERSISTED_MEMORY_FIELDS = [
  "memoryId",
  "memoryType",
  "content",
  "tags",
  "confidence",
  "source",
  // Sprint 22.1 enrichment:
  "memoryRecordId",
  "storagePolicy",
  "retentionPolicy",
  "importanceScore",
  "storageHints",
  "qualityMetrics",
];

export const STORAGE_HINTS_FIELDS = [
  "category",
  "priority",
  "recommendedIndexes",
  "compression",
  "versioning",
  "notes",
];

export const QUALITY_METRICS_FIELDS = [
  "confidence",
  "consistency",
  "completeness",
  "relevance",
  "reliability",
];

// === Deterministic ID generation (no Math.random, no Date.now for IDs) ===

let _resultIdCounter = 0;
function generateResultId() {
  _resultIdCounter++;
  return `mur-${_resultIdCounter}`;
}

let _memoryIdCounter = 0;
function generateMemoryId() {
  _memoryIdCounter++;
  return `mem-${_memoryIdCounter}`;
}

// Sprint 22.1 — Deterministic memoryRecordId, derived from a stable sequence.
// Reproducible across runs with the same call order. No Math.random.
let _memoryRecordIdCounter = 0;
export function generateMemoryRecordId() {
  _memoryRecordIdCounter++;
  return `mrec-${_memoryRecordIdCounter}`;
}

let _auditIdCounter = 0;
function generateAuditId() {
  _auditIdCounter++;
  return `audit-${_auditIdCounter}`;
}

export function _resetIdsForTests() {
  _resultIdCounter = 0;
  _memoryIdCounter = 0;
  _memoryRecordIdCounter = 0;
  _auditIdCounter = 0;
}

// === Sprint 22.1 — Builders (structure only, no heuristics) ===

/**
 * Sprint 22.1 — Builds the storageHints structure.
 * No inference, no auto-fill. All fields null except recommendedIndexes (empty array).
 * Future sprints (Storage Engine, Importance Engine, etc.) will populate these values.
 */
export function buildStorageHints({
  category,
  priority,
  recommendedIndexes,
  compression,
  versioning,
  notes,
} = {}) {
  return Object.freeze({
    category: category ?? null,
    priority: priority ?? null,
    recommendedIndexes: Object.freeze(
      Array.isArray(recommendedIndexes) ? [...recommendedIndexes] : []
    ),
    compression: compression ?? null,
    versioning: versioning ?? null,
    notes: notes ?? null,
  });
}

/**
 * Sprint 22.1 — Builds the qualityMetrics structure.
 * No calculation. All fields null. Future sprints will compute metrics.
 */
export function buildQualityMetrics({
  confidence,
  consistency,
  completeness,
  relevance,
  reliability,
} = {}) {
  return Object.freeze({
    confidence: confidence ?? null,
    consistency: consistency ?? null,
    completeness: completeness ?? null,
    relevance: relevance ?? null,
    reliability: reliability ?? null,
  });
}

// === Builders ===

export function buildPersistedMemory({
  memoryType,
  content,
  tags,
  confidence,
  source,
  // Sprint 22.1 enrichment — structure only, no heuristics:
  memoryRecordId,
  storagePolicy,
  retentionPolicy,
  importanceScore,
  storageHints,
  qualityMetrics,
}) {
  if (!content) throw new Error("persisted memory content is required");
  const conf = RESULT_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";

  return Object.freeze({
    memoryId: generateMemoryId(),
    memoryType: memoryType || "fact",
    content,
    tags: Array.isArray(tags) ? Object.freeze([...tags]) : Object.freeze([]),
    confidence: conf,
    source: source || "proposal",
    // Sprint 22.1 — fields exist but carry no decision:
    memoryRecordId: memoryRecordId || generateMemoryRecordId(),
    storagePolicy: storagePolicy ?? null,
    retentionPolicy: retentionPolicy ?? null,
    importanceScore: importanceScore ?? null,
    storageHints: storageHints || buildStorageHints(),
    qualityMetrics: qualityMetrics || buildQualityMetrics(),
  });
}

export function buildPolicyDecision({ policy, applied, reason }) {
  if (!policy) throw new Error("policy name is required");
  return Object.freeze({
    policy,
    applied: Boolean(applied),
    reason: reason || "",
  });
}

export function buildAuditEntry({ step, action, detail }) {
  if (!step) throw new Error("audit step is required");
  return Object.freeze({
    auditId: generateAuditId(),
    step,
    action: action || "",
    detail: detail || "",
    timestamp: new Date().toISOString(),
  });
}

export function buildMemoryUpdateResult({
  proposalId,
  action,
  status,
  persistedMemories,
  duplicatesFound,
  conflictsResolved,
  conflictsUnresolved,
  policyDecisions,
  auditTrail,
  confidence,
  requiresReview,
}) {
  const act = RESULT_ACTIONS.includes(action) ? action : "IGNORE";
  const stat = RESULT_STATUSES.includes(status) ? status : "REJECTED";
  const conf = RESULT_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";

  return Object.freeze({
    resultId: generateResultId(),
    proposalId: proposalId || null,
    action: act,
    status: stat,
    persistedMemories: Array.isArray(persistedMemories)
      ? Object.freeze([...persistedMemories])
      : Object.freeze([]),
    duplicatesFound: typeof duplicatesFound === "number" ? duplicatesFound : 0,
    conflictsResolved: typeof conflictsResolved === "number" ? conflictsResolved : 0,
    conflictsUnresolved: typeof conflictsUnresolved === "number" ? conflictsUnresolved : 0,
    policyDecisions: Array.isArray(policyDecisions)
      ? Object.freeze([...policyDecisions])
      : Object.freeze([]),
    auditTrail: Array.isArray(auditTrail)
      ? Object.freeze([...auditTrail])
      : Object.freeze([]),
    confidence: conf,
    requiresReview: Boolean(requiresReview),
    createdAt: new Date().toISOString(),
  });
}

// === Validators ===

export function validateMemoryUpdateResult(result) {
  if (!result || typeof result !== "object") {
    return { valid: false, error: "result is not an object" };
  }
  if (!result.resultId || typeof result.resultId !== "string") {
    return { valid: false, error: "missing resultId" };
  }
  if (!result.proposalId) {
    return { valid: false, error: "missing proposalId" };
  }
  if (!RESULT_ACTIONS.includes(result.action)) {
    return { valid: false, error: "invalid action" };
  }
  if (!RESULT_STATUSES.includes(result.status)) {
    return { valid: false, error: "invalid status" };
  }
  if (!Array.isArray(result.persistedMemories)) {
    return { valid: false, error: "persistedMemories must be an array" };
  }
  if (typeof result.duplicatesFound !== "number") {
    return { valid: false, error: "duplicatesFound must be a number" };
  }
  if (typeof result.conflictsResolved !== "number") {
    return { valid: false, error: "conflictsResolved must be a number" };
  }
  if (typeof result.conflictsUnresolved !== "number") {
    return { valid: false, error: "conflictsUnresolved must be a number" };
  }
  if (!Array.isArray(result.policyDecisions)) {
    return { valid: false, error: "policyDecisions must be an array" };
  }
  if (!Array.isArray(result.auditTrail)) {
    return { valid: false, error: "auditTrail must be an array" };
  }
  if (!RESULT_CONFIDENCE_LEVELS.includes(result.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  if (typeof result.requiresReview !== "boolean") {
    return { valid: false, error: "requiresReview must be a boolean" };
  }
  return { valid: true, error: null };
}

export function validateStorageHints(hints) {
  if (!hints || typeof hints !== "object") {
    return { valid: false, error: "storageHints is not an object" };
  }
  if (!STORAGE_HINTS_FIELDS.every((f) => f in hints)) {
    return { valid: false, error: "storageHints missing required fields" };
  }
  if (!Array.isArray(hints.recommendedIndexes)) {
    return { valid: false, error: "storageHints.recommendedIndexes must be an array" };
  }
  return { valid: true, error: null };
}

export function validateQualityMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return { valid: false, error: "qualityMetrics is not an object" };
  }
  if (!QUALITY_METRICS_FIELDS.every((f) => f in metrics)) {
    return { valid: false, error: "qualityMetrics missing required fields" };
  }
  return { valid: true, error: null };
}

export function validatePersistedMemory(mem) {
  if (!mem || typeof mem !== "object") {
    return { valid: false, error: "memory is not an object" };
  }
  if (!mem.memoryId || typeof mem.memoryId !== "string") {
    return { valid: false, error: "missing memoryId" };
  }
  if (!mem.memoryType || typeof mem.memoryType !== "string") {
    return { valid: false, error: "missing memoryType" };
  }
  if (!mem.content || typeof mem.content !== "string") {
    return { valid: false, error: "missing content" };
  }
  if (!Array.isArray(mem.tags)) {
    return { valid: false, error: "tags must be an array" };
  }
  if (!RESULT_CONFIDENCE_LEVELS.includes(mem.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  // Sprint 22.1 fields — existence only, no business rules:
  if (!mem.memoryRecordId || typeof mem.memoryRecordId !== "string") {
    return { valid: false, error: "missing memoryRecordId" };
  }
  if (!PERSISTED_MEMORY_FIELDS.every((f) => f in mem)) {
    return { valid: false, error: "missing Sprint 22.1 enrichment fields" };
  }
  const hintsValidation = validateStorageHints(mem.storageHints);
  if (!hintsValidation.valid) {
    return hintsValidation;
  }
  const metricsValidation = validateQualityMetrics(mem.qualityMetrics);
  if (!metricsValidation.valid) {
    return metricsValidation;
  }
  return { valid: true, error: null };
}