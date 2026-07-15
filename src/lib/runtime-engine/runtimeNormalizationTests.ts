/**
 * runtimeNormalizationTests.ts — Engineering Sprint E-02.3A
 * Tests for the normalized runtime architecture:
 *   ExecutionDispatcher, ExecutionContextFactory, RuntimeProvider,
 *   ExecutionPolicy, RetryStrategy.
 *
 * Todos determinísticos. Nenhuma rede. Nenhum Connector real.
 */

import { ExecutionDispatcher }       from "./ExecutionDispatcher";
import { ExecutionContextFactory }   from "./ExecutionContextFactory";
import { RuntimeProvider }           from "./RuntimeProvider";
import { buildPolicy, DEFAULT_EXECUTION_POLICY } from "./ExecutionPolicy";
import { NoRetryStrategy, ImmediateRetryStrategy, ExponentialBackoffStrategy } from "./RetryStrategy";
import { MockCapabilityExecutor }    from "./MockCapabilityExecutor";
import { ConversationRuntimeEngine } from "./ConversationRuntimeEngine";
import type { ExecutionPlan }        from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { ICapabilityExecutor, CapabilityExecutorInput, CapabilityExecutorOutput } from "./RuntimeTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error: string | null; durationMs: number; }

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected "${String(expected)}", got "${String(actual)}"`);
}
async function run(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  const t0 = Date.now();
  try { await fn(); return { name, passed: true, error: null, durationMs: Date.now() - t0 }; }
  catch (e) { return { name, passed: false, error: (e as Error).message, durationMs: Date.now() - t0 }; }
}

let _ps = 0; let _ss = 0;
function makePlan(steps: Array<{ connector: string; capability: string }> = [], status: "planned" | "empty" | "invalid_goal" = "planned"): ExecutionPlan {
  return Object.freeze({
    id: `norm-plan-${++_ps}`, goalId: `norm-goal-${_ps}`, goalType: "gmail.readInbox",
    status,
    steps: Object.freeze(steps.map((s) => Object.freeze({ id: `ns-${++_ss}`, connector: s.connector, capability: s.capability, parameters: Object.freeze({}) }))),
    createdAt: Date.now(), durationMs: 0,
  });
}

class FailExecutor implements ICapabilityExecutor {
  async execute(_: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    return { status: "failed", output: null, error: "Simulated failure" };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

export async function runRuntimeNormalizationTests(): Promise<{
  passed: number; failed: number; total: number; results: TestResult[]; verdict: "PASS" | "FAIL";
}> {
  const results: TestResult[] = await Promise.all([

    // ── ExecutionPolicy ────────────────────────────────────────────────────
    run("T01 — DEFAULT_EXECUTION_POLICY tem timeoutMs=30000", () => {
      assertEqual(DEFAULT_EXECUTION_POLICY.timeoutMs,     30_000, "timeoutMs");
      assertEqual(DEFAULT_EXECUTION_POLICY.stepTimeoutMs, 10_000, "stepTimeoutMs");
      assertEqual(DEFAULT_EXECUTION_POLICY.priority,      "normal", "priority");
      assert(!DEFAULT_EXECUTION_POLICY.retry.enabled,     "retry disabled by default");
    }),

    run("T02 — buildPolicy sobrescreve campos seletivamente", () => {
      const p = buildPolicy({ timeoutMs: 60_000 });
      assertEqual(p.timeoutMs,     60_000, "timeoutMs overridden");
      assertEqual(p.stepTimeoutMs, 10_000, "stepTimeoutMs preserved");
    }),

    run("T03 — ExecutionPolicy é imutável", () => {
      let threw = false;
      try { (DEFAULT_EXECUTION_POLICY as Record<string, unknown>)["hacked"] = true; } catch { threw = true; }
      assert(threw || (DEFAULT_EXECUTION_POLICY as Record<string, unknown>)["hacked"] === undefined, "must be immutable");
    }),

    // ── RetryStrategy ──────────────────────────────────────────────────────
    run("T04 — NoRetryStrategy sempre retorna shouldRetry=false", () => {
      const s = new NoRetryStrategy();
      const d = s.decide({ attempt: 1, maxAttempts: 3, lastError: null });
      assert(!d.shouldRetry, "no retry");
      assertEqual(d.delayMs, 0, "no delay");
    }),

    run("T05 — ImmediateRetryStrategy retorna retry até maxAttempts", () => {
      const s = new ImmediateRetryStrategy(3);
      assert(s.decide({ attempt: 1, maxAttempts: 3, lastError: null }).shouldRetry,  "attempt 1: retry");
      assert(s.decide({ attempt: 2, maxAttempts: 3, lastError: null }).shouldRetry,  "attempt 2: retry");
      assert(!s.decide({ attempt: 3, maxAttempts: 3, lastError: null }).shouldRetry, "attempt 3: stop");
    }),

    run("T06 — ExponentialBackoffStrategy calcula delay corretamente", () => {
      const s = new ExponentialBackoffStrategy(3, 100);
      const d1 = s.decide({ attempt: 1, maxAttempts: 3, lastError: null });
      const d2 = s.decide({ attempt: 2, maxAttempts: 3, lastError: null });
      assert(d1.shouldRetry, "retry on attempt 1");
      assertEqual(d1.delayMs, 100, "delay=100ms on attempt 1");
      assertEqual(d2.delayMs, 200, "delay=200ms on attempt 2");
    }),

    // ── ExecutionContextFactory ────────────────────────────────────────────
    run("T07 — ContextFactory cria contexto válido", () => {
      const f    = new ExecutionContextFactory();
      const plan = makePlan([{ connector: "gmail", capability: "readInbox" }]);
      const ctx  = f.create(plan);
      assert(ctx !== null, "context created");
      assertEqual(ctx!.planId,  plan.id,     "planId");
      assertEqual(ctx!.goalId,  plan.goalId, "goalId");
      assertEqual(ctx!.status,  "queued",    "initial status");
      assertEqual(ctx!.currentStepIndex, -1, "no step started");
      assert(!ctx!.cancelRequested, "not cancelled");
    }),

    run("T08 — ContextFactory retorna null para plan inválido", () => {
      const f    = new ExecutionContextFactory();
      const plan = makePlan([{ connector: "gmail", capability: "readInbox" }], "invalid_goal");
      const ctx  = f.create(plan);
      assert(ctx === null, "must return null for invalid_goal");
    }),

    run("T09 — ContextFactory.validate detecta missing fields", () => {
      const f = new ExecutionContextFactory();
      const badPlan = { id: "", goalId: "ok", goalType: "g", status: "planned" as const, steps: Object.freeze([]), createdAt: 0, durationMs: 0 };
      const v = f.validate(badPlan);
      assert(!v.valid, "invalid");
      assert(v.errors.length > 0, "has errors");
    }),

    run("T10 — ContextFactory metadata contém policy e stepCount", () => {
      const f    = new ExecutionContextFactory();
      const plan = makePlan([{ connector: "gmail", capability: "readInbox" }]);
      const ctx  = f.create(plan, DEFAULT_EXECUTION_POLICY);
      assert(ctx!.metadata["policy"] !== undefined, "policy in metadata");
      assertEqual(ctx!.metadata["stepCount"] as number, 1, "stepCount=1");
    }),

    // ── ExecutionDispatcher ────────────────────────────────────────────────
    run("T11 — Dispatcher despacha step e retorna StepResult", async () => {
      const d      = new ExecutionDispatcher(new MockCapabilityExecutor(10));
      const step   = Object.freeze({ id: "ds1", connector: "gmail", capability: "readInbox", parameters: Object.freeze({}) });
      const result = await d.dispatch({ executionId: "test-exec", step, stepTimeoutMs: 5000 });
      assertEqual(result.status,     "completed", "status");
      assertEqual(result.connector,  "gmail",     "connector");
      assertEqual(result.capability, "readInbox", "capability");
      assert(result.durationMs >= 0, "durationMs");
    }),

    run("T12 — Dispatcher retorna failed para executor com erro", async () => {
      const d    = new ExecutionDispatcher(new FailExecutor());
      const step = Object.freeze({ id: "ds2", connector: "gmail", capability: "readInbox", parameters: Object.freeze({}) });
      const res  = await d.dispatch({ executionId: "test-exec", step, stepTimeoutMs: 5000 });
      assertEqual(res.status, "failed", "status");
      assert(res.error !== null, "error must be set");
    }),

    // ── RuntimeProvider ────────────────────────────────────────────────────
    run("T13 — RuntimeProvider.get('conversation') retorna engine", () => {
      const engine = RuntimeProvider.get("conversation");
      assert(engine !== null, "engine exists");
      assert(typeof engine.execute === "function",    "has execute");
      assert(typeof engine.cancel  === "function",    "has cancel");
      assert(typeof engine.getMetrics === "function", "has getMetrics");
    }),

    run("T14 — RuntimeProvider.get retorna mesma instância (lazy singleton)", () => {
      const e1 = RuntimeProvider.get("conversation");
      const e2 = RuntimeProvider.get("conversation");
      assert(e1 === e2, "same instance");
    }),

    run("T15 — RuntimeProvider.register aceita custom engine", () => {
      const custom = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
      RuntimeProvider.register("desktop", custom);
      const fetched = RuntimeProvider.get("desktop");
      assert(fetched === custom, "registered custom engine returned");
    }),

    // ── Runtime end-to-end (normalized) ───────────────────────────────────
    run("T16 — Runtime normalizado executa plan com Dispatcher", async () => {
      const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10), DEFAULT_EXECUTION_POLICY);
      const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }]);
      const result = await engine.execute(plan);
      assertEqual(result.status, "completed", "status");
      assertEqual(result.steps.length, 1, "1 step");
    }),

    run("T17 — Runtime normalizado: plan invalid_goal → ExecutionResult.status=failed", async () => {
      const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
      const plan   = makePlan([{ connector: "gmail", capability: "readInbox" }], "invalid_goal");
      const result = await engine.execute(plan);
      assertEqual(result.status, "failed", "status");
    }),

    run("T18 — Métricas incluem policy no getMetrics()", () => {
      const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10), DEFAULT_EXECUTION_POLICY);
      const m = engine.getMetrics();
      assert(m["policy"] !== undefined, "policy in metrics");
    }),

    run("T19 — Nenhum Connector real chamado (fetch não invocado)", async () => {
      let called = false;
      const orig = (globalThis as Record<string, unknown>)["fetch"];
      (globalThis as Record<string, unknown>)["fetch"] = () => { called = true; return Promise.reject(); };
      const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(10));
      await engine.execute(makePlan([{ connector: "gmail", capability: "readInbox" }]));
      (globalThis as Record<string, unknown>)["fetch"] = orig;
      assert(!called, "fetch must never be called");
    }),

    run("T20 — RetryDecision é imutável", () => {
      const d = new NoRetryStrategy().decide({ attempt: 1, maxAttempts: 1, lastError: null });
      let threw = false;
      try { (d as Record<string, unknown>)["hacked"] = true; } catch { threw = true; }
      assert(threw || (d as Record<string, unknown>)["hacked"] === undefined, "immutable");
    }),

  ]);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { passed, failed, total: results.length, results, verdict: failed === 0 ? "PASS" : "FAIL" };
}