// Base44Connector — Primeira Implementacao Real
// Foundation v1.0 · Engineering First
//
// Sprint: Base44 Connector — Validacao em Ambiente Real
// Objetivo: provar que o Connector Runtime integra-se com um sistema externo real.
//
// Operacoes implementadas (apenas leitura):
//   auth.me            — retorna usuario autenticado
//   auth.validate      — valida autenticacao
//   app.info           — informacoes da aplicacao
//   projects.list      — lista projetos do usuario
//   sessions.list      — lista sessoes recentes
//   connectivity.ping  — valida conectividade

import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
} from "../ConnectorTypes";
import { makeLog, makeExecutionId } from "../ConnectorTypes";

// Base44 SDK — pre-inicializado, sem criar novo cliente
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdk: any = null;
async function getSDK() {
  if (!_sdk) {
    const mod = await import("../../../api/base44Client.js");
    _sdk = mod.base44;
  }
  return _sdk;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok<T>(data: T, start: number, connectorId: string, executionId: string, logs: ReturnType<typeof makeLog>[]): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId, executionId, logs };
}

function fail(error: string, start: number, connectorId: string, executionId: string, logs: ReturnType<typeof makeLog>[]): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", error));
  return { status: "FAILED", success: false, error, duration, connectorId, executionId, logs };
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class Base44Connector implements IConnector {
  readonly id = "base44";
  private initialized = false;
  private authenticatedUser: Record<string, unknown> | null = null;

  metadata(): ConnectorMetadata {
    return {
      id: "base44",
      name: "Base44 Connector",
      version: "0.2.0",
      description: "Connector real para a plataforma Base44 — operacoes de leitura",
      author: "MemoryOS",
      capabilities: [
        "auth.me",
        "auth.validate",
        "app.info",
        "projects.list",
        "sessions.list",
        "connectivity.ping",
        // Mantidos para compatibilidade com testes de validacao do runtime
        "test.ping",
        "test.echo",
      ],
    };
  }

  async initialize(context: ConnectorContext): Promise<void> {
    const sdk = await getSDK();
    // Valida conectividade e autenticacao durante inicializacao
    this.authenticatedUser = await sdk.auth.me();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.authenticatedUser = null;
  }

  async health(): Promise<ConnectorHealthReport> {
    if (!this.initialized) {
      return { status: "unhealthy", connectorId: this.id, checkedAt: Date.now(), details: "Not initialized" };
    }
    try {
      const sdk = await getSDK();
      // Health check real: tenta chamar me() para verificar conectividade
      await sdk.auth.me();
      return { status: "healthy", connectorId: this.id, checkedAt: Date.now(), details: `Authenticated as: ${(this.authenticatedUser as any)?.email ?? "unknown"}` };
    } catch {
      return { status: "degraded", connectorId: this.id, checkedAt: Date.now(), details: "Auth check failed" };
    }
  }

  validate(): boolean {
    return true; // configuracao sem segredos externos — usa SDK pre-inicializado
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs = [makeLog("info", `Base44Connector executing "${operation}"`)];
    const sdk = await getSDK();

    switch (operation) {

      // ── Autenticacao ──────────────────────────────────────────────────────────

      case "auth.me": {
        const user = await sdk.auth.me();
        logs.push(makeLog("info", `User retrieved: ${user?.email ?? "anonymous"}`));
        return ok({ id: user?.id, email: user?.email, full_name: user?.full_name, role: user?.role }, start, this.id, eid, logs);
      }

      case "auth.validate": {
        const authed = await sdk.auth.isAuthenticated();
        logs.push(makeLog("info", `Authentication status: ${authed}`));
        if (!authed) return fail("User is not authenticated", start, this.id, eid, logs);
        return ok({ authenticated: true }, start, this.id, eid, logs);
      }

      // ── Aplicacao ─────────────────────────────────────────────────────────────

      case "app.info": {
        // Informacoes da aplicacao via usuario autenticado + metadados do connector
        const user = await sdk.auth.me();
        logs.push(makeLog("info", "App info retrieved via auth context"));
        return ok({
          connector: this.metadata(),
          user: { id: user?.id, role: user?.role },
          runtimeInitialized: this.initialized,
          timestamp: Date.now(),
        }, start, this.id, eid, logs);
      }

      // ── Dados ─────────────────────────────────────────────────────────────────

      case "projects.list": {
        const limit = typeof payload.limit === "number" ? payload.limit : 10;
        const projects = await sdk.entities.Project.list("-updated_date", limit);
        logs.push(makeLog("info", `Retrieved ${projects.length} projects`));
        return ok({ count: projects.length, items: projects.map((p: any) => ({ id: p.id, name: p.name, type: p.type })) }, start, this.id, eid, logs);
      }

      case "sessions.list": {
        const limit = typeof payload.limit === "number" ? payload.limit : 5;
        const sessions = await sdk.entities.ChatSession.list("-updated_date", limit);
        logs.push(makeLog("info", `Retrieved ${sessions.length} sessions`));
        return ok({ count: sessions.length, items: sessions.map((s: any) => ({ id: s.id, title: s.title, status: s.status })) }, start, this.id, eid, logs);
      }

      // ── Conectividade ─────────────────────────────────────────────────────────

      case "connectivity.ping": {
        // Ping real: valida que o SDK responde
        const authed = await sdk.auth.isAuthenticated();
        logs.push(makeLog("info", `Connectivity OK — authenticated: ${authed}`));
        return ok({ pong: true, authenticated: authed, timestamp: Date.now() }, start, this.id, eid, logs);
      }

      // ── Compatibilidade runtime tests ─────────────────────────────────────────

      case "test.ping":
        logs.push(makeLog("info", "test.ping (compat)"));
        return ok({ pong: true }, start, this.id, eid, logs);

      case "test.echo":
        logs.push(makeLog("info", "test.echo (compat)"));
        return ok({ echo: payload }, start, this.id, eid, logs);

      default:
        return fail(`Unknown operation: "${operation}"`, start, this.id, eid, logs);
    }
  }
}