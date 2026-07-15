/**
 * connectorRouterTests.ts — Engineering Sprint E-02.4
 * Deterministic test suite for the Universal Connector Router layer.
 *
 * Cobre: registry, lookup, removal, routing, capability validation,
 *        ConnectorCapabilityExecutor, Runtime end-to-end via UCR.
 *
 * Nenhuma chamada HTTP. Nenhum OAuth. Nenhum connector real.
 */

import { ConnectorRegistry }             from "./ConnectorRegistry";
import { UniversalConnectorRouter }      from "./UniversalConnectorRouter";
import { ConnectorCapabilityExecutor }   from "./ConnectorCapabilityExecutor";
import { MockGmailConnector }            from "./mock/MockGmailConnector";
import { MockCalendarConnector }         from "./mock/MockCalendarConnector";
import { MockDriveConnector }            from "./mock/MockDriveConnector";
import { ExecutionDispatcher }           from "@/lib/runtime-engine/ExecutionDispatcher";
import { ConversationRuntimeEngine }     from "@/lib/runtime-engine/ConversationRuntimeEngine";
import type { ExecutionPlan, ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { IConnector, ConnectorInput, ConnectorResult, ConnectorHealth, ConnectorMetadata, ConnectorCapability } from "./UCRTypes";

// ── Test infrastructure ───────────────────────────────────────────────────────

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

// ── Plan factory ──────────────────────────────────────────────────────────────

let _ps = 0; let _ss = 0;
function makeStep(connector: string, capability: string, params: Record<string, unknown> = {}): ExecutionStep {
  return Object.freeze({ id: `ucr-s${++_ss}`, connector, capability, parameters: Object.freeze(params) });
}
function makePlan(steps: ExecutionStep[]): ExecutionPlan {
  return Object.freeze({ id: `ucr-plan-${++_ps}`, goalId: `ucr-goal-${_ps}`, goalType: "test", status: "planned" as const, steps: Object.freeze(steps), createdAt: Date.now(), durationMs: 0 });
}

// ── Bad connector stub ────────────────────────────────────────────────────────

class ErrorConnector implements IConnector {
  connectorId() { return "bad"; }
  capabilities(): readonly ConnectorCapability[] { return Object.freeze([Object.freeze({ id: "explode", version: "1.0", description: "always throws", requiresAuthentication: false, requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 0, timeoutMs: 1000, metadata: Object.freeze({}) })]); }
  async execute(_: ConnectorInput): Promise<ConnectorResult> { throw new Error("Connector exploded"); }
  health(): ConnectorHealth { return Object.freeze({ status: "unavailable", message: "broken", checkedAt: Date.now() }); }
  metadata(): ConnectorMetadata { return Object.freeze({ name: "Bad", version: "0", description: "", author: "", tags: Object.freeze([]) }); }
}

// ── Test suite ────────────────────────────────────────────────────────────────

export async function runConnectorRouterTests(): Promise<{
  passed: number; failed: number; total: number; results: TestResult[]; verdict: "PASS" | "FAIL";
}> {
  const results: TestResult[] = await Promise.all([

    // ── ConnectorRegistry ──────────────────────────────────────────────────
    run("T01 — Registry.register e exists()", () => {
      const r = new ConnectorRegistry();
      r.register(new MockGmailConnector());
      assert(r.exists("gmail"), "gmail registered");
      assert(!r.exists("drive"), "drive not registered");
    }),

    run("T02 — Registry.lookup retorna connector correto", () => {
      const r = new ConnectorRegistry();
      r.register(new MockGmailConnector());
      const c = r.lookup("gmail");
      assert(c !== null, "found");
      assertEqual(c!.connectorId(), "gmail", "connectorId");
    }),

    run("T03 — Registry.lookup retorna null para id desconhecido", () => {
      const r = new ConnectorRegistry();
      assertEqual(r.lookup("unknown"), null, "null for unknown");
    }),

    run("T04 — Registry.remove elimina connector", () => {
      const r = new ConnectorRegistry();
      r.register(new MockGmailConnector());
      assert(r.remove("gmail"), "remove returned true");
      assert(!r.exists("gmail"), "gmail gone");
      assert(!r.remove("gmail"), "second remove returns false");
    }),

    run("T05 — Registry.list retorna todos os ids", () => {
      const r = new ConnectorRegistry();
      r.register(new MockGmailConnector());
      r.register(new MockCalendarConnector());
      r.register(new MockDriveConnector());
      const ids = r.list();
      assert(ids.includes("gmail"),    "gmail in list");
      assert(ids.includes("calendar"), "calendar in list");
      assert(ids.includes("drive"),    "drive in list");
      assertEqual(r.size(), 3, "size=3");
    }),

    run("T06 — Registry.clear remove todos", () => {
      const r = new ConnectorRegistry();
      r.register(new MockGmailConnector());
      r.register(new MockCalendarConnector());
      r.clear();
      assertEqual(r.size(), 0, "size=0 after clear");
    }),

    run("T07 — Registry sobrescreve ao registrar mesmo connectorId", () => {
      const r = new ConnectorRegistry();
      r.register(new MockGmailConnector(10));
      r.register(new MockGmailConnector(20));
      assertEqual(r.size(), 1, "size stays 1");
    }),

    // ── Mock Connectors ────────────────────────────────────────────────────
    run("T08 — MockGmailConnector capabilities e metadata", () => {
      const c = new MockGmailConnector();
      assert(c.capabilities().length > 0, "has capabilities");
      assert(c.capabilities().some((cap) => cap.id === "readInbox"), "readInbox present");
      assertEqual(c.metadata().name, "Gmail (Mock)", "name");
      assertEqual(c.health().status, "healthy", "health");
    }),

    run("T09 — MockGmailConnector.execute retorna output correto", async () => {
      const c   = new MockGmailConnector(5);
      const res = await c.execute({ executionId: "e1", capability: "readInbox", parameters: Object.freeze({}) });
      assertEqual(res.status, "success", "status");
      assertEqual(res.connectorId, "gmail", "connectorId");
      assert(res.output !== null, "output not null");
    }),

    run("T10 — MockCalendarConnector.execute listToday", async () => {
      const c   = new MockCalendarConnector(5);
      const res = await c.execute({ executionId: "e2", capability: "listToday", parameters: Object.freeze({}) });
      assertEqual(res.status, "success", "status");
    }),

    run("T11 — MockDriveConnector.execute searchFiles com query param", async () => {
      const c   = new MockDriveConnector(5);
      const res = await c.execute({ executionId: "e3", capability: "searchFiles", parameters: Object.freeze({ query: "report" }) });
      assertEqual(res.status, "success", "status");
    }),

    // ── UniversalConnectorRouter ───────────────────────────────────────────
    run("T12 — Router roteia para connector correto", async () => {
      const reg = new ConnectorRegistry();
      reg.register(new MockGmailConnector(5));
      const router = new UniversalConnectorRouter(reg);
      const step   = makeStep("gmail", "readInbox");
      const res    = await router.route("exec-1", step);
      assert(res.found, "found");
      assert(res.result !== null, "result not null");
      assertEqual(res.result!.status, "success", "status");
    }),

    run("T13 — Router retorna found=false para connector desconhecido", async () => {
      const router = new UniversalConnectorRouter(new ConnectorRegistry());
      const res    = await router.route("exec-2", makeStep("unknown", "readInbox"));
      assert(!res.found, "not found");
      assert(res.error !== null, "error set");
    }),

    run("T14 — Router retorna found=false para capability inexistente", async () => {
      const reg = new ConnectorRegistry();
      reg.register(new MockGmailConnector(5));
      const router = new UniversalConnectorRouter(reg);
      const res    = await router.route("exec-3", makeStep("gmail", "nonExistentCapability"));
      assert(!res.found, "not found");
      assert(res.error!.includes("nonExistentCapability"), "error mentions capability");
    }),

    run("T15 — Router suporta múltiplos connectors", async () => {
      const reg = new ConnectorRegistry();
      reg.register(new MockGmailConnector(5));
      reg.register(new MockCalendarConnector(5));
      reg.register(new MockDriveConnector(5));
      const router = new UniversalConnectorRouter(reg);
      const [r1, r2, r3] = await Promise.all([
        router.route("ex", makeStep("gmail",    "readInbox")),
        router.route("ex", makeStep("calendar", "listToday")),
        router.route("ex", makeStep("drive",    "searchFiles", { query: "q" })),
      ]);
      assert(r1.found && r1.result!.status === "success", "gmail ok");
      assert(r2.found && r2.result!.status === "success", "calendar ok");
      assert(r3.found && r3.result!.status === "success", "drive ok");
    }),

    // ── ConnectorCapabilityExecutor ────────────────────────────────────────
    run("T16 — ConnectorCapabilityExecutor adapts para ICapabilityExecutor", async () => {
      const reg = new ConnectorRegistry();
      reg.register(new MockGmailConnector(5));
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const out = await executor.execute({ executionId: "e4", step: makeStep("gmail", "readInbox"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "completed", "status=completed");
      assert(out.output !== null, "output not null");
    }),

    run("T17 — ConnectorCapabilityExecutor retorna failed para connector ausente", async () => {
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(new ConnectorRegistry()));
      const out = await executor.execute({ executionId: "e5", step: makeStep("ghost", "anything"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "failed", "status=failed");
      assert(out.error !== null, "error set");
    }),

    // ── ExecutionDispatcher + UCR ──────────────────────────────────────────
    run("T18 — Dispatcher usa ConnectorCapabilityExecutor sem conhecer UCR", async () => {
      const reg = new ConnectorRegistry();
      reg.register(new MockGmailConnector(5));
      const executor   = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const dispatcher = new ExecutionDispatcher(executor);
      const result     = await dispatcher.dispatch({ executionId: "e6", step: makeStep("gmail", "readInbox"), stepTimeoutMs: 5000 });
      assertEqual(result.status, "completed", "status=completed");
      assertEqual(result.connector, "gmail", "connector");
    }),

    // ── Runtime end-to-end via UCR ─────────────────────────────────────────
    run("T19 — Runtime executa plan completo via UCR (sem alterar Runtime)", async () => {
      const reg = new ConnectorRegistry();
      reg.register(new MockGmailConnector(5));
      reg.register(new MockCalendarConnector(5));
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const engine   = new ConversationRuntimeEngine(executor);
      const plan     = makePlan([makeStep("gmail", "readInbox"), makeStep("calendar", "listToday")]);
      const result   = await engine.execute(plan);
      assertEqual(result.status, "completed", "status");
      assertEqual(result.steps.length, 2, "2 steps");
      assert(result.errors.length === 0, "no errors");
    }),

    run("T20 — Runtime para em failed quando connector não encontrado", async () => {
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(new ConnectorRegistry()));
      const engine   = new ConversationRuntimeEngine(executor);
      const plan     = makePlan([makeStep("ghost", "anything")]);
      const result   = await engine.execute(plan);
      assertEqual(result.status, "failed", "status=failed");
    }),

    // ── Metadata e health ──────────────────────────────────────────────────
    run("T21 — Cada mock connector declara metadata e health corretos", () => {
      const connectors = [new MockGmailConnector(), new MockCalendarConnector(), new MockDriveConnector()];
      for (const c of connectors) {
        const m = c.metadata();
        assert(m.name.length > 0,        `${c.connectorId()} name ok`);
        assert(m.version.length > 0,     `${c.connectorId()} version ok`);
        assert(m.tags.length > 0,        `${c.connectorId()} tags ok`);
        assertEqual(c.health().status, "healthy", `${c.connectorId()} health`);
      }
    }),

    run("T22 — Nenhum fetch/HTTP chamado em nenhum teste", async () => {
      let called = false;
      const orig = (globalThis as Record<string, unknown>)["fetch"];
      (globalThis as Record<string, unknown>)["fetch"] = () => { called = true; return Promise.reject(); };
      const reg = new ConnectorRegistry();
      reg.register(new MockGmailConnector(5));
      reg.register(new MockCalendarConnector(5));
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const engine   = new ConversationRuntimeEngine(executor);
      await engine.execute(makePlan([makeStep("gmail", "searchEmails", { query: "test" })]));
      (globalThis as Record<string, unknown>)["fetch"] = orig;
      assert(!called, "fetch never called");
    }),

  ]);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { passed, failed, total: results.length, results, verdict: failed === 0 ? "PASS" : "FAIL" };
}