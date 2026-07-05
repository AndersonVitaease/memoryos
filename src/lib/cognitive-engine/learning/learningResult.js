/**
 * Learning Result Contract (Fase 3 — Sprint 20)
 *
 * Contrato oficial do aprendizado derivado de uma execução.
 * O Learning Engine consome um Execution Result e produz um
 * Learning Result contendo observações, métricas e conhecimento derivado.
 *
 * Campos imutáveis:
 *   learningId       — UUID do aprendizado
 *   executionId      — ID da execução de origem
 *   status           — "completed" | "partial" | "failed"
 *   observations     — observações factuais da execução
 *   strengths        — pontos fortes identificados
 *   weaknesses       — limitações observadas
 *   lessons          — lições aprendidas
 *   metrics          — métricas derivadas
 *   recommendations  — recomendações para futuras execuções
 *   confidence       — "LOW" | "MEDIUM" | "HIGH"
 *   createdAt        — timestamp ISO
 */

export const LEARNING_STATUSES = ["completed", "partial", "failed"];
export const LEARNING_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"];

export const LEARNING_RESULT_FIELDS = [
  "learningId",
  "executionId",
  "status",
  "observations",
  "strengths",
  "weaknesses",
  "lessons",
  "metrics",
  "recommendations",
  "confidence",
  "createdAt",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `learn-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói uma observação imutável.
 */
export function buildObservation({ type, description, source }) {
  if (!description) throw new Error("observation description is required");
  return Object.freeze({
    type: type || "info",
    description,
    source: source || null,
  });
}

/**
 * Constrói uma lição imutável.
 */
export function buildLesson({ category, statement, evidence }) {
  if (!statement) throw new Error("lesson statement is required");
  return Object.freeze({
    category: category || "general",
    statement,
    evidence: evidence || null,
  });
}

/**
 * Constrói uma recomendação imutável.
 */
export function buildRecommendation({ priority, action, rationale }) {
  if (!action) throw new Error("recommendation action is required");
  return Object.freeze({
    priority: priority || "normal",
    action,
    rationale: rationale || "",
  });
}

/**
 * Constrói um Learning Result imutável.
 */
export function buildLearningResult({
  executionId,
  status,
  observations,
  strengths,
  weaknesses,
  lessons,
  metrics,
  recommendations,
  confidence,
}) {
  const finalStatus = LEARNING_STATUSES.includes(status) ? status : "completed";
  const conf = LEARNING_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";

  return Object.freeze({
    learningId: generateUUID(),
    executionId: executionId || null,
    status: finalStatus,
    observations: Array.isArray(observations) ? Object.freeze([...observations]) : Object.freeze([]),
    strengths: Array.isArray(strengths) ? Object.freeze([...strengths]) : Object.freeze([]),
    weaknesses: Array.isArray(weaknesses) ? Object.freeze([...weaknesses]) : Object.freeze([]),
    lessons: Array.isArray(lessons) ? Object.freeze([...lessons]) : Object.freeze([]),
    metrics: metrics ? Object.freeze({ ...metrics }) : Object.freeze({}),
    recommendations: Array.isArray(recommendations) ? Object.freeze([...recommendations]) : Object.freeze([]),
    confidence: conf,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Valida se um objeto é um Learning Result válido.
 */
export function validateLearningResult(result) {
  if (!result || typeof result !== "object") {
    return { valid: false, error: "result is not an object" };
  }
  if (!result.learningId || typeof result.learningId !== "string") {
    return { valid: false, error: "missing learningId" };
  }
  if (!LEARNING_STATUSES.includes(result.status)) {
    return { valid: false, error: "invalid status" };
  }
  if (!Array.isArray(result.observations)) {
    return { valid: false, error: "observations must be an array" };
  }
  if (!Array.isArray(result.strengths)) {
    return { valid: false, error: "strengths must be an array" };
  }
  if (!Array.isArray(result.weaknesses)) {
    return { valid: false, error: "weaknesses must be an array" };
  }
  if (!Array.isArray(result.lessons)) {
    return { valid: false, error: "lessons must be an array" };
  }
  if (!Array.isArray(result.recommendations)) {
    return { valid: false, error: "recommendations must be an array" };
  }
  if (!LEARNING_CONFIDENCE_LEVELS.includes(result.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  return { valid: true, error: null };
}