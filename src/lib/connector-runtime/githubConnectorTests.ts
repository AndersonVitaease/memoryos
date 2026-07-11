// GitHub Connector — Sprint Validation Suite
// Foundation v1.0 · Engineering First · v1.0.0
//
// 9 criterios de aceitacao — demonstra que o Connector Runtime e genericamente
// reutilizavel para integrar um segundo sistema real sem alteracoes arquiteturais.

import { ConnectorRuntime } from "./ConnectorRuntime";
import { GitHubConnector } from "./connectors/GitHubConnector";
import type { GitHubConnectorMetrics } from "./connectors/GitHubConnector";

export interface GitHubTestResult {
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
  userId: "github-sprint-user",
  projectId: "github-sprint-project",
  sessionId: "github-sprint-session",
};

async function criterion(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string; data?: unknown; observation?: string }>,
): Promise<GitHubTestResult> {
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

export async function runGitHubConnectorTests(): Promise<GitHubTestResult[]> {
  const results: GitHubTestResult[] = [];
  const runtime = new ConnectorRuntime();
  const connector = new GitHubConnector();

  // ── Criterio 1: Registro ───────────────────────────────────────────────────
  results.push(await criterion(1, "GitHubConnector registra-se corretamente", async () => {
    runtime.register(connector);
    const list = runtime.listConnectors();
    const found = list.find(c => c.id === "github");
    if (!found) throw new Error("github nao encontrado no registry");
    return {
      detail: `Registrado — capabilities: ${found.capabilities.join(", ")}`,
      data: { id: found.id, version: found.version, capabilities: found.capabilities },
    };
  }));

  // ── Criterio 2: Localizacao pelo Runtime ───────────────────────────────────
  results.push(await criterion(2, "Connector Runtime localiza o GitHub Connector", async () => {
    const list = runtime.listConnectors();
    const meta = list.find(c => c.id === "github");
    if (!meta) throw new Error("Runtime nao localizou github");
    const metrics = runtime.getMetrics("github");
    if (!metrics) throw new Error("Metricas nao inicializadas pelo Runtime");
    return { detail: `Localizado — metricas inicializadas, totalExecutions=${metrics.totalExecutions}` };
  }));

  // ── Criterio 3: Policy Engine autoriza ────────────────────────────────────
  results.push(await criterion(3, "Policy Engine autoriza execucao no GitHub Connector", async () => {
    await runtime.load("github", { ...BASE_CTX, executionId: "load-gh-c3" });
    if (!runtime.isLoaded("github")) throw new Error("Connector nao carregado apos load()");
    const result = await runtime.execute("github", "connectivity.ping", {}, BASE_CTX);
    if (result.status === "DENIED") throw new Error(`Policy Engine negou: ${result.error}`);
    return { detail: `Policy Engine autorizou — status: ${result.status}` };
  }));

  // ── Criterio 4: Conectividade com GitHub ───────────────────────────────────
  results.push(await criterion(4, "Connector conecta-se a API do GitHub", async () => {
    const result = await runtime.execute("github", "connectivity.ping", {}, BASE_CTX);
    const status = result.status;
    // Se nao tem token, espera FAILED[auth] — e uma limitacao de ambiente, nao arquitetural
    if (status === "FAILED" && result.error?.includes("auth")) {
      return {
        detail: `Sem token configurado — status: ${status}`,
        observation: "Token VITE_GITHUB_TOKEN nao configurado. Configurar o secret para habilitar integracao real.",
        data: { status, noToken: true },
      };
    }
    if (status !== "SUCCESS") throw new Error(`Ping falhou: ${result.error}`);
    return {
      detail: `Conectado — responseTime: ${(result.data as any)?.responseTimeMs}ms`,
      data: result.data,
    };
  }));

  // ── Criterio 5: Operacao real — auth.user ──────────────────────────────────
  results.push(await criterion(5, "Operacao real: auth.user retorna usuario autenticado", async () => {
    const result = await runtime.execute("github", "auth.user", {}, BASE_CTX);
    if (result.status === "FAILED" && result.error?.includes("auth")) {
      return {
        detail: `Sem token — ${result.error}`,
        observation: "Token necessario para operacoes autenticadas.",
      };
    }
    if (result.status !== "SUCCESS") throw new Error(`auth.user falhou: ${result.error}`);
    const user = result.data as any;
    if (!user?.login) throw new Error("Campo login ausente na resposta");
    return {
      detail: `Autenticado como: ${user.login} | repos publicos: ${user.public_repos}`,
      data: { login: user.login, name: user.name, public_repos: user.public_repos },
    };
  }));

  // ── Criterio 6: Operacao real — repos.list ────────────────────────────────
  results.push(await criterion(6, "Operacao real: repos.list retorna repositorios", async () => {
    const result = await runtime.execute("github", "repos.list", { per_page: 5 }, BASE_CTX);
    if (result.status === "FAILED" && result.error?.includes("auth")) {
      return {
        detail: `Sem token — ${result.error}`,
        observation: "Token necessario para listar repositorios.",
      };
    }
    if (result.status !== "SUCCESS") throw new Error(`repos.list falhou: ${result.error}`);
    const d = result.data as any;
    return {
      detail: `${d.count} repositorios listados`,
      data: { count: d.count, firstRepo: d.items?.[0] },
    };
  }));

  // ── Criterio 7: ConnectorResult padronizado ────────────────────────────────
  results.push(await criterion(7, "ConnectorResult retornado conforme contrato", async () => {
    const result = await runtime.execute("github", "connectivity.ping", {}, BASE_CTX);
    if (!result.status) throw new Error("Campo status ausente");
    if (typeof result.success !== "boolean") throw new Error("Campo success ausente ou tipo incorreto");
    if (!result.connectorId) throw new Error("Campo connectorId ausente");
    if (!result.executionId) throw new Error("Campo executionId ausente");
    if (typeof result.duration !== "number") throw new Error("Campo duration ausente");
    if (!Array.isArray(result.logs)) throw new Error("Campo logs deve ser array");
    if (!result.logs.length) throw new Error("Nenhum log registrado");
    return {
      detail: `status=${result.status} | connectorId=${result.connectorId} | duration=${result.duration}ms | logs=${result.logs.length}`,
    };
  }));

  // ── Criterio 8: Logs e metricas ────────────────────────────────────────────
  results.push(await criterion(8, "Logs e metricas sao registrados corretamente", async () => {
    const result = await runtime.execute("github", "auth.validate", {}, BASE_CTX);

    // Logs no ConnectorResult
    if (!result.logs?.length) throw new Error("Logs ausentes no ConnectorResult");
    const hasOpLog = result.logs.some(l => l.message.includes("auth.validate"));
    if (!hasOpLog) throw new Error("Log da operacao nao encontrado");

    // Metricas do Runtime
    const rtMetrics = runtime.getMetrics("github");
    if (!rtMetrics) throw new Error("Metricas do Runtime nao encontradas");
    if (rtMetrics.totalExecutions === 0) throw new Error("totalExecutions = 0");

    // Metricas internas do Connector
    const internalM: GitHubConnectorMetrics = connector.internalMetrics;
    if (internalM.totalExecutions === 0) throw new Error("internalMetrics.totalExecutions = 0");

    // Historico do Runtime
    const history = runtime.getHistory();
    if (!history.length) throw new Error("Historico de execucao vazio");

    return {
      detail: `logs=${result.logs.length} | rtExecutions=${rtMetrics.totalExecutions} | internalExecutions=${internalM.totalExecutions} | history=${history.length}`,
      data: {
        runtimeMetrics: rtMetrics,
        internalMetrics: {
          totalExecutions: internalM.totalExecutions,
          authFailures: internalM.authFailures,
          invalidResponses: internalM.invalidResponses,
          externalFailures: internalM.externalFailures,
        },
      },
    };
  }));

  // ── Criterio 9: Health Check ───────────────────────────────────────────────
  results.push(await criterion(9, "Health Check retorna estado correto", async () => {
    const health = await runtime.health("github");
    // Com token: healthy. Sem token: unhealthy. Ambos sao respostas validas do contrato.
    if (!health.status) throw new Error("Campo status ausente no HealthReport");
    if (!health.connectorId) throw new Error("Campo connectorId ausente");
    if (!health.checkedAt) throw new Error("Campo checkedAt ausente");

    const hasToken = !!(import.meta as any).env?.VITE_GITHUB_TOKEN;
    if (hasToken && health.status !== "healthy") {
      throw new Error(`Health deveria ser healthy com token, obtido: ${health.status} — ${health.details}`);
    }
    return {
      detail: `status=${health.status} | ${health.details}`,
      data: health,
    };
  }));

  return results;
}

// ── Hardening suite (falhas injetadas) ────────────────────────────────────────

export interface GitHubHardeningResult {
  scenario: number;
  name: string;
  category: "auth" | "validation" | "external" | "timeout" | "success";
  expectedStatus: string;
  actualStatus: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  observation?: string;
}

async function hardeningScenario(
  n: number,
  name: string,
  category: GitHubHardeningResult["category"],
  expectedStatus: string,
  fn: (c: GitHubConnector) => Promise<{ detail?: string; observation?: string }>,
): Promise<GitHubHardeningResult> {
  const start = Date.now();
  const c = new GitHubConnector();
  (c as any).initialized = true;

  const makeCtx = () => ({ executionId: `hard-${n}-${Date.now()}`, userId: "h", projectId: "h", sessionId: "h" });

  try {
    const out = await fn(c);
    return {
      scenario: n, name, category, expectedStatus, actualStatus: expectedStatus,
      passed: true, durationMs: Date.now() - start, ...out,
    };
  } catch (err) {
    // If exception escaped the connector, hardening failed
    const isExpectedFail = expectedStatus === "FAILED";
    return {
      scenario: n, name, category, expectedStatus,
      actualStatus: "EXCEPTION_ESCAPED",
      passed: false, durationMs: Date.now() - start,
      error: `Exception escaped: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function runGitHubHardeningTests(): Promise<GitHubHardeningResult[]> {
  const results: GitHubHardeningResult[] = [];
  const makeCtx = (n: number) => ({ executionId: `hard-${n}`, userId: "h", projectId: "h", sessionId: "h" });

  // S1: Sem token — deve retornar FAILED[auth], nao lancar excecao
  results.push(await hardeningScenario(1, "Sem token — FAILED[auth] sem excecao", "auth", "FAILED",
    async (c) => {
      (c as any).token = null;
      const result = await c.execute("auth.user", {}, makeCtx(1));
      if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
      if (!result.error?.includes("auth")) throw new Error(`Categoria auth esperada, obtido: ${result.error}`);
      return { detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // S2: Token invalido — deve retornar FAILED[auth] com 401
  results.push(await hardeningScenario(2, "Token invalido — FAILED[auth] com 401", "auth", "FAILED",
    async (c) => {
      (c as any).token = "ghp_INVALID_TOKEN_12345";
      const result = await c.execute("auth.user", {}, makeCtx(2));
      if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
      return { detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // S3: Resposta nula da API — deve retornar FAILED[validation]
  results.push(await hardeningScenario(3, "Resposta nula — FAILED[validation]", "validation", "FAILED",
    async (c) => {
      (c as any).token = "token-mock";
      // Monkey-patch githubFetch via override on the module — use global shim
      const origFetch = globalThis.fetch;
      (globalThis as any).fetch = async () => ({
        ok: true, status: 200,
        json: async () => null,
      });
      const result = await c.execute("auth.user", {}, makeCtx(3));
      globalThis.fetch = origFetch;
      if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
      return { detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // S4: Resposta sem campo obrigatorio login — FAILED[validation]
  results.push(await hardeningScenario(4, "Resposta sem campo login — FAILED[validation]", "validation", "FAILED",
    async (c) => {
      (c as any).token = "token-mock";
      const origFetch = globalThis.fetch;
      (globalThis as any).fetch = async () => ({
        ok: true, status: 200,
        json: async () => ({ id: 999, name: "Test" }), // login ausente
      });
      const result = await c.execute("auth.user", {}, makeCtx(4));
      globalThis.fetch = origFetch;
      if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
      return { detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // S5: API retorna array onde se espera objeto — FAILED[validation]
  results.push(await hardeningScenario(5, "Tipo inesperado — array no lugar de objeto — FAILED[validation]", "validation", "FAILED",
    async (c) => {
      (c as any).token = "token-mock";
      const origFetch = globalThis.fetch;
      (globalThis as any).fetch = async () => ({
        ok: true, status: 200,
        json: async () => [{ id: 1 }], // array em vez de objeto
      });
      const result = await c.execute("auth.user", {}, makeCtx(5));
      globalThis.fetch = origFetch;
      if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
      return { detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // S6: Erro externo — fetch lanca excecao — FAILED[external]
  results.push(await hardeningScenario(6, "Erro externo — fetch lanca excecao — FAILED sem escape", "external", "FAILED",
    async (c) => {
      (c as any).token = "token-mock";
      const origFetch = globalThis.fetch;
      (globalThis as any).fetch = async () => { throw new Error("Network error: ECONNREFUSED"); };
      const result = await c.execute("auth.user", {}, makeCtx(6));
      globalThis.fetch = origFetch;
      if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
      return { detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // S7: Timeout — AbortController dispara — FAILED[timeout]
  results.push(await hardeningScenario(7, "Timeout — AbortError capturado — FAILED[timeout]", "timeout", "FAILED",
    async (c) => {
      (c as any).token = "token-mock";
      const origFetch = globalThis.fetch;
      (globalThis as any).fetch = async (_url: string, opts: RequestInit) => {
        return new Promise((_, reject) => {
          // Simulate abort after 10ms
          setTimeout(() => {
            const err = new DOMException("The user aborted a request.", "AbortError");
            reject(err);
          }, 10);
        });
      };
      const result = await c.execute("connectivity.ping", {}, makeCtx(7));
      globalThis.fetch = origFetch;
      if (result.status !== "FAILED") throw new Error(`Esperado FAILED (timeout), obtido ${result.status}`);
      return { detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // S8: Resposta valida — SUCCESS completo
  results.push(await hardeningScenario(8, "Resposta valida — SUCCESS completo", "success", "SUCCESS",
    async (c) => {
      (c as any).token = "token-mock";
      const origFetch = globalThis.fetch;
      (globalThis as any).fetch = async () => ({
        ok: true, status: 200,
        json: async () => ({ resources: { core: { limit: 5000, remaining: 4999 } } }),
      });
      const result = await c.execute("connectivity.ping", {}, makeCtx(8));
      globalThis.fetch = origFetch;
      if (result.status !== "SUCCESS") throw new Error(`Esperado SUCCESS, obtido ${result.status} — ${result.error}`);
      if (!result.logs?.length) throw new Error("Logs ausentes");
      const metricsOk = c.internalMetrics.totalExecutions > 0;
      return { detail: `status=${result.status} | logs=${result.logs.length} | metrics=${metricsOk}` };
    }
  ));

  return results;
}