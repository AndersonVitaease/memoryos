// Base44 Connector — Sprint Validation Suite
// Foundation v1.0 · Engineering First
//
// 8 criterios de aceitacao obrigatorios.
// Evidencias para Engineering Review.

import { ConnectorRuntime } from "./ConnectorRuntime";
import { Base44Connector } from "./connectors/Base44Connector";

export interface Base44TestResult {
  criterion: number;
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  data?: unknown;
  observation?: string;
}

const BASE_CTX = {
  userId: "sprint-user",
  projectId: "sprint-project",
  sessionId: "sprint-session",
};

async function criterion(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string; data?: unknown; observation?: string }>,
): Promise<Base44TestResult> {
  const start = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - start, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runBase44ConnectorTests(): Promise<Base44TestResult[]> {
  const results: Base44TestResult[] = [];
  const runtime = new ConnectorRuntime();
  const connector = new Base44Connector();

  // ── Criterio 1: Registro ───────────────────────────────────────────────────
  results.push(await criterion(1, "Base44Connector registra-se corretamente", async () => {
    runtime.register(connector);
    const list = runtime.listConnectors();
    const found = list.find(c => c.id === "base44");
    if (!found) throw new Error("base44 nao encontrado no registro");
    return { detail: `Registrado — capacidades: ${found.capabilities.join(", ")}`, data: found };
  }));

  // ── Criterio 2: Localizacao ────────────────────────────────────────────────
  results.push(await criterion(2, "Connector Runtime localiza o Connector", async () => {
    const list = runtime.listConnectors();
    const meta = list.find(c => c.id === "base44");
    if (!meta) throw new Error("Runtime nao localizou base44");
    const metrics = runtime.getMetrics("base44");
    if (!metrics) throw new Error("Metricas nao inicializadas");
    return { detail: `Localizado — metricas inicializadas, totalExecutions: ${metrics.totalExecutions}` };
  }));

  // ── Criterio 3: Policy Engine ──────────────────────────────────────────────
  results.push(await criterion(3, "Policy Engine autoriza a execucao", async () => {
    // Carrega o connector para permitir execucao
    await runtime.load("base44", { ...BASE_CTX, executionId: "load-sprint" });
    if (!runtime.isLoaded("base44")) throw new Error("Connector nao carregado apos load()");

    // Executa uma operacao — se DENIED, o Policy Engine bloqueou
    const result = await runtime.execute("base44", "auth.validate", {}, BASE_CTX);
    if (result.status === "DENIED") throw new Error(`Policy Engine negou: ${result.error}`);
    return { detail: `Policy Engine autorizou — status: ${result.status}` };
  }));

  // ── Criterio 4: Conexao com Base44 ────────────────────────────────────────
  results.push(await criterion(4, "Connector estabelece conexao com o Base44", async () => {
    const result = await runtime.execute("base44", "connectivity.ping", {}, BASE_CTX);
    if (result.status !== "SUCCESS") throw new Error(`Ping falhou: ${result.error}`);
    const data = result.data as any;
    if (!data?.pong) throw new Error("Pong ausente na resposta");
    return {
      detail: `Conexao estabelecida — authenticated: ${data.authenticated}`,
      data: { pong: data.pong, authenticated: data.authenticated },
    };
  }));

  // ── Criterio 5: Operacao real ──────────────────────────────────────────────
  results.push(await criterion(5, "Operacao real executada com sucesso", async () => {
    // auth.me — retorna dados reais do usuario autenticado
    const meResult = await runtime.execute("base44", "auth.me", {}, BASE_CTX);
    if (meResult.status !== "SUCCESS") throw new Error(`auth.me falhou: ${meResult.error}`);
    const user = meResult.data as any;
    if (!user?.id) throw new Error("ID do usuario ausente na resposta");

    // projects.list — lista projetos reais
    const projResult = await runtime.execute("base44", "projects.list", { limit: 5 }, BASE_CTX);
    if (projResult.status !== "SUCCESS") throw new Error(`projects.list falhou: ${projResult.error}`);
    const proj = projResult.data as any;

    // app.info
    const infoResult = await runtime.execute("base44", "app.info", {}, BASE_CTX);
    if (infoResult.status !== "SUCCESS") throw new Error(`app.info falhou: ${infoResult.error}`);

    return {
      detail: `auth.me: ${user.email} | projects: ${proj.count} | app.info: OK`,
      data: { user: { id: user.id, email: user.email, role: user.role }, projectCount: proj.count },
    };
  }));

  // ── Criterio 6: ConnectorResult padronizado ────────────────────────────────
  results.push(await criterion(6, "ConnectorResult retornado corretamente", async () => {
    const result = await runtime.execute("base44", "auth.me", {}, BASE_CTX);
    if (!result.status) throw new Error("Campo status ausente");
    if (typeof result.success !== "boolean") throw new Error("Campo success ausente");
    if (!result.connectorId) throw new Error("Campo connectorId ausente");
    if (!result.executionId) throw new Error("Campo executionId ausente");
    if (typeof result.duration !== "number") throw new Error("Campo duration ausente");
    if (!Array.isArray(result.logs)) throw new Error("Campo logs ausente");
    return {
      detail: `status=${result.status} | connectorId=${result.connectorId} | duration=${result.duration}ms | logs=${result.logs.length}`,
    };
  }));

  // ── Criterio 7: Logs e metricas ────────────────────────────────────────────
  results.push(await criterion(7, "Logs e metricas sao registrados", async () => {
    const result = await runtime.execute("base44", "sessions.list", { limit: 3 }, BASE_CTX);
    if (!result.logs?.length) throw new Error("Logs ausentes no ConnectorResult");

    const metrics = runtime.getMetrics("base44");
    if (!metrics) throw new Error("Metricas nao encontradas");
    if (metrics.totalExecutions === 0) throw new Error("totalExecutions = 0");
    if (metrics.lastExecutedAt === null) throw new Error("lastExecutedAt nulo");

    const history = runtime.getHistory();
    if (!history.length) throw new Error("Historico de execucao vazio");

    return {
      detail: `Logs: ${result.logs.length} | totalExecutions: ${metrics.totalExecutions} | avgDuration: ${metrics.avgDurationMs}ms | history: ${history.length}`,
      data: { metrics, logCount: result.logs.length },
    };
  }));

  // ── Criterio 8: Health Check ───────────────────────────────────────────────
  results.push(await criterion(8, "Health Check permanece saudavel", async () => {
    const health = await runtime.health("base44");
    if (health.status !== "healthy") throw new Error(`Health degraded: ${health.details}`);
    return { detail: `Status: ${health.status} — ${health.details}`, data: health };
  }));

  return results;
}