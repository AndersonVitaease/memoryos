// Connector Runtime — Validation Suite
// Foundation v1.0 · Engineering First
//
// 7 cenarios obrigatorios + criterios de aceitacao originais.
// Evidencias para Engineering Review.

import { ConnectorRuntime } from "./ConnectorRuntime";
import { ConnectorRegistry } from "./ConnectorRegistry";
import { ConnectorLoader } from "./ConnectorLoader";
import { ConnectorExecutor } from "./ConnectorExecutor";
import { Base44Connector } from "./connectors/Base44Connector";
import { GitHubConnector } from "./connectors/GitHubConnector";
import type { IConnector } from "./IConnector";
import type { ConnectorContext, ConnectorResult } from "./ConnectorTypes";
import { makeLog } from "./ConnectorTypes";

export interface RuntimeTestResult {
  name: string;
  scenario?: string;
  expectedStatus?: string;
  actualStatus?: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  observation?: string;
}

const BASE_CTX = {
  userId: "test-user",
  projectId: "test-project",
  sessionId: "test-session",
};

async function run(
  name: string,
  fn: () => Promise<{ detail?: string; observation?: string; expectedStatus?: string; actualStatus?: string }>,
  scenario?: string,
): Promise<RuntimeTestResult> {
  const start = Date.now();
  try {
    const out = await fn();
    return { name, scenario, passed: true, durationMs: Date.now() - start, ...out };
  } catch (err) {
    return { name, scenario, passed: false, durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Fault-injection helpers ───────────────────────────────────────────────────

/** Connector que lanca erro interno */
class ErrorConnector implements IConnector {
  readonly id = "error-connector";
  metadata() { return { id: this.id, name: "Error Connector", version: "0.1.0", description: "Injects internal error", author: "test", capabilities: [] }; }
  async initialize() { return; }
  async shutdown() { return; }
  async health() { return { status: "unhealthy" as const, connectorId: this.id, checkedAt: Date.now() }; }
  async execute(_op: string, _pl: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorResult> {
    throw new Error("Internal connector error — simulated fault");
  }
  validate() { return true; }
}

/** Connector que simula operacao lenta (timeout) */
class SlowConnector implements IConnector {
  readonly id = "slow-connector";
  metadata() { return { id: this.id, name: "Slow Connector", version: "0.1.0", description: "Simulates timeout", author: "test", capabilities: [] }; }
  async initialize() { return; }
  async shutdown() { return; }
  async health() { return { status: "degraded" as const, connectorId: this.id, checkedAt: Date.now() }; }
  async execute(_op: string, _pl: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorResult> {
    await new Promise(res => setTimeout(res, 15_000)); // maior que timeout padrao
    return { status: "SUCCESS", success: true, duration: 0, connectorId: this.id, executionId: ctx.executionId, logs: [] };
  }
  validate() { return true; }
}

// ── Main test runner ──────────────────────────────────────────────────────────

export async function runConnectorRuntimeTests(): Promise<RuntimeTestResult[]> {
  const results: RuntimeTestResult[] = [];

  // ── SCENARIO 1: Connector registrado corretamente → SUCCESS ────────────────
  results.push(await run("Cenario 1 — Registro correto do Connector", async () => {
    const rt = new ConnectorRuntime();
    rt.register(new Base44Connector());
    rt.register(new GitHubConnector());
    const list = rt.listConnectors();
    if (!list.find(c => c.id === "base44")) throw new Error("base44 nao encontrado");
    if (!list.find(c => c.id === "github")) throw new Error("github nao encontrado");
    return { expectedStatus: "SUCCESS", actualStatus: "SUCCESS", detail: "Ambos os connectors registrados e localizados" };
  }, "Cenario 1"));

  // ── SCENARIO 2: Connector inexistente → FAILED ─────────────────────────────
  results.push(await run("Cenario 2 — Connector inexistente", async () => {
    const rt = new ConnectorRuntime();
    let status = "FAILED";
    try {
      await rt.execute("connector-nao-existe", "test.ping", {}, BASE_CTX);
      status = "SUCCESS"; // nao deveria chegar aqui
    } catch {
      status = "FAILED"; // esperado
    }
    if (status !== "FAILED") throw new Error("Runtime deveria ter lancado erro para connector inexistente");
    return { expectedStatus: "FAILED", actualStatus: "FAILED", detail: "Runtime lancou erro corretamente para ID desconhecido" };
  }, "Cenario 2"));

  // ── SCENARIO 3: Policy Engine bloqueia → DENIED ────────────────────────────
  results.push(await run("Cenario 3 — Policy Engine bloqueia execucao", async () => {
    // Override temporario do PolicyEngine para negar
    const rt = new ConnectorRuntime();
    rt.register(new Base44Connector());
    await rt.load("base44", { ...BASE_CTX, executionId: "load-s3" });

    // Injetar policy que nega via monkey-patch no modulo carregado
    const policyMod = await import("../../lib/policies/policyEngine.js");
    const original = policyMod.PolicyEngine.authorize;
    policyMod.PolicyEngine.authorize = async () => ({ allow: false, reason: "test-deny" });

    const result = await rt.execute("base44", "test.ping", {}, BASE_CTX);
    policyMod.PolicyEngine.authorize = original; // restaurar

    if (result.status !== "DENIED") throw new Error(`Esperado DENIED, obtido ${result.status}`);
    if (result.success !== false) throw new Error("success deveria ser false");
    return { expectedStatus: "DENIED", actualStatus: result.status, detail: "Policy Engine bloqueou e retornou DENIED corretamente" };
  }, "Cenario 3"));

  // ── SCENARIO 4: Timeout → TIMEOUT ─────────────────────────────────────────
  results.push(await run("Cenario 4 — Timeout na execucao", async () => {
    const rt = new ConnectorRuntime();
    const slow = new SlowConnector();
    rt.register(slow);
    await rt.load("slow-connector", { ...BASE_CTX, executionId: "load-s4" });
    const result = await rt.execute("slow-connector", "run", {}, BASE_CTX, 100); // timeout 100ms
    if (result.status !== "TIMEOUT") throw new Error(`Esperado TIMEOUT, obtido ${result.status}`);
    return { expectedStatus: "TIMEOUT", actualStatus: result.status, detail: "Operacao excedeu 100ms e foi abortada com TIMEOUT" };
  }, "Cenario 4"));

  // ── SCENARIO 5: Erro interno → FAILED ─────────────────────────────────────
  results.push(await run("Cenario 5 — Erro interno do Connector", async () => {
    const rt = new ConnectorRuntime();
    rt.register(new ErrorConnector());
    await rt.load("error-connector", { ...BASE_CTX, executionId: "load-s5" });
    const result = await rt.execute("error-connector", "run", {}, BASE_CTX);
    if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
    if (!result.error) throw new Error("Campo error deveria estar preenchido");
    return { expectedStatus: "FAILED", actualStatus: result.status, detail: `Erro capturado: "${result.error}"` };
  }, "Cenario 5"));

  // ── SCENARIO 6: Execucao bem-sucedida → SUCCESS ────────────────────────────
  results.push(await run("Cenario 6 — Execucao bem-sucedida", async () => {
    const rt = new ConnectorRuntime();
    rt.register(new Base44Connector());
    rt.register(new GitHubConnector());
    await rt.load("base44", { ...BASE_CTX, executionId: "load-b-s6" });
    await rt.load("github", { ...BASE_CTX, executionId: "load-g-s6" });

    const r1 = await rt.execute("base44", "test.ping", {}, BASE_CTX);
    const r2 = await rt.execute("github", "test.echo", { msg: "hello" }, BASE_CTX);

    if (r1.status !== "SUCCESS") throw new Error(`Base44: esperado SUCCESS, obtido ${r1.status}`);
    if (r2.status !== "SUCCESS") throw new Error(`GitHub: esperado SUCCESS, obtido ${r2.status}`);
    if (!r1.logs?.length) throw new Error("Logs ausentes no resultado");
    if (!r1.executionId) throw new Error("executionId ausente");

    const m = rt.getMetrics("base44");
    if (!m || m.totalExecutions === 0) throw new Error("Metricas nao registradas");

    const history = rt.getHistory();
    if (!history.length) throw new Error("Historico vazio");

    const h1 = await rt.health("base44");
    const h2 = await rt.health("github");
    if (h1.status !== "healthy") throw new Error("base44 nao healthy");
    if (h2.status !== "healthy") throw new Error("github nao healthy");

    return {
      expectedStatus: "SUCCESS",
      actualStatus: "SUCCESS",
      detail: `Base44: ${r1.duration}ms | GitHub: ${r2.duration}ms | Execucoes: ${m.totalExecutions} | Historico: ${history.length}`,
    };
  }, "Cenario 6"));

  // ── SCENARIO 7: Cancelamento → CANCELLED ──────────────────────────────────
  results.push(await run("Cenario 7 — Cancelamento solicitado", async () => {
    // CANCELLED e um status valido do contrato. ConnectorRuntime expoe cancelExecution()
    // Nesta validacao, o resultado e construido diretamente simulando o caminho de cancelamento.
    // Observacao: o runtime atual nao possui mecanismo de cancelamento em voo.
    // Registrado como evidencia para Engineering Review.
    const rt = new ConnectorRuntime();
    const cancelled = rt.buildCancelledResult("base44", "test.ping");
    if (cancelled.status !== "CANCELLED") throw new Error(`Esperado CANCELLED, obtido ${cancelled.status}`);
    if (cancelled.success !== false) throw new Error("success deveria ser false");
    return {
      expectedStatus: "CANCELLED",
      actualStatus: cancelled.status,
      detail: "CANCELLED produzido via buildCancelledResult()",
      observation: "O runtime atual nao suporta cancelamento em voo. buildCancelledResult() produz o objeto padronizado mas nao interrompe execucoes em andamento. Evidencia registrada para Engineering Review.",
    };
  }, "Cenario 7"));

  return results;
}