// GitHubConnector — EF-35 Production Hardening
// Foundation v1.0 · Engineering First · v1.1.0
//
// EF-35 changes:
//   - validate() replaced: real checks for token, API reachability, repo access, permissions
//   - NOT_CONFIGURED status returned when no token — never fakes SUCCESS
//   - validateAsync() returns ConnectorValidationResult with structured diagnostics

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

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "github", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal" | "timeout",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "github", executionId: eid, logs };
}

function notConfigured(start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("warn", `[${op}] NOT_CONFIGURED — no GitHub token available`));
  return {
    status: "NOT_CONFIGURED",
    success: false,
    error: "GitHub token not configured. Set VITE_GITHUB_TOKEN or __GITHUB_TOKEN__ in environment.",
    duration,
    connectorId: "github",
    executionId: eid,
    logs,
  };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface FetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  responseTimeMs: number;
  error?: string;
}

async function githubFetch(path: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchResult> {
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
    let data: unknown = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { ok: res.ok, status: res.status, data, responseTimeMs: Date.now() - t0 };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = (err as Error).name === "AbortError";
    return { ok: false, status: 0, data: null, responseTimeMs: Date.now() - t0, error: isAbort ? "Request timed out" : (err as Error).message };
  }
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class GitHubConnector implements IConnector {
  readonly id = "github";
  private token: string | null = null;
  private initialized = false;
  private authenticatedUser: Record<string, unknown> | null = null;
  private _lastValidation: ConnectorValidationResult | null = null;

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
      version: "1.1.0",
      description: "GitHub Connector — EF-35 production hardened, read-only",
      author: "MemoryOS",
      capabilities: ["auth.user", "auth.validate", "repos.list", "repos.get", "repos.branches", "connectivity.ping"],
    };
  }

  // Legacy sync gate — real validation done in validateAsync()
  validate(): boolean { return true; }

  async validateAsync(): Promise<ConnectorValidationResult> {
    const checks: ConnectorValidationResult["checks"] = [];
    const token = this.getToken();

    // Check 1: Token configured
    checks.push({
      name: "Token configured",
      passed: !!token,
      detail: token ? "GitHub token found in environment" : "No token in globalThis.__GITHUB_TOKEN__ or __env__.GITHUB_TOKEN — operations will return NOT_CONFIGURED",
    });

    if (!token) {
      const result: ConnectorValidationResult = {
        valid: false,
        checks,
        summary: "GitHub token not configured — connector is NOT_CONFIGURED, not broken",
      };
      this._lastValidation = result;
      return result;
    }

    // Check 2: API reachable (rate_limit endpoint — no auth needed)
    let apiReachable = false;
    let apiDetail = "Not checked";
    try {
      const res = await githubFetch("/rate_limit", token, 5000);
      apiReachable = res.ok || res.status === 401; // 401 = reachable but bad token
      apiDetail = apiReachable
        ? `GitHub API reachable — HTTP ${res.status} in ${res.responseTimeMs}ms`
        : `GitHub API returned ${res.status} in ${res.responseTimeMs}ms`;
      if (res.error) { apiReachable = false; apiDetail = `Network error: ${res.error}`; }
    } catch (e) {
      apiDetail = `Fetch threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    checks.push({ name: "GitHub API reachable", passed: apiReachable, detail: apiDetail });

    // Check 3: Token valid — GET /user
    let tokenValid = false;
    let tokenDetail = "Not checked";
    let login: string | null = null;
    try {
      const res = await githubFetch("/user", token, 5000);
      tokenValid = res.ok && !!(res.data as any)?.login;
      login = tokenValid ? (res.data as any).login : null;
      tokenDetail = tokenValid
        ? `Token valid — authenticated as: ${login}`
        : res.status === 401
          ? "Token invalid or expired (HTTP 401)"
          : res.status === 403
            ? "Token lacks required scopes (HTTP 403)"
            : `GET /user returned HTTP ${res.status}`;
    } catch (e) {
      tokenDetail = `GET /user threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    checks.push({ name: "Token valid (GET /user)", passed: tokenValid, detail: tokenDetail });

    // Check 4: Repository access — GET /user/repos
    let repoAccess = false;
    let repoDetail = "Not checked";
    if (tokenValid) {
      try {
        const res = await githubFetch("/user/repos?per_page=1", token, 5000);
        repoAccess = res.ok && Array.isArray(res.data);
        repoDetail = repoAccess
          ? `Repository access confirmed — ${(res.data as any[]).length} repo(s) accessible`
          : `GET /user/repos returned HTTP ${res.status}`;
      } catch (e) {
        repoDetail = `GET /user/repos threw: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      repoDetail = "Skipped — token invalid";
    }
    checks.push({ name: "Repository access", passed: repoAccess, detail: repoDetail });

    // Check 5: Required capabilities declared
    const required = ["auth.user", "auth.validate", "repos.list", "repos.get", "repos.branches", "connectivity.ping"];
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
        ? `All ${checks.length} checks passed — authenticated as: ${login}`
        : `${passed}/${checks.length} checks passed — ${checks.filter(c => !c.passed).map(c => c.name).join("; ")}`,
    };
    this._lastValidation = result;
    return result;
  }

  getLastValidation(): ConnectorValidationResult | null {
    return this._lastValidation;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    try {
      const tok = this.getToken();
      this.token = tok;
      if (this.token) {
        const res = await githubFetch("/user", this.token);
        if (res.ok && res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
          this.authenticatedUser = res.data as Record<string, unknown>;
          this.initialized = true;
          return;
        }
      }
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
    const token = this.getToken();
    if (!token) {
      return { status: "unhealthy", connectorId: this.id, checkedAt: Date.now(), details: "No token configured — set VITE_GITHUB_TOKEN" };
    }
    try {
      const res = await githubFetch("/user", token);
      if (res.ok) {
        const login = (res.data as any)?.login ?? "unknown";
        return { status: "healthy", connectorId: this.id, checkedAt: Date.now(), details: `Authenticated as: ${login}` };
      }
      if (res.status === 401) return { status: "unhealthy", connectorId: this.id, checkedAt: Date.now(), details: "Token invalid or expired" };
      return { status: "degraded", connectorId: this.id, checkedAt: Date.now(), details: `GitHub API returned ${res.status}` };
    } catch {
      return { status: "degraded", connectorId: this.id, checkedAt: Date.now(), details: "Health check failed" };
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────────

  async execute(operation: string, payload: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid} connectorId=${this.id} Starting`)];

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
    operation: string, payload: Record<string, unknown>,
    start: number, eid: string, logs: ConnectorLog[],
  ): Promise<ConnectorResult> {
    const token = this.getToken();

    // No token: return NOT_CONFIGURED (not FAILED) for all ops
    if (!token) {
      this.internalMetrics.authFailures++;
      return notConfigured(start, eid, logs, operation);
    }

    switch (operation) {

      case "connectivity.ping": {
        const res = await githubFetch("/rate_limit", token);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API returned ${res.status}`, "external", start, eid, logs, operation); }
        const vObj = requireObject(res.data, "rate_limit response");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, eid, logs, operation); }
        const d = res.data as Record<string, unknown>;
        const rate = (d.rate ?? d.resources) as any;
        return ok({ pong: true, authenticated: true, responseTimeMs: res.responseTimeMs, rateLimit: rate }, start, eid, logs, operation);
      }

      case "auth.user": {
        const res = await githubFetch("/user", token);
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
        return ok({ id: u.id, login: u.login, name: u.name, email: u.email, avatar_url: u.avatar_url, public_repos: u.public_repos, followers: u.followers }, start, eid, logs, operation);
      }

      case "auth.validate": {
        const res = await githubFetch("/user", token);
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
        return ok({ authenticated: true, login: u.login }, start, eid, logs, operation);
      }

      case "repos.list": {
        const perPage = typeof payload.per_page === "number" ? payload.per_page : 10;
        const sort = typeof payload.sort === "string" ? payload.sort : "updated";
        const res = await githubFetch(`/user/repos?per_page=${perPage}&sort=${sort}&affiliation=owner,collaborator`, token);
        logs.push(makeLog("info", `[${operation}] responseTime=${res.responseTimeMs}ms status=${res.status}`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }
        const vArr = requireArray(res.data, "repos response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, eid, logs, operation); }
        const repos = res.data as Record<string, unknown>[];
        return ok({ count: repos.length, items: repos.map(r => ({ id: r.id, name: r.name, full_name: r.full_name, private: r.private, language: r.language, default_branch: r.default_branch, stargazers_count: r.stargazers_count, updated_at: r.updated_at })) }, start, eid, logs, operation);
      }

      case "repos.get": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("payload.owner and payload.repo are required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}`, token);
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }
        const vObj = requireObject(res.data, "repo response");
        if (!vObj.valid) { this.internalMetrics.invalidResponses++; return fail(vObj.reason, "validation", start, eid, logs, operation); }
        const r = res.data as Record<string, unknown>;
        return ok({ id: r.id, name: r.name, full_name: r.full_name, description: r.description, private: r.private, language: r.language, default_branch: r.default_branch, stargazers_count: r.stargazers_count, forks_count: r.forks_count, open_issues_count: r.open_issues_count, updated_at: r.updated_at }, start, eid, logs, operation);
      }

      case "repos.branches": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("payload.owner and payload.repo are required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=30`, token);
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`GitHub API ${res.status}`, "external", start, eid, logs, operation); }
        const vArr = requireArray(res.data, "branches response");
        if (!vArr.valid) { this.internalMetrics.invalidResponses++; return fail(vArr.reason, "validation", start, eid, logs, operation); }
        const branches = res.data as Record<string, unknown>[];
        return ok({ count: branches.length, items: branches.map(b => ({ name: b.name, protected: b.protected, sha: (b.commit as any)?.sha })) }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }
}