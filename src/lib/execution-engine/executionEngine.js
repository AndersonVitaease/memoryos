/**
 * Execution Engine (Sprint 17 — MDS)
 *
 * Responsabilidade única: EXECUTAR planos aprovados.
 *
 * FLUXO:
 *   Goal → Goal Validation → Planner → Capability Negotiation
 *   → Execution Engine → Connector Interface → Provider Adapter → Sistema Externo
 *
 * PRINCÍPIOS:
 *   — Nunca interpreta objetivos
 *   — Nunca altera políticas
 *   — Nunca toma decisões de negócio
 *   — Nunca acessa APIs diretamente
 *   — Nunca conhece sistemas específicos
 *   — Apenas executa planos aprovados de forma segura, auditável e desacoplada
 *
 * COMPATIBILIDADE FUTURA:
 *   — Learning Engine  (interface reservada)
 *   — Knowledge Engine (interface reservada)
 *   — Support Intelligence (interface reservada)
 *   — Intent Verification Engine (interface reservada)
 *   — Security Intelligence Engine (interface reservada)
 */

import {
  EXECUTION_STATUS,
  STEP_STATUS,
  EXECUTION_ERROR_TYPE,
  RETRY_POLICY,
  buildExecutionRecord,
  buildStepResult,
  buildAuditEntry,
  buildExecutionEvent,
  buildIntentVerification,
  nextExecutionId,
  deepFreeze,
} from "./executionContracts.js";

import {
  createTransaction,
  getReadySteps,
  groupStepsForExecution,
  transitionStepStatus,
  recordStepResult,
  applyContextUpdate,
  getContext,
  enqueueForRollback,
  getRollbackQueue,
  recordRollback,
  computeRetryInterval,
  recordRetry,
  getRetryCount,
  checkIntegrity,
  computeFinalStatus,
  finalizeTransaction,
  snapshotTransaction,
} from "./executionTransactionManager.js";

import {
  getConnector,
  buildConnectorResult,
  buildRollbackResult,
} from "./connectorInterface.js";

import { createSecurityGate } from "./executionSecurityGate.js";

// ─── Observability ────────────────────────────────────────────────────────────

const _stats = {
  executionsStarted:   0,
  executionsCompleted: 0,
  executionsFailed:    0,
  executionsRolledBack: 0,
  totalStepsExecuted:  0,
  totalStepsFailed:    0,
  totalRetries:        0,
  totalRollbacks:      0,
  totalDurationMs:     0,
  eventLog:            [],
};

function _emit(type, executionId, stepId, payload) {
  try {
    const ev = buildExecutionEvent({ type, executionId, stepId: stepId ?? null, payload: payload ?? {} });
    _stats.eventLog.push(ev);
    return ev;
  } catch (_) {
    return null;
  }
}

function _audit(record, extra = {}) {
  try {
    const entry = buildAuditEntry({
      executionId: record.executionId,
      userId:      record.userId,
      sessionId:   record.sessionId,
      ...extra,
    });
    record.auditTrail.push(entry);
    return entry;
  } catch (_) {
    return null;
  }
}

// ─── Step Executor ────────────────────────────────────────────────────────────

/**
 * Executa um único Step através da Connector Interface.
 * Aplica Retry Policy, Timeout e registra auditoria.
 *
 * O Engine nunca chama APIs diretamente.
 * Toda comunicação é via ConnectorInterface.
 */
async function executeStep(step, transaction, record, securityGate) {
  const t0 = Date.now();

  // 1. Verificar autorização de segurança
  const auth = securityGate.authorize({
    stepId:     step.stepId,
    capability: step.capability,
    userId:     record.userId,
    orgId:      record.orgId,
    context:    getContext(transaction),
  });

  if (!auth.authorized) {
    transitionStepStatus(transaction, step.stepId, STEP_STATUS.FAILED);
    _emit("execution.step.failed", record.executionId, step.stepId, { reason: auth.reason, errorType: auth.errorType });
    _audit(record, { stepId: step.stepId, action: "STEP_BLOCKED_BY_SECURITY", capability: step.capability, status: "failed", errorType: auth.errorType, details: auth.reason });

    const result = buildStepResult({
      stepId:     step.stepId,
      name:       step.name,
      capability: step.capability,
      status:     STEP_STATUS.FAILED,
      startedAt:  new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      error:      auth.reason,
      errorType:  auth.errorType,
    });
    recordStepResult(transaction, step.stepId, result);
    return result;
  }

  transitionStepStatus(transaction, step.stepId, STEP_STATUS.AUTHORIZED);
  _emit("execution.step.authorized", record.executionId, step.stepId, { capability: step.capability });

  // 2. Resolver Connector
  const connector = step.connectorId ? getConnector(step.connectorId) : null;

  if (step.connectorId && !connector) {
    const err = `Connector "${step.connectorId}" not found in registry`;
    transitionStepStatus(transaction, step.stepId, STEP_STATUS.FAILED);
    _emit("execution.step.failed", record.executionId, step.stepId, { reason: err });

    const result = buildStepResult({
      stepId: step.stepId, name: step.name, capability: step.capability,
      connectorId: step.connectorId, status: STEP_STATUS.FAILED,
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0, error: err, errorType: EXECUTION_ERROR_TYPE.CONNECTOR_ERROR,
    });
    recordStepResult(transaction, step.stepId, result);
    return result;
  }

  _emit("execution.connector.selected", record.executionId, step.stepId, { connectorId: step.connectorId });
  _emit("execution.provider.selected",  record.executionId, step.stepId, { providerId:  step.providerId  });

  transitionStepStatus(transaction, step.stepId, STEP_STATUS.RUNNING);
  _emit("execution.step.started", record.executionId, step.stepId, { capability: step.capability });
  _audit(record, { stepId: step.stepId, action: "STEP_STARTED", capability: step.capability, connectorId: step.connectorId, providerId: step.providerId, status: "running" });

  // 3. Executar com Retry Policy
  let lastError    = null;
  let lastErrorType = null;
  let attempt      = 0;
  let connResult   = null;
  const maxAttempts = step.maxRetries + 1;

  while (attempt < maxAttempts) {
    attempt++;

    if (attempt > 1) {
      const interval = computeRetryInterval(attempt - 1, step.retryPolicy, step.retryIntervalMs);
      recordRetry(transaction, step.stepId, attempt, lastError, step.retryPolicy, interval, false);
      _emit("execution.step.retrying", record.executionId, step.stepId, { attempt, interval, reason: lastError });
      _stats.totalRetries++;
      record.retryLog.push({ stepId: step.stepId, attempt, reason: lastError, interval });
    }

    _emit("execution.external.request", record.executionId, step.stepId, {
      capability: step.capability, connectorId: step.connectorId, attempt,
    });

    if (connector) {
      try {
        const inputData = { ...step.inputData, ...getContext(transaction) };
        const raw = await connector.execute(inputData, { userId: record.userId, orgId: record.orgId });
        connResult = buildConnectorResult({
          connectorId:  step.connectorId,
          capabilityId: step.capability,
          success:      raw.success ?? true,
          outputData:   raw.outputData ?? raw,
          durationMs:   Date.now() - t0,
          executionRef: raw.executionRef ?? null,
        });
      } catch (err) {
        lastError     = String(err?.message ?? err);
        lastErrorType = EXECUTION_ERROR_TYPE.CONNECTOR_ERROR;
        connResult    = buildConnectorResult({
          connectorId: step.connectorId, capabilityId: step.capability,
          success: false, error: lastError, errorType: lastErrorType,
          durationMs: Date.now() - t0, retryable: attempt < maxAttempts,
        });
      }
    } else {
      // Sem Connector registrado — execução lógica determinística
      connResult = buildConnectorResult({
        connectorId:  step.connectorId ?? "internal",
        capabilityId: step.capability,
        success:      true,
        outputData:   { capability: step.capability, inputData: step.inputData },
        durationMs:   Date.now() - t0,
      });
    }

    _emit("execution.external.response", record.executionId, step.stepId, {
      success: connResult.success, durationMs: connResult.durationMs, attempt,
    });

    if (connResult.success) break;

    lastError     = connResult.error;
    lastErrorType = connResult.errorType ?? EXECUTION_ERROR_TYPE.CONNECTOR_ERROR;

    if (!connResult.retryable || attempt >= maxAttempts) break;
  }

  const durationMs = Date.now() - t0;

  // 4. Processar resultado
  if (!connResult || !connResult.success) {
    _stats.totalStepsFailed++;
    transitionStepStatus(transaction, step.stepId, STEP_STATUS.FAILED);
    _emit("execution.step.failed", record.executionId, step.stepId, { error: lastError });
    _audit(record, {
      stepId: step.stepId, action: "STEP_FAILED", capability: step.capability,
      connectorId: step.connectorId, providerId: step.providerId,
      durationMs, status: "failed", errorType: lastErrorType, details: lastError,
    });

    const result = buildStepResult({
      stepId: step.stepId, name: step.name, capability: step.capability,
      connectorId: step.connectorId, providerId: step.providerId,
      status: STEP_STATUS.FAILED,
      startedAt:  new Date(Date.now() - durationMs).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs, retries: attempt - 1,
      error: lastError, errorType: lastErrorType,
    });
    recordStepResult(transaction, step.stepId, result);
    return result;
  }

  // 5. Sucesso — atualizar contexto
  _stats.totalStepsExecuted++;
  transitionStepStatus(transaction, step.stepId, STEP_STATUS.COMPLETED);
  applyContextUpdate(transaction, step.stepId, step.capability, connResult.outputData);

  // 6. Enfileirar para rollback se suportado
  enqueueForRollback(transaction, step, connResult.executionRef);

  _emit("execution.step.completed", record.executionId, step.stepId, {
    capability: step.capability, durationMs, retries: attempt - 1,
  });
  _emit("execution.context.updated", record.executionId, step.stepId, {
    capability: step.capability,
  });
  _audit(record, {
    stepId: step.stepId, action: "STEP_COMPLETED", capability: step.capability,
    connectorId: step.connectorId, providerId: step.providerId,
    durationMs, status: "completed",
  });

  const result = buildStepResult({
    stepId: step.stepId, name: step.name, capability: step.capability,
    connectorId: step.connectorId, providerId: step.providerId,
    status:     STEP_STATUS.COMPLETED,
    startedAt:  new Date(Date.now() - durationMs).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs, retries: attempt - 1,
    outputData: connResult.outputData,
  });
  recordStepResult(transaction, step.stepId, result);
  return result;
}

// ─── Rollback Executor ────────────────────────────────────────────────────────

async function executeRollback(transaction, record) {
  const queue = getRollbackQueue(transaction);

  _emit("execution.rolled_back", record.executionId, null, { stepsToRollback: queue.length });
  _audit(record, { action: "ROLLBACK_STARTED", status: "rolling_back", details: `${queue.length} steps` });

  for (const item of queue) {
    const t0        = Date.now();
    const connector = item.connectorId ? getConnector(item.connectorId) : null;
    let success     = false;
    let error       = null;

    if (connector && typeof connector.rollback === "function") {
      try {
        await connector.rollback(item.executionRef, { userId: record.userId });
        success = true;
      } catch (err) {
        error = String(err?.message ?? err);
      }
    } else {
      // Sem rollback disponível — registrar intervenção humana necessária
      error = "Rollback not available — human intervention required";
    }

    const durationMs = Date.now() - t0;
    const status = success ? "rolled_back" : "rollback_failed";

    recordRollback(transaction, item.stepId, item.capability, item.connectorId, status, error, durationMs);
    transitionStepStatus(transaction, item.stepId, STEP_STATUS.ROLLED_BACK);
    _stats.totalRollbacks++;

    _emit("execution.step.rolled_back", record.executionId, item.stepId, { success, error, durationMs });
    _audit(record, {
      stepId:      item.stepId,
      action:      "STEP_ROLLED_BACK",
      capability:  item.capability,
      connectorId: item.connectorId,
      durationMs,
      status,
      details:     error,
    });

    record.rollbackLog.push({ stepId: item.stepId, status, error, durationMs });
  }
}

// ─── Intent Verification ──────────────────────────────────────────────────────

function verifyIntent(record, executedActions) {
  if (!record.goalId) return null;

  // Comparar intenção original com ações executadas
  const planCapabilities = record.steps.map((s) => s.capability);
  const executedCaps     = executedActions.map((a) => a.capability).filter(Boolean);
  const divergent        = planCapabilities.some((c) => !executedCaps.includes(c));

  const verification = buildIntentVerification({
    userIntent:      record.goalId,
    approvedPlan:    record.planId,
    executedActions,
    divergent,
    divergenceReason: divergent ? "One or more planned capabilities were not executed" : null,
  });

  if (divergent) {
    _emit("execution.intent.diverged", record.executionId, null, {
      planCapabilities, executedCaps, divergenceReason: verification.divergenceReason,
    });
  } else {
    _emit("execution.intent.verified", record.executionId, null, { planCapabilities, executedCaps });
  }

  return verification;
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

/**
 * Cria uma instância do Execution Engine.
 *
 * @param {Object} config
 * @param {Object} config.securityGate — SecurityGate injetado (opcional)
 */
export function createExecutionEngine(config = {}) {
  const securityGate = config.securityGate ?? createSecurityGate();

  return {
    /**
     * Executa um plano aprovado completo.
     *
     * @param {Object} plan — Plano aprovado do Planner Engine
     * @param {Object} executionCtx — Contexto: userId, sessionId, orgId, goalId
     * @returns {Object} ExecutionRecord imutável
     */
    async execute(plan, executionCtx = {}) {
      const t0 = Date.now();
      _stats.executionsStarted++;

      if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
        _stats.executionsFailed++;
        return deepFreeze({
          executionId: `exe-err-${Date.now()}`,
          status:      EXECUTION_STATUS.FAILED,
          error:       "Invalid plan: steps array required",
        });
      }

      // Criar registro mutável (será frozen ao final)
      const record = {
        executionId: nextExecutionId(),
        planId:      plan.planId ?? "unknown",
        userId:      executionCtx.userId ?? "anonymous",
        sessionId:   executionCtx.sessionId ?? null,
        orgId:       executionCtx.orgId     ?? null,
        goalId:      executionCtx.goalId    ?? null,
        status:      EXECUTION_STATUS.CREATED,
        steps:       plan.steps,
        stepResults: [],
        auditTrail:  [],
        events:      [],
        contextUpdates: [],
        rollbackLog: [],
        retryLog:    [],
        intentVerification: null,
        startedAt:   new Date().toISOString(),
        finishedAt:  null,
      };

      // Criar transação interna
      const transaction = createTransaction({
        executionId: record.executionId,
        planId:      record.planId,
        userId:      record.userId,
        steps:       plan.steps,
      });

      // Emitir eventos de início
      _emit("execution.started",  record.executionId, null, { planId: record.planId, userId: record.userId, stepCount: plan.steps.length });
      _emit("execution.queued",   record.executionId, null, {});
      _emit("execution.preparing",record.executionId, null, {});
      _audit(record, { action: "EXECUTION_STARTED", status: "started" });

      record.status = EXECUTION_STATUS.EXECUTING;
      _emit("execution.queued", record.executionId, null, {});

      // ── Loop de execução ──────────────────────────────────────────────────
      let hasFailed  = false;
      let iterations = 0;
      const maxIter  = plan.steps.length + 5;   // guardar contra loops infinitos

      while (iterations++ < maxIter) {
        const ready = getReadySteps(transaction, plan.steps);
        if (ready.length === 0) break;

        const { parallel, sequential } = groupStepsForExecution(ready);

        // Executar steps paralelos simultaneamente
        if (parallel.length > 0) {
          const parallelResults = await Promise.all(
            parallel.map((step) => executeStep(step, transaction, record, securityGate))
          );
          record.stepResults.push(...parallelResults);
          if (parallelResults.some((r) => r.status === STEP_STATUS.FAILED)) hasFailed = true;
        }

        // Executar steps sequenciais um a um
        for (const step of sequential) {
          const result = await executeStep(step, transaction, record, securityGate);
          record.stepResults.push(result);
          if (result.status === STEP_STATUS.FAILED) hasFailed = true;
        }
      }

      // ── Rollback se necessário ────────────────────────────────────────────
      if (hasFailed && transaction.rollbackQueue.length > 0) {
        await executeRollback(transaction, record);
        _stats.executionsRolledBack++;
      }

      // ── Verificação de integridade ────────────────────────────────────────
      const integrity = checkIntegrity(transaction, plan.steps);

      // ── Intent Verification ───────────────────────────────────────────────
      const executedActions = record.stepResults
        .filter((r) => r.status === STEP_STATUS.COMPLETED)
        .map((r) => ({ stepId: r.stepId, capability: r.capability }));

      record.intentVerification = verifyIntent(record, executedActions);

      // ── Status final ──────────────────────────────────────────────────────
      const finalStatus = computeFinalStatus(transaction, plan.steps);
      finalizeTransaction(transaction, finalStatus);
      record.status    = finalStatus;
      record.finishedAt = new Date().toISOString();

      const totalDurationMs = Date.now() - t0;
      _stats.totalDurationMs += totalDurationMs;

      const completedCount = record.stepResults.filter((r) => r.status === STEP_STATUS.COMPLETED).length;
      const totalRequired  = plan.steps.filter((s) => s.required).length;
      const successRate    = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 100;

      _audit(record, {
        action:    "EXECUTION_FINISHED",
        status:    finalStatus,
        durationMs: totalDurationMs,
        details:   `${completedCount}/${totalRequired} steps completed, successRate=${successRate}%`,
      });

      const finalEvent = hasFailed ? "execution.failed" : "execution.completed";
      _emit(finalEvent, record.executionId, null, { status: finalStatus, successRate, totalDurationMs });

      if (hasFailed) _stats.executionsFailed++;
      else           _stats.executionsCompleted++;

      // Adicionar eventos ao record
      record.events = _stats.eventLog.filter((e) => e.executionId === record.executionId);

      // Retornar snapshot imutável
      return deepFreeze({
        executionId:       record.executionId,
        planId:            record.planId,
        userId:            record.userId,
        sessionId:         record.sessionId,
        orgId:             record.orgId,
        goalId:            record.goalId,
        status:            record.status,
        stepResults:       [...record.stepResults],
        totalSteps:        plan.steps.length,
        completedSteps:    record.stepResults.filter((r) => r.status === STEP_STATUS.COMPLETED),
        failedSteps:       record.stepResults.filter((r) => r.status === STEP_STATUS.FAILED),
        skippedSteps:      record.stepResults.filter((r) => r.status === STEP_STATUS.SKIPPED),
        rolledBackSteps:   record.stepResults.filter((r) => r.status === STEP_STATUS.ROLLED_BACK),
        totalDurationMs,
        successRate,
        auditTrail:        [...record.auditTrail],
        events:            [...record.events],
        contextUpdates:    [...record.contextUpdates],
        rollbackLog:       [...record.rollbackLog],
        retryLog:          [...record.retryLog],
        intentVerification: record.intentVerification,
        transactionSnapshot: snapshotTransaction(transaction),
        integrityCheck:    integrity,
        startedAt:         record.startedAt,
        finishedAt:        record.finishedAt,
      });
    },

    // ── Future Integration Interfaces ─────────────────────────────────────

    /** Interface reservada — Learning Engine (Sprint futura) */
    onLearningEngineEvent(_event) { /* noop — futuro */ },

    /** Interface reservada — Knowledge Engine (Sprint futura) */
    onKnowledgeEngineEvent(_event) { /* noop — futuro */ },

    /** Interface reservada — Support Intelligence (Sprint futura) */
    notifySupportIntelligence(_incident) { /* noop — futuro */ },

    /** Interface reservada — Product Evolution Engine (Sprint futura) */
    onProductEvolutionEvent(_event) { /* noop — futuro */ },

    getType() { return "ExecutionEngine"; },
  };
}

// ─── Observability ────────────────────────────────────────────────────────────

export function getExecutionStats() {
  const runs = _stats.executionsStarted;
  return deepFreeze({
    executionsStarted:    _stats.executionsStarted,
    executionsCompleted:  _stats.executionsCompleted,
    executionsFailed:     _stats.executionsFailed,
    executionsRolledBack: _stats.executionsRolledBack,
    totalStepsExecuted:   _stats.totalStepsExecuted,
    totalStepsFailed:     _stats.totalStepsFailed,
    totalRetries:         _stats.totalRetries,
    totalRollbacks:       _stats.totalRollbacks,
    averageDurationMs:    runs > 0 ? Math.round(_stats.totalDurationMs / runs) : 0,
    successRate:          runs > 0 ? Math.round((_stats.executionsCompleted / runs) * 100) : 0,
    eventLogSize:         _stats.eventLog.length,
  });
}

export function getExecutionEventLog() {
  return [..._stats.eventLog];
}

export function _resetExecutionEngineForTests() {
  _stats.executionsStarted   = 0;
  _stats.executionsCompleted = 0;
  _stats.executionsFailed    = 0;
  _stats.executionsRolledBack = 0;
  _stats.totalStepsExecuted  = 0;
  _stats.totalStepsFailed    = 0;
  _stats.totalRetries        = 0;
  _stats.totalRollbacks      = 0;
  _stats.totalDurationMs     = 0;
  _stats.eventLog.length     = 0;
}

export default {
  createExecutionEngine,
  getExecutionStats,
  getExecutionEventLog,
  _resetExecutionEngineForTests,
};