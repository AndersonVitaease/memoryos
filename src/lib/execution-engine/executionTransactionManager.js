/**
 * Execution Transaction Manager (Sprint 17)
 *
 * Gerenciador interno de transações do Execution Engine.
 *
 * Responsabilidades:
 *   — Coordenar múltiplos Steps
 *   — Garantir consistência
 *   — Controlar rollback e compensações
 *   — Detectar estados intermediários
 *   — Garantir integridade da execução
 *
 * NÃO é um novo motor — é parte interna do Execution Engine.
 * Totalmente determinístico. Sem efeitos externos.
 * Sem acesso a APIs, LLMs ou banco de dados.
 */

import {
  EXECUTION_STATUS,
  STEP_STATUS,
  RETRY_POLICY,
  nextTransactionId,
  deepFreeze,
  buildRollbackEntry,
  buildRetryEntry,
  buildContextUpdate,
} from "./executionContracts.js";

// ─── Transaction State ────────────────────────────────────────────────────────

export function createTransaction({ executionId, planId, userId, steps = [] }) {
  if (!executionId) throw new Error("Transaction: executionId required");
  if (!planId)      throw new Error("Transaction: planId required");
  if (!userId)      throw new Error("Transaction: userId required");

  return {
    transactionId:  nextTransactionId(),
    executionId:    String(executionId),
    planId:         String(planId),
    userId:         String(userId),
    status:         EXECUTION_STATUS.PREPARING,
    stepStates:     new Map(steps.map((s) => [s.stepId, STEP_STATUS.PENDING])),
    stepResults:    new Map(),
    completedStepIds: new Set(),
    failedStepIds:  new Set(),
    rolledBackStepIds: new Set(),
    contextState:   {},
    rollbackQueue:  [],   // steps que suportam rollback, em ordem inversa
    retryLog:       [],
    rollbackLog:    [],
    contextUpdates: [],
    startedAt:      new Date().toISOString(),
    finishedAt:     null,
  };
}

// ─── Dependency Resolution ─────────────────────────────────────────────────────

/**
 * Retorna os steps prontos para execução (dependências todas completadas).
 * Determinístico: retorna sempre o mesmo resultado para o mesmo estado.
 */
export function getReadySteps(transaction, allSteps) {
  const ready = [];

  for (const step of allSteps) {
    const state = transaction.stepStates.get(step.stepId);
    if (state !== STEP_STATUS.PENDING) continue;

    const depsOk = step.dependencies.every((depId) =>
      transaction.completedStepIds.has(depId)
    );

    if (depsOk) ready.push(step);
  }

  // Ordenar por prioridade (maior primeiro)
  return ready.sort((a, b) => b.priority - a.priority);
}

/**
 * Separa steps prontos em grupos:
 *   - parallel: podem executar simultaneamente
 *   - sequential: devem aguardar o anterior
 */
export function groupStepsForExecution(readySteps) {
  const parallel   = readySteps.filter((s) => s.parallel);
  const sequential = readySteps.filter((s) => !s.parallel);
  return { parallel, sequential };
}

// ─── Step State Machine ───────────────────────────────────────────────────────

export function transitionStepStatus(transaction, stepId, newStatus) {
  if (!STEP_STATUS[newStatus.toUpperCase().replace(/-/g, "_")] &&
      !Object.values(STEP_STATUS).includes(newStatus)) {
    throw new Error(`Invalid step status transition: ${newStatus}`);
  }

  transaction.stepStates.set(stepId, newStatus);

  if (newStatus === STEP_STATUS.COMPLETED) {
    transaction.completedStepIds.add(stepId);
  } else if (newStatus === STEP_STATUS.FAILED) {
    transaction.failedStepIds.add(stepId);
  } else if (newStatus === STEP_STATUS.ROLLED_BACK) {
    transaction.rolledBackStepIds.add(stepId);
  }
}

export function recordStepResult(transaction, stepId, result) {
  transaction.stepResults.set(stepId, result);
}

// ─── Context Update ───────────────────────────────────────────────────────────

/**
 * Atualiza o Progressive Context Builder após cada Step concluído.
 * O próximo Step utilizará o contexto atualizado.
 */
export function applyContextUpdate(transaction, stepId, capability, outputData, contextPatch = null) {
  const update = buildContextUpdate({ stepId, capability, outputData, contextPatch });
  transaction.contextUpdates.push(update);

  // Mesclar no estado de contexto atual
  if (contextPatch && typeof contextPatch === "object") {
    Object.assign(transaction.contextState, contextPatch);
  }
  if (outputData && typeof outputData === "object") {
    // Output do step fica disponível no contexto por stepId
    transaction.contextState[`step_${stepId}_output`] = outputData;
  }

  return update;
}

export function getContext(transaction) {
  return { ...transaction.contextState };
}

// ─── Rollback Management ──────────────────────────────────────────────────────

/**
 * Registra um step no rollback queue (apenas steps com supportsRollback=true).
 * Mantém ordem inversa de execução para rollback correto.
 */
export function enqueueForRollback(transaction, step, executionRef) {
  if (!step.supportsRollback) return false;

  // Inserir no início — rollback executa em ordem inversa
  transaction.rollbackQueue.unshift({
    stepId:       step.stepId,
    capability:   step.capability,
    connectorId:  step.connectorId,
    executionRef: executionRef ?? null,
  });
  return true;
}

export function getRollbackQueue(transaction) {
  return [...transaction.rollbackQueue];
}

export function recordRollback(transaction, stepId, capability, connectorId, status, reason, durationMs = 0) {
  const entry = buildRollbackEntry({ stepId, capability, connectorId, status, reason, durationMs });
  transaction.rollbackLog.push(entry);
  return entry;
}

// ─── Retry Management ────────────────────────────────────────────────────────

/**
 * Calcula o intervalo de retry com base na política configurada.
 */
export function computeRetryInterval(attempt, policy, baseIntervalMs) {
  if (policy === RETRY_POLICY.EXPONENTIAL_BACKOFF) {
    return Math.min(baseIntervalMs * Math.pow(2, attempt - 1), 30_000);
  }
  return baseIntervalMs;
}

export function recordRetry(transaction, stepId, attempt, reason, policy, intervalMs, success) {
  const entry = buildRetryEntry({ stepId, attempt, reason, policy, intervalMs, success });
  transaction.retryLog.push(entry);
  return entry;
}

export function getRetryCount(transaction, stepId) {
  return transaction.retryLog.filter((r) => r.stepId === stepId).length;
}

// ─── Integrity Checks ────────────────────────────────────────────────────────

/**
 * Verifica integridade da transação.
 * Garante que todos os steps obrigatórios foram executados ou falharam.
 */
export function checkIntegrity(transaction, allSteps) {
  const errors = [];
  const requiredSteps = allSteps.filter((s) => s.required);

  for (const step of requiredSteps) {
    const state = transaction.stepStates.get(step.stepId);
    if (!state || state === STEP_STATUS.PENDING || state === STEP_STATUS.AUTHORIZED) {
      errors.push(`Required step "${step.stepId}" was never executed (state: ${state ?? "unknown"})`);
    }
  }

  // Detectar estados intermediários inconsistentes
  for (const [stepId, state] of transaction.stepStates.entries()) {
    if (state === STEP_STATUS.RUNNING || state === STEP_STATUS.WAITING_EXTERNAL) {
      errors.push(`Step "${stepId}" stuck in intermediate state: ${state}`);
    }
  }

  return {
    valid:  errors.length === 0,
    errors,
  };
}

// ─── Finalization ─────────────────────────────────────────────────────────────

/**
 * Determina o status final da transação com base nos resultados dos steps.
 */
export function computeFinalStatus(transaction, allSteps) {
  const requiredSteps = allSteps.filter((s) => s.required);
  const failed  = [...transaction.failedStepIds].filter((id) => requiredSteps.some((s) => s.stepId === id));
  const completed = [...transaction.completedStepIds];

  if (transaction.rolledBackStepIds.size > 0) return EXECUTION_STATUS.ROLLED_BACK;
  if (failed.length > 0 && completed.length > 0) return EXECUTION_STATUS.FAILED;
  if (failed.length > 0) return EXECUTION_STATUS.FAILED;
  if (completed.length === requiredSteps.length) return EXECUTION_STATUS.COMPLETED;
  return EXECUTION_STATUS.FAILED;
}

export function finalizeTransaction(transaction, status) {
  transaction.status     = status;
  transaction.finishedAt = new Date().toISOString();
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export function snapshotTransaction(transaction) {
  return deepFreeze({
    transactionId:    transaction.transactionId,
    executionId:      transaction.executionId,
    planId:           transaction.planId,
    userId:           transaction.userId,
    status:           transaction.status,
    stepStates:       Object.fromEntries(transaction.stepStates),
    completedStepIds: [...transaction.completedStepIds],
    failedStepIds:    [...transaction.failedStepIds],
    rolledBackStepIds: [...transaction.rolledBackStepIds],
    contextState:     { ...transaction.contextState },
    rollbackQueueSize: transaction.rollbackQueue.length,
    retryCount:       transaction.retryLog.length,
    rollbackCount:    transaction.rollbackLog.length,
    contextUpdateCount: transaction.contextUpdates.length,
    startedAt:        transaction.startedAt,
    finishedAt:       transaction.finishedAt,
  });
}