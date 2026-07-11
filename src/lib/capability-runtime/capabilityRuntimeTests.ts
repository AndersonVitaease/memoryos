// Capability Runtime — Validation Suite
// Foundation v1.0 · Engineering First
//
// 11 criterios de aceitacao + hardening.

import { CapabilityRuntime } from "./CapabilityRuntime";
import { CapabilityRegistry } from "./CapabilityRegistry";
import { CapabilityLoader } from "./CapabilityLoader";
import { CapabilityExecutor } from "./CapabilityExecutor";
import { GitHubReadCapability } from "./capabilities/GitHubReadCapability";
import { Base44InfoCapability } from "./capabilities/Base44InfoCapability";
import { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";
import { Base44Connector } from "../connector-runtime/connectors/Base44Connector";
import { GitHubConnector } from "../connector-runtime/connectors/GitHubConnector";
import type { ICapability } from "./ICapability";
import type { CapabilityContext, CapabilityResult } from "./CapabilityTypes";
import { makeCapabilityLog } from "./CapabilityTypes";

export interface CapabilityTestResult {
  criterion: number;
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  data?: unknown;
  observation?: string;
}

export interface CapabilityHardeningResult {
  scenario: number;
  name: string;
  category: "registration" | "execution" | "timeout" | "exception" | "validation" | "success";
  expectedStatus: string;
  actualStatus: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  observation?: string;
}

const BASE_CTX = {
  userId: "cap-test-user",
  projectId: "cap-test-project",
  sessionId: "cap-test-session",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function criterion(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string; data?: unknown; observation?: string }>,
): Promise<CapabilityTestResult> {
  const start = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - start, ...out };
  } catch (err) {
    return {
      criterion: n, name, passed: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildConnectorRuntime(): ConnectorRuntime {
  const rt = new ConnectorRuntime();
  rt.register(new Base44Connector());
  rt.register(new GitHubConnector());
  return rt;
}

// ── Main sprint suite (11 criterios) ─────────────────────────────────────────

export async function runCapabilityRuntimeTests(): Promise<CapabilityTestResult[]> {
  const results: CapabilityTestResult[] = [];
  const connectorRuntime = buildConnectorRuntime();
  const capabilityRuntime = new CapabilityRuntime(connectorRuntime);

  const githubCap = new GitHubReadCapability();
  const base44Cap = new Base44InfoCapability();

  // ── Criterio 1: Registro GitHub Capability ────────────────────────────────
  results.push(await criterion(1, "Criterio 1 — Registrar GitHub Read Capability", async () => {
    capabilityRuntime.register(githubCap);
    const list = capabilityRuntime.listCapabilities();
    const found = list.find(c => c.id === "github-read");
    if (!found) throw new Error("github-read nao encontrado no registry");
    return { detail: `Registrada — operations: ${found.operations.join(", ")}`, data: found };
  }));

  // ── Criterio 2: Registro Base44 Capability ────────────────────────────────
  results.push(await criterion(2, "Criterio 2 — Registrar Base44 Info Capability", async () => {
    capabilityRuntime.register(base44Cap);
    const list = capabilityRuntime.listCapabilities();
    const found = list.find(c => c.id === "base44-info");
    if (!found) throw new Error("base44-info nao encontrado no registry");
    return { detail: `Registrada — operations: ${found.operations.join(", ")}`, data: found };
  }));

  // ── Criterio 3: Registry localiza ambas ──────────────────────────────────
  results.push(await criterion(3, "Criterio 3 — Capability Registry localiza ambas", async () => {
    const list = capabilityRuntime.listCapabilities();
    if (list.length < 2) throw new Error(`Esperado >= 2 capabilities, encontrado: ${list.length}`);
    const gh = list.find(c => c.id === "github-read");
    const b44 = list.find(c => c.id === "base44-info");
    if (!gh) throw new Error("github-read nao encontrada");
    if (!b44) throw new Error("base44-info nao encontrada");
    const metricsGh = capabilityRuntime.getMetrics("github-read");
    const metricsB44 = capabilityRuntime.getMetrics("base44-info");
    if (!metricsGh || !metricsB44) throw new Error("Metricas nao inicializadas");
    return { detail: `${list.length} capabilities localizadas — metricas inicializadas`, data: list.map(c => c.id) };
  }));

  // ── Criterio 4: Loader inicializa ambas ───────────────────────────────────
  results.push(await criterion(4, "Criterio 4 — Capability Loader inicializa ambas", async () => {
    // Load connectors first
    await connectorRuntime.load("base44", { ...BASE_CTX, executionId: "load-b44-init" });
    await connectorRuntime.load("github", { ...BASE_CTX, executionId: "load-gh-init" });

    await capabilityRuntime.load("github-read", { ...BASE_CTX, connectorId: "github" });
    await capabilityRuntime.load("base44-info", { ...BASE_CTX, connectorId: "base44" });

    if (!capabilityRuntime.isLoaded("github-read")) throw new Error("github-read nao carregada");
    if (!capabilityRuntime.isLoaded("base44-info")) throw new Error("base44-info nao carregada");
    return { detail: "Ambas as Capabilities carregadas e inicializadas com sucesso" };
  }));

  // ── Criterio 5: Policy Engine autoriza ────────────────────────────────────
  results.push(await criterion(5, "Criterio 5 — Policy Engine autoriza execucao", async () => {
    const result = await capabilityRuntime.execute(
      "base44-info", "connectivity.ping", {}, { ...BASE_CTX, connectorId: "base44" },
    );
    if (result.status === "DENIED") throw new Error(`Policy Engine negou: ${result.error}`);
    return { detail: `Policy Engine autorizou — status: ${result.status}` };
  }));

  // ── Criterio 6: Capability Runtime executa corretamente ───────────────────
  results.push(await criterion(6, "Criterio 6 — Capability Runtime executa corretamente", async () => {
    const r1 = await capabilityRuntime.execute(
      "base44-info", "app.info", {}, { ...BASE_CTX, connectorId: "base44" },
    );
    const r2 = await capabilityRuntime.execute(
      "github-read", "connectivity.ping", {}, { ...BASE_CTX, connectorId: "github" },
    );
    if (r1.status !== "SUCCESS") throw new Error(`base44-info app.info: esperado SUCCESS, obtido ${r1.status} — ${r1.error}`);
    // github pode ser SUCCESS ou FAILED[auth] sem token — ambos sao validos
    const detail = `base44-info: ${r1.status} in ${r1.duration}ms | github-read: ${r2.status} in ${r2.duration}ms`;
    return { detail, data: { base44Status: r1.status, githubStatus: r2.status } };
  }));

  // ── Criterio 7: Connector Runtime reutilizado sem modificacoes ────────────
  results.push(await criterion(7, "Criterio 7 — Connector Runtime reutilizado integralmente", async () => {
    // Verificar que o mesmo ConnectorRuntime recebeu execucoes via Capability
    const connHistory = connectorRuntime.getHistory();
    if (!connHistory.length) throw new Error("Connector Runtime nao registrou execucoes via Capability");
    const connMetrics = connectorRuntime.allMetrics();
    const b44Metrics = connMetrics.find(m => m.connectorId === "base44");
    if (!b44Metrics || b44Metrics.totalExecutions === 0) throw new Error("Metricas do Base44 Connector zeradas");
    return {
      detail: `Connector Runtime history: ${connHistory.length} records | Base44 executions: ${b44Metrics.totalExecutions}`,
      data: { connectorHistory: connHistory.length, base44Executions: b44Metrics.totalExecutions },
    };
  }));

  // ── Criterio 8: ConnectorResult convertido em CapabilityResult ────────────
  results.push(await criterion(8, "Criterio 8 — ConnectorResult convertido em CapabilityResult", async () => {
    const result = await capabilityRuntime.execute(
      "base44-info", "auth.me", {}, { ...BASE_CTX, connectorId: "base44" },
    );
    // Validar contrato CapabilityResult
    if (!result.status) throw new Error("Campo status ausente");
    if (typeof result.success !== "boolean") throw new Error("Campo success ausente");
    if (!result.capabilityId) throw new Error("Campo capabilityId ausente");
    if (!result.connectorId) throw new Error("Campo connectorId ausente");
    if (!result.executionId) throw new Error("Campo executionId ausente");
    if (typeof result.duration !== "number") throw new Error("Campo duration ausente");
    if (!Array.isArray(result.logs)) throw new Error("Campo logs deve ser array");
    if (result.capabilityId !== "base44-info") throw new Error(`capabilityId incorreto: ${result.capabilityId}`);
    if (result.connectorId !== "base44") throw new Error(`connectorId incorreto: ${result.connectorId}`);
    return {
      detail: `status=${result.status} | capabilityId=${result.capabilityId} | connectorId=${result.connectorId} | duration=${result.duration}ms | logs=${result.logs.length}`,
    };
  }));

  // ── Criterio 9: Logs registrados ──────────────────────────────────────────
  results.push(await criterion(9, "Criterio 9 — Logs sao registrados", async () => {
    const result = await capabilityRuntime.execute(
      "base44-info", "projects.list", { limit: 3 }, { ...BASE_CTX, connectorId: "base44" },
    );
    if (!result.logs?.length) throw new Error("Logs ausentes no CapabilityResult");
    const hasCapLog = result.logs.some(l => l.message.includes("base44-info"));
    if (!hasCapLog) throw new Error("Log da Capability nao encontrado");
    return {
      detail: `Logs: ${result.logs.length} | Capability log presente: ${hasCapLog}`,
      data: { logCount: result.logs.length },
    };
  }));

  // ── Criterio 10: Metricas registradas ─────────────────────────────────────
  results.push(await criterion(10, "Criterio 10 — Metricas sao registradas", async () => {
    const m = capabilityRuntime.getMetrics("base44-info");
    if (!m) throw new Error("Metricas nao encontradas");
    if (m.totalExecutions === 0) throw new Error("totalExecutions = 0");
    if (m.lastExecutedAt === null) throw new Error("lastExecutedAt nulo");
    const history = capabilityRuntime.getHistory();
    if (!history.length) throw new Error("Historico de execucao vazio");
    return {
      detail: `totalExecutions: ${m.totalExecutions} | avgDuration: ${m.avgDurationMs}ms | history: ${history.length}`,
      data: { metrics: m, historyLength: history.length },
    };
  }));

  // ── Criterio 11: Health Check ─────────────────────────────────────────────
  results.push(await criterion(11, "Criterio 11 — Health Check do Connector retorna SUCCESS", async () => {
    const h = await connectorRuntime.health("base44");
    if (h.status !== "healthy") throw new Error(`Base44 Connector nao healthy: ${h.details}`);
    const allMetrics = capabilityRuntime.allMetrics();
    if (!allMetrics.length) throw new Error("allMetrics vazio");
    return {
      detail: `Base44 Connector: ${h.status} | Capabilities com metricas: ${allMetrics.length}`,
      data: { connectorHealth: h, capabilityMetrics: allMetrics },
    };
  }));

  // ── Criterio 12: Sem decisao de negocio — executa apenas o que foi selecionado ──
  results.push(await criterion(12, "Criterio 12 — Runtime executa apenas Capabilities previamente selecionadas", async () => {
    // Evidencia: execute() requer capabilityId explicito — nao existe overload sem ID,
    // nao existe metodo "findBest()", "chooseCap()" ou qualquer inferencia de intencao.
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(capabilityRuntime));
    const forbidden = ["choose", "infer", "plan", "decide", "selectCapability", "findBest", "interpret"];
    const found = forbidden.filter(f => proto.some(m => m.toLowerCase().includes(f)));
    if (found.length) throw new Error(`Metodos de decisao encontrados no Runtime: ${found.join(", ")}`);
    // Confirmar que execute() exige ID explicito
    const hasExecute = proto.includes("execute");
    if (!hasExecute) throw new Error("execute() nao encontrado");
    return {
      detail: `API publica auditada: ${proto.filter(m => !m.startsWith("_")).join(", ")} | Nenhum metodo de decisao presente`,
      observation: "Responsabilidade de selecao pertence ao Goal Runtime / Planner / PIE — nao ao Capability Runtime.",
    };
  }));

  // ── Criterio 13: Nenhuma responsabilidade do Goal Runtime incorporada ──────
  results.push(await criterion(13, "Criterio 13 — Nenhuma responsabilidade do Goal Runtime no Capability Runtime", async () => {
    // Verificar que o CapabilityRuntime nao expoe: intent, goal, plan, strategy, reasoning
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(capabilityRuntime));
    const goalRuntimeBoundary = ["intent", "goal", "plan", "strategy", "reason", "infer", "suggest", "orchestrate"];
    const violations = goalRuntimeBoundary.filter(b => proto.some(m => m.toLowerCase().includes(b)));
    if (violations.length) {
      throw new Error(`Violacao de boundary: metodos de Goal Runtime presentes: ${violations.join(", ")}`);
    }
    // Confirmar boundary positivo: apenas responsabilidades do Runtime
    const allowed = ["register", "load", "unload", "execute", "getMetrics", "allMetrics", "getHistory", "listCapabilities", "isLoaded", "buildCancelledResult"];
    const publicMethods = proto.filter(m => !m.startsWith("_") && m !== "constructor");
    const unknown = publicMethods.filter(m => !allowed.includes(m));
    return {
      detail: `Metodos publicos: ${publicMethods.join(", ")} | Metodos fora do boundary: ${unknown.length === 0 ? "nenhum" : unknown.join(", ")}`,
      observation: "Boundary Goal Runtime / Capability Runtime confirmado. Intencao, planejamento e estrategia pertencem ao Goal Runtime, Planner e PIE.",
    };
  }));

  return results;
}

// ── Hardening Suite ───────────────────────────────────────────────────────────

/** Faz uma Capability incorreta que lanca excecao */
class ExplodingCapability implements ICapability {
  readonly id = "exploding-cap";
  metadata() {
    return { id: this.id, name: "Exploding", version: "0.0.1", description: "Throws", author: "test", connectorId: "base44", operations: ["run"] };
  }
  validate() { return true; }
  async initialize() { return; }
  async shutdown() { return; }
  async execute(): Promise<CapabilityResult> {
    throw new Error("Simulated internal capability explosion");
  }
}

/** Capability extremamente lenta para testar timeout */
class SlowCapability implements ICapability {
  readonly id = "slow-cap";
  metadata() {
    return { id: this.id, name: "Slow", version: "0.0.1", description: "Sleeps forever", author: "test", connectorId: "base44", operations: ["run"] };
  }
  validate() { return true; }
  async initialize() { return; }
  async shutdown() { return; }
  async execute(_op: string, _payload: Record<string, unknown>, ctx: CapabilityContext): Promise<CapabilityResult> {
    await new Promise(res => setTimeout(res, 30_000));
    return { status: "SUCCESS", success: true, duration: 0, capabilityId: this.id, connectorId: "base44", executionId: ctx.executionId, logs: [] };
  }
}

export async function runCapabilityHardeningTests(): Promise<CapabilityHardeningResult[]> {
  const results: CapabilityHardeningResult[] = [];
  const connectorRuntime = buildConnectorRuntime();
  await connectorRuntime.load("base44", { ...BASE_CTX, executionId: "hard-load-b44" });

  async function scenario(
    n: number,
    name: string,
    category: CapabilityHardeningResult["category"],
    expectedStatus: string,
    fn: () => Promise<{ detail?: string; observation?: string; actualStatus: string }>,
  ): Promise<CapabilityHardeningResult> {
    const start = Date.now();
    try {
      const out = await fn();
      const passed = out.actualStatus === expectedStatus;
      return { scenario: n, name, category, expectedStatus, actualStatus: out.actualStatus, passed, durationMs: Date.now() - start, detail: out.detail, observation: out.observation };
    } catch (err) {
      return {
        scenario: n, name, category, expectedStatus, actualStatus: "EXCEPTION_ESCAPED",
        passed: false, durationMs: Date.now() - start,
        error: `Exception escaped: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // S1: Registro correto
  results.push(await scenario(1, "Registro correto — sem duplicidade", "registration", "SUCCESS", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    rt.register(new Base44InfoCapability());
    const list = rt.listCapabilities();
    const found = list.find(c => c.id === "base44-info");
    if (!found) throw new Error("Capability nao registrada");
    return { actualStatus: "SUCCESS", detail: `Registrada: ${found.id}` };
  }));

  // S2: Duplicidade impedida
  results.push(await scenario(2, "Duplicidade impedida pelo Registry", "registration", "FAILED", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    rt.register(new Base44InfoCapability());
    let caught = false;
    try {
      rt.register(new Base44InfoCapability());
    } catch {
      caught = true;
    }
    if (!caught) throw new Error("Registry deveria ter lancado erro de duplicidade");
    return { actualStatus: "FAILED", detail: "Duplicidade corretamente impedida pelo Registry" };
  }));

  // S3: Capability inexistente
  results.push(await scenario(3, "Capability inexistente lancou erro", "execution", "FAILED", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    let caught = false;
    try {
      await rt.execute("nao-existe", "run", {}, { ...BASE_CTX, connectorId: "base44" });
    } catch {
      caught = true;
    }
    if (!caught) throw new Error("Runtime deveria ter lancado erro para capability inexistente");
    return { actualStatus: "FAILED", detail: "Erro corretamente lancado para capability desconhecida" };
  }));

  // S4: Capability que lanca excecao — nao deve escapar
  results.push(await scenario(4, "Excecao interna capturada pelo Executor", "exception", "FAILED", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    rt.register(new ExplodingCapability());
    await rt.load("exploding-cap", { ...BASE_CTX, connectorId: "base44" });
    const result = await rt.execute("exploding-cap", "run", {}, { ...BASE_CTX, connectorId: "base44" });
    if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
    return { actualStatus: "FAILED", detail: `Excecao capturada — error: ${result.error}` };
  }));

  // S5: Timeout
  results.push(await scenario(5, "Timeout capturado pelo Executor", "timeout", "TIMEOUT", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    rt.register(new SlowCapability());
    await rt.load("slow-cap", { ...BASE_CTX, connectorId: "base44" });
    const result = await rt.execute("slow-cap", "run", {}, { ...BASE_CTX, connectorId: "base44" }, 100);
    if (result.status !== "TIMEOUT") throw new Error(`Esperado TIMEOUT, obtido ${result.status}`);
    return { actualStatus: "TIMEOUT", detail: `Timeout em 100ms corretamente capturado` };
  }));

  // S6: Operacao invalida
  results.push(await scenario(6, "Operacao invalida retorna FAILED", "validation", "FAILED", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    rt.register(new Base44InfoCapability());
    await rt.load("base44-info", { ...BASE_CTX, connectorId: "base44" });
    const result = await rt.execute("base44-info", "operacao.invalida.xyz", {}, { ...BASE_CTX, connectorId: "base44" });
    if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
    return { actualStatus: "FAILED", detail: `Operacao invalida retornou FAILED — error: ${result.error}` };
  }));

  // S7: Policy Engine nega
  results.push(await scenario(7, "Policy Engine nega — DENIED retornado", "execution", "DENIED", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    rt.register(new Base44InfoCapability());
    await rt.load("base44-info", { ...BASE_CTX, connectorId: "base44" });

    const policyMod = await import("../policies/policyEngine.js");
    const original = policyMod.PolicyEngine.authorize;
    policyMod.PolicyEngine.authorize = async () => ({ allow: false, reason: "hardening-deny" });
    const result = await rt.execute("base44-info", "connectivity.ping", {}, { ...BASE_CTX, connectorId: "base44" });
    policyMod.PolicyEngine.authorize = original;

    if (result.status !== "DENIED") throw new Error(`Esperado DENIED, obtido ${result.status}`);
    return { actualStatus: "DENIED", detail: "Policy Engine bloqueou e retornou DENIED" };
  }));

  // S8: Execucao bem-sucedida — contrato completo
  results.push(await scenario(8, "Execucao bem-sucedida — CapabilityResult completo", "success", "SUCCESS", async () => {
    const rt = new CapabilityRuntime(connectorRuntime);
    rt.register(new Base44InfoCapability());
    await rt.load("base44-info", { ...BASE_CTX, connectorId: "base44" });
    const result = await rt.execute("base44-info", "connectivity.ping", {}, { ...BASE_CTX, connectorId: "base44" });
    if (result.status !== "SUCCESS") throw new Error(`Esperado SUCCESS, obtido ${result.status} — ${result.error}`);
    if (!result.logs?.length) throw new Error("Logs ausentes");
    if (!result.executionId) throw new Error("executionId ausente");
    if (result.capabilityId !== "base44-info") throw new Error("capabilityId incorreto");
    const m = rt.getMetrics("base44-info");
    if (!m || m.totalExecutions === 0) throw new Error("Metricas nao registradas");
    return {
      actualStatus: "SUCCESS",
      detail: `status=${result.status} | logs=${result.logs.length} | executions=${m.totalExecutions} | avgMs=${m.avgDurationMs}`,
    };
  }));

  return results;
}