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
function generateMemoryRecordId() {
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

// === Sprint 22.1 — Deterministic scoring helpers ===

const _confidenceToScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function _clampScore(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  return fallback;
}

/**
 * Deterministic importance score (0-100).
 * Based on confidence + priority weighting — no randomness.
 */
function _computeImportanceScore(confidence, priority) {
  const baseScore = (_confidenceToScore[confidence] || 1) * 25; // 25, 50, 75
  const priorityBoost = { low: 5, normal: 10, high: 20, critical: 25 };
  const boost = priorityBoost[priority] || 10;
  return _clampScore(baseScore + boost, 50);
}

/**
 * Sprint 22.1 — Builds the storageHints object (suggestions only).
 */
export function buildStorageHints({ category, priority, recommendedIndexes, compression, versioning, notes }) {
  return Object.freeze({
    category: category || "general",
    priority: priority || "normal",
    recommendedIndexes: Array.isArray(recommendedIndexes)
      ? Object.freeze([...recommendedIndexes])
      : Object.freeze([]),
    compression: typeof compression === "boolean" ? compression : false,
    versioning: typeof versioning === "boolean" ? versioning : true,
    notes: notes || "",
  });
}

/**
 * Sprint 22.1 — Builds the qualityMetrics object (all 0-100, deterministic).
 */
export function buildQualityMetrics({ confidence, consistency, completeness, relevance, reliability }) {
  return Object.freeze({
    confidence: _clampScore(confidence, 50),
    consistency: _clampScore(consistency, 50),
    completeness: _clampScore(completeness, 50),
    relevance: _clampScore(relevance, 50),
    reliability: _clampScore(reliability, 50),
  });
}

// === Builders ===

export function buildPersistedMemory({
  memoryType,
  content,
  tags,
  confidence,
  source,
  // Sprint 22.1 enrichment (optional — sensible defaults applied):
  memoryRecordId,
  storagePolicy,
  retentionPolicy,
  importanceScore,
  storageHints,
  qualityMetrics,
  // Used for deterministic importance score when importanceScore not provided
  priority,
}) {
  if (!content) throw new Error("persisted memory content is required");
  const conf = RESULT_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";
  const sPolicy = STORAGE_POLICIES.includes(storagePolicy) ? storagePolicy : "SHORT_TERM_MEMORY";
  const rPolicy = RETENTION_POLICIES.includes(retentionPolicy) ? retentionPolicy : "TEMPORARY";
  const score = _clampScore(
    typeof importanceScore === "number" ? importanceScore : _computeImportanceScore(conf, priority),
    50
  );

  return Object.freeze({
    memoryId: generateMemoryId(),
    memoryType: memoryType || "fact",
    content,
    tags: Array.isArray(tags) ? Object.freeze([...tags]) : Object.freeze([]),
    confidence: conf,
    source: source || "proposal",
    // Sprint 22.1:
    memoryRecordId: memoryRecordId || generateMemoryRecordId(),
    storagePolicy: sPolicy,
    retentionPolicy: rPolicy,
    importanceScore: score,
    storageHints: storageHints || buildStorageHints({ category: memoryType, priority }),
    qualityMetrics: qualityMetrics || buildQualityMetrics({
      confidence: score,
      consistency: score,
      completeness: conf === "HIGH" ? 90 : conf === "MEDIUM" ? 70 : 50,
      relevance: score,
      reliability: score,
    }),
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
  if (typeof hints.category !== "string") {
    return { valid: false, error: "storageHints.category must be a string" };
  }
  if (typeof hints.priority !== "string") {
    return { valid: false, error: "storageHints.priority must be a string" };
  }
  if (!Array.isArray(hints.recommendedIndexes)) {
    return { valid: false, error: "storageHints.recommendedIndexes must be an array" };
  }
  if (typeof hints.compression !== "boolean") {
    return { valid: false, error: "storageHints.compression must be a boolean" };
  }
  if (typeof hints.versioning !== "boolean") {
    return { valid: false, error: "storageHints.versioning must be a boolean" };
  }
  if (typeof hints.notes !== "string") {
    return { valid: false, error: "storageHints.notes must be a string" };
  }
  return { valid: true, error: null };
}

export function validateQualityMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return { valid: false, error: "qualityMetrics is not an object" };
  }
  for (const field of QUALITY_METRICS_FIELDS) {
    if (typeof metrics[field] !== "number" || metrics[field] < 0 || metrics[field] > 100) {
      return { valid: false, error: `qualityMetrics.${field} must be a number 0-100` };
    }
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
  // Sprint 22.1 fields:
  if (!mem.memoryRecordId || typeof mem.memoryRecordId !== "string") {
    return { valid: false, error: "missing memoryRecordId" };
  }
  if (!STORAGE_POLICIES.includes(mem.storagePolicy)) {
    return { valid: false, error: "invalid storagePolicy" };
  }
  if (!RETENTION_POLICIES.includes(mem.retentionPolicy)) {
    return { valid: false, error: "invalid retentionPolicy" };
  }
  if (typeof mem.importanceScore !== "number" || mem.importanceScore < 0 || mem.importanceScore > 100) {
    return { valid: false, error: "importanceScore must be a number 0-100" };
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