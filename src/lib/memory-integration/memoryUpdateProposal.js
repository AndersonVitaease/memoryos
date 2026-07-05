/**
 * Memory Update Proposal Contract (Fase 3 — Sprint 21)
 *
 * Contrato oficial da proposta de atualização de memória.
 * A Memory Integration Layer recebe um Learning Result e produz uma
 * Memory Update Proposal contendo conhecimento estruturado.
 *
 * Esta camada NÃO grava memória. Apenas transforma aprendizado em
 * uma proposta estruturada que poderá ser analisada futuramente pelo
 * Memory Engine.
 *
 * Campos imutáveis:
 *   proposalId        — UUID da proposta
 *   learningId        — ID do Learning Result de origem
 *   proposalType      — "create" | "update" | "merge" | "ignore"
 *   priority          — "low" | "normal" | "high" | "critical"
 *   confidence        — "LOW" | "MEDIUM" | "HIGH"
 *   knowledgeItems    — itens de conhecimento extraídos
 *   suggestedMemories — memórias sugeridas (dados estruturados)
 *   conflicts         — conflitos detectados entre os próprios dados
 *   requiresReview    — boolean
 *   createdAt         — timestamp ISO
 */

export const PROPOSAL_TYPES = ["create", "update", "merge", "ignore"];
export const PROPOSAL_PRIORITIES = ["low", "normal", "high", "critical"];
export const PROPOSAL_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"];

export const MEMORY_UPDATE_PROPOSAL_FIELDS = [
  "proposalId",
  "learningId",
  "proposalType",
  "priority",
  "confidence",
  "knowledgeItems",
  "suggestedMemories",
  "conflicts",
  "requiresReview",
  "createdAt",
];

export const KNOWLEDGE_ITEM_FIELDS = [
  "id",
  "category",
  "content",
  "evidence",
  "confidence",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `proposal-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

let _itemCounter = 0;
function generateItemId() {
  _itemCounter++;
  return `ki-${_itemCounter}`;
}

/**
 * Constrói um Knowledge Item imutável.
 */
export function buildKnowledgeItem({ category, content, evidence, confidence }) {
  if (!content) throw new Error("knowledge item content is required");
  const conf = PROPOSAL_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";
  return Object.freeze({
    id: generateItemId(),
    category: category || "general",
    content,
    evidence: evidence || null,
    confidence: conf,
  });
}

/**
 * Constrói uma Suggested Memory imutável.
 */
export function buildSuggestedMemory({ memoryType, intent, content, tags, confidence }) {
  if (!content) throw new Error("suggested memory content is required");
  const conf = PROPOSAL_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";
  return Object.freeze({
    memoryType: memoryType || "fact",
    intent: intent || "reference",
    content,
    tags: Array.isArray(tags) ? Object.freeze([...tags]) : Object.freeze([]),
    confidence: conf,
  });
}

/**
 * Constrói um Conflict imutável.
 */
export function buildConflict({ type, description, items }) {
  if (!description) throw new Error("conflict description is required");
  return Object.freeze({
    type: type || "internal",
    description,
    items: Array.isArray(items) ? Object.freeze([...items]) : Object.freeze([]),
  });
}

/**
 * Constrói uma Memory Update Proposal imutável.
 */
export function buildMemoryUpdateProposal({
  learningId,
  proposalType,
  priority,
  confidence,
  knowledgeItems,
  suggestedMemories,
  conflicts,
  requiresReview,
}) {
  const pType = PROPOSAL_TYPES.includes(proposalType) ? proposalType : "create";
  const prio = PROPOSAL_PRIORITIES.includes(priority) ? priority : "normal";
  const conf = PROPOSAL_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";

  return Object.freeze({
    proposalId: generateUUID(),
    learningId: learningId || null,
    proposalType: pType,
    priority: prio,
    confidence: conf,
    knowledgeItems: Array.isArray(knowledgeItems) ? Object.freeze([...knowledgeItems]) : Object.freeze([]),
    suggestedMemories: Array.isArray(suggestedMemories) ? Object.freeze([...suggestedMemories]) : Object.freeze([]),
    conflicts: Array.isArray(conflicts) ? Object.freeze([...conflicts]) : Object.freeze([]),
    requiresReview: Boolean(requiresReview),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Valida se um objeto é uma Memory Update Proposal válida.
 */
export function validateMemoryUpdateProposal(proposal) {
  if (!proposal || typeof proposal !== "object") {
    return { valid: false, error: "proposal is not an object" };
  }
  if (!proposal.proposalId || typeof proposal.proposalId !== "string") {
    return { valid: false, error: "missing proposalId" };
  }
  if (!PROPOSAL_TYPES.includes(proposal.proposalType)) {
    return { valid: false, error: "invalid proposalType" };
  }
  if (!PROPOSAL_PRIORITIES.includes(proposal.priority)) {
    return { valid: false, error: "invalid priority" };
  }
  if (!PROPOSAL_CONFIDENCE_LEVELS.includes(proposal.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  if (!Array.isArray(proposal.knowledgeItems)) {
    return { valid: false, error: "knowledgeItems must be an array" };
  }
  if (!Array.isArray(proposal.suggestedMemories)) {
    return { valid: false, error: "suggestedMemories must be an array" };
  }
  if (!Array.isArray(proposal.conflicts)) {
    return { valid: false, error: "conflicts must be an array" };
  }
  if (typeof proposal.requiresReview !== "boolean") {
    return { valid: false, error: "requiresReview must be a boolean" };
  }
  return { valid: true, error: null };
}

/**
 * Valida se um objeto é um Knowledge Item válido.
 */
export function validateKnowledgeItem(item) {
  if (!item || typeof item !== "object") {
    return { valid: false, error: "item is not an object" };
  }
  if (!item.id || typeof item.id !== "string") {
    return { valid: false, error: "missing id" };
  }
  if (!item.category || typeof item.category !== "string") {
    return { valid: false, error: "missing category" };
  }
  if (!item.content || typeof item.content !== "string") {
    return { valid: false, error: "missing content" };
  }
  if (!PROPOSAL_CONFIDENCE_LEVELS.includes(item.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  return { valid: true, error: null };
}