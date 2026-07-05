/**
 * Cognitive Pipeline (Fase 3 — Sprint 15)
 *
 * Responsabilidade única: EXECUTAR. Recebe um Cognitive Plan válido e
 * executa cada etapa na ordem definida, registrando status, tempo,
 * resultado e erro.
 *
 * O QUE FAZ:
 *   - Receber Cognitive Plan válido
 *   - Executar cada Step na ordem
 *   - Registrar status, tempo, resultado, erro
 *   - Suportar pause / resume / cancel
 *   - Retornar Pipeline Execution
 *
 * O QUE NÃO FAZ:
 *   - Criar planos
 *   - Alterar planos
 *   - Tomar decisões estratégicas
 *   - Execução paralela
 *   - Retry automático
 *   - Reflection / Self Evaluation
 *   - Planejamento / Aprendizado
 *
 * Arquitetura:
 *   Cognitive Orchestrator → Cognitive Pipeline → Memory Engine →
 *   Capabilities → Services → Specialists → Policy Engine →
 *   Planner → LLM → Resposta
 */

import {
  buildPipelineExecution,
  validatePipelineExecution,
  EXECUTION_STATUSES,
  STEP_STATUSES,
  PIPELINE_EXECUTION_FIELDS,
} from "./pipelineExecution";

// === Step executor registry ===
// Cada participante possui um executor mock que simula sua ação.
// O Pipeline nunca implementa a lógica de negócio — apenas delega.
// O executor recebe (step, execution) para que possa, opcionalmente,
// pausar ou cancelar a execução como efeito colateral.
const _stepExecutors = new Map();

function _defaultExecutor(step) {
  return { ok: true, participant: step.participant, action: step.action };
}

function _getExecutor(participant) {
  return _stepExecutors.get(participant) || _defaultExecutor;
}

export function registerStepExecutor(participant, fn) {
  if (!participant || typeof participant !== "string") {
    throw new Error("participant is required");
  }
  if (typeof fn !== "function") {
    throw new Error("executor must be a function");
  }
  _stepExecutors.set(participant, fn);
}

export function clearStepExecutors() {
  _stepExecutors.clear();
}

// === Executions store (in-memory) ===
const _executions = new Map();

// === Observability ===
const _stats = {
  executionStarted: 0,
  executionCompleted: 0,
  executionFailed: 0,
  executionCancelled: 0,
  executionPaused: 0,
  executionResumed: 0,
  stepStarted: 0,
  stepCompleted: 0,
  stepFailed: 0,
  stepSkipped: 0,
  stepCancelled: 0,
  totalStepsExecuted: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

const _eventLog = [];

function _log(event, data) {
  _eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Internal helpers ===

function _finalize(execution, startTime) {
  // Only set finishedAt/duration if execution is truly done (not PAUSED)
  if (execution.status !== "PAUSED") {
    execution.finishedAt = new Date().toISOString();
    execution.duration = Date.now() - startTime;
  }
}

// === Step execution ===

/**
 * Executa uma única etapa de uma execução.
 *
 * @param {Object} execution — Pipeline Execution em andamento
 * @param {Object} step — etapa a executar
 * @returns {Object} etapa atualizada
 */
export function executeStep(execution, step) {
  _stats.operations++;

  if (!execution || !execution.executionId) {
    throw new Error("execution is required");
  }

  if (execution.status === "CANCELLED") {
    step.status = "CANCELLED";
    _stats.stepCancelled++;
    _log("stepCancelled", { executionId: execution.executionId, step: step.order });
    return step;
  }

  if (execution.status === "PAUSED") {
    return step;
  }

  const startTime = Date.now();
  step.status = "RUNNING";
  step.startedAt = new Date().toISOString();
  _stats.stepStarted++;
  _stats.totalStepsExecuted++;
  _log("stepStarted", { executionId: execution.executionId, step: step.order, participant: step.participant });

  try {
    const executor = _getExecutor(step.participant);
    const result = executor(step, execution);

    if (result && result.ok === false) {
      throw new Error(result.error || `executor failed for ${step.participant}`);
    }

    step.status = "COMPLETED";
    step.result = result || { ok: true };
    step.finishedAt = new Date().toISOString();
    step.duration = Date.now() - startTime;
    _stats.stepCompleted++;
    _log("stepCompleted", {
      executionId: execution.executionId,
      step: step.order,
      duration: step.duration,
    });
  } catch (err) {
    step.status = "FAILED";
    step.error = err.message;
    step.finishedAt = new Date().toISOString();
    step.duration = Date.now() - startTime;
    _stats.stepFailed++;
    execution.errors.push({
      step: step.order,
      participant: step.participant,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
    _log("stepFailed", {
      executionId: execution.executionId,
      step: step.order,
      error: err.message,
    });
  }

  return step;
}

// === Plan execution ===

/**
 * Executa um Cognitive Plan completo, etapa por etapa, na ordem definida.
 *
 * @param {Object} plan — Cognitive Plan válido
 * @returns {Object} Pipeline Execution finalizada
 */
export function executePlan(plan) {
  _stats.operations++;
  const startTime = Date.now();

  if (!plan || !plan.planId || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("invalid plan: missing planId or steps");
  }

  const execution = buildPipelineExecution(plan);
  _executions.set(execution.executionId, execution);

  execution.status = "RUNNING";
  execution.startedAt = new Date().toISOString();
  _stats.executionStarted++;
  _log("executionStarted", { executionId: execution.executionId, planId: plan.planId });

  for (const step of execution.steps) {
    if (execution.status === "CANCELLED") {
      step.status = "CANCELLED";
      _stats.stepCancelled++;
      continue;
    }
    if (execution.status === "PAUSED") {
      break;
    }
    executeStep(execution, step);
    if (step.status === "FAILED") {
      execution.status = "FAILED";
      for (const remaining of execution.steps) {
        if (remaining.status === "PENDING") {
          remaining.status = "SKIPPED";
          _stats.stepSkipped++;
        }
      }
      break;
    }
  }

  if (execution.status === "RUNNING") {
    execution.status = "COMPLETED";
    _stats.executionCompleted++;
    _log("executionCompleted", { executionId: execution.executionId, duration: Date.now() - startTime });
  } else if (execution.status === "FAILED") {
    _stats.executionFailed++;
    _log("executionFailed", { executionId: execution.executionId });
  }

  _finalize(execution, startTime);
  return execution;
}

// === Cancel ===

/**
 * Cancela uma execução em andamento.
 * Steps restantes são marcados como CANCELLED.
 */
export function cancelExecution(executionId) {
  _stats.operations++;
  const execution = _executions.get(executionId);
  if (!execution) return null;

  if (["COMPLETED", "FAILED", "CANCELLED"].includes(execution.status)) {
    execution.warnings.push({
      message: `cannot cancel execution in status ${execution.status}`,
      timestamp: new Date().toISOString(),
    });
    return execution;
  }

  execution.status = "CANCELLED";
  _stats.executionCancelled++;
  execution.finishedAt = new Date().toISOString();

  for (const step of execution.steps) {
    if (step.status === "PENDING" || step.status === "RUNNING") {
      step.status = "CANCELLED";
      _stats.stepCancelled++;
    }
  }

  _log("executionCancelled", { executionId });
  return execution;
}

// === Pause / Resume ===

/**
 * Pausa uma execução em andamento. Steps restantes permanecem PENDING.
 */
export function pauseExecution(executionId) {
  _stats.operations++;
  const execution = _executions.get(executionId);
  if (!execution) return null;

  if (execution.status !== "RUNNING") {
    execution.warnings.push({
      message: `cannot pause execution in status ${execution.status}`,
      timestamp: new Date().toISOString(),
    });
    return execution;
  }

  execution.status = "PAUSED";
  _stats.executionPaused++;
  _log("executionPaused", { executionId });
  return execution;
}

/**
 * Retoma uma execução pausada, continuando de onde parou.
 */
export function resumeExecution(executionId) {
  _stats.operations++;
  const execution = _executions.get(executionId);
  if (!execution) return null;

  if (execution.status !== "PAUSED") {
    execution.warnings.push({
      message: `cannot resume execution in status ${execution.status}`,
      timestamp: new Date().toISOString(),
    });
    return execution;
  }

  execution.status = "RUNNING";
  _stats.executionResumed++;
  _log("executionResumed", { executionId });

  const startTime = new Date(execution.startedAt).getTime();

  for (const step of execution.steps) {
    if (step.status === "PENDING") {
      executeStep(execution, step);
      if (step.status === "FAILED") {
        execution.status = "FAILED";
        for (const remaining of execution.steps) {
          if (remaining.status === "PENDING") {
            remaining.status = "SKIPPED";
            _stats.stepSkipped++;
          }
        }
        break;
      }
    }
  }

  if (execution.status === "RUNNING") {
    execution.status = "COMPLETED";
    _stats.executionCompleted++;
    _log("executionCompleted", { executionId, duration: Date.now() - startTime });
  } else if (execution.status === "FAILED") {
    _stats.executionFailed++;
  }

  _finalize(execution, startTime);
  return execution;
}

// === Describe ===

export function describeExecution(executionId) {
  const execution = _executions.get(executionId);
  if (!execution) return null;

  const lines = [
    `Execução ${execution.executionId}`,
    `  Plano: ${execution.planId}`,
    `  Status: ${execution.status}`,
    `  Início: ${execution.startedAt || "—"}`,
    `  Fim: ${execution.finishedAt || "—"}`,
    `  Duração: ${execution.duration !== null ? execution.duration + "ms" : "—"}`,
    `  Erros: ${execution.errors.length}`,
    `  Warnings: ${execution.warnings.length}`,
    `  Etapas:`,
    ...execution.steps.map(
      (s) => `    ${s.order}. [${s.status}] ${s.participant} → ${s.action}${s.duration !== null ? ` (${s.duration}ms)` : ""}`
    ),
  ];
  return lines.join("\n");
}

// === Get / Validate ===

export function getExecution(executionId) {
  return _executions.get(executionId) || null;
}

export function validateExecution(execution) {
  return validatePipelineExecution(execution);
}

// === Observability ===

export function getStats() {
  return {
    ..._stats,
    averageStepTimeMs:
      _stats.totalStepsExecuted > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.totalStepsExecuted)
        : 0,
    totalExecutions: _executions.size,
    eventLog: [..._eventLog],
  };
}

export function getDecisionLog() {
  return [..._eventLog];
}

export function _resetForTests() {
  _executions.clear();
  _stats.executionStarted = 0;
  _stats.executionCompleted = 0;
  _stats.executionFailed = 0;
  _stats.executionCancelled = 0;
  _stats.executionPaused = 0;
  _stats.executionResumed = 0;
  _stats.stepStarted = 0;
  _stats.stepCompleted = 0;
  _stats.stepFailed = 0;
  _stats.stepSkipped = 0;
  _stats.stepCancelled = 0;
  _stats.totalStepsExecuted = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _eventLog.length = 0;
}

export default {
  executePlan,
  executeStep,
  cancelExecution,
  pauseExecution,
  resumeExecution,
  describeExecution,
  getExecution,
  validateExecution,
  registerStepExecutor,
  clearStepExecutors,
  getStats,
  getDecisionLog,
  _resetForTests,
};