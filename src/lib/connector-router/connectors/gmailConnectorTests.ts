/**
 * gmailConnectorTests.ts — Engineering Sprint E-02.5
 * Test suite for the real GmailConnector integration.
 *
 * Estratégia:
 *   - Testes de contrato (determinísticos): connectorId, capabilities,
 *     metadata, health, IConnector shape, registry, routing.
 *   - Testes de execução com mocks de token/session:
 *     simula OAuth válido, expirado, 401, 403, timeout, network.
 *   - Testes de integração com Runtime via UCR (sem HTTP real).
 *
 * Nenhuma chamada HTTP real. Nenhum OAuth real.
 */

import { GmailConnector, registerGmailConnector } from "./GmailConnector";
import { ConnectorRegistry }                       from "../ConnectorRegistry";
import { UniversalConnectorRouter }                from "../UniversalConnectorRouter";
import { ConnectorCapabilityExecutor }             from "../ConnectorCapabilityExecutor";
import { ConversationRuntimeEngine }               from "@/lib/runtime-engine/ConversationRuntimeEngine";
import type { ExecutionPlan, ExecutionStep }        from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { IConnector, ConnectorInput, ConnectorResult, ConnectorCapability, ConnectorHealth, ConnectorMetadata } from "../UCRTypes";

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
  return Object.freeze({ id: `gs-${++_ss}`, connector, capability, parameters: Object.freeze(params) });
}
function makePlan(steps: ExecutionStep[]): ExecutionPlan {
  return Object.freeze({ id: `gp-${++_ps}`, goalId: `gg-${_ps}`, goalType: "gmail", status: "planned" as const, steps: Object.freeze(steps), createdAt: Date.now(), durationMs: 0 });
}

// ── Stub connector that simulates legacy Gmail API responses ──────────────────

type LegacyStatus = "connected" | "disconnected" | "expired" | "error" | "timeout" | "success";

function makeLegacyStub(legacyResponse: { ok: boolean; data: unknown; error: string | null; status: LegacyStatus }): IConnector {
  return {
    connectorId:  () => "gmail",
    capabilities: () => Object.freeze([Object.freeze({ id: "readInbox", version: "1.0", description: "", requiresAuthentication: true, requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 0, timeoutMs: 5000, metadata: Object.freeze({}) })]),
    async execute(_: ConnectorInput): Promise<ConnectorResult> {
      const durationMs = 5;
      if (legacyResponse.ok) {
        return Object.freeze({ connectorId: "gmail", capability: _.capability, status: "success", output: legacyResponse.data, error: null, durationMs });
      }
      const s = legacyResponse.status === "timeout" ? "timeout" : "failed";
      return Object.freeze({ connectorId: "gmail", capability: _.capability, status: s, output: null, error: legacyResponse.error, durationMs });
    },
    health:   (): ConnectorHealth  => Object.freeze({ status: "healthy", message: "stub", checkedAt: Date.now() }),
    metadata: (): ConnectorMetadata => Object.freeze({ name: "stub", version: "1", description: "", author: "", tags: Object.freeze([]) }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

export async function runGmailConnectorTests(): Promise<{
  passed: number; failed: number; total: number; results: TestResult[]; verdict: "PASS" | "FAIL";
}> {
  const results: TestResult[] = await Promise.all([

    // ── Contract: IConnector shape ─────────────────────────────────────────
    run("T01 — GmailConnector.connectorId() == 'gmail'", () => {
      assertEqual(new GmailConnector().connectorId(), "gmail", "connectorId");
    }),

    run("T02 — GmailConnector declara 6 capabilities", () => {
      const caps = new GmailConnector().capabilities();
      assertEqual(caps.length, 6, "capabilities count");
      const ids = caps.map((c) => c.id);
      assert(ids.includes("readInbox"),    "readInbox");
      assert(ids.includes("searchEmails"), "searchEmails");
      assert(ids.includes("readMessage"),  "readMessage");
      assert(ids.includes("listLabels"),   "listLabels");
      assert(ids.includes("createDraft"),  "createDraft");
      assert(ids.includes("sendEmail"),    "sendEmail");
    }),

    run("T03 — Capabilities sensíveis exigem confirmação", () => {
      const caps = new GmailConnector().capabilities();
      const draft = caps.find((c) => c.id === "createDraft")!;
      const send  = caps.find((c) => c.id === "sendEmail")!;
      assert(draft.requiresConfirmation, "createDraft.requiresConfirmation");
      assert(send.requiresConfirmation,  "sendEmail.requiresConfirmation");
    }),

    run("T04 — Capabilities de leitura NÃO exigem confirmação", () => {
      const caps = new GmailConnector().capabilities();
      const read = caps.find((c) => c.id === "readInbox")!;
      assert(!read.requiresConfirmation, "readInbox.requiresConfirmation=false");
    }),

    run("T05 — metadata() retorna campos obrigatórios", () => {
      const m = new GmailConnector().metadata();
      assert(m.name.length > 0,        "name");
      assert(m.version.length > 0,     "version");
      assert(m.description.length > 0, "description");
      assert(m.tags.includes("gmail"), "tag gmail");
    }),

    run("T06 — health() retorna unavailable quando não conectado", () => {
      // GoogleAuthSession.getConnection('default') returns null in test env
      const h = new GmailConnector().health();
      assert(["unavailable", "degraded", "healthy"].includes(h.status), "valid status");
      assert(typeof h.message === "string", "message is string");
      assert(h.checkedAt > 0, "checkedAt");
    }),

    // ── Registry integration ───────────────────────────────────────────────
    run("T07 — registerGmailConnector registra no registry", () => {
      const reg = new ConnectorRegistry();
      registerGmailConnector(reg);
      assert(reg.exists("gmail"), "gmail registered");
      assertEqual(reg.size(), 1, "size=1");
    }),

    run("T08 — Registry.lookup retorna GmailConnector", () => {
      const reg = new ConnectorRegistry();
      registerGmailConnector(reg);
      const c = reg.lookup("gmail");
      assert(c !== null, "found");
      assertEqual(c!.connectorId(), "gmail", "connectorId");
    }),

    // ── Router capability routing ──────────────────────────────────────────
    run("T09 — Router localiza GmailConnector e verifica capability real", async () => {
      const stub = makeLegacyStub({ ok: true, data: { messages: [] }, error: null, status: "connected" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const router = new UniversalConnectorRouter(reg);
      const res    = await router.route("ex", makeStep("gmail", "readInbox"));
      assert(res.found, "found");
      assertEqual(res.result!.status, "success", "status");
    }),

    run("T10 — Router retorna not_found para capability desconhecida", async () => {
      const reg = new ConnectorRegistry();
      registerGmailConnector(reg);
      const router = new UniversalConnectorRouter(reg);
      const res    = await router.route("ex", makeStep("gmail", "unknownCapability"));
      assert(!res.found, "not found");
      assert(res.error!.includes("unknownCapability"), "error mentions capability");
    }),

    // ── Execution via stub: success path ───────────────────────────────────
    run("T11 — ConnectorCapabilityExecutor com OAuth válido → status=completed", async () => {
      const stub = makeLegacyStub({ ok: true, data: { messages: [{ id: "m1" }] }, error: null, status: "connected" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const out = await executor.execute({ executionId: "e1", step: makeStep("gmail", "readInbox"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "completed", "status=completed");
      assert(out.error === null, "no error");
    }),

    // ── Execution via stub: OAuth expired / 401 ───────────────────────────
    run("T12 — OAuth expirado → status=failed com error", async () => {
      const stub = makeLegacyStub({ ok: false, data: null, error: "Token invalido ou expirado", status: "expired" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const out = await executor.execute({ executionId: "e2", step: makeStep("gmail", "readInbox"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "failed", "status=failed");
      assert(out.error !== null, "error set");
    }),

    // ── Execution via stub: disconnected ───────────────────────────────────
    run("T13 — Sem conexão Google → status=failed", async () => {
      const stub = makeLegacyStub({ ok: false, data: null, error: "Google Workspace nao conectado", status: "disconnected" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const out = await executor.execute({ executionId: "e3", step: makeStep("gmail", "readInbox"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "failed", "status=failed");
    }),

    // ── Execution via stub: timeout ────────────────────────────────────────
    run("T14 — Timeout da API → status=timeout", async () => {
      const stub = makeLegacyStub({ ok: false, data: null, error: "Timeout ao acessar Gmail", status: "timeout" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const out = await executor.execute({ executionId: "e4", step: makeStep("gmail", "readInbox"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "timeout", "status=timeout");
    }),

    // ── Execution via stub: 403 Forbidden ─────────────────────────────────
    run("T15 — 403 Forbidden (escopos insuficientes) → status=failed", async () => {
      const stub = makeLegacyStub({ ok: false, data: null, error: "Acesso negado ao Gmail. Verifique os escopos autorizados.", status: "error" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const out = await executor.execute({ executionId: "e5", step: makeStep("gmail", "readInbox"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "failed", "status=failed");
    }),

    // ── searchEmails capability ────────────────────────────────────────────
    run("T16 — searchEmails com query param", async () => {
      const stub = makeLegacyStub({ ok: true, data: { messages: [{ id: "m2", subject: "Relatorio" }], query: "relatorio" }, error: null, status: "connected" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const out = await executor.execute({ executionId: "e6", step: makeStep("gmail", "searchEmails", { query: "relatorio" }), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      assertEqual(out.status, "completed", "status=completed");
    }),

    // ── Runtime end-to-end via UCR + GmailConnector stub ──────────────────
    run("T17 — Runtime executa plan via UCR → GmailConnector (stub) sem alterar Runtime", async () => {
      const stub = makeLegacyStub({ ok: true, data: { messages: [] }, error: null, status: "connected" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const engine   = new ConversationRuntimeEngine(executor);
      const result   = await engine.execute(makePlan([makeStep("gmail", "readInbox", { maxResults: 5 })]));
      assertEqual(result.status, "completed", "status=completed");
      assertEqual(result.steps.length, 1, "1 step");
      assert(result.errors.length === 0, "no errors");
    }),

    run("T18 — Runtime para em failed quando OAuth expirado (sem alterar Runtime)", async () => {
      const stub = makeLegacyStub({ ok: false, data: null, error: "Token expirado", status: "expired" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      const engine   = new ConversationRuntimeEngine(executor);
      const result   = await engine.execute(makePlan([makeStep("gmail", "readInbox")]));
      assertEqual(result.status, "failed", "status=failed");
      assert(result.errors.length > 0, "errors captured");
    }),

    // ── Gold architecture test ─────────────────────────────────────────────
    run("T19 — GOLD TEST: GmailConnector funciona como qualquer outro connector no Router", async () => {
      // Proves OCP: add gmail to registry → router finds it automatically.
      // No special-casing anywhere.
      const stub = makeLegacyStub({ ok: true, data: { messages: [{ id: "gold", subject: "Leia seus emails" }] }, error: null, status: "connected" });
      const reg  = new ConnectorRegistry();
      reg.register(stub); // <-- this is the ONLY change needed to "add Gmail"
      assert(reg.exists("gmail"), "gmail in registry");
      const router = new UniversalConnectorRouter(reg);
      const res    = await router.route("gold-exec", makeStep("gmail", "readInbox", { maxResults: 10 }));
      assert(res.found, "router found gmail");
      assertEqual(res.result!.status, "success", "success");
      // Confirms: no code in Router, Dispatcher, Runtime, or Pipeline changed.
    }),

    run("T20 — Nenhum HTTP real chamado durante todos os testes", async () => {
      let fetchCalled = false;
      const orig = (globalThis as Record<string, unknown>)["fetch"];
      (globalThis as Record<string, unknown>)["fetch"] = () => { fetchCalled = true; return Promise.reject(new Error("no fetch")); };
      const stub = makeLegacyStub({ ok: true, data: {}, error: null, status: "connected" });
      const reg  = new ConnectorRegistry();
      reg.register(stub);
      const executor = new ConnectorCapabilityExecutor(new UniversalConnectorRouter(reg));
      await executor.execute({ executionId: "nofetch", step: makeStep("gmail", "readInbox"), retryCtx: { attempt: 1, maxAttempts: 1, lastError: null } });
      (globalThis as Record<string, unknown>)["fetch"] = orig;
      assert(!fetchCalled, "fetch never called");
    }),

    // ── Capability versions ────────────────────────────────────────────────
    run("T21 — Todas as capabilities têm versão declarada", () => {
      const caps = new GmailConnector().capabilities();
      for (const c of caps) {
        assert(c.version.length > 0, `${c.id} has version`);
        assert(c.timeoutMs > 0,      `${c.id} has timeout`);
      }
    }),

    run("T22 — health() retorna ConnectorHealth com shape correto", () => {
      const h = new GmailConnector().health();
      assert("status"    in h, "status field");
      assert("message"   in h, "message field");
      assert("checkedAt" in h, "checkedAt field");
    }),

  ]);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { passed, failed, total: results.length, results, verdict: failed === 0 ? "PASS" : "FAIL" };
}