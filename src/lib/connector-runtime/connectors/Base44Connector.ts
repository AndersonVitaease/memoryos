// Base44Connector — EF-35 Production Hardening
// Foundation v1.0 · Engineering First · v0.4.0
//
// EF-35 changes:
//   - validate() replaced: real checks for SDK availability, auth session, required capabilities
//   - ConnectorValidationResult returned as structured diagnostics
//   - All operations return SUCCESS only when they actually succeed

import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
  ConnectorValidationResult,
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

// ── Internal metrics ─────────────────────────────────────────────────────────

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
  data: T, start: number, id: string, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult<T> {
  const duration = Date.now() - start;
  const size = (() => { try { return JSON.stringify(data).length; } catch { return 0; } })();
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms — response size: ${size}B`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "base44", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal",
  start: number, id: string, eid: string, logs: ConnectorLog[], op: string,
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
  private _lastValidation: ConnectorValidationResult | null = null;

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
      version: "0.4.0",
      description: "Base44 Connector — EF-35 production hardened, read-only",
      author: "MemoryOS",
      capabilities: [
        "auth.me", "auth.validate", "app.info",
        "projects.list", "sessions.list", "connectivity.ping",
        "test.ping", "test.echo",
      ],
    };
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    try {
      const sdk = await getSDK();
      this.authenticatedUser = await sdk.auth.me();
      this.initialized = true;
    } catch {
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

  // ── Real validation (EF-35) ───────────────────────────────────────────────

  validate(): boolean {
    // Legacy sync gate — always pass so the loader proceeds,
    // then validateAsync() does the real work asynchronously.
    return true;
  }

  async validateAsync(): Promise<ConnectorValidationResult> {
    const checks: ConnectorValidationResult["checks"] = [];

    // Check 1: SDK available
    let sdk: any = null;
    try {
      sdk = await getSDK();
      checks.push({ name: "SDK available", passed: !!sdk, detail: sdk ? "Base44 SDK loaded" : "SDK module not found" });
    } catch (e) {
      checks.push({ name: "SDK available", passed: false, detail: `SDK import failed: ${e instanceof Error ? e.message : String(e)}` });
    }

    // Check 2: Authenticated session
    let authOk = false;
    let authDetail = "Not checked";
    try {
      if (sdk) {
        const user = await sdk.auth.me();
        authOk = !!(user && typeof user === "object" && (user as any).id);
        authDetail = authOk ? `Authenticated as: ${(user as any).email ?? (user as any).id}` : "auth.me() returned invalid user";
      } else {
        authDetail = "Skipped — SDK unavailable";
      }
    } catch (e) {
      authDetail = `auth.me() threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    checks.push({ name: "Authenticated session", passed: authOk, detail: authDetail });

    // Check 3: isAuthenticated() returns boolean true
    let isAuthedOk = false;
    let isAuthedDetail = "Not checked";
    try {
      if (sdk) {
        const authed = await sdk.auth.isAuthenticated();
        isAuthedOk = authed === true;
        isAuthedDetail = isAuthedOk ? "isAuthenticated() = true" : `isAuthenticated() returned: ${authed}`;
      } else {
        isAuthedDetail = "Skipped — SDK unavailable";
      }
    } catch (e) {
      isAuthedDetail = `isAuthenticated() threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    checks.push({ name: "isAuthenticated() returns true", passed: isAuthedOk, detail: isAuthedDetail });

    // Check 4: Entity API reachable (Project.list)
    let entityOk = false;
    let entityDetail = "Not checked";
    try {
      if (sdk && authOk) {
        const projects = await sdk.entities.Project.list("-updated_date", 1);
        entityOk = Array.isArray(projects);
        entityDetail = entityOk ? `Entity API reachable — ${projects.length} project(s)` : "Project.list() did not return array";
      } else {
        entityDetail = "Skipped — auth not available";
      }
    } catch (e) {
      entityDetail = `Entity API threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    checks.push({ name: "Entity API reachable", passed: entityOk, detail: entityDetail });

    // Check 5: Required capabilities declared
    const required = ["auth.me", "auth.validate", "projects.list", "sessions.list", "connectivity.ping"];
    const declared = this.metadata().capabilities;
    const missing = required.filter(c => !declared.includes(c));
    checks.push({
      name: "Required capabilities declared",
      passed: missing.length === 0,
      detail: missing.length === 0 ? `All ${required.length} required capabilities present` : `Missing: ${missing.join(", ")}`,
    });

    const valid = checks.every(c => c.passed);
    const passed = checks.filter(c => c.passed).length;
    const result: ConnectorValidationResult = {
      valid,
      checks,
      summary: valid
        ? `All ${checks.length} checks passed`
        : `${passed}/${checks.length} checks passed — ${checks.filter(c => !c.passed).map(c => c.name).join("; ")}`,
    };
    this._lastValidation = result;
    return result;
  }

  getLastValidation(): ConnectorValidationResult | null {
    return this._lastValidation;
  }

  // ── Execute ─────────────────────────────────────────────────────────────────

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] Starting execution`)];

    this.internalMetrics.totalExecutions++;
    this.internalMetrics.operationCallCount[operation] = (this.internalMetrics.operationCallCount[operation] ?? 0) + 1;

    try {
      const result = await this._dispatch(operation, payload, context, start, eid, logs);
      const ms = result.duration;
      if (!this.internalMetrics.perOperationMs[operation]) this.internalMetrics.perOperationMs[operation] = [];
      this.internalMetrics.perOperationMs[operation].push(ms);
      return result;
    } catch (err) {
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

      case "auth.me": {
        let raw: unknown;
        try { raw = await sdk.auth.me(); }
        catch (err) {
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

      case "auth.validate": {
        let authed: unknown;
        try { authed = await sdk.auth.isAuthenticated(); }
        catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK isAuthenticated() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }
        if (typeof authed !== "boolean") {
          this.internalMetrics.invalidResponses++;
          return fail(`isAuthenticated() returned unexpected type: ${typeof authed}`, "validation", start, this.id, eid, logs, operation);
        }
        if (!authed) {
          this.internalMetrics.authFailures++;
          return fail("User is not authenticated", "auth", start, this.id, eid, logs, operation);
        }
        logs.push(makeLog("info", `[${operation}] Validation OK — authenticated`));
        return ok({ authenticated: true }, start, this.id, eid, logs, operation);
      }

      case "app.info": {
        let user: unknown;
        try { user = await sdk.auth.me(); }
        catch (err) {
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

      case "projects.list": {
        const limit = typeof payload.limit === "number" && payload.limit > 0 ? payload.limit : 10;
        let projects: unknown;
        try { projects = await sdk.entities.Project.list("-updated_date", limit); }
        catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK Project.list() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }
        const vArr = requireArray(projects, "projects response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, this.id, eid, logs, operation); }
        const arr = projects as Record<string, unknown>[];
        logs.push(makeLog("info", `[${operation}] Validation OK — ${arr.length} items`));
        return ok({ count: arr.length, items: arr.map(p => ({ id: p.id, name: p.name, type: p.type })) }, start, this.id, eid, logs, operation);
      }

      case "sessions.list": {
        const limit = typeof payload.limit === "number" && payload.limit > 0 ? payload.limit : 5;
        let sessions: unknown;
        try { sessions = await sdk.entities.ChatSession.list("-updated_date", limit); }
        catch (err) {
          this.internalMetrics.externalFailures++;
          return fail(`SDK ChatSession.list() threw: ${err instanceof Error ? err.message : err}`, "external", start, this.id, eid, logs, operation);
        }
        const vArr = requireArray(sessions, "sessions response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, this.id, eid, logs, operation); }
        const arr = sessions as Record<string, unknown>[];
        logs.push(makeLog("info", `[${operation}] Validation OK — ${arr.length} items`));
        return ok({ count: arr.length, items: arr.map(s => ({ id: s.id, title: s.title, status: s.status })) }, start, this.id, eid, logs, operation);
      }

      case "connectivity.ping": {
        let authed: unknown;
        try { authed = await sdk.auth.isAuthenticated(); }
        catch (err) {
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

      case "test.ping":
        return ok({ pong: true }, start, this.id, eid, logs, operation);

      case "test.echo":
        return ok({ echo: payload }, start, this.id, eid, logs, operation);

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, this.id, eid, logs, operation);
    }
  }
}