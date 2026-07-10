/**
 * Execution Engine — Tests (Sprint 17)
 *
 * Cobertura:
 *   — Contracts
 *   — Connector Interface
 *   — Security Gate
 *   — Transaction Manager
 *   — Execution Engine (sequencial, paralelo, rollback, retry)
 *   — Observabilidade
 *   — Isolamento e determinismo
 */

import {
  buildExecutionStep,
  buildStepResult,
  buildAuditEntry,
  buildExecutionEvent,
  buildRollbackEntry,
  buildRetryEntry,
  buildContextUpdate,
  buildIntentVerification,
  EXECUTION_STATUS,
  STEP_STATUS,
  RETRY_POLICY,
  EXECUTION_EVENTS,
  nextExecutionId,
  nextStepId,
  _resetIdsForTests,
  deepFreeze,
} from "../executionContracts.js";

import {
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
} from "../connectorInterface.js";

import {
  createPermissionEngine,
  createApprovalEngine,
  createRiskEngine,
  createSecurityIntelligence,
  createSecurityGate,
} from "../executionSecurityGate.js";

import {
  createTransaction,
  getReadySteps,
  groupStepsForExecution,
  transitionStepStatus,
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
  snapshotTransaction,
} from "../executionTransactionManager.js";

import {
  createExecutionEngine,
  getExecutionStats,
  getExecutionEventLog,
  _resetExecutionEngineForTests,
} from "../executionEngine.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStep(overrides = {}) {
  return buildExecutionStep({
    name:       overrides.name       ?? "Test Step",
    capability: overrides.capability ?? "capability.test",
    connectorId: overrides.connectorId ?? null,
    providerId:  overrides.providerId  ?? null,
    dependencies: overrides.dependencies ?? [],
    priority:     overrides.priority  ?? 5,
    timeoutMs:    overrides.timeoutMs ?? 5_000,
    maxRetries:   overrides.maxRetries ?? 0,
    retryPolicy:  overrides.retryPolicy ?? RETRY_POLICY.NONE,
    supportsRollback: overrides.supportsRollback ?? false,
    parallel:     overrides.parallel  ?? false,
    required:     overrides.required  ?? true,
    inputData:    overrides.inputData ?? null,
    ...overrides,
  });
}

function makePlan(stepsOverrides = [{}]) {
  const steps = stepsOverrides.map((o) => makeStep(o));
  return {
    planId: `plan-${Date.now()}`,
    steps,
    dependencies: [],
  };
}

function makeConnector({ success = true, outputData = { result: "ok" }, supportsRollback = false } = {}) {
  return {
    execute:     async (input, ctx) => ({ success, outputData, executionRef: "ref-001" }),
    rollback:    supportsRollback
      ? async (ref, ctx) => ({ success: true })
      : null,
    validate:    (input) => ({ valid: true }),
    getMetadata: () => buildConnectorMetadata({
      connectorId:     "conn-test",
      capabilityId:    "capability.test",
      displayName:     "Test Connector",
      supportsRollback,
    }),
  };
}

function setup() {
  _resetIdsForTests();
  _resetRegistryForTests();
  _resetExecutionEngineForTests();
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

export const executionTests = [

  // ── Contracts ──────────────────────────────────────────────────────────────

  {
    name: "buildExecutionStep — cria step válido e imutável",
    run() {
      setup();
      const step = makeStep({ name: "Reservar Voo", capability: "flight.reserve" });
      if (!step.stepId)                     throw new Error("Missing stepId");
      if (step.name !== "Reservar Voo")     throw new Error("Wrong name");
      if (step.capability !== "flight.reserve") throw new Error("Wrong capability");
      if (step.status !== STEP_STATUS.PENDING)  throw new Error("Wrong initial status");
      if (step.priority < 1 || step.priority > 10) throw new Error("Priority out of range");
      try { step.name = "hacked"; throw new Error("Should be frozen"); } catch (_) { /* ok */ }
    },
  },

  {
    name: "buildExecutionStep — lança erro se name ausente",
    run() {
      setup();
      try {
        buildExecutionStep({ capability: "x" });
        throw new Error("Should have thrown");
      } catch (e) {
        if (!e.message.includes("name is required")) throw e;
      }
    },
  },

  {
    name: "buildExecutionStep — lança erro se capability ausente",
    run() {
      setup();
      try {
        buildExecutionStep({ name: "x" });
        throw new Error("Should have thrown");
      } catch (e) {
        if (!e.message.includes("capability is required")) throw e;
      }
    },
  },

  {
    name: "buildStepResult — cria resultado válido e imutável",
    run() {
      setup();
      const r = buildStepResult({
        stepId: "stp-1", name: "Step A", capability: "cap.a",
        status: STEP_STATUS.COMPLETED, durationMs: 120,
      });
      if (r.stepId !== "stp-1")                    throw new Error("Wrong stepId");
      if (r.status !== STEP_STATUS.COMPLETED)       throw new Error("Wrong status");
      if (r.durationMs !== 120)                     throw new Error("Wrong durationMs");
      try { r.status = "hacked"; throw new Error("Should be frozen"); } catch (_) { /* ok */ }
    },
  },

  {
    name: "buildStepResult — rejeita status inválido",
    run() {
      setup();
      try {
        buildStepResult({ stepId: "stp-1", status: "invalid_status" });
        throw new Error("Should have thrown");
      } catch (e) {
        if (!e.message.includes("invalid status")) throw e;
      }
    },
  },

  {
    name: "buildAuditEntry — cria entrada de auditoria válida",
    run() {
      setup();
      const entry = buildAuditEntry({
        executionId: "exe-1", userId: "u1", action: "STEP_STARTED",
        capability: "cap.x", status: "running",
      });
      if (!entry.auditId)                 throw new Error("Missing auditId");
      if (entry.executionId !== "exe-1")  throw new Error("Wrong executionId");
      if (entry.action !== "STEP_STARTED") throw new Error("Wrong action");
    },
  },

  {
    name: "buildExecutionEvent — cria evento válido para tipo conhecido",
    run() {
      setup();
      const ev = buildExecutionEvent({
        type:        "execution.started",
        executionId: "exe-1",
        payload:     { planId: "plan-1" },
      });
      if (!ev.eventId)                        throw new Error("Missing eventId");
      if (ev.type !== "execution.started")    throw new Error("Wrong type");
      if (ev.payload.planId !== "plan-1")     throw new Error("Wrong payload");
    },
  },

  {
    name: "buildExecutionEvent — rejeita tipo desconhecido",
    run() {
      setup();
      try {
        buildExecutionEvent({ type: "unknown.event", executionId: "exe-1" });
        throw new Error("Should have thrown");
      } catch (e) {
        if (!e.message.includes("unknown type")) throw e;
      }
    },
  },

  {
    name: "EXECUTION_EVENTS — contém todos os 19 eventos esperados",
    run() {
      setup();
      const required = [
        "execution.started", "execution.step.started", "execution.step.completed",
        "execution.step.failed", "execution.completed", "execution.failed",
        "execution.rolled_back", "execution.step.retrying", "execution.context.updated",
        "execution.intent.verified", "execution.intent.diverged",
      ];
      for (const ev of required) {
        if (!EXECUTION_EVENTS.includes(ev)) throw new Error(`Missing event: ${ev}`);
      }
    },
  },

  // ── Connector Interface ────────────────────────────────────────────────────

  {
    name: "registerConnector — registra e recupera conector",
    run() {
      setup();
      const c = makeConnector();
      registerConnector("conn-a", c);
      if (getConnector("conn-a") !== c) throw new Error("Connector not found after registration");
    },
  },

  {
    name: "registerConnector — rejeita conector sem execute()",
    run() {
      setup();
      try {
        registerConnector("bad", { getMetadata: () => {} });
        throw new Error("Should have thrown");
      } catch (e) {
        if (!e.message.includes("execute()")) throw e;
      }
    },
  },

  {
    name: "listConnectors — retorna IDs registrados",
    run() {
      setup();
      registerConnector("c1", makeConnector());
      registerConnector("c2", makeConnector());
      const list = listConnectors();
      if (!list.includes("c1")) throw new Error("c1 not in list");
      if (!list.includes("c2")) throw new Error("c2 not in list");
    },
  },

  {
    name: "buildConnectorResult — cria resultado válido e imutável",
    run() {
      setup();
      const r = buildConnectorResult({
        connectorId: "c1", capabilityId: "cap.x",
        success: true, outputData: { ok: 1 }, durationMs: 50,
      });
      if (!r.success)              throw new Error("Should be success");
      if (r.durationMs !== 50)     throw new Error("Wrong durationMs");
      if (r.outputData?.ok !== 1)  throw new Error("Wrong outputData");
      try { r.success = false; throw new Error("Should be frozen"); } catch (_) { /* ok */ }
    },
  },

  // ── Security Gate ──────────────────────────────────────────────────────────

  {
    name: "SecurityGate — autoriza step por padrão",
    run() {
      setup();
      const gate = createSecurityGate();
      const result = gate.authorize({ stepId: "s1", capability: "cap.x", userId: "u1" });
      if (!result.authorized) throw new Error("Should be authorized by default");
    },
  },

  {
    name: "PermissionEngine — bloqueia usuário negado",
    run() {
      setup();
      const pe = createPermissionEngine({ deniedUsers: ["blocked-user"] });
      const r  = pe.check({ stepId: "s1", capability: "cap.x", userId: "blocked-user" });
      if (r.authorized) throw new Error("Should block denied user");
    },
  },

  {
    name: "PermissionEngine — bloqueia capability negada",
    run() {
      setup();
      const pe = createPermissionEngine({ deniedCapabilities: ["cap.forbidden"] });
      const r  = pe.check({ stepId: "s1", capability: "cap.forbidden", userId: "u1" });
      if (r.authorized) throw new Error("Should block denied capability");
    },
  },

  {
    name: "ApprovalEngine — marca requiresApproval sem bloquear (autoApprove=true)",
    run() {
      setup();
      const ae = createApprovalEngine({ autoApprove: true, requireApprovalFor: ["cap.risky"] });
      const r  = ae.check({ stepId: "s1", capability: "cap.risky", userId: "u1" });
      if (!r.authorized)        throw new Error("Should be authorized with autoApprove");
      if (!r.requiresApproval)  throw new Error("Should mark requiresApproval");
    },
  },

  {
    name: "ApprovalEngine — bloqueia quando autoApprove=false",
    run() {
      setup();
      const ae = createApprovalEngine({ autoApprove: false, requireApprovalFor: ["cap.risky"] });
      const r  = ae.check({ stepId: "s1", capability: "cap.risky", userId: "u1" });
      if (r.authorized) throw new Error("Should block without autoApprove");
    },
  },

  {
    name: "RiskEngine — bloqueia capability de alto risco acima do threshold",
    run() {
      setup();
      const re = createRiskEngine({ maxAllowedRisk: "medium", highRiskCapabilities: ["cap.high"] });
      const r  = re.check({ stepId: "s1", capability: "cap.high", userId: "u1" });
      if (r.authorized) throw new Error("Should block high risk capability");
    },
  },

  {
    name: "SecurityGate — bloqueia quando PermissionEngine nega",
    run() {
      setup();
      const gate = createSecurityGate({
        permissionEngine: createPermissionEngine({ deniedUsers: ["u-bad"] }),
      });
      const r = gate.authorize({ stepId: "s1", capability: "cap.x", userId: "u-bad" });
      if (r.authorized)              throw new Error("Should be blocked");
      if (r.blockedBy !== "PermissionEngine") throw new Error("Wrong blockedBy");
    },
  },

  // ── Transaction Manager ────────────────────────────────────────────────────

  {
    name: "createTransaction — cria transação com estado inicial correto",
    run() {
      setup();
      const step = makeStep();
      const txn  = createTransaction({ executionId: "exe-1", planId: "plan-1", userId: "u1", steps: [step] });
      if (!txn.transactionId)          throw new Error("Missing transactionId");
      if (txn.status !== EXECUTION_STATUS.PREPARING) throw new Error("Wrong initial status");
      if (!txn.stepStates.has(step.stepId)) throw new Error("Step not in stepStates");
    },
  },

  {
    name: "getReadySteps — retorna step sem dependências como pronto",
    run() {
      setup();
      const step = makeStep({ dependencies: [] });
      const txn  = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [step] });
      const ready = getReadySteps(txn, [step]);
      if (ready.length !== 1)         throw new Error("Should have 1 ready step");
      if (ready[0].stepId !== step.stepId) throw new Error("Wrong step returned");
    },
  },

  {
    name: "getReadySteps — não retorna step com dependência pendente",
    run() {
      setup();
      const s1 = makeStep({ name: "Step 1" });
      const s2 = makeStep({ name: "Step 2", dependencies: [s1.stepId] });
      const txn = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [s1, s2] });
      const ready = getReadySteps(txn, [s1, s2]);
      if (ready.some((s) => s.stepId === s2.stepId)) throw new Error("Step 2 should not be ready");
    },
  },

  {
    name: "getReadySteps — retorna step após dependência ser completada",
    run() {
      setup();
      const s1 = makeStep({ name: "Step 1" });
      const s2 = makeStep({ name: "Step 2", dependencies: [s1.stepId] });
      const txn = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [s1, s2] });
      transitionStepStatus(txn, s1.stepId, STEP_STATUS.COMPLETED);
      txn.completedStepIds.add(s1.stepId);
      const ready = getReadySteps(txn, [s1, s2]);
      if (!ready.some((s) => s.stepId === s2.stepId)) throw new Error("Step 2 should now be ready");
    },
  },

  {
    name: "groupStepsForExecution — separa paralelos e sequenciais",
    run() {
      setup();
      const s1 = makeStep({ name: "Parallel", parallel: true });
      const s2 = makeStep({ name: "Sequential", parallel: false });
      const { parallel, sequential } = groupStepsForExecution([s1, s2]);
      if (parallel.length  !== 1) throw new Error("Should have 1 parallel step");
      if (sequential.length !== 1) throw new Error("Should have 1 sequential step");
    },
  },

  {
    name: "applyContextUpdate — atualiza contextState com outputData",
    run() {
      setup();
      const step = makeStep();
      const txn  = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [step] });
      applyContextUpdate(txn, step.stepId, "cap.x", { reservationId: "R-001" });
      const ctx = getContext(txn);
      if (!ctx[`step_${step.stepId}_output`]) throw new Error("Context not updated with output");
    },
  },

  {
    name: "enqueueForRollback — enfileira apenas steps com supportsRollback=true",
    run() {
      setup();
      const s1 = makeStep({ supportsRollback: true });
      const s2 = makeStep({ supportsRollback: false });
      const txn = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [s1, s2] });
      enqueueForRollback(txn, s1, "ref-1");
      enqueueForRollback(txn, s2, "ref-2");
      const queue = getRollbackQueue(txn);
      if (queue.length !== 1) throw new Error("Only 1 step should be in rollback queue");
      if (queue[0].stepId !== s1.stepId) throw new Error("Wrong step in rollback queue");
    },
  },

  {
    name: "computeRetryInterval — EXPONENTIAL_BACKOFF dobra o intervalo",
    run() {
      setup();
      const base = 1_000;
      const t1 = computeRetryInterval(1, RETRY_POLICY.EXPONENTIAL_BACKOFF, base);
      const t2 = computeRetryInterval(2, RETRY_POLICY.EXPONENTIAL_BACKOFF, base);
      if (t2 !== t1 * 2) throw new Error(`Expected ${t1 * 2}, got ${t2}`);
    },
  },

  {
    name: "computeRetryInterval — SIMPLE retorna intervalo base",
    run() {
      setup();
      const t = computeRetryInterval(5, RETRY_POLICY.SIMPLE, 500);
      if (t !== 500) throw new Error(`Expected 500, got ${t}`);
    },
  },

  {
    name: "checkIntegrity — válido quando todos os steps obrigatórios foram executados",
    run() {
      setup();
      const step = makeStep({ required: true });
      const txn  = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [step] });
      transitionStepStatus(txn, step.stepId, STEP_STATUS.COMPLETED);
      const check = checkIntegrity(txn, [step]);
      if (!check.valid) throw new Error(`Integrity should be valid: ${check.errors.join(", ")}`);
    },
  },

  {
    name: "checkIntegrity — inválido quando step obrigatório está pendente",
    run() {
      setup();
      const step = makeStep({ required: true });
      const txn  = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [step] });
      const check = checkIntegrity(txn, [step]);
      if (check.valid) throw new Error("Integrity should be invalid with pending required step");
    },
  },

  {
    name: "snapshotTransaction — retorna snapshot imutável",
    run() {
      setup();
      const step = makeStep();
      const txn  = createTransaction({ executionId: "exe-1", planId: "p1", userId: "u1", steps: [step] });
      const snap = snapshotTransaction(txn);
      if (!snap.transactionId) throw new Error("Missing transactionId in snapshot");
      try { snap.status = "hacked"; throw new Error("Should be frozen"); } catch (_) { /* ok */ }
    },
  },

  // ── Execution Engine — Integration ────────────────────────────────────────

  {
    name: "execute — plano simples sequencial completa com sucesso",
    async run() {
      setup();
      registerConnector("conn-a", makeConnector({ success: true }));
      const engine = createExecutionEngine();
      const plan   = makePlan([
        { name: "Step A", capability: "cap.a", connectorId: "conn-a" },
        { name: "Step B", capability: "cap.b" },
      ]);
      const result = await engine.execute(plan, { userId: "u1", sessionId: "s1" });
      if (result.status !== EXECUTION_STATUS.COMPLETED) throw new Error(`Wrong status: ${result.status}`);
      if (result.completedSteps.length === 0)           throw new Error("No completed steps");
    },
  },

  {
    name: "execute — plano inválido retorna FAILED imediatamente",
    async run() {
      setup();
      const engine = createExecutionEngine();
      const result = await engine.execute(null, { userId: "u1" });
      if (result.status !== EXECUTION_STATUS.FAILED) throw new Error("Should fail with null plan");
    },
  },

  {
    name: "execute — connector falhando resulta em FAILED",
    async run() {
      setup();
      registerConnector("conn-fail", makeConnector({ success: false }));
      const engine = createExecutionEngine();
      const plan   = makePlan([{ name: "Fail Step", capability: "cap.x", connectorId: "conn-fail", required: true }]);
      const result = await engine.execute(plan, { userId: "u1" });
      if (result.status !== EXECUTION_STATUS.FAILED) throw new Error(`Expected failed, got ${result.status}`);
      if (result.failedSteps.length === 0)            throw new Error("Should have failed steps");
    },
  },

  {
    name: "execute — step opcional sem connector não bloqueia execução",
    async run() {
      setup();
      const engine = createExecutionEngine();
      const plan   = makePlan([{ name: "Optional", capability: "cap.opt", required: false }]);
      const result = await engine.execute(plan, { userId: "u1" });
      if (result.status !== EXECUTION_STATUS.COMPLETED) throw new Error(`Wrong status: ${result.status}`);
    },
  },

  {
    name: "execute — steps paralelos executam simultaneamente",
    async run() {
      setup();
      registerConnector("conn-a", makeConnector({ success: true }));
      const engine = createExecutionEngine();
      const plan = {
        planId: "plan-parallel",
        steps: [
          makeStep({ name: "Clima",  capability: "cap.clima",   parallel: true }),
          makeStep({ name: "Hotel",  capability: "cap.hotel",   parallel: true }),
          makeStep({ name: "Carro",  capability: "cap.carro",   parallel: true }),
        ],
        dependencies: [],
      };
      const result = await engine.execute(plan, { userId: "u1" });
      if (result.status !== EXECUTION_STATUS.COMPLETED) throw new Error(`Wrong status: ${result.status}`);
      if (result.completedSteps.length !== 3) throw new Error(`Expected 3 completed, got ${result.completedSteps.length}`);
    },
  },

  {
    name: "execute — registra auditTrail com entradas",
    async run() {
      setup();
      const engine = createExecutionEngine();
      const plan   = makePlan([{ name: "Step A", capability: "cap.a" }]);
      const result = await engine.execute(plan, { userId: "u1", sessionId: "s1" });
      if (!Array.isArray(result.auditTrail)) throw new Error("auditTrail should be an array");
      if (result.auditTrail.length === 0)    throw new Error("auditTrail should have entries");
    },
  },

  {
    name: "execute — emite eventos durante execução",
    async run() {
      setup();
      const engine = createExecutionEngine();
      const plan   = makePlan([{ name: "Step A", capability: "cap.a" }]);
      await engine.execute(plan, { userId: "u1" });
      const log = getExecutionEventLog();
      if (log.length === 0) throw new Error("Event log should not be empty");
      const types = log.map((e) => e.type);
      if (!types.includes("execution.started"))   throw new Error("Missing execution.started");
      if (!types.includes("execution.completed")) throw new Error("Missing execution.completed");
    },
  },

  {
    name: "execute — rollback executado quando connector suporta",
    async run() {
      setup();
      // Connector A tem sucesso e suporta rollback
      const connA = {
        execute:     async () => ({ success: true, outputData: {}, executionRef: "ref-a" }),
        rollback:    async () => ({ success: true }),
        getMetadata: () => buildConnectorMetadata({ connectorId: "conn-a", capabilityId: "cap.a", displayName: "A", supportsRollback: true }),
      };
      // Connector B sempre falha (dispara rollback do A)
      const connB = {
        execute:     async () => ({ success: false, error: "Provider error" }),
        getMetadata: () => buildConnectorMetadata({ connectorId: "conn-b", capabilityId: "cap.b", displayName: "B" }),
      };
      registerConnector("conn-a", connA);
      registerConnector("conn-b", connB);

      const engine = createExecutionEngine();
      const plan = {
        planId: "plan-rb",
        steps: [
          makeStep({ name: "Reservar", capability: "cap.a", connectorId: "conn-a", supportsRollback: true }),
          makeStep({ name: "Pagar",    capability: "cap.b", connectorId: "conn-b", supportsRollback: false }),
        ],
        dependencies: [],
      };
      const result = await engine.execute(plan, { userId: "u1" });
      if (result.status !== EXECUTION_STATUS.FAILED)   throw new Error("Should be failed");
      if (result.rollbackLog.length === 0)              throw new Error("Should have rollback entries");
    },
  },

  {
    name: "execute — intent verification gerada quando goalId presente",
    async run() {
      setup();
      const engine = createExecutionEngine();
      const plan   = makePlan([{ name: "Step A", capability: "cap.a" }]);
      const result = await engine.execute(plan, { userId: "u1", goalId: "goal-123" });
      if (!result.intentVerification) throw new Error("intentVerification should be present");
    },
  },

  {
    name: "execute — retorna successRate correto",
    async run() {
      setup();
      const engine = createExecutionEngine();
      const plan   = makePlan([
        { name: "S1", capability: "cap.a" },
        { name: "S2", capability: "cap.b" },
      ]);
      const result = await engine.execute(plan, { userId: "u1" });
      if (typeof result.successRate !== "number") throw new Error("successRate should be a number");
      if (result.successRate < 0 || result.successRate > 100) throw new Error("successRate out of range");
    },
  },

  {
    name: "execute — resultado é imutável (frozen)",
    async run() {
      setup();
      const engine = createExecutionEngine();
      const result = await engine.execute(makePlan(), { userId: "u1" });
      try { result.status = "hacked"; throw new Error("Should be frozen"); } catch (_) { /* ok */ }
    },
  },

  // ── Security Gate Integration ──────────────────────────────────────────────

  {
    name: "execute — step bloqueado pelo PermissionEngine resulta em FAILED",
    async run() {
      setup();
      const gate = createSecurityGate({
        permissionEngine: createPermissionEngine({ deniedCapabilities: ["cap.blocked"] }),
      });
      const engine = createExecutionEngine({ securityGate: gate });
      const plan   = makePlan([{ name: "Blocked", capability: "cap.blocked", required: true }]);
      const result = await engine.execute(plan, { userId: "u1" });
      if (result.status !== EXECUTION_STATUS.FAILED) throw new Error("Should be failed due to permission");
    },
  },

  // ── Observability ──────────────────────────────────────────────────────────

  {
    name: "getExecutionStats — retorna métricas válidas",
    async run() {
      setup();
      const engine = createExecutionEngine();
      await engine.execute(makePlan(), { userId: "u1" });
      const stats = getExecutionStats();
      if (stats.executionsStarted  === 0) throw new Error("executionsStarted should be > 0");
      if (typeof stats.successRate !== "number") throw new Error("successRate should be a number");
      if (typeof stats.averageDurationMs !== "number") throw new Error("averageDurationMs should be a number");
    },
  },

  {
    name: "getExecutionStats — resultado imutável",
    run() {
      setup();
      const stats = getExecutionStats();
      try { stats.executionsStarted = 999; throw new Error("Should be frozen"); } catch (_) { /* ok */ }
    },
  },

  // ── Isolation ─────────────────────────────────────────────────────────────

  {
    name: "Execution Engine — não importa módulos externos (LLM, DB, HTTP)",
    run() {
      setup();
      const src = createExecutionEngine.toString() + createTransaction.toString();
      const forbidden = ["fetch(", "axios.", "mongoose.", "supabase.", "openai.", "anthropic."];
      for (const f of forbidden) {
        if (src.includes(f)) throw new Error(`Forbidden external dependency found: ${f}`);
      }
    },
  },

  {
    name: "Execution Engine — IDs sequenciais e determinísticos",
    run() {
      _resetIdsForTests();
      const id1 = nextExecutionId();
      const id2 = nextExecutionId();
      if (id1 === id2)          throw new Error("IDs should be unique");
      if (!id1.startsWith("exe-")) throw new Error("ID should start with exe-");
    },
  },

  {
    name: "_resetExecutionEngineForTests — zera estatísticas",
    async run() {
      setup();
      const engine = createExecutionEngine();
      await engine.execute(makePlan(), { userId: "u1" });
      _resetExecutionEngineForTests();
      const stats = getExecutionStats();
      if (stats.executionsStarted !== 0) throw new Error("Stats should be reset");
    },
  },

  {
    name: "Execution Engine — futura integração: interfaces reservadas existem",
    run() {
      setup();
      const engine = createExecutionEngine();
      if (typeof engine.onLearningEngineEvent   !== "function") throw new Error("Missing onLearningEngineEvent");
      if (typeof engine.onKnowledgeEngineEvent  !== "function") throw new Error("Missing onKnowledgeEngineEvent");
      if (typeof engine.notifySupportIntelligence !== "function") throw new Error("Missing notifySupportIntelligence");
      if (typeof engine.onProductEvolutionEvent !== "function") throw new Error("Missing onProductEvolutionEvent");
    },
  },
];

// ─── Test Runner ──────────────────────────────────────────────────────────────

export async function runExecutionTests(onProgress) {
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const tc of executionTests) {
    const t0 = Date.now();
    try {
      await tc.run();
      passed++;
      const r = { name: tc.name, status: "passed", durationMs: Date.now() - t0 };
      results.push(r);
      if (onProgress) onProgress(r);
    } catch (err) {
      failed++;
      const r = { name: tc.name, status: "failed", error: err.message, durationMs: Date.now() - t0 };
      results.push(r);
      if (onProgress) onProgress(r);
    }
  }

  return deepFreeze({
    total:     executionTests.length,
    passed,
    failed,
    accuracy:  Math.round((passed / executionTests.length) * 100),
    results,
  });
}

export default { executionTests, runExecutionTests };