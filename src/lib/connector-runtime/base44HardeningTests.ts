// Base44 Connector — Hardening Test Suite
// Foundation v1.0 · Engineering First · v0.3.0
//
// Cenarios: resposta nula, incompleta, campo ausente, tipo inesperado,
//           timeout, erro de autenticacao, erro interno, resposta valida.
// Todos devem produzir ConnectorResult consistente — nenhuma excecao pode escapar.

import { Base44Connector } from "./connectors/Base44Connector";
import type { ConnectorContext, ConnectorResult } from "./ConnectorTypes";
import { makeExecutionId } from "./ConnectorTypes";

export interface HardeningTestResult {
  scenario: number;
  name: string;
  category: "validation" | "auth" | "external" | "internal" | "success";
  expectedStatus: string;
  actualStatus: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  observation?: string;
  internalMetricsSnapshot?: Record<string, unknown>;
}

const BASE_CTX: ConnectorContext = {
  executionId: makeExecutionId(),
  userId: "hardening-user",
  projectId: "hardening-project",
  sessionId: "hardening-session",
};

function ctx(): ConnectorContext {
  return { ...BASE_CTX, executionId: makeExecutionId() };
}

// ── Scenario runner ───────────────────────────────────────────────────────────

async function scenario(
  n: number,
  name: string,
  category: HardeningTestResult["category"],
  expectedStatus: string,
  fn: (connector: Base44Connector) => Promise<{ detail?: string; observation?: string; result: ConnectorResult }>,
): Promise<HardeningTestResult> {
  const start = Date.now();
  const connector = new Base44Connector();
  (connector as any).initialized = true;

  try {
    const { detail, observation, result } = await fn(connector);
    const passed = result.status === expectedStatus;
    const snap = { ...connector.internalMetrics };
    return {
      scenario: n, name, category, expectedStatus,
      actualStatus: result.status,
      passed,
      durationMs: Date.now() - start,
      detail: detail ?? result.error,
      observation,
      internalMetricsSnapshot: snap,
    };
  } catch (err) {
    return {
      scenario: n, name, category, expectedStatus,
      actualStatus: "EXCEPTION_ESCAPED",
      passed: false,
      durationMs: Date.now() - start,
      error: `Exception escaped connector: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── SDK patch helper — patches the live base44Client module object ────────────
// base44Client exports a singleton `base44` object; we mutate its methods
// temporarily to inject faults, then restore. This works because ESM singletons
// share the same reference across imports within the same module graph.

async function getSDKMod() {
  // Use the @/ alias path that Vite resolves correctly
  const mod = await import("@/api/base44Client");
  return (mod as any).base44;
}

// ── Test suite ────────────────────────────────────────────────────────────────

export async function runBase44HardeningTests(): Promise<HardeningTestResult[]> {
  const results: HardeningTestResult[] = [];

  // ── Cenario 1: Resposta nula ──────────────────────────────────────────────
  results.push(await scenario(1, "Resposta nula — auth.me retorna null", "validation", "FAILED",
    async (c) => {
      const sdk = await getSDKMod();
      const orig = sdk.auth.me;
      sdk.auth.me = async () => null;
      const result = await c.execute("auth.me", {}, ctx());
      sdk.auth.me = orig;
      return { result, detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // ── Cenario 2: Resposta incompleta — objeto sem campo id ──────────────────
  results.push(await scenario(2, "Resposta incompleta — auth.me sem campo id", "validation", "FAILED",
    async (c) => {
      const sdk = await getSDKMod();
      const orig = sdk.auth.me;
      sdk.auth.me = async () => ({ email: "test@test.com" }); // id ausente
      const result = await c.execute("auth.me", {}, ctx());
      sdk.auth.me = orig;
      return { result, detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // ── Cenario 3: Campo obrigatorio ausente — projects.list retorna objeto ────
  results.push(await scenario(3, "Campo obrigatorio ausente — projects.list retorna objeto", "validation", "FAILED",
    async (c) => {
      const sdk = await getSDKMod();
      const orig = sdk.entities.Project.list;
      sdk.entities.Project.list = async () => ({ data: [] }); // objeto em vez de array
      const result = await c.execute("projects.list", {}, ctx());
      sdk.entities.Project.list = orig;
      return { result, detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // ── Cenario 4: Tipo inesperado — isAuthenticated retorna string ───────────
  results.push(await scenario(4, "Tipo inesperado — auth.validate retorna string", "validation", "FAILED",
    async (c) => {
      const sdk = await getSDKMod();
      const orig = sdk.auth.isAuthenticated;
      sdk.auth.isAuthenticated = async () => "yes"; // string em vez de boolean
      const result = await c.execute("auth.validate", {}, ctx());
      sdk.auth.isAuthenticated = orig;
      return { result, detail: `status=${result.status} error=${result.error}` };
    }
  ));

  // ── Cenario 5: Erro externo — SDK lanca excecao (simula timeout) ──────────
  results.push(await scenario(5, "Erro externo — SDK lanca excecao (simula timeout)", "external", "FAILED",
    async (c) => {
      const sdk = await getSDKMod();
      const orig = sdk.auth.me;
      sdk.auth.me = async () => { throw new Error("Timeout after 100ms"); };
      const result = await c.execute("auth.me", {}, ctx());
      sdk.auth.me = orig;
      return {
        result,
        detail: `status=${result.status} error=${result.error}`,
        observation: result.status !== "FAILED"
          ? `Esperado FAILED para erro externo, obtido ${result.status}` : undefined,
      };
    }
  ));

  // ── Cenario 6: Erro de autenticacao ───────────────────────────────────────
  results.push(await scenario(6, "Erro de autenticacao — isAuthenticated retorna false", "auth", "FAILED",
    async (c) => {
      const sdk = await getSDKMod();
      const orig = sdk.auth.isAuthenticated;
      sdk.auth.isAuthenticated = async () => false;
      const result = await c.execute("auth.validate", {}, ctx());
      sdk.auth.isAuthenticated = orig;
      const authTracked = (c as any).internalMetrics.authFailures > 0;
      return { result, detail: `status=${result.status} | authFailures tracked: ${authTracked}` };
    }
  ));

  // ── Cenario 7: Erro interno da API ────────────────────────────────────────
  results.push(await scenario(7, "Erro interno da API — SDK lanca excecao inesperada", "external", "FAILED",
    async (c) => {
      const sdk = await getSDKMod();
      const orig = sdk.entities.ChatSession.list;
      sdk.entities.ChatSession.list = async () => { throw new Error("Internal Server Error 500"); };
      const result = await c.execute("sessions.list", {}, ctx());
      sdk.entities.ChatSession.list = orig;
      const extTracked = (c as any).internalMetrics.externalFailures > 0;
      return { result, detail: `status=${result.status} | externalFailures tracked: ${extTracked}` };
    }
  ));

  // ── Cenario 8: Resposta valida — fluxo completo ───────────────────────────
  results.push(await scenario(8, "Resposta valida — connectivity.ping bem-sucedido", "success", "SUCCESS",
    async (c) => {
      const result = await c.execute("connectivity.ping", {}, ctx());
      const logOk = (result.logs ?? []).some(l => l.message.includes("Validation OK"));
      return {
        result,
        detail: `status=${result.status} | duration=${result.duration}ms | validationLogPresent=${logOk} | logs=${result.logs?.length}`,
      };
    }
  ));

  return results;
}

// ── Metrics summary helper ────────────────────────────────────────────────────

export function summarizeHardeningMetrics(results: HardeningTestResult[]): {
  totalScenarios: number;
  passed: number;
  failed: number;
  exceptionsEscaped: number;
  byCategory: Record<string, number>;
} {
  return {
    totalScenarios: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    exceptionsEscaped: results.filter(r => r.actualStatus === "EXCEPTION_ESCAPED").length,
    byCategory: results.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}