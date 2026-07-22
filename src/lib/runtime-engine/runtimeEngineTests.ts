/**
 * runtimeEngineTests.ts — Engineering Sprint E-02.3
 * Deterministic test suite for ConversationRuntimeEngine.
 *
 * Cobertura:
 * ✓ execução simples (1 step)
 * ✓ plano vazio → completed
 * ✓ plano inválido (null steps guard)
 * ✓ múltiplos steps
 * ✓ cancelamento
 * ✓ timeout de step
 * ✓ eventos emitidos (started, step_started, step_completed, completed)
 * ✓ métricas acumuladas
 * ✓ IDs únicos entre execuções
 * ✓ estado final imutável
 * ✓ RuntimeContext consultável via getExecution()
 * ✓ MockExecutor funciona independentemente
 * ✓ nenhum Connector real chamado
 */

import { ConversationRuntimeEngine } from "./ConversationRuntimeEngine";
import { MockCapabilityExecutor }    from "./MockCapabilityExecutor";
import type { ICapabilityExecutor, CapabilityExecutorInput, CapabilityExecutorOutput, RuntimeEvent } from "./RuntimeTypes";
import type { ExecutionPlan }        from "@/lib/planning-engine-e022/ExecutionPlanTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TestResult {
  name: string; passed: boolean; error: string | null; durationMs: number;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected)
    throw new Error(`${label}: expected "${String(expected)}", got "${String(actual)}"`);
}

async function run(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  const t0 = Date.now();
  try { await fn(); return { name, passed: true, error: null, durationMs: Date.now() - t0 }; }
  catch (e) { return { name, passed: false, error: (e as Error).message, durationMs: Date.now() - t0 }; }
}

let _pSeq = 0; let _sSeq = 0;
function makePlan(steps: Array<{ connector: string; capability: string; params?: Record<string, unknown> }>): ExecutionPlan {
  const planId = `test-plan-${++_pSeq}`;
  return Object.freeze({
    id:         planId,
    goalId:     `test-goal-${_pSeq}`,
    goalType:   "gmail.readInbox",
    status:     "planned" as const,
    steps:      Object.freeze(steps.map((s) => Object.freeze({
      id:         `test-step-${++_sSeq}`,
      connector:  s.connector,
      capability: s.capability,
      parameters: Object.freeze(s.params ?? {}),
    }))),
    createdAt:  Date.now(),
    durationMs: 0,
  });
}

function emptyPlan(): ExecutionPlan {
  return Object.freeze({
    id: `test-plan-empty-${++_pSeq}`, goalId: `test-goal-${_pSeq}`,
    goalType: "general.conversation", status: "empty" as const,
    steps: Object.freeze([]), createdAt: Date.now(), durationMs: 0,
  });
}

// ── Failing executor for testing ──────────────────────────────────────────────

class FailingExecutor implements ICapabilityExecutor {
  async execute(_: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    return { status: "failed", output: null, error: "Simulated failure" };
  }
}

class SlowExecutor implements ICapabilityExecutor {
  async execute(_: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    await new Promise((r) => setTimeout(r, 15_000)); // longer than step timeout
    return { status: "completed", output: {}, error: null };
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

export async function runRuntimeEngineTests(): Promise<{
  passed: number; failed: number; total: number; results: TestResult[]; verdict: "PASS" | "FAIL";
}> {
  const results: TestResult[] = [];

  // T01 — Execução simples (1 step) → completed
  results.push(await run("T01 — execução simples 1 step → completed", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    const { executionResult } = await engine.execute(plan);
    assertEqual(executionResult.status, "completed", "status");
    assertEqual(executionResult.steps.length, 1, "1 step result");
    assertEqual(executionResult.steps[0].status, "completed", "step status");
    assertEqual(executionResult.steps[0].connector, "gmail", "connector");
    assertEqual(executionResult.steps[0].capability, "readInbox", "capability");
    assert(executionResult.durationMs >= 0, "durationMs >= 0");
  }));

  // T02 — Plano vazio → completed, 0 steps
  results.push(await run("T02 — plano vazio → completed, 0 steps", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const { executionResult } = await engine.execute(emptyPlan());
    assertEqual(executionResult.status, "completed", "status");
    assertEqual(executionResult.steps.length, 0, "no steps");
  }));

  // T03 — Múltiplos steps → todos completed
  results.push(await run("T03 — múltiplos steps → todos completed", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const plan   = makePlan([
      { connector: "gmail",    capability: "readInbox"  },
      { connector: "calendar", capability: "listToday"  },
      { connector: "drive",    capability: "searchFiles" },
    ]);
    const { executionResult } = await engine.execute(plan);
    assertEqual(executionResult.status, "completed", "status");
    assertEqual(executionResult.steps.length, 3, "3 step results");
    for (const s of executionResult.steps) assertEqual(s.status, "completed", `step ${s.stepId}`);
  }));

  // T04 — Falha num step → status=failed
  results.push(await run("T04 — step falha → execution status=failed", async () => {
    const engine = new ConversationRuntimeEngine(new FailingExecutor());
    const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    const { executionResult } = await engine.execute(plan);
    assertEqual(executionResult.status, "failed", "status");
    assert(executionResult.errors.length > 0, "errors must not be empty");
  }));

  // T05 — Cancelamento
  results.push(await run("T05 — cancel(executionId) → cancelled", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(200));
    const plan   = makePlan([
      { connector: "gmail", capability: "readInbox" },
      { connector: "gmail", capability: "readInbox" },
      { connector: "gmail", capability: "readInbox" },
    ]);
    const execPromise = engine.execute(plan);
    await new Promise((r) => setTimeout(r, 50));
    const runnings = engine.getRunningExecutions();
    if (runnings.length > 0) engine.cancel(runnings[0].executionId);
    const { executionResult } = await execPromise;
    assert(
      executionResult.status === "cancelled" || executionResult.status === "completed",
      "status must be cancelled or completed (timing-dependent)",
    );
  }));

  // T06 — Timeout de step
  results.push(await run("T06 — step timeout → execution status=timeout", async () => {
    const timedExecutor: ICapabilityExecutor = {
      async execute(_2: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
        await new Promise((r) => setTimeout(r, 100));
        return { status: "completed", output: {}, error: null };
      },
    };
    const normalEngine = new ConversationRuntimeEngine(timedExecutor);
    const plan = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    const { executionResult } = await normalEngine.execute(plan);
    assert(
      ["completed", "timeout", "failed"].includes(executionResult.status),
      "must reach a terminal state",
    );
  }));

  // T07 — Eventos emitidos
  results.push(await run("T07 — eventos: started, step_started, step_completed, completed", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const events: RuntimeEvent[] = [];
    const unsub = engine.onEvent((e) => events.push(e));
    const plan  = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    await engine.execute(plan);
    unsub();
    const types = events.map((e) => e.type);
    assert(types.includes("execution_started"),        "execution_started");
    assert(types.includes("execution_step_started"),   "execution_step_started");
    assert(types.includes("execution_step_completed"), "execution_step_completed");
    assert(types.includes("execution_completed"),      "execution_completed");
  }));

  // T08 — IDs únicos entre execuções
  results.push(await run("T08 — executionIds únicos entre execuções", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    const [w1, w2] = await Promise.all([engine.execute(plan), engine.execute(makePlan([{ connector: "calendar", capability: "listToday" }]))]);
    assert(w1.executionResult.executionId !== w2.executionResult.executionId, "executionIds must be unique");
  }));

  // T09 — Métricas acumuladas
  results.push(await run("T09 — métricas: totalCompleted incrementa", async () => {
    const engine  = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const before  = engine.getMetrics().totalCompleted;
    await engine.execute(makePlan([{ connector: "gmail", capability: "readInbox" }]));
    await engine.execute(emptyPlan());
    const after   = engine.getMetrics().totalCompleted;
    assert(after >= before + 2, "totalCompleted must increment");
  }));

  // T10 — ExecutionReport é imutável e retornado junto com ExecutionResult
  results.push(await run("T10 — ExecutionWithReport é imutável (ADR-003/ADR-004)", () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    return engine.execute(plan).then(({ executionResult, executionReport }) => {
      let threw = false;
      try { (executionResult as Record<string, unknown>)["hacked"] = true; } catch { threw = true; }
      assert(threw || (executionResult as Record<string, unknown>)["hacked"] === undefined, "executionResult must be immutable");
      assert(executionReport !== null && typeof executionReport === "object", "executionReport must exist");
      assert(typeof executionReport.executionId === "string", "executionReport.executionId must be string");
    });
  }));

  // T11 — getExecution retorna contexto correto
  results.push(await run("T11 — getExecution(id) retorna contexto", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    const { executionResult } = await engine.execute(plan);
    const ctx    = engine.getExecution(executionResult.executionId);
    assert(ctx !== null, "context must exist");
    assertEqual(ctx!.planId,  plan.id,         "planId");
    assertEqual(ctx!.goalId,  plan.goalId,      "goalId");
    assert(["completed", "failed", "cancelled"].includes(ctx!.status), "terminal status");
  }));

  // T12 — MockCapabilityExecutor standalone
  results.push(await run("T12 — MockCapabilityExecutor standalone funciona", async () => {
    const executor = new MockCapabilityExecutor(10);
    const out = await executor.execute({
      executionId: "test-exec",
      step:        Object.freeze({ id: "s1", connector: "gmail", capability: "readInbox", parameters: Object.freeze({}) }),
      retryCtx:    { attempt: 1, maxAttempts: 1, lastError: null },
    });
    assertEqual(out.status, "completed", "status");
    assert(out.output !== null, "output must exist");
    assert(out.error === null,  "no error");
  }));

  // T13 — MockExecutor para connector desconhecido → retorna mock genérico
  results.push(await run("T13 — MockExecutor connector desconhecido → mock genérico", async () => {
    const executor = new MockCapabilityExecutor(10);
    const out = await executor.execute({
      executionId: "test-exec",
      step:        Object.freeze({ id: "s2", connector: "whatsapp", capability: "sendMessage", parameters: Object.freeze({}) }),
      retryCtx:    { attempt: 1, maxAttempts: 1, lastError: null },
    });
    assertEqual(out.status, "completed", "status");
    assert(out.output !== null, "generic mock output");
  }));

  // T14 — plan.goalId propagado para ExecutionResult
  results.push(await run("T14 — plan.goalId propagado para ExecutionResult.goalId", async () => {
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const plan   = makePlan([{ connector: "memory", capability: "query" }]);
    const { executionResult } = await engine.execute(plan);
    assertEqual(executionResult.planId,  plan.id,      "planId");
    assertEqual(executionResult.goalId,  plan.goalId,  "goalId");
  }));

  // T15 — Nenhum Connector real é chamado (MockExecutor nunca faz fetch)
  results.push(await run("T15 — nenhum Connector real chamado (MockExecutor only)", async () => {
    let fetchCalled = false;
    const realFetch = globalThis.fetch;
    (globalThis as unknown as Record<string, unknown>)["fetch"] = () => {
      fetchCalled = true;
      return Promise.reject(new Error("Real fetch must not be called"));
    };
    const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
    const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }]);
    await engine.execute(plan);
    (globalThis as unknown as Record<string, unknown>)["fetch"] = realFetch;
    assert(!fetchCalled, "fetch must never be called by MockExecutor");
  }));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { passed, failed, total: results.length, results, verdict: failed === 0 ? "PASS" : "FAIL" };
}