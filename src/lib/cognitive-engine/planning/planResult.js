/**
 * Plan Result Contract (Fase 3 — Sprint 18)
 *
 * Contrato oficial do plano estruturado do MemoryOS.
 * O Planning Engine transforma um Decision Result em um plano executável.
 *
 * Campos imutáveis:
 *   planId            — UUID do plano
 *   decisionId        — ID da decisão de origem
 *   goal              — objetivo do plano
 *   selectedDecision  — decisão selecionada
 *   steps             — etapas do plano
 *   dependencies      — dependências entre etapas
 *   estimatedCost     — custo estimado total
 *   estimatedTime     — tempo estimado total
 *   priority          — "low" | "normal" | "high" | "critical"
 *   expectedOutcome   — resultado esperado
 *   fallbackPlan      — plano alternativo
 *   confidence        — "LOW" | "MEDIUM" | "HIGH"
 *   createdAt         — timestamp ISO
 */

export const PLAN_PRIORITY_LEVELS = ["low", "normal", "high", "critical"];
export const PLAN_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"];

export const PLAN_RESULT_FIELDS = [
  "planId",
  "decisionId",
  "goal",
  "selectedDecision",
  "steps",
  "dependencies",
  "estimatedCost",
  "estimatedTime",
  "priority",
  "expectedOutcome",
  "fallbackPlan",
  "confidence",
  "createdAt",
];

export const PLAN_STEP_FIELDS = [
  "id",
  "description",
  "order",
  "required",
  "estimatedTime",
  "estimatedCost",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `plan-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói um Step de plano imutável.
 */
export function buildPlanStep({
  id,
  description,
  order,
  required = true,
  estimatedTime = 0,
  estimatedCost = 0,
}) {
  if (!id) throw new Error("step id is required");
  if (!description || typeof description !== "string") throw new Error("step description is required");
  if (typeof order !== "number") throw new Error("step order must be a number");

  return Object.freeze({
    id,
    description,
    order,
    required: Boolean(required),
    estimatedTime: Math.max(0, estimatedTime),
    estimatedCost: Math.max(0, estimatedCost),
  });
}

/**
 * Constrói um Plan Result imutável.
 */
export function buildPlanResult({
  decisionId,
  goal,
  selectedDecision,
  steps,
  dependencies,
  estimatedCost,
  estimatedTime,
  priority,
  expectedOutcome,
  fallbackPlan,
  confidence,
}) {
  const prio = PLAN_PRIORITY_LEVELS.includes(priority) ? priority : "normal";
  const conf = PLAN_CONFIDENCE_LEVELS.includes(confidence) ? confidence : "LOW";

  return Object.freeze({
    planId: generateUUID(),
    decisionId: decisionId || null,
    goal: goal || "",
    selectedDecision: selectedDecision || null,
    steps: Array.isArray(steps) ? Object.freeze([...steps]) : Object.freeze([]),
    dependencies: Array.isArray(dependencies) ? Object.freeze([...dependencies]) : Object.freeze([]),
    estimatedCost: Math.max(0, estimatedCost || 0),
    estimatedTime: Math.max(0, estimatedTime || 0),
    priority: prio,
    expectedOutcome: expectedOutcome || "",
    fallbackPlan: fallbackPlan || null,
    confidence: conf,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Valida se um objeto é um Plan Result válido.
 */
export function validatePlanResult(plan) {
  if (!plan || typeof plan !== "object") {
    return { valid: false, error: "plan is not an object" };
  }
  if (!plan.planId || typeof plan.planId !== "string") {
    return { valid: false, error: "missing planId" };
  }
  if (!Array.isArray(plan.steps)) {
    return { valid: false, error: "steps must be an array" };
  }
  if (!Array.isArray(plan.dependencies)) {
    return { valid: false, error: "dependencies must be an array" };
  }
  if (!PLAN_PRIORITY_LEVELS.includes(plan.priority)) {
    return { valid: false, error: "invalid priority" };
  }
  if (!PLAN_CONFIDENCE_LEVELS.includes(plan.confidence)) {
    return { valid: false, error: "invalid confidence" };
  }
  for (const step of plan.steps) {
    if (!step.id || !step.description || typeof step.order !== "number") {
      return { valid: false, error: "invalid step" };
    }
  }
  return { valid: true, error: null };
}

/**
 * Valida se um objeto é um Step válido.
 */
export function validatePlanStep(step) {
  if (!step || typeof step !== "object") {
    return { valid: false, error: "step is not an object" };
  }
  if (!step.id) return { valid: false, error: "missing step id" };
  if (!step.description) return { valid: false, error: "missing step description" };
  if (typeof step.order !== "number") return { valid: false, error: "step order must be a number" };
  if (typeof step.required !== "boolean") return { valid: false, error: "step required must be boolean" };
  if (typeof step.estimatedTime !== "number") return { valid: false, error: "step estimatedTime must be number" };
  if (typeof step.estimatedCost !== "number") return { valid: false, error: "step estimatedCost must be number" };
  return { valid: true, error: null };
}