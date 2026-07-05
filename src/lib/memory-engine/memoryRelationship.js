/**
 * Memory Relationship — Contrato Oficial (Sprint 8)
 *
 * Define a estrutura oficial de uma relação entre memórias.
 * As relações são entidades independentes — nunca alteram
 * Memory Records, Version History ou Lifecycle.
 *
 * Estrutura oficial:
 *   {
 *     relationshipId: string (UUID),
 *     sourceMemoryId: string,
 *     targetMemoryId: string,
 *     relationType: string,
 *     confidence: "low" | "medium" | "high",
 *     reasonCode: string,
 *     createdAt: datetime (ISO),
 *     createdBy: "system"
 *   }
 */

export const RELATION_TYPES = [
  "belongs_to",
  "parent",
  "child",
  "depends_on",
  "references",
  "related_to",
  "updates",
  "duplicate_of",
];

export const RELATIONSHIP_FIELDS = [
  "relationshipId",
  "sourceMemoryId",
  "targetMemoryId",
  "relationType",
  "confidence",
  "reasonCode",
  "createdAt",
  "createdBy",
];

const VALID_CONFIDENCE = ["low", "medium", "high"];

function _generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Constrói uma Memory Relationship oficial.
 *
 * @param {Object} params
 * @param {string} params.sourceMemoryId
 * @param {string} params.targetMemoryId
 * @param {string} params.relationType
 * @param {string} [params.confidence]
 * @param {string} [params.reasonCode]
 * @returns {Object} Memory Relationship
 */
export function buildRelationship({
  sourceMemoryId,
  targetMemoryId,
  relationType,
  confidence = "medium",
  reasonCode = "MANUAL",
}) {
  return {
    relationshipId: _generateUUID(),
    sourceMemoryId,
    targetMemoryId,
    relationType: RELATION_TYPES.includes(relationType) ? relationType : "related_to",
    confidence: VALID_CONFIDENCE.includes(confidence) ? confidence : "medium",
    reasonCode: reasonCode || "MANUAL",
    createdAt: new Date().toISOString(),
    createdBy: "system",
  };
}

/**
 * Valida uma Memory Relationship.
 *
 * @param {Object} rel
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRelationship(rel) {
  const errors = [];

  if (!rel || typeof rel !== "object") {
    return { valid: false, errors: ["Memory Relationship ausente ou inválida."] };
  }

  if (!rel.relationshipId || typeof rel.relationshipId !== "string") {
    errors.push("relationshipId é obrigatório (string).");
  }
  if (!rel.sourceMemoryId || typeof rel.sourceMemoryId !== "string") {
    errors.push("sourceMemoryId é obrigatório (string).");
  }
  if (!rel.targetMemoryId || typeof rel.targetMemoryId !== "string") {
    errors.push("targetMemoryId é obrigatório (string).");
  }
  if (rel.sourceMemoryId && rel.targetMemoryId && rel.sourceMemoryId === rel.targetMemoryId) {
    errors.push("Auto relacionamento não permitido (sourceMemoryId == targetMemoryId).");
  }
  if (!RELATION_TYPES.includes(rel.relationType)) {
    errors.push(`relationType inválido: "${rel.relationType}".`);
  }
  if (!VALID_CONFIDENCE.includes(rel.confidence)) {
    errors.push(`confidence inválido: "${rel.confidence}".`);
  }

  return { valid: errors.length === 0, errors };
}

export default {
  buildRelationship,
  validateRelationship,
  RELATION_TYPES,
  RELATIONSHIP_FIELDS,
};