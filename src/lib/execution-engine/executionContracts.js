/**
 * Execution Engine — Contracts (Sprint 17)
 *
 * Contratos oficiais do Execution Engine do MemoryOS.
 * Todos os objetos são imutáveis (Object.freeze).
 * IDs são sequenciais e determinísticos.
 *
 * Princípios:
 *   — Nunca interpreta objetivos
 *   — Nunca altera políticas
 *   — Nunca acessa APIs diretamente
 *   — Apenas executa planos aprovados
 */

// ─── Execution Status ────────────────────────────────────────────────────────

export const EXECUTION_STATUS = Object.freeze({
  CREATED:           "created",
  QUEUED:            "queued",
  PREPARING:         "preparing",
  EXECUTING:         "executing",
  WAITING_EXTERNAL:  "waiting_external",
  COMPLETED:         "completed",
  FAILED:            "failed",
  CANCELLED:         "cancelled",
  ROLLED_BACK:       "rolled_back",
});

export const EXECUTION_STATUSES = Object.freeze(Object.values(EXECUTION_STATUS));

// ─── Step Status ──────────────────────────────────────────────────────────────

export const STEP_STATUS = Object.freeze({
  PENDING:          "pending",
  AUTHORIZED:       "authorized",
  RUNNING:          "running",
  WAITING_EXTERNAL: "waiting_external",
  COMPLETED:        "completed",
  FAILED:           "failed",
  SKIPPED:          "skipped",
  CANCELLED:        "cancelled",
  ROLLING_BACK:     "rolling_back",
  ROLLED_BACK:      "rolled_back",
});

export const STEP_STATUSES = Object.freeze(Object.values(STEP_STATUS));

// ─── Error Classification ─────────────────────────────────────────────────────

export const EXECUTION_ERROR_TYPE = Object.freeze({
  USER_ERROR:          "user_error",
  PERMISSION_ERROR:    "permission_error",
  CONNECTOR_ERROR:     "connector_error",
  PROVIDER_ERROR:      "provider_error",
  INFRASTRUCTURE:      "infrastructure",
  TIMEOUT:             "timeout",
  COMMUNICATION:       "communication",
  BUSINESS_RULE:       "business_rule",
  UNEXPECTED:          "unexpected",
});

// ─── Retry Policies ──────────────────────────────────────────────────────────

export const RETRY_POLICY = Object.freeze({
  NONE:              "none",
  SIMPLE:            "simple",
  EXPONENTIAL_BACKOFF: "exponential_backoff",
  CONDITIONAL:       "conditional",
});

// ─── ID Generators ───────────────────────────────────────────────────────────

let _executionCounter  = 0;
let _stepCounter       = 0;
let _transactionCounter = 0;
let _auditCounter      = 0;

export function nextExecutionId()   { return `exe-${++_executionCounter}`; }
export function nextStepId()        { return `stp-${++_stepCounter}`; }
export function nextTransactionId() { return `txn-${++_transactionCounter}`; }
export function nextAuditId()       { return `aud-${++_auditCounter}`; }

export function _resetIdsForTests() {
  _executionCounter  = 0;
  _stepCounter       = 0;
  _transactionCounter = 0;
  _auditCounter      = 0;
}

// ─── Deep Freeze ─────────────────────────────────────────────────────────────

export function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const val = obj[name];
    if (typeof val === "object" && val !== null) deepFreeze(val);
  });
  return Object.freeze(obj);
}

// ─── Execution Step Builder ───────────────────────────────────────────────────

export function buildExecutionStep({
  name,
  capability,
  connectorId,
  providerId,
  dependencies     = [],
  priority         = 5,
  timeoutMs        = 30_000,
  retryPolicy      = RETRY_POLICY.EXPONENTIAL_BACKOFF,
  maxRetries       = 3,
  retryIntervalMs  = 1_000,
  supportsRollback = false,
  parallel         = false,
  required         = true,
  inputData        = null,
}) {
  if (!name)       throw new Error("ExecutionStep: name is required");
  if (!capability) throw new Error("ExecutionStep: capability is required");

  return deepFreeze({
    stepId:          nextStepId(),
    name:            String(name),
    capability:      String(capability),
    connectorId:     connectorId  ? String(connectorId)  : null,
    providerId:      providerId   ? String(providerId)   : null,
    dependencies:    Array.isArray(dependencies) ? [...dependencies] : [],
    priority:        Math.max(1, Math.min(10, Number(priority) || 5)),
    timeoutMs:       Math.max(1_000, Number(timeoutMs) || 30_000),
    retryPolicy:     Object.values(RETRY_POLICY).includes(retryPolicy) ? retryPolicy : RETRY_POLICY.SIMPLE,
    maxRetries:      Math.max(0, Number(maxRetries) || 0),
    retryIntervalMs: Math.max(100, Number(retryIntervalMs) || 1_000),
    supportsRollback: Boolean(supportsRollback),
    parallel:        Boolean(parallel),
    required:        Boolean(required),
    inputData:       inputData ?? null,
    status:          STEP_STATUS.PENDING,
    createdAt:       new Date().toISOString(),
  });
}

// ─── Step Result Builder ──────────────────────────────────────────────────────

export function buildStepResult({
  stepId,
  name           = "",
  capability     = "",
  connectorId    = null,
  providerId     = null,
  status,
  startedAt      = null,
  finishedAt     = null,
  durationMs     = 0,
  retries        = 0,
  outputData     = null,
  error          = null,
  errorType      = null,
  rollbackStatus = null,
  auditId        = null,
}) {
  if (!stepId)                        throw new Error("StepResult: stepId is required");
  if (!STEP_STATUSES.includes(status)) throw new Error(`StepResult: invalid status "${status}"`);

  return deepFreeze({
    stepId,
    name:          String(name || ""),
    capability:    String(capability || ""),
    connectorId:   connectorId  ? String(connectorId)  : null,
    providerId:    providerId   ? String(providerId)   : null,
    status,
    startedAt:     startedAt  ?? null,
    finishedAt:    finishedAt ?? null,
    durationMs:    Math.max(0, Number(durationMs) || 0),
    retries:       Math.max(0, Number(retries) || 0),
    outputData:    outputData ?? null,
    error:         error      ?? null,
    errorType:     errorType  ?? null,
    rollbackStatus: rollbackStatus ?? null,
    auditId:       auditId    ?? null,
  });
}

// ─── Execution Record Builder ─────────────────────────────────────────────────

export function buildExecutionRecord({
  planId,
  userId,
  sessionId      = null,
  orgId          = null,
  goalId         = null,
  steps          = [],
  status         = EXECUTION_STATUS.CREATED,
  startedAt      = null,
  finishedAt     = null,
  stepResults    = [],
  totalDurationMs = 0,
  successRate    = 0,
  auditTrail     = [],
  events         = [],
  contextUpdates = [],
  rollbackLog    = [],
  retryLog       = [],
  intentVerification = null,
}) {
  if (!planId)  throw new Error("ExecutionRecord: planId is required");
  if (!userId)  throw new Error("ExecutionRecord: userId is required");

  const safeStatus = EXECUTION_STATUSES.includes(status) ? status : EXECUTION_STATUS.CREATED;

  return deepFreeze({
    executionId:     nextExecutionId(),
    planId:          String(planId),
    userId:          String(userId),
    sessionId:       sessionId  ? String(sessionId)  : null,
    orgId:           orgId      ? String(orgId)      : null,
    goalId:          goalId     ? String(goalId)     : null,
    status:          safeStatus,
    steps:           Array.isArray(steps) ? [...steps] : [],
    stepResults:     Array.isArray(stepResults) ? [...stepResults] : [],
    totalDurationMs: Math.max(0, Number(totalDurationMs) || 0),
    successRate:     Math.max(0, Math.min(100, Number(successRate) || 0)),
    auditTrail:      Array.isArray(auditTrail) ? [...auditTrail] : [],
    events:          Array.isArray(events) ? [...events] : [],
    contextUpdates:  Array.isArray(contextUpdates) ? [...contextUpdates] : [],
    rollbackLog:     Array.isArray(rollbackLog) ? [...rollbackLog] : [],
    retryLog:        Array.isArray(retryLog) ? [...retryLog] : [],
    intentVerification: intentVerification ?? null,
    startedAt:       startedAt  ?? null,
    finishedAt:      finishedAt ?? null,
    createdAt:       new Date().toISOString(),
  });
}

// ─── Audit Entry Builder ──────────────────────────────────────────────────────

export function buildAuditEntry({
  executionId,
  stepId         = null,
  userId,
  sessionId      = null,
  action,
  capability     = null,
  connectorId    = null,
  providerId     = null,
  durationMs     = null,
  status,
  errorType      = null,
  details        = null,
}) {
  if (!executionId) throw new Error("AuditEntry: executionId is required");
  if (!userId)      throw new Error("AuditEntry: userId is required");
  if (!action)      throw new Error("AuditEntry: action is required");
  if (!status)      throw new Error("AuditEntry: status is required");

  return deepFreeze({
    auditId:     nextAuditId(),
    executionId: String(executionId),
    stepId:      stepId     ? String(stepId)     : null,
    userId:      String(userId),
    sessionId:   sessionId  ? String(sessionId)  : null,
    action:      String(action),
    capability:  capability  ? String(capability)  : null,
    connectorId: connectorId ? String(connectorId) : null,
    providerId:  providerId  ? String(providerId)  : null,
    durationMs:  durationMs  !== null ? Math.max(0, Number(durationMs)) : null,
    status:      String(status),
    errorType:   errorType  ?? null,
    details:     details    ?? null,
    timestamp:   new Date().toISOString(),
  });
}

// ─── Execution Event Builder ──────────────────────────────────────────────────

export const EXECUTION_EVENTS = Object.freeze([
  "execution.started",
  "execution.queued",
  "execution.preparing",
  "execution.step.authorized",
  "execution.step.started",
  "execution.connector.selected",
  "execution.provider.selected",
  "execution.external.request",
  "execution.external.response",
  "execution.step.completed",
  "execution.step.failed",
  "execution.step.retrying",
  "execution.step.rolled_back",
  "execution.context.updated",
  "execution.completed",
  "execution.failed",
  "execution.cancelled",
  "execution.rolled_back",
  "execution.intent.verified",
  "execution.intent.diverged",
]);

export function buildExecutionEvent({ type, executionId, stepId = null, payload = {} }) {
  if (!EXECUTION_EVENTS.includes(type)) throw new Error(`ExecutionEvent: unknown type "${type}"`);
  if (!executionId) throw new Error("ExecutionEvent: executionId is required");

  return deepFreeze({
    eventId:     `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    executionId: String(executionId),
    stepId:      stepId ? String(stepId) : null,
    payload:     typeof payload === "object" && payload !== null ? { ...payload } : {},
    timestamp:   new Date().toISOString(),
  });
}

// ─── Rollback Entry Builder ───────────────────────────────────────────────────

export function buildRollbackEntry({ stepId, capability, connectorId, status, reason, durationMs = 0 }) {
  if (!stepId)     throw new Error("RollbackEntry: stepId is required");
  if (!capability) throw new Error("RollbackEntry: capability is required");
  if (!status)     throw new Error("RollbackEntry: status is required");

  return deepFreeze({
    stepId:      String(stepId),
    capability:  String(capability),
    connectorId: connectorId ? String(connectorId) : null,
    status:      String(status),
    reason:      reason ?? null,
    durationMs:  Math.max(0, Number(durationMs) || 0),
    rolledBackAt: new Date().toISOString(),
  });
}

// ─── Retry Entry Builder ──────────────────────────────────────────────────────

export function buildRetryEntry({ stepId, attempt, reason, policy, intervalMs, success }) {
  if (!stepId) throw new Error("RetryEntry: stepId is required");

  return deepFreeze({
    stepId:     String(stepId),
    attempt:    Math.max(1, Number(attempt) || 1),
    reason:     reason   ?? null,
    policy:     policy   ?? RETRY_POLICY.SIMPLE,
    intervalMs: Math.max(0, Number(intervalMs) || 0),
    success:    Boolean(success),
    retriedAt:  new Date().toISOString(),
  });
}

// ─── Context Update Builder ───────────────────────────────────────────────────

export function buildContextUpdate({ stepId, capability, outputData, contextPatch }) {
  if (!stepId) throw new Error("ContextUpdate: stepId is required");

  return deepFreeze({
    stepId:      String(stepId),
    capability:  capability ? String(capability) : null,
    outputData:  outputData   ?? null,
    contextPatch: contextPatch ?? null,
    updatedAt:   new Date().toISOString(),
  });
}

// ─── Intent Verification Builder ─────────────────────────────────────────────

export function buildIntentVerification({ userIntent, approvedPlan, executedActions, divergent, divergenceReason = null }) {
  return deepFreeze({
    userIntent:      userIntent      ?? null,
    approvedPlan:    approvedPlan    ?? null,
    executedActions: Array.isArray(executedActions) ? [...executedActions] : [],
    divergent:       Boolean(divergent),
    divergenceReason: divergenceReason ?? null,
    verifiedAt:      new Date().toISOString(),
  });
}