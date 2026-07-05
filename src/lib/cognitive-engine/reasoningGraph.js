/**
 * Reasoning Graph Contract (Fase 3 — Sprint 16)
 *
 * Contrato oficial do raciocínio estruturado do MemoryOS.
 * O Reasoning Engine transforma resultados do Pipeline em raciocínio.
 *
 * Campos:
 *   reasoningId    — UUID do raciocínio
 *   premises       — premissas extraídas dos resultados
 *   evidence       — evidências agrupadas por step
 *   conflicts      — conflitos detectados entre evidências
 *   hypotheses     — hipóteses geradas
 *   conclusions    — conclusões estruturadas
 *   confidence     — "LOW" | "MEDIUM" | "HIGH"
 *   createdAt      — timestamp ISO
 */

export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"];

export const REASONING_GRAPH_FIELDS = [
  "reasoningId",
  "premises",
  "evidence",
  "conflicts",
  "hypotheses",
  "conclusions",
  "confidence",
  "createdAt",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `rg-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói um Reasoning Graph.
 */
export function buildReasoningGraph({
  premises,
  evidence,
  conflicts,
  hypotheses,
  conclusions,
  confidence,
}) {
  return {
    reasoningId: generateUUID(),
    premises: Array.isArray(premises) ? premises : [],
    evidence: Array.isArray(evidence) ? evidence : [],
    conflicts: Array.isArray(conflicts) ? conflicts : [],
    hypotheses: Array.isArray(hypotheses) ? hypotheses : [],
    conclusions: Array.isArray(conclusions) ? conclusions : [],
    confidence: CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Valida se um objeto é um Reasoning Graph válido.
 */
export function validateReasoningGraph(graph) {
  if (!graph || typeof graph !== "object") {
    return { valid: false, error: "graph is not an object" };
  }
  if (!graph.reasoningId || typeof graph.reasoningId !== "string") {
    return { valid: false, error: "missing reasoningId" };
  }
  if (!Array.isArray(graph.premises)) {
    return { valid: false, error: "premises must be an array" };
  }
  if (!Array.isArray(graph.evidence)) {
    return { valid: false, error: "evidence must be an array" };
  }
  if (!Array.isArray(graph.conflicts)) {
    return { valid: false, error: "conflicts must be an array" };
  }
  if (!Array.isArray(graph.hypotheses)) {
    return { valid: false, error: "hypotheses must be an array" };
  }
  if (!Array.isArray(graph.conclusions)) {
    return { valid: false, error: "conclusions must be an array" };
  }
  if (!CONFIDENCE_LEVELS.includes(graph.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  return { valid: true, error: null };
}