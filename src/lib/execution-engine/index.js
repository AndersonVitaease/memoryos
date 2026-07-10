/**
 * Execution Engine (Sprint 17 — MDS)
 *
 * Entry point oficial do Execution Engine do MemoryOS.
 *
 * FLUXO:
 *   Goal → Goal Validation → Planner → Capability Negotiation
 *   → Execution Engine → Connector Interface → Provider Adapter → Sistema Externo
 *
 * PRINCÍPIOS ARQUITETURAIS:
 *   — Nunca interpreta objetivos
 *   — Nunca altera políticas
 *   — Nunca toma decisões de negócio
 *   — Nunca acessa APIs diretamente
 *   — Nunca conhece sistemas específicos (Wooba, Sabre, Shopify, etc.)
 *   — Apenas executa planos aprovados de forma segura, auditável e desacoplada
 *
 * COMPATIBILIDADE:
 *   — MAS 1.0, MPS, MCF, MCIS, MGIS, MES, MDS 1.0–1.6
 *   — Completamente desacoplado de sistemas externos
 *   — Preparado para milhões de execuções simultâneas
 */

// ── Core Engine ───────────────────────────────────────────────────────────────
export {
  createExecutionEngine,
  getExecutionStats,
  getExecutionEventLog,
  _resetExecutionEngineForTests,
} from "./executionEngine.js";

// ── Contracts ─────────────────────────────────────────────────────────────────
export {
  EXECUTION_STATUS,
  STEP_STATUS,
  EXECUTION_ERROR_TYPE,
  RETRY_POLICY,
  EXECUTION_EVENTS,
  buildExecutionStep,
  buildStepResult,
  buildAuditEntry,
  buildExecutionEvent,
  buildRollbackEntry,
  buildRetryEntry,
  buildContextUpdate,
  buildIntentVerification,
  nextExecutionId,
  nextStepId,
  nextTransactionId,
  nextAuditId,
  deepFreeze,
  _resetIdsForTests,
} from "./executionContracts.js";

// ── Connector Interface ────────────────────────────────────────────────────────
export {
  CONNECTOR_INTERFACE_SCHEMA,
  PROVIDER_ADAPTER_SCHEMA,
  buildConnectorMetadata,
  buildConnectorResult,
  buildRollbackResult,
  buildProviderMetadata,
  registerConnector,
  registerProvider,
  getConnector,
  getProvider,
  listConnectors,
  listProviders,
  getConnectorStats,
  _resetRegistryForTests,
} from "./connectorInterface.js";

// ── Security Gate ─────────────────────────────────────────────────────────────
export {
  createPermissionEngine,
  createApprovalEngine,
  createRiskEngine,
  createSecurityIntelligence,
  createSecurityGate,
  RISK_LEVELS,
} from "./executionSecurityGate.js";

// ── Transaction Manager ───────────────────────────────────────────────────────
export {
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

// ── Tests ─────────────────────────────────────────────────────────────────────
export { executionTests, runExecutionTests } from "./tests/executionTests.js";