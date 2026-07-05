/**
 * Execution Result Contract (Fase 3 — Sprint 19)
 *
 * Contrato oficial do resultado de execução do MemoryOS.
 * O Execution Engine consome um Plan Result e executa suas etapas
 * de forma determinística, sem efeitos externos.
 *
 * Campos imutáveis:
 *   executionId      — UUID da execução
 *   planId           — ID do plano executado
 *   status           — "running" | "completed" | "failed" | "partial"
 *   completedSteps   — etapas concluídas
 *   skippedSteps     — etapas ignoradas
 *   failedSteps      — etapas com falha
 *   totalSteps       — total de etapas
 *   executionTime    — tempo total (ms)
 *   executionCost    — custo real total
 *   successRate      — percentual de sucesso (0-100)
 *   startedAt        — timestamp ISO
 *   finishedAt       — timestamp ISO
 *   logs             — log de eventos
 */

export const EXECUTION_STATUSES = ["pending", "running", "completed", "failed", "partial"];

export const STEP_STATUS_PENDING = "pending";
export const STEP_STATUS_RUNNING = "running";
export const STEP_STATUS_COMPLETED = "completed";
export const STEP_STATUS_SKIPPED = "skipped";
export const STEP_STATUS_FAILED = "failed";

export const STEP_STATUSES = [
  STEP_STATUS_PENDING,
  STEP_STATUS_RUNNING,
  STEP_STATUS_COMPLETED,
  STEP_STATUS_SKIPPED,
  STEP_STATUS_FAILED,
];

export const EXECUTION_RESULT_FIELDS = [
  "executionId",
  "planId",
  "status",
  "completedSteps",
  "skippedSteps",
  "failedSteps",
  "totalSteps",
  "executionTime",
  "executionCost",
  "successRate",
  "startedAt",
  "finishedAt",
  "logs",
];

export const STEP_RESULT_FIELDS = [
  "stepId",
  "status",
  "startedAt",
  "finishedAt",
  "duration",
  "cost",
  "message",
];

let _uuidCounter = 0;
function generateUUID() {
  _uuidCounter++;
  return `exec-${Date.now()}-${_uuidCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói um Step Result imutável.
 */
export function buildStepResult({
  stepId,
  status,
  startedAt,
  finishedAt,
  duration = 0,
  cost = 0,
  message = "",
}) {
  if (!stepId) throw new Error("stepId is required");
  if (!STEP_STATUSES.includes(status)) throw new Error(`invalid step status: ${status}`);

  return Object.freeze({
    stepId,
    status,
    startedAt: startedAt || null,
    finishedAt: finishedAt || null,
    duration: Math.max(0, duration),
    cost: Math.max(0, cost),
    message: message || "",
  });
}

/**
 * Constrói um Execution Result imutável.
 */
export function buildExecutionResult({
  planId,
  status,
  completedSteps = [],
  skippedSteps = [],
  failedSteps = [],
  totalSteps = 0,
  executionTime = 0,
  executionCost = 0,
  successRate = 0,
  startedAt,
  finishedAt,
  logs = [],
}) {
  const finalStatus = EXECUTION_STATUSES.includes(status) ? status : "running";

  return Object.freeze({
    executionId: generateUUID(),
    planId: planId || null,
    status: finalStatus,
    completedSteps: Array.isArray(completedSteps)
      ? Object.freeze([...completedSteps])
      : Object.freeze([]),
    skippedSteps: Array.isArray(skippedSteps)
      ? Object.freeze([...skippedSteps])
      : Object.freeze([]),
    failedSteps: Array.isArray(failedSteps)
      ? Object.freeze([...failedSteps])
      : Object.freeze([]),
    totalSteps: Math.max(0, totalSteps),
    executionTime: Math.max(0, executionTime),
    executionCost: Math.max(0, executionCost),
    successRate: Math.max(0, Math.min(100, successRate)),
    startedAt: startedAt || null,
    finishedAt: finishedAt || null,
    logs: Array.isArray(logs) ? Object.freeze([...logs]) : Object.freeze([]),
  });
}

/**
 * Valida se um objeto é um Execution Result válido.
 */
export function validateExecutionResult(result) {
  if (!result || typeof result !== "object") {
    return { valid: false, error: "result is not an object" };
  }
  if (!result.executionId || typeof result.executionId !== "string") {
    return { valid: false, error: "missing executionId" };
  }
  if (!EXECUTION_STATUSES.includes(result.status)) {
    return { valid: false, error: "invalid status" };
  }
  if (!Array.isArray(result.completedSteps)) {
    return { valid: false, error: "completedSteps must be an array" };
  }
  if (!Array.isArray(result.skippedSteps)) {
    return { valid: false, error: "skippedSteps must be an array" };
  }
  if (!Array.isArray(result.failedSteps)) {
    return { valid: false, error: "failedSteps must be an array" };
  }
  if (typeof result.totalSteps !== "number") {
    return { valid: false, error: "totalSteps must be a number" };
  }
  if (typeof result.executionTime !== "number") {
    return { valid: false, error: "executionTime must be a number" };
  }
  if (typeof result.executionCost !== "number") {
    return { valid: false, error: "executionCost must be a number" };
  }
  if (typeof result.successRate !== "number") {
    return { valid: false, error: "successRate must be a number" };
  }
  return { valid: true, error: null };
}

/**
 * Valida se um objeto é um Step Result válido.
 */
export function validateStepResult(step) {
  if (!step || typeof step !== "object") {
    return { valid: false, error: "step result is not an object" };
  }
  if (!step.stepId) return { valid: false, error: "missing stepId" };
  if (!STEP_STATUSES.includes(step.status)) {
    return { valid: false, error: "invalid step status" };
  }
  if (typeof step.duration !== "number") return { valid: false, error: "duration must be a number" };
  if (typeof step.cost !== "number") return { valid: false, error: "cost must be a number" };
  return { valid: true, error: null };
}