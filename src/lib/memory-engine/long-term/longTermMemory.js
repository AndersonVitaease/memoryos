/**
 * Long-Term Memory Contract (Sprint 23 — LTM)
 *
 * Contrato imutável para memórias permanentes do MemoryOS.
 * Esta Sprint cria APENAS a infraestrutura de representação.
 *
 * NÃO existe recuperação, busca, ranking, similaridade, embeddings,
 * vetores ou IA nesta Sprint.
 *
 * Nenhuma Sprint anterior é modificada.
 * O Memory Engine existente permanece intacto.
 *
 * Campos imutáveis:
 *   memoryId        — ID determinístico da memória (ltm-N)
 *   memoryRecordId  — ID determinístico do registro (ltrec-N)
 *   createdAt        — timestamp ISO de criação
 *   updatedAt        — timestamp ISO de atualização
 *   memoryType       — tipo da memória
 *   content          — conteúdo textual
 *   tags             — array de tags
 *   confidence       — nível de confiança
 *   status           — status da memória
 *   source           — origem da memória
 *   metadata         — metadados (estrutura apenas)
 */

// === Fields ===

export const LONG_TERM_MEMORY_FIELDS = [
  "memoryId",
  "memoryRecordId",
  "createdAt",
  "updatedAt",
  "memoryType",
  "content",
  "tags",
  "confidence",
  "status",
  "source",
  "metadata",
];

// === Types ===

export const LONG_TERM_MEMORY_TYPES = [
  "fact",
  "event",
  "preference",
  "relationship",
  "skill",
  "goal",
  "context",
  "note",
];

// === Statuses ===

export const LONG_TERM_MEMORY_STATUSES = [
  "active",
  "archived",
  "deprecated",
];

// === Sources ===

export const LONG_TERM_MEMORY_SOURCES = [
  "conversation",
  "document",
  "import",
  "manual",
  "system",
];

// === Confidence levels ===

export const LONG_TERM_MEMORY_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"];

// === Deterministic ID generation (no Math.random, no UUID) ===

let _memoryIdCounter = 0;
let _memoryRecordIdCounter = 0;

function generateMemoryId() {
  _memoryIdCounter++;
  return `ltm-${_memoryIdCounter}`;
}

function generateMemoryRecordId() {
  _memoryRecordIdCounter++;
  return `ltrec-${_memoryRecordIdCounter}`;
}

export function _resetIdsForTests() {
  _memoryIdCounter = 0;
  _memoryRecordIdCounter = 0;
}

// === Builder ===

/**
 * Constrói uma Long-Term Memory imutável.
 * Nenhuma decisão automática. Nenhuma inferência. Nenhum cálculo cognitivo.
 *
 * @param {Object} params
 * @param {string} [params.memoryType]      — tipo (default: "fact")
 * @param {string} params.content            — conteúdo (obrigatório)
 * @param {string[]} [params.tags]           — tags (default: [])
 * @param {string} [params.confidence]       — confiança (default: "LOW")
 * @param {string} [params.status]           — status (default: "active")
 * @param {string} [params.source]          — origem (default: "system")
 * @param {Object} [params.metadata]         — metadados (default: {})
 * @returns {Object} LongTermMemory congelada
 */
export function buildLongTermMemory({
  memoryType,
  content,
  tags,
  confidence,
  status,
  source,
  metadata,
} = {}) {
  if (!content) throw new Error("content is required");

  const type = LONG_TERM_MEMORY_TYPES.includes(memoryType) ? memoryType : "fact";
  const conf = LONG_TERM_MEMORY_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";
  const stat = LONG_TERM_MEMORY_STATUSES.includes(status) ? status : "active";
  const src = LONG_TERM_MEMORY_SOURCES.includes(source) ? source : "system";

  const now = new Date().toISOString();

  return Object.freeze({
    memoryId: generateMemoryId(),
    memoryRecordId: generateMemoryRecordId(),
    createdAt: now,
    updatedAt: now,
    memoryType: type,
    content,
    tags: Array.isArray(tags) ? Object.freeze([...tags]) : Object.freeze([]),
    confidence: conf,
    status: stat,
    source: src,
    metadata: metadata && typeof metadata === "object"
      ? Object.freeze({ ...metadata })
      : Object.freeze({}),
  });
}

// === Validator ===

/**
 * Valida apenas estrutura, existência de campos e tipos básicos.
 * Nenhuma regra de negócio.
 */
export function validateLongTermMemory(mem) {
  if (!mem || typeof mem !== "object") {
    return { valid: false, error: "memory is not an object" };
  }
  if (!mem.memoryId || typeof mem.memoryId !== "string") {
    return { valid: false, error: "missing memoryId" };
  }
  if (!mem.memoryRecordId || typeof mem.memoryRecordId !== "string") {
    return { valid: false, error: "missing memoryRecordId" };
  }
  if (!mem.createdAt || typeof mem.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (!mem.updatedAt || typeof mem.updatedAt !== "string") {
    return { valid: false, error: "missing updatedAt" };
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
  if (!mem.confidence || typeof mem.confidence !== "string") {
    return { valid: false, error: "missing confidence" };
  }
  if (!mem.status || typeof mem.status !== "string") {
    return { valid: false, error: "missing status" };
  }
  if (!mem.source || typeof mem.source !== "string") {
    return { valid: false, error: "missing source" };
  }
  if (!mem.metadata || typeof mem.metadata !== "object") {
    return { valid: false, error: "missing metadata" };
  }
  if (!LONG_TERM_MEMORY_FIELDS.every((f) => f in mem)) {
    return { valid: false, error: "missing required LTM fields" };
  }
  return { valid: true, error: null };
}