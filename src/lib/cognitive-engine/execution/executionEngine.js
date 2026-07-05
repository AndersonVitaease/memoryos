/**
 * Execution Engine (Fase 3 — Sprint 19)
 *
 * Responsabilidade única: EXECUTAR. Recebe um Plan Result e executa
 * suas etapas de forma determinística, sem efeitos externos.
 *
 * O QUE FAZ:
 *   - Receber Plan Result
 *   - Executar etapas em ordem
 *   - Validar ordem de dependências
 *   - Calcular custo, tempo e taxa de sucesso
 *   - Produzir descrição legível
 *
 * O QUE NÃO FAZ:
 *   - Tomar decisões
 *   - Criar novos planos
 *   - Aprender
 *   - Consultar memória
 *   - Chamar LLM
 *   - Alterar o Planning Engine
 *   - Alterar o Decision Engine
 *   - Reflexão / Autoavaliação / Retry automático
 *
 * Arquitetura:
 *   Decision → Planning → Execution → Learning (futuro)
 */

import {
  buildExecutionResult,
  buildStepResult,
  validateExecutionResult,
  validateStepResult,
  STEP_STATUS_PENDING,
  STEP_STATUS_RUNNING,
  STEP_STATUS_COMPLETED,
  STEP_STATUS_SKIPPED,
  STEP_STATUS_FAILED,
} from "./executionResult";

// === Observability ===
const _stats = {
  executionsCreated: 0,
  executedSteps: 0,
  skippedSteps: 0,
  failedSteps: 0,
  completedSteps: 0,
  totalExecutionTimeMs: 0,
  totalExecutionCost: 0,
  totalSuccessRate: 0,
  statusDistribution: { running: 0, completed: 0, failed: 0, partial: 0 },
  eventLog: [],
};

function _log(event, data) {
  _stats.eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Execute Step ===

/**
 * Executa uma etapa individual (determinístico, sem efeitos externos).
 *
 * Regras:
 *   - Etapas obrigatórias (required=true) → completed
 *   - Etapas opcionais (required=false) → skipped
 *   - Etapas com custo 0 e descrição vazia → skipped
 */
export function executeStep(step) {
  if (!step || !step.id) {
    return buildStepResult({
      stepId: "unknown",
      status: STEP_STATUS_FAILED,
      duration: 0,
      cost: 0,
      message: "Invalid step",
    });
  }

  const startedAt = new Date().toISOString();

  // Determinístico: etapas não obrigatórias são ignoradas
  if (!step.required) {
    const finishedAt = new Date().toISOString();
    _stats.skippedSteps++;
    _log("stepSkipped", { stepId: step.id });
    return buildStepResult({
      stepId: step.id,
      status: STEP_STATUS_SKIPPED,
      startedAt,
      finishedAt,
      duration: 0,
      cost: 0,
      message: `Optional step skipped: ${step.description}`,
    });
  }

  // Etapa obrigatória — executa determinicamente
  const duration = step.estimatedTime || 1;
  const cost = step.estimatedCost || 0;
  const finishedAt = new Date().toISOString();

  _stats.executedSteps++;
  _stats.completedSteps++;
  _log("stepCompleted", { stepId: step.id, duration, cost });

  return buildStepResult({
    stepId: step.id,
    status: STEP_STATUS_COMPLETED,
    startedAt,
    finishedAt,
    duration,
    cost,
    message: `Executed: ${step.description}`,
  });
}

// === Validate Execution Order ===

/**
 * Garante que nenhuma etapa execute antes de suas dependências.
 * Retorna a ordem válida de execução.
 */
export function validateExecutionOrder(steps, dependencies) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { valid: true, order: [], error: null };
  }

  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set();
  const order = [];
  const errors = [];

  function visit(stepId, path) {
    if (visited.has(stepId)) return;
    if (path.includes(stepId)) {
      errors.push(`Circular dependency detected at step ${stepId}`);
      return;
    }

    const deps = (dependencies || []).filter((d) => d.to === stepId);
    for (const dep of deps) {
      visit(dep.from, [...path, stepId]);
    }

    visited.add(stepId);
    order.push(stepMap.get(stepId));
  }

  for (const step of steps) {
    visit(step.id, []);
  }

  return {
    valid: errors.length === 0,
    order,
    error: errors.length > 0 ? errors.join("; ") : null,
  };
}

// === Update Execution Status ===

/**
 * Atualiza o estado da execução com base nos resultados das etapas.
 */
export function updateExecutionStatus(stepResults, totalSteps) {
  const completed = stepResults.filter((r) => r.status === STEP_STATUS_COMPLETED);
  const skipped = stepResults.filter((r) => r.status === STEP_STATUS_SKIPPED);
  const failed = stepResults.filter((r) => r.status === STEP_STATUS_FAILED);

  const executedCount = completed.length + failed.length;

  if (failed.length > 0 && completed.length > 0) {
    return "partial";
  }
  if (failed.length > 0) {
    return "failed";
  }
  if (executedCount + skipped.length === totalSteps) {
    return "completed";
  }
  if (executedCount > 0) {
    return "running";
  }
  return "pending";
}

// === Calculate Execution Cost ===

/**
 * Soma o custo real das etapas executadas.
 */
export function calculateExecutionCost(stepResults) {
  if (!Array.isArray(stepResults)) return 0;
  return stepResults.reduce((total, r) => total + (r.cost || 0), 0);
}

// === Calculate Execution Time ===

/**
 * Calcula o tempo total de execução.
 */
export function calculateExecutionTime(stepResults) {
  if (!Array.isArray(stepResults)) return 0;
  return stepResults.reduce((total, r) => total + (r.duration || 0), 0);
}

// === Calculate Success Rate ===

/**
 * Percentual de etapas concluídas em relação às etapas executadas
 * (concluídas + falhadas). Etapas ignoradas não contam.
 */
export function calculateSuccessRate(stepResults) {
  if (!Array.isArray(stepResults) || stepResults.length === 0) return 0;

  const completed = stepResults.filter((r) => r.status === STEP_STATUS_COMPLETED).length;
  const failed = stepResults.filter((r) => r.status === STEP_STATUS_FAILED).length;
  const executed = completed + failed;

  if (executed === 0) return 100; // nothing to execute = full success
  return Math.round((completed / executed) * 100);
}

// === Execute Plan ===

/**
 * Executa um Plan Result completo e retorna um Execution Result.
 *
 * @param {Object} plan — Plan Result
 * @returns {Object} Execution Result
 */
export function executePlan(plan) {
  _stats.executionsCreated++;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  _log("executionStarted", { planId: plan?.planId });

  if (!plan || !plan.steps) {
    const result = buildExecutionResult({
      planId: plan?.planId || null,
      status: "failed",
      totalSteps: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs: [{ event: "executionFailed", reason: "Invalid plan", timestamp: new Date().toISOString() }],
    });
    _stats.statusDistribution.failed++;
    return result;
  }

  const steps = plan.steps;
  const dependencies = plan.dependencies || [];

  // 1. Validar ordem de execução
  const orderValidation = validateExecutionOrder(steps, dependencies);
  const orderedSteps = orderValidation.valid ? orderValidation.order : steps;

  // 2. Executar cada etapa
  const stepResults = orderedSteps.map((step) => executeStep(step));

  // 3. Calcular métricas
  const cost = calculateExecutionCost(stepResults);
  const time = calculateExecutionTime(stepResults);
  const successRate = calculateSuccessRate(stepResults);
  const status = updateExecutionStatus(stepResults, steps.length);

  const completedSteps = stepResults.filter((r) => r.status === STEP_STATUS_COMPLETED);
  const skippedSteps = stepResults.filter((r) => r.status === STEP_STATUS_SKIPPED);
  const failedSteps = stepResults.filter((r) => r.status === STEP_STATUS_FAILED);

  _stats.skippedSteps += skippedSteps.length;
  _stats.failedSteps += failedSteps.length;
  _stats.totalExecutionTimeMs += time;
  _stats.totalExecutionCost += cost;
  _stats.totalSuccessRate += successRate;
  _stats.statusDistribution[status] = (_stats.statusDistribution[status] || 0) + 1;

  const finishedAt = new Date().toISOString();
  _log("executionCompleted", { status, cost, time, successRate });

  return buildExecutionResult({
    planId: plan.planId,
    status,
    completedSteps,
    skippedSteps,
    failedSteps,
    totalSteps: steps.length,
    executionTime: time,
    executionCost: cost,
    successRate,
    startedAt,
    finishedAt,
    logs: [..._stats.eventLog.slice(-steps.length - 2)],
  });
}

// === Describe Execution ===

/**
 * Produz descrição legível da execução.
 */
export function describeExecution(result) {
  if (!result) return null;

  const lines = [
    `Execução ${result.executionId}`,
    `  Plano: ${result.planId || "—"}`,
    `  Status: ${result.status}`,
    `  Etapas: ${result.totalSteps}`,
    `  Concluídas: ${result.completedSteps.length}`,
    `  Ignoradas: ${result.skippedSteps.length}`,
    `  Falhadas: ${result.failedSteps.length}`,
    `  Tempo: ${result.executionTime}ms`,
    `  Custo: ${result.executionCost}`,
    `  Taxa de sucesso: ${result.successRate}%`,
    `  Início: ${result.startedAt}`,
    `  Fim: ${result.finishedAt}`,
  ];

  if (result.completedSteps.length > 0) {
    lines.push("  Etapas concluídas:");
    for (const s of result.completedSteps) {
      lines.push(`    ✓ ${s.stepId} (${s.duration}ms, ${s.cost}c) — ${s.message}`);
    }
  }

  if (result.skippedSteps.length > 0) {
    lines.push("  Etapas ignoradas:");
    for (const s of result.skippedSteps) {
      lines.push(`    → ${s.stepId} — ${s.message}`);
    }
  }

  if (result.failedSteps.length > 0) {
    lines.push("  Etapas falhadas:");
    for (const s of result.failedSteps) {
      lines.push(`    ✗ ${s.stepId} — ${s.message}`);
    }
  }

  return lines.join("\n");
}

// === Validate Execution ===

export function validateExecution(result) {
  return validateExecutionResult(result);
}

// === Observability ===

export function getStats() {
  return {
    executionsCreated: _stats.executionsCreated,
    executedSteps: _stats.executedSteps,
    skippedSteps: _stats.skippedSteps,
    failedSteps: _stats.failedSteps,
    completedSteps: _stats.completedSteps,
    averageExecutionTime:
      _stats.executionsCreated > 0
        ? Math.round(_stats.totalExecutionTimeMs / _stats.executionsCreated)
        : 0,
    averageExecutionCost:
      _stats.executionsCreated > 0
        ? Math.round((_stats.totalExecutionCost / _stats.executionsCreated) * 10) / 10
        : 0,
    averageSuccessRate:
      _stats.executionsCreated > 0
        ? Math.round(_stats.totalSuccessRate / _stats.executionsCreated)
        : 0,
    averageProcessingTimeMs:
      _stats.executionsCreated > 0
        ? Math.round(_stats.totalExecutionTimeMs / _stats.executionsCreated)
        : 0,
    statusDistribution: { ..._stats.statusDistribution },
    eventLog: [..._stats.eventLog],
  };
}

export function getDecisionLog() {
  return [..._stats.eventLog];
}

export function _resetForTests() {
  _stats.executionsCreated = 0;
  _stats.executedSteps = 0;
  _stats.skippedSteps = 0;
  _stats.failedSteps = 0;
  _stats.completedSteps = 0;
  _stats.totalExecutionTimeMs = 0;
  _stats.totalExecutionCost = 0;
  _stats.totalSuccessRate = 0;
  _stats.statusDistribution = { running: 0, completed: 0, failed: 0, partial: 0 };
  _stats.eventLog.length = 0;
}

export default {
  executePlan,
  executeStep,
  validateExecutionOrder,
  updateExecutionStatus,
  calculateExecutionCost,
  calculateExecutionTime,
  calculateSuccessRate,
  describeExecution,
  validateExecution,
  getStats,
  getDecisionLog,
  _resetForTests,
};