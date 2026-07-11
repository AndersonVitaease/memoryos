// Base44Connector — Hardening
// Foundation v1.0 · Engineering First · v0.3.0
//
// Operacoes (apenas leitura, imutavel nesta sprint):
//   auth.me            — retorna usuario autenticado
//   auth.validate      — valida autenticacao
//   app.info           — informacoes da aplicacao
//   projects.list      — lista projetos do usuario
//   sessions.list      — lista sessoes recentes
//   connectivity.ping  — valida conectividade
//
// Hardening:
//   - Toda resposta validada antes de retornar ConnectorResult
//   - Nenhuma excecao escapa do Connector
//   - Logs expandidos: operation, validation, response time, error category
//   - Metricas internas: invalid responses, auth failures, external failures, per-op timing

import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
} from "../ConnectorTypes";
import { makeLog, makeExecutionId } from "../ConnectorTypes";

// ── SDK loader ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdk: any = null;
async function getSDK() {
  if (!_sdk) {
    const mod = await import("../../../api/base44Client.js");
    _sdk = mod.base44;
  }
  return _sdk;
}

// ── Internal metrics (used by MERS future integration) ────────────────────────

export interface Base44ConnectorMetrics {
  totalExecutions: number;
  invalidResponses: number;
  authFailures: number;
  externalFailures: number;
  perOperationMs: Record<string, number[]>;
  operationCallCount: Record<string, number>;
}

// ── Validation helpers ────────────────────────────────────────────────────────

type ValidationResult = { valid: true } | { valid: false; reason: string };

function requireObject(val: unknown, label: string): ValidationResult {
  if (val === null || val === undefined) return { valid: false, reason: `${label} is null or undefined` };
  if (typeof val !== "object" || Array.isArray(val)) return { valid: false, reason: `${label} is not an object` };
  return { valid: true };
}

function requireField(obj: Record<string, unknown>, field: string, type: string): ValidationResult {
  if (!(field in obj)) return { valid: false, reason: `Missing required field: "${field}"` };
  // eslint-disable-next-line valid-typeof
  if (typeof obj[field] !== type) return { valid: false, reason: `Field "${field}" expected ${type}, got ${typeof obj[field]}` };
  return { valid: true };
}

function requireArray(val: unknown, label: string): ValidationResult {
  if (val === null || val === undefined) return { valid: false, reason: `${label} is null or undefined` };
  if (!Array.isArray(val)) return { valid: false, reason: `${label} is not an array` };
  return { valid: true };
}

// ── Result builders ───────────────────────────────────────────────────────────

function ok<T>(
  data: T,
  start: number,
  id: string,
  eid: string,
  logs: ConnectorLog[],
  op: string,
): ConnectorResult<T> {
  const duration = Date.now() - start;
  const size = (() => { try { return JSON.stringify(data).length; } catch { return 0; } })();
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms — response size: ${size}B`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: id, executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal",
  start: number,
  id: string,
  eid: string,
  logs: ConnectorLog[],
  op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — duration: ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: id, executionId: eid, logs };
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class Base44Connector implements IConnector {
  readonly id = "base44";
  private initialized = false;
  private authenticatedUser: Record<string, unknown> | null = null;

  readonly internalMetrics: Base44ConnectorMetrics = {
    totalExecutions: 0,
    invalidResponses: 0,
    authFailures: 0,
    externalFailures: 0,
    perOperationMs: {},
    operationCallCount: {},
  };

  metadata(): ConnectorMetadata {
    return {
      id: "base44",
      name: "Base44 Connector",
      version: "0.3.0",
      description: "Base44 Connector — hardened, read-only, reference implementation",
      author: "MemoryOS",
      capabilities: [
        "auth.me", "auth.validate", "app.info",
        "projects.list", "sessions.list", "connectivity.ping",
        "test.ping", "test.echo", // compat
      ],
    };
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    try {
      const sdk = await getSDK();
      this.authenticatedUser = await sdk.auth.me();
      this.initialized = true;
    } catch (err) {
      // initialize nao propaga — connector fica em estado degraded
      this.initialized = false;
    }
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
      await sdk.auth.me();
      const email = (this.authenticatedUser as any)?.email ?? "unknown";
      return { status: "healthy", connectorId: this.id, checkedAt: Date.now(), details: `Authenticated as: ${email}` };
    } catch {
      return { status: "degraded", connectorId: this.id, checkedAt: Date.now(), details: "Auth check failed" };
    }
  }

  validate(): boolean { return true; }

  // ── Execute ─────────────────────────────────────────────────────────────────

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] Starting execution`)];

    // Track per-operation call count
    this.internalMetrics.totalExecutions++;
    this.internalMetrics.operationCallCount[operation] = (this.internalMetrics.operationCallCount[operation] ?? 0) + 1;

    try {
      const result = await this._dispatch(operation, payload, context, start, eid, logs);
      // Track per-operation timing
      const ms = result.duration;
      if (!this.internalMetrics.perOperationMs[operation]) this.internalMetrics.perOperationMs[operation] = [];
      this.internalMetrics.perOperationMs[operation].push(ms);
      return result;
    } catch (err) {
      // Safety net — nenhuma excecao escapa
      this.internalMetrics.externalFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Unhandled exception: ${msg}`, "internal", start, this.id, eid, logs, operation);
    }
  }

  private async _dispatch(
    operation: string,
    payload: Record<string, unknown>,
    _ctx: ConnectorContext,
    start: number,
    eid: string,
    logs: ConnectorLog[],
  ): Promise<ConnectorResult> {
    const sdk = await getSDK();

    switch (operation) {

      // ── auth.me ──────────────────────────────────────────────────────────────
      case "auth.me": {
        let raw: unknown;
        try {
          raw = await sdk.auth.me();
        } catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK auth.me() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }

        const vObj = requireObject(raw, "auth.me response");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, this.id, eid, logs, operation); }

        const obj = raw as Record<string, unknown>;
        const vId = requireField(obj, "id", "string");
        if (!vId.valid) { this.internalMetrics.invalidResponses++; return fail(vId.reason, "validation", start, this.id, eid, logs, operation); }

        logs.push(makeLog("info", `[${operation}] Validation OK — user: ${obj.email ?? "?"}`));
        return ok({ id: obj.id, email: obj.email, full_name: obj.full_name, role: obj.role }, start, this.id, eid, logs, operation);
      }

      // ── auth.validate ─────────────────────────────────────────────────────────
      case "auth.validate": {
        let authed: unknown;
        try {
          authed = await sdk.auth.isAuthenticated();
        } catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK isAuthenticated() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }

        if (typeof authed !== "boolean") {
          this.internalMetrics.invalidResponses++;
          return fail(`isAuthenticated() returned unexpected type: ${typeof authed}`, "validation", start, this.id, eid, logs, operation);
        }
        if (!authed) {
          this.internalMetrics.authFailures++;
          logs.push(makeLog("warn", `[${operation}] User is not authenticated`));
          return fail("User is not authenticated", "auth", start, this.id, eid, logs, operation);
        }
        logs.push(makeLog("info", `[${operation}] Validation OK — authenticated`));
        return ok({ authenticated: true }, start, this.id, eid, logs, operation);
      }

      // ── app.info ─────────────────────────────────────────────────────────────
      case "app.info": {
        let user: unknown;
        try {
          user = await sdk.auth.me();
        } catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK auth.me() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }

        const vObj = requireObject(user, "app.info user");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, this.id, eid, logs, operation); }

        const u = user as Record<string, unknown>;
        logs.push(makeLog("info", `[${operation}] Validation OK`));
        return ok({
          connector: this.metadata(),
          user: { id: u.id, role: u.role },
          runtimeInitialized: this.initialized,
          timestamp: Date.now(),
        }, start, this.id, eid, logs, operation);
      }

      // ── projects.list ─────────────────────────────────────────────────────────
      case "projects.list": {
        const limit = typeof payload.limit === "number" && payload.limit > 0 ? payload.limit : 10;
        let projects: unknown;
        try {
          projects = await sdk.entities.Project.list("-updated_date", limit);
        } catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK Project.list() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }

        const vArr = requireArray(projects, "projects response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, this.id, eid, logs, operation); }

        const arr = projects as Record<string, unknown>[];
        logs.push(makeLog("info", `[${operation}] Validation OK — ${arr.length} items — response size: ${JSON.stringify(arr).length}B`));
        return ok({
          count: arr.length,
          items: arr.map(p => ({ id: p.id, name: p.name, type: p.type })),
        }, start, this.id, eid, logs, operation);
      }

      // ── sessions.list ─────────────────────────────────────────────────────────
      case "sessions.list": {
        const limit = typeof payload.limit === "number" && payload.limit > 0 ? payload.limit : 5;
        let sessions: unknown;
        try {
          sessions = await sdk.entities.ChatSession.list("-updated_date", limit);
        } catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK ChatSession.list() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }

        const vArr = requireArray(sessions, "sessions response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, this.id, eid, logs, operation); }

        const arr = sessions as Record<string, unknown>[];
        logs.push(makeLog("info", `[${operation}] Validation OK — ${arr.length} items`));
        return ok({
          count: arr.length,
          items: arr.map(s => ({ id: s.id, title: s.title, status: s.status })),
        }, start, this.id, eid, logs, operation);
      }

      // ── connectivity.ping ─────────────────────────────────────────────────────
      case "connectivity.ping": {
        let authed: unknown;
        try {
          authed = await sdk.auth.isAuthenticated();
        } catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK isAuthenticated() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }

        if (typeof authed !== "boolean") {
          this.internalMetrics.invalidResponses++;
          return fail(`Unexpected connectivity response type: ${typeof authed}`, "validation", start, this.id, eid, logs, operation);
        }
        logs.push(makeLog("info", `[${operation}] Validation OK — connected, authenticated: ${authed}`));
        return ok({ pong: true, authenticated: authed, timestamp: Date.now() }, start, this.id, eid, logs, operation);
      }

      // ── compat ────────────────────────────────────────────────────────────────
      case "test.ping":
        logs.push(makeLog("info", `[${operation}] compat`));
        return ok({ pong: true }, start, this.id, eid, logs, operation);

      case "test.echo":
        logs.push(makeLog("info", `[${operation}] compat`));
        return ok({ echo: payload }, start, this.id, eid, logs, operation);

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, this.id, eid, logs, operation);
    }
  }
}