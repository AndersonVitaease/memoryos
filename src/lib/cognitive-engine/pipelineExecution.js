/**
 * Pipeline Execution Contract (Fase 3 — Sprint 15)
 *
 * Contrato oficial da execução de um Cognitive Plan.
 * O Cognitive Pipeline recebe um plano válido e executa cada etapa na ordem.
 *
 * O QUE É:
 *   - Registro imutável de uma execução de plano
 *   - Contém status, steps, tempos, erros e warnings
 *
 * Campos:
 *   executionId   — UUID da execução
 *   planId        — ID do plano executado
 *   status        — "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "PAUSED"
 *   steps         — etapas com status individual, tempo e resultado
 *   startedAt     — timestamp ISO de início
 *   finishedAt    — timestamp ISO de fim (null se em andamento)
 *   duration      — duração total em ms (null se em andamento)
 *   errors        — lista de erros
 *   warnings      — lista de warnings
 */

export const EXECUTION_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "PAUSED",
];

export const STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
];

export const PIPELINE_EXECUTION_FIELDS = [
  "executionId",
  "planId",
  "status",
  "steps",
  "startedAt",
  "finishedAt",
  "duration",
  "errors",
  "warnings",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `exec-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói uma Pipeline Execution a partir de um Cognitive Plan válido.
 */
export function buildPipelineExecution(plan) {
  if (!plan || typeof plan !== "object") {
    throw new Error("plan is required and must be an object");
  }
  if (!plan.planId || typeof plan.planId !== "string") {
    throw new Error("plan.planId is required");
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("plan.steps must be a non-empty array");
  }

  return {
    executionId: generateUUID(),
    planId: plan.planId,
    status: "PENDING",
    steps: plan.steps.map((s, i) => ({
      order: s.order || i + 1,
      participant: s.participant,
      action: s.action,
      status: "PENDING",
      startedAt: null,
      finishedAt: null,
      duration: null,
      result: null,
      error: null,
    })),
    startedAt: null,
    finishedAt: null,
    duration: null,
    errors: [],
    warnings: [],
  };
}

/**
 * Valida se um objeto é uma Pipeline Execution válida.
 */
export function validatePipelineExecution(execution) {
  if (!execution || typeof execution !== "object") {
    return { valid: false, error: "execution is not an object" };
  }
  if (!execution.executionId || typeof execution.executionId !== "string") {
    return { valid: false, error: "missing executionId" };
  }
  if (!execution.planId || typeof execution.planId !== "string") {
    return { valid: false, error: "missing planId" };
  }
  if (!EXECUTION_STATUSES.includes(execution.status)) {
    return { valid: false, error: "invalid status" };
  }
  if (!Array.isArray(execution.steps) || execution.steps.length === 0) {
    return { valid: false, error: "steps must be non-empty" };
  }
  for (const step of execution.steps) {
    if (!STEP_STATUSES.includes(step.status)) {
      return { valid: false, error: `invalid step status: ${step.status}` };
    }
    if (!step.participant || typeof step.participant !== "string") {
      return { valid: false, error: "step missing participant" };
    }
  }
  if (!Array.isArray(execution.errors)) {
    return { valid: false, error: "errors must be an array" };
  }
  if (!Array.isArray(execution.warnings)) {
    return { valid: false, error: "warnings must be an array" };
  }
  return { valid: true, error: null };
}