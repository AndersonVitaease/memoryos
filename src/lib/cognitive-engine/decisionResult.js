/**
 * Decision Result Contract (Fase 3 — Sprint 17)
 *
 * Contrato oficial da decisão do MemoryOS.
 * O Decision Engine seleciona a melhor conclusão a partir de um Reasoning Graph.
 *
 * Campos:
 *   decisionId          — UUID da decisão
 *   reasoningId         — ID do Reasoning Graph de origem
 *   selectedConclusion  — conclusão selecionada
 *   alternatives        — alternativas avaliadas
 *   confidence          — "LOW" | "MEDIUM" | "HIGH"
 *   justification       — justificativa textual
 *   riskLevel           — "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
 *   createdAt           — timestamp ISO
 */

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"];

export const DECISION_RESULT_FIELDS = [
  "decisionId",
  "reasoningId",
  "selectedConclusion",
  "alternatives",
  "confidence",
  "justification",
  "riskLevel",
  "createdAt",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `dec-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói um Decision Result.
 */
export function buildDecisionResult({
  reasoningId,
  selectedConclusion,
  alternatives,
  confidence,
  justification,
  riskLevel,
}) {
  return {
    decisionId: generateUUID(),
    reasoningId: reasoningId || null,
    selectedConclusion: selectedConclusion || null,
    alternatives: Array.isArray(alternatives) ? alternatives : [],
    confidence: CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW",
    justification: justification || "",
    riskLevel: RISK_LEVELS.includes(riskLevel) ? riskLevel : "LOW",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Valida se um objeto é um Decision Result válido.
 */
export function validateDecisionResult(result) {
  if (!result || typeof result !== "object") {
    return { valid: false, error: "result is not an object" };
  }
  if (!result.decisionId || typeof result.decisionId !== "string") {
    return { valid: false, error: "missing decisionId" };
  }
  if (!Array.isArray(result.alternatives)) {
    return { valid: false, error: "alternatives must be an array" };
  }
  if (!CONFIDENCE_LEVELS.includes(result.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  if (!RISK_LEVELS.includes(result.riskLevel)) {
    return { valid: false, error: "invalid riskLevel" };
  }
  return { valid: true, error: null };
}