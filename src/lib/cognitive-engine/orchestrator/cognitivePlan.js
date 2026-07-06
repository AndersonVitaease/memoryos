/**
 * Cognitive Execution Plan Contract (Sprint 23 — Cognitive Orchestrator)
 *
 * Contrato imutável do plano de execução cognitiva.
 * O Cognitive Orchestrator recebe o contexto da requisição e produz
 * um CognitiveExecutionPlan descrevendo quais módulos participarão
 * do processamento, em qual ordem, e quais podem rodar em paralelo.
 *
 * Esta Sprint NÃO executa nenhum módulo.
 * Ela apenas declara o contrato de dados.
 *
 * Sprint 23 é uma nova camada que coexiste com a Sprint 14.
 * Nenhum arquivo da Sprint 14 é modificado.
 * Nenhum arquivo do Memory Engine é alterado.
 *
 * Campos imutáveis:
 *   planId            — ID determinístico do plano
 *   createdAt          — timestamp ISO
 *   requestType        — tipo da requisição (ex: "question", "image", "voice")
 *   requiredModules    — módulos obrigatórios
 *   optionalModules    — módulos opcionais
 *   executionOrder     — ordem sequencial de execução
 *   parallelGroups     — grupos de módulos que podem rodar em paralelo
 *   estimatedSteps     — número estimado de etapas
 *   metadata           — metadados adicionais (estrutura apenas)
 */

// === Modules ===

export const COGNITIVE_MODULES = [
  "InputAnalysis",
  "IntentClassifier",
  "MemoryRetrieval",
  "MemoryUpdate",
  "Reasoning",
  "Planner",
  "ToolSelection",
  "ImageGeneration",
  "VoiceGeneration",
  "ResponseComposer",
  "SafetyEngine",
  "KnowledgeSearch",
];

// === Request Types ===

export const REQUEST_TYPES = [
  "question",
  "image_generation",
  "voice_generation",
  "knowledge_search",
  "memory_query",
  "task_planning",
  "general",
];

// === Fields ===

export const COGNITIVE_EXECUTION_PLAN_FIELDS = [
  "planId",
  "createdAt",
  "requestType",
  "requiredModules",
  "optionalModules",
  "executionOrder",
  "parallelGroups",
  "estimatedSteps",
  "metadata",
];

// === Deterministic ID generation (no Math.random) ===

let _planIdCounter = 0;
function generatePlanId() {
  _planIdCounter++;
  return `cep-${_planIdCounter}`;
}

export function _resetIdsForTests() {
  _planIdCounter = 0;
}

// === Builder ===

/**
 * Constrói um CognitiveExecutionPlan imutável.
 * Nenhuma heurística. Apenas monta a estrutura a partir dos parâmetros.
 *
 * @param {Object} params
 * @param {string} params.requestType        — tipo da requisição
 * @param {string[]} params.requiredModules   — módulos obrigatórios
 * @param {string[]} params.optionalModules   — módulos opcionais (default [])
 * @param {string[]} params.executionOrder     — ordem de execução (default = requiredModules)
 * @param {Array[]} params.parallelGroups      — grupos paralelos (default [])
 * @param {Object} params.metadata             — metadados (default {})
 * @returns {Object} CognitiveExecutionPlan congelado
 */
export function buildExecutionPlan({
  requestType,
  requiredModules,
  optionalModules,
  executionOrder,
  parallelGroups,
  metadata,
}) {
  if (!requestType) throw new Error("requestType is required");
  if (!Array.isArray(requiredModules)) throw new Error("requiredModules must be an array");

  const req = Object.freeze([...requiredModules]);
  const opt = Array.isArray(optionalModules) ? Object.freeze([...optionalModules]) : Object.freeze([]);
  const order = Array.isArray(executionOrder) ? Object.freeze([...executionOrder]) : req;
  const groups = Array.isArray(parallelGroups)
    ? Object.freeze(parallelGroups.map((g) => Object.freeze(Array.isArray(g) ? [...g] : [])))
    : Object.freeze([]);
  const meta = metadata && typeof metadata === "object" ? Object.freeze({ ...metadata }) : Object.freeze({});

  return Object.freeze({
    planId: generatePlanId(),
    createdAt: new Date().toISOString(),
    requestType,
    requiredModules: req,
    optionalModules: opt,
    executionOrder: order,
    parallelGroups: groups,
    estimatedSteps: order.length,
    metadata: meta,
  });
}

// === Validator ===

/**
 * Valida apenas estrutura, existência de campos e tipos básicos.
 * Nenhuma validação de domínio ou regra de negócio.
 */
export function validateExecutionPlan(plan) {
  if (!plan || typeof plan !== "object") {
    return { valid: false, error: "plan is not an object" };
  }
  if (!plan.planId || typeof plan.planId !== "string") {
    return { valid: false, error: "missing planId" };
  }
  if (!plan.createdAt || typeof plan.createdAt !== "string") {
    return { valid: false, error: "missing createdAt" };
  }
  if (!REQUEST_TYPES.includes(plan.requestType)) {
    return { valid: false, error: "invalid requestType" };
  }
  if (!Array.isArray(plan.requiredModules)) {
    return { valid: false, error: "requiredModules must be an array" };
  }
  if (!Array.isArray(plan.optionalModules)) {
    return { valid: false, error: "optionalModules must be an array" };
  }
  if (!Array.isArray(plan.executionOrder)) {
    return { valid: false, error: "executionOrder must be an array" };
  }
  if (!Array.isArray(plan.parallelGroups)) {
    return { valid: false, error: "parallelGroups must be an array" };
  }
  if (typeof plan.estimatedSteps !== "number") {
    return { valid: false, error: "estimatedSteps must be a number" };
  }
  if (!plan.metadata || typeof plan.metadata !== "object") {
    return { valid: false, error: "metadata must be an object" };
  }
  if (!COGNITIVE_EXECUTION_PLAN_FIELDS.every((f) => f in plan)) {
    return { valid: false, error: "missing required plan fields" };
  }
  return { valid: true, error: null };
}