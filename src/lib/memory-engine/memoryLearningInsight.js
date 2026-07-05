/**
 * Learning Insight Contract (Sprint 13)
 *
 * Contrato oficial dos insights gerados pelo Memory Learning Manager.
 * Um Learning Insight é uma observação sobre padrões de comportamento
 * do sistema — nunca uma modificação de Memory Records.
 *
 * Campos:
 *   insightId    — UUID do insight
 *   type         — tipo do insight (um de INSIGHT_TYPES)
 *   memoryId     — ID da memória (ou tag/tópico) relacionada
 *   confidence   — "low" | "medium" | "high"
 *   reason       — explicação humana do padrão detectado
 *   createdAt    — timestamp ISO
 *   status       — "active" | "dismissed"
 */

export const INSIGHT_TYPES = [
  "FREQUENTLY_ACCESSED",
  "RARELY_ACCESSED",
  "POSSIBLE_ARCHIVE",
  "POSSIBLE_UPDATE",
  "POSSIBLE_RELATIONSHIP",
  "POPULAR_TOPIC",
  "UNUSED_MEMORY",
];

export const INSIGHT_STATUSES = ["active", "dismissed"];

export const DEFAULT_INSIGHT_STATUS = "active";

export const LEARNING_INSIGHT_FIELDS = [
  "insightId",
  "type",
  "memoryId",
  "confidence",
  "reason",
  "createdAt",
  "status",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `li-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói um Learning Insight validado.
 * @param {Object} params
 * @param {string} params.type — um de INSIGHT_TYPES
 * @param {string} params.memoryId — ID da memória ou tópico relacionado
 * @param {string} params.confidence — "low" | "medium" | "high"
 * @param {string} params.reason — explicação do padrão
 * @returns {Object} Learning Insight
 */
export function buildLearningInsight({ type, memoryId, confidence, reason }) {
  if (!INSIGHT_TYPES.includes(type)) {
    throw new Error(`Invalid insight type: ${type}`);
  }
  if (!memoryId || typeof memoryId !== "string") {
    throw new Error("memoryId is required and must be a string");
  }
  const conf = ["low", "medium", "high"].includes(confidence) ? confidence : "low";
  return {
    insightId: generateUUID(),
    type,
    memoryId,
    confidence: conf,
    reason: typeof reason === "string" ? reason : "",
    createdAt: new Date().toISOString(),
    status: DEFAULT_INSIGHT_STATUS,
  };
}

/**
 * Valida se um objeto é um Learning Insight válido.
 */
export function validateLearningInsight(insight) {
  if (!insight || typeof insight !== "object") return false;
  if (!insight.insightId || typeof insight.insightId !== "string") return false;
  if (!INSIGHT_TYPES.includes(insight.type)) return false;
  if (!insight.memoryId || typeof insight.memoryId !== "string") return false;
  if (!["low", "medium", "high"].includes(insight.confidence)) return false;
  if (typeof insight.reason !== "string") return false;
  if (!insight.createdAt || typeof insight.createdAt !== "string") return false;
  if (!INSIGHT_STATUSES.includes(insight.status)) return false;
  return true;
}