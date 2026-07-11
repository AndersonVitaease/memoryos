// GitHubConnector — Sprint: Primeira Implementacao Real
// Foundation v1.0 · Engineering First · v1.0.0
//
// Operacoes (apenas leitura):
//   auth.user          — retorna usuario autenticado (GET /user)
//   auth.validate      — valida token de autenticacao
//   repos.list         — lista repositorios do usuario
//   repos.get          — retorna dados de um repositorio especifico
//   repos.branches     — lista branches de um repositorio
//   connectivity.ping  — valida conectividade com a API do GitHub
//
// Hardening (padrao Base44Connector):
//   - Toda resposta validada antes de construir ConnectorResult
//   - Nenhuma excecao escapa do Connector
//   - Logs expandidos: executionId, connectorId, operation, status, duration, responseTime, errorCategory
//   - Metricas internas: totalExecutions, avgResponseMs, authFailures, invalidResponses, externalFailures, timeouts

import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
} from "../ConnectorTypes";
import { makeLog, makeExecutionId } from "../ConnectorTypes";

// ── Constants ─────────────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 8000;

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface GitHubConnectorMetrics {
  totalExecutions: number;
  authFailures: number;
  invalidResponses: number;
  externalFailures: number;
  timeouts: number;
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
  eid: string,
  logs: ConnectorLog[],
  op: string,
): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "github", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal" | "timeout",
  start: number,
  eid: string,
  logs: ConnectorLog[],
  op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "github", executionId: eid, logs };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface FetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  responseTimeMs: number;
  error?: string;
}

async function githubFetch(
  path: string,
  token: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchResult> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const responseTimeMs = Date.now() - t0;

    let data: unknown = null;
    try { data = await res.json(); } catch { /* empty response */ }

    return { ok: res.ok, status: res.status, data, responseTimeMs };
  } catch (err) {
    clearTimeout(timer);
    const responseTimeMs = Date.now() - t0;
    const isAbort = (err as Error).name === "AbortError";
    return { ok: false, status: 0, data: null, responseTimeMs, error: isAbort ? "Request timed out" : (err as Error).message };
  }
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class GitHubConnector implements IConnector {
  readonly id = "github";
  private token: string | null = null;
  private initialized = false;
  private authenticatedUser: Record<string, unknown> | null = null;

  readonly internalMetrics: GitHubConnectorMetrics = {
    totalExecutions: 0,
    authFailures: 0,
    invalidResponses: 0,
    externalFailures: 0,
    timeouts: 0,
    perOperationMs: {},
    operationCallCount: {},
  };

  metadata(): ConnectorMetadata {
    return {
      id: "github",
      name: "GitHub Connector",
      version: "1.0.0",
      description: "GitHub Connector — read-only, Engineering First Sprint, Foundation v1.0",
      author: "MemoryOS",
      capabilities: [
        "auth.user", "auth.validate",
        "repos.list", "repos.get", "repos.branches",
        "connectivity.ping",
      ],
    };
  }

  validate(): boolean { return true; }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    try {
      // Resolve token from environment (injected via globalThis by Base44 secrets)
      const tok = (globalThis as any).__GITHUB_TOKEN__
        ?? (globalThis as any).__env__?.GITHUB_TOKEN
        ?? null;
      this.token = tok;

      if (this.token) {
        const res = await githubFetch("/user", this.token);
        if (res.ok && res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
          this.authenticatedUser = res.data as Record<string, unknown>;
          this.initialized = true;
          return;
        }
      }
      // No token or auth failed — initialized in degraded mode
      this.initialized = false;
    } catch {
      this.initialized = false;
    }
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.authenticatedUser = null;
    this.token = null;
  }

  async health(): Promise<ConnectorHealthReport> {
    if (!this.token) {
      return { status: "unhealthy", connectorId: this.id, checkedAt: Date.now(), details: "No token configured" };
    }
    try {
      const res = await githubFetch("/user", this.token);
      if (res.ok) {
        const login = (res.data as any)?.login ?? "unknown";
        return { status: "healthy", connectorId: this.id, checkedAt: Date.now(), details: `Authenticated as: ${login}` };
      }
      if (res.status === 401) {
        return { status: "unhealthy", connectorId: this.id, checkedAt: Date.now(), details: "Token invalid or expired" };
      }
      return { status: "degraded", connectorId: this.id, checkedAt: Date.now(), details: `GitHub API returned ${res.status}` };
    } catch {
      return { status: "degraded", connectorId: this.id, checkedAt: Date.now(), details: "Health check failed" };
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────────

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [
      makeLog("info", `[${operation}] executionId=${eid} connectorId=${this.id} Starting`),
    ];

    this.internalMetrics.totalExecutions++;
    this.internalMetrics.operationCallCount[operation] = (this.internalMetrics.operationCallCount[operation] ?? 0) + 1;

    try {
      const result = await this._dispatch(operation, payload, start, eid, logs);
      const ms = result.duration;
      if (!this.internalMetrics.perOperationMs[operation]) this.internalMetrics.perOperationMs[operation] = [];
      this.internalMetrics.perOperationMs[operation].push(ms);
      return result;
    } catch (err) {
      this.internalMetrics.externalFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Unhandled exception: ${msg}`, "internal", start, eid, logs, operation);
    }
  }

  private getToken(): string | null {
    return (globalThis as any).__GITHUB_TOKEN__
      ?? (globalThis as any).__env__?.GITHUB_TOKEN
      ?? this.token
      ?? null;
  }

  private async _dispatch(
    operation: string,
    payload: Record<string, unknown>,
    start: number,
    eid: string,
    logs: ConnectorLog[],
  ): Promise<ConnectorResult> {
    const token = this.getToken();

    // Token required for all operations except connectivity.ping (which validates it exists)
    if (!token && operation !== "connectivity.ping") {
      this.internalMetrics.authFailures++;
      return fail("No GitHub token configured. Set VITE_GITHUB_TOKEN secret.", "auth", start, eid, logs, operation);
    }

    switch (operation) {

      // ── connectivity.ping ─────────────────────────────────────────────────
      case "connectivity.ping": {
        if (!token) {
          this.internalMetrics.authFailures++;
          logs.push(makeLog("warn", `[${operation}] No token — connectivity check without auth`));
          return fail("No token configured", "auth", start, eid, logs, operation);
        }
        const res = await githubFetch("/rate_limit", token);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) {
          this.internalMetrics.timeouts++;
          return fail("Request timed out", "timeout", start, eid, logs, operation);
        }
        if (!res.ok) {
          this.internalMetrics.externalFailures++;
          return fail(`GitHub API returned ${res.status}`, "external", start, eid, logs, operation);
        }
        const vObj = requireObject(res.data, "rate_limit response");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, eid, logs, operation); }
        const d = res.data as Record<string, unknown>;
        const rate = (d.rate ?? d.resources) as any;
        logs.push(makeLog("info", `[${operation}] Validation OK — connected`));
        return ok({ pong: true, authenticated: true, responseTimeMs: res.responseTimeMs, rateLimit: rate }, start, eid, logs, operation);
      }

      // ── auth.user ─────────────────────────────────────────────────────────
      case "auth.user": {
        const res = await githubFetch("/user", token!);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid or expired (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }

        const vObj = requireObject(res.data, "user response");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, eid, logs, operation); }
        const u = res.data as Record<string, unknown>;
        const vLogin = requireField(u, "login", "string");
        if (!vLogin.valid) { this.internalMetrics.invalidResponses++; return fail(vLogin.reason, "validation", start, eid, logs, operation); }
        const vId = requireField(u, "id", "number");
        if (!vId.valid) { this.internalMetrics.invalidResponses++; return fail(vId.reason, "validation", start, eid, logs, operation); }

        logs.push(makeLog("info", `[${operation}] Validation OK — login: ${u.login}`));
        return ok({
          id: u.id, login: u.login, name: u.name,
          email: u.email, avatar_url: u.avatar_url,
          public_repos: u.public_repos, followers: u.followers,
        }, start, eid, logs, operation);
      }

      // ── auth.validate ─────────────────────────────────────────────────────
      case "auth.validate": {
        const res = await githubFetch("/user", token!);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid or expired (401)", "auth", start, eid, logs, operation); }
        if (res.status === 403) { this.internalMetrics.authFailures++; return fail("Token lacks required scopes (403)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }

        const vObj = requireObject(res.data, "auth.validate response");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, eid, logs, operation); }
        const u = res.data as Record<string, unknown>;
        const vLogin = requireField(u, "login", "string");
        if (!vLogin.valid) { this.internalMetrics.invalidResponses++; return fail(vLogin.reason, "validation", start, eid, logs, operation); }

        logs.push(makeLog("info", `[${operation}] Validation OK — token valid for: ${u.login}`));
        return ok({ authenticated: true, login: u.login }, start, eid, logs, operation);
      }

      // ── repos.list ────────────────────────────────────────────────────────
      case "repos.list": {
        const perPage = typeof payload.per_page === "number" ? payload.per_page : 10;
        const sort = typeof payload.sort === "string" ? payload.sort : "updated";
        const res = await githubFetch(`/user/repos?per_page=${perPage}&sort=${sort}&affiliation=owner,collaborator`, token!);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }

        const vArr = requireArray(res.data, "repos response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, eid, logs, operation); }

        const repos = res.data as Record<string, unknown>[];
        logs.push(makeLog("info", `[${operation}] Validation OK — ${repos.length} repos`));
        return ok({
          count: repos.length,
          items: repos.map(r => ({
            id: r.id, name: r.name, full_name: r.full_name,
            private: r.private, language: r.language,
            default_branch: r.default_branch,
            stargazers_count: r.stargazers_count,
            updated_at: r.updated_at,
          })),
        }, start, eid, logs, operation);
      }

      // ── repos.get ─────────────────────────────────────────────────────────
      case "repos.get": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail(`payload.owner and payload.repo are required`, "validation", start, eid, logs, operation);

        const res = await githubFetch(`/repos/${owner}/${repo}`, token!);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }

        const vObj = requireObject(res.data, "repo response");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, eid, logs, operation); }
        const r = res.data as Record<string, unknown>;
        const vName = requireField(r, "name", "string");
        if (!vName.valid) { this.internalMetrics.invalidResponses++; return fail(vName.reason, "validation", start, eid, logs, operation); }

        logs.push(makeLog("info", `[${operation}] Validation OK — ${r.full_name}`));
        return ok({
          id: r.id, name: r.name, full_name: r.full_name,
          description: r.description, private: r.private,
          language: r.language, default_branch: r.default_branch,
          stargazers_count: r.stargazers_count, forks_count: r.forks_count,
          open_issues_count: r.open_issues_count, updated_at: r.updated_at,
        }, start, eid, logs, operation);
      }

      // ── repos.branches ────────────────────────────────────────────────────
      case "repos.branches": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail(`payload.owner and payload.repo are required`, "validation", start, eid, logs, operation);

        const res = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=30`, token!);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }

        const vArr = requireArray(res.data, "branches response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, eid, logs, operation); }

        const branches = res.data as Record<string, unknown>[];
        logs.push(makeLog("info", `[${operation}] Validation OK — ${branches.length} branches`));
        return ok({
          count: branches.length,
          items: branches.map(b => ({
            name: b.name,
            protected: b.protected,
            sha: (b.commit as any)?.sha,
          })),
        }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }
}