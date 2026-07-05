/**
 * Cognitive Plan Contract (Fase 3 — Cognitive Engine)
 *
 * Contrato oficial do plano de coordenação cognitiva.
 * O Cognitive Orchestrator cria planos — nunca os executa.
 *
 * Campos:
 *   planId                 — UUID do plano
 *   goal                   — objetivo detectado
 *   steps                  — etapas ordenadas com prioridade
 *   participants           — lista de componentes participantes
 *   priority               — "low" | "normal" | "high" | "critical"
 *   requiresMemory         — boolean
 *   requiresCapabilities   — boolean
 *   requiresServices       — boolean
 *   requiresSpecialists    — boolean
 *   requiresPolicy         — boolean
 *   requiresLLM            — boolean
 *   estimatedComplexity    — "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
 *   createdAt              — timestamp ISO
 */

export const COMPLEXITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const PRIORITY_LEVELS = ["low", "normal", "high", "critical"];

export const PARTICIPANTS = [
  "GoalDetector",
  "MemoryEngine",
  "CapabilityLayer",
  "ServiceLayer",
  "SpecialistLayer",
  "ConnectorLayer",
  "PolicyEngine",
  "Planner",
  "LLM",
];

export const COGNITIVE_PLAN_FIELDS = [
  "planId",
  "goal",
  "steps",
  "participants",
  "priority",
  "requiresMemory",
  "requiresCapabilities",
  "requiresServices",
  "requiresSpecialists",
  "requiresPolicy",
  "requiresLLM",
  "estimatedComplexity",
  "createdAt",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `cp-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói um Cognitive Plan validado.
 */
export function buildCognitivePlan({
  goal,
  steps,
  participants,
  priority,
  requiresMemory,
  requiresCapabilities,
  requiresServices,
  requiresSpecialists,
  requiresPolicy,
  requiresLLM,
  estimatedComplexity,
}) {
  if (!goal || typeof goal !== "string") {
    throw new Error("goal is required and must be a string");
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("steps is required and must be a non-empty array");
  }
  if (!Array.isArray(participants)) {
    throw new Error("participants must be an array");
  }

  const prio = PRIORITY_LEVELS.includes(priority) ? priority : "normal";
  const complexity = COMPLEXITY_LEVELS.includes(estimatedComplexity)
    ? estimatedComplexity
    : "LOW";

  return {
    planId: generateUUID(),
    goal,
    steps: steps.map((s, i) => ({
      order: s.order || i + 1,
      participant: s.participant,
      action: s.action,
      priority: PRIORITY_LEVELS.includes(s.priority) ? s.priority : prio,
    })),
    participants: [...new Set(participants)],
    priority: prio,
    requiresMemory: Boolean(requiresMemory),
    requiresCapabilities: Boolean(requiresCapabilities),
    requiresServices: Boolean(requiresServices),
    requiresSpecialists: Boolean(requiresSpecialists),
    requiresPolicy: Boolean(requiresPolicy),
    requiresLLM: Boolean(requiresLLM),
    estimatedComplexity: complexity,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Valida se um objeto é um Cognitive Plan válido.
 */
export function validateCognitivePlan(plan) {
  if (!plan || typeof plan !== "object") return { valid: false, error: "plan is not an object" };
  if (!plan.planId || typeof plan.planId !== "string") return { valid: false, error: "missing planId" };
  if (!plan.goal || typeof plan.goal !== "string") return { valid: false, error: "missing goal" };
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) return { valid: false, error: "steps must be non-empty" };
  if (!Array.isArray(plan.participants)) return { valid: false, error: "participants must be array" };
  if (!PRIORITY_LEVELS.includes(plan.priority)) return { valid: false, error: "invalid priority" };
  if (!COMPLEXITY_LEVELS.includes(plan.estimatedComplexity)) return { valid: false, error: "invalid complexity" };
  for (const step of plan.steps) {
    if (!step.participant || typeof step.participant !== "string") return { valid: false, error: `step missing participant` };
    if (!PARTICIPANTS.includes(step.participant)) return { valid: false, error: `unknown participant: ${step.participant}` };
  }
  return { valid: true, error: null };
}