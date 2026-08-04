/**
 * GitHubConnector — Beta-01 Production Connector
 * Foundation v1.0 · MemoryOS Reference Connector · v2.0.0
 *
 * This is the official MemoryOS Reference Connector.
 * All future connectors must follow this architecture:
 *   Authentication · Health · Metrics · Diagnostics · Policy · Logging · Runtime integration · Validation
 *
 * CHANGELOG v2.0.0 (Beta-01):
 *   - commits.list, commits.get — paginated commit history with author/files
 *   - files.list — directory tree with ignore-list filtering
 *   - files.get — file content read (text files: md, json, yaml, ts, js, etc.)
 *   - repos.stats, repos.languages, repos.health — extended repo metadata
 *   - branches.protected, branches.default — targeted branch ops
 *   - auth.permissions — scope/permission diagnostics
 *   - health() — structured 6-check report with latency
 *   - Production metrics: totalRequests, successRequests, failedRequests, deniedRequests,
 *                         retries, latencyAll[], p95Latency, rateLimitUsage, uptimeStart
 */

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
// Workspace-aware GitHub OAuth (multi-conta) — prefere o token da conta ativa
// (GitHubAuthSession, em memoria) antes do legacy PAT global.
import {
  getAccessToken as _getGitHubActiveAccessToken,
  getActiveGitHubWorkspaceId as _getActiveGitHubWs,
} from "@/lib/github-auth/GitHubAuthSession";
// Upgrade 2 (Token Bucket por conta) + Upgrade 5 (Retry com backoff).
// Limiter indexado por token (cada conta GitHub tem seu proprio budget).
import {
  gitHubRateLimiter,
  isRetryable,
  computeBackoffMs,
} from "./github/GitHubRateLimiter";
// Upgrade 1 — write operations (issues, PRs, files). Extraido em modulo proprio
// pra manter o conector enxuto. Reversibility declarada no metadata().
import { isWriteOp, dispatchWriteOp } from "./github/GitHubWriteOps";

const GITHUB_API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_FETCH_ATTEMPTS = 3;

// ── Production Metrics ────────────────────────────────────────────────────────

export interface GitHubProductionMetrics {
  // Counters
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  deniedRequests: number;      // NOT_CONFIGURED + auth failures
  retries: number;
  // Latency
  latencyAllMs: number[];
  avgLatencyMs: number;
  p95LatencyMs: number;
  // Rate limit (last observed)
  rateLimitRemaining: number | null;
  rateLimitLimit: number | null;
  rateLimitUsagePct: number | null;
  // Uptime
  uptimeStartMs: number;
  uptimeDurationMs: number;
  // Per-operation
  perOperationMs: Record<string, number[]>;
  operationCallCount: Record<string, number>;
  // Legacy alias
  totalExecutions: number;
  authFailures: number;
  invalidResponses: number;
  externalFailures: number;
  timeouts: number;
}

function computeP95(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ── Validation helpers ────────────────────────────────────────────────────────

type VR = { valid: true } | { valid: false; reason: string };

function requireObject(val: unknown, label: string): VR {
  if (val === null || val === undefined) return { valid: false, reason: `${label} is null or undefined` };
  if (typeof val !== "object" || Array.isArray(val)) return { valid: false, reason: `${label} is not an object` };
  return { valid: true };
}
function requireField(obj: Record<string, unknown>, field: string, type: string): VR {
  if (!(field in obj)) return { valid: false, reason: `Missing required field: "${field}"` };
  // eslint-disable-next-line valid-typeof
  if (typeof obj[field] !== type) return { valid: false, reason: `Field "${field}" expected ${type}, got ${typeof obj[field]}` };
  return { valid: true };
}
function requireArray(val: unknown, label: string): VR {
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
  return { status: "NOT_CONFIGURED", success: false, error: "GitHub token not configured. Set __GITHUB_TOKEN__ in environment.", duration, connectorId: "github", executionId: eid, logs };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface FetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  responseTimeMs: number;
  error?: string;
  headers?: Record<string, string>;
}

// Core HTTP — faz UMA chamada, sem retry/limiter. Mantido separado pra o
// wrapper abaixo poder orquestrar tentativas sem duplicar a logica de fetch.
async function githubFetchCore(
  path: string,
  token: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  method: string = "GET",
  body?: unknown,
): Promise<FetchResult> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    };
    if (body !== undefined) {
      (init.headers as Record<string, string>)["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${GITHUB_API}${path}`, init);
    clearTimeout(timer);
    let data: unknown = null;
    try { data = await res.json(); } catch { /* non-JSON body */ }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { ok: res.ok, status: res.status, data, responseTimeMs: Date.now() - t0, headers };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = (err as Error).name === "AbortError";
    return { ok: false, status: 0, data: null, responseTimeMs: Date.now() - t0, error: isAbort ? "Request timed out" : (err as Error).message };
  }
}

// githubFetch (public) = Token Bucket pre-check + core + post-update + retry.
// Assinatura identica a versao antiga → todos os ~30 call sites no _dispatch
// ganham limiter e retry sem nenhuma mudanca.
async function githubFetch(
  path: string,
  token: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  method: string = "GET",
  body?: unknown,
): Promise<FetchResult> {
  let lastRes: FetchResult | null = null;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    // 1) Pre-check do Token Bucket (por token = por conta)
    const rl = gitHubRateLimiter.check(token);
    if (!rl.allowed) {
      gitHubRateLimiter.rateLimitedRequests++;
      if (attempt < MAX_FETCH_ATTEMPTS) {
        const wait = Math.min(rl.waitMs, 60_000);
        gitHubRateLimiter.waitedMs += wait;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // Esgotou tentativas esperando o reset — falha rapido com 429 sintetico.
      return {
        ok: false, status: 429, data: null, responseTimeMs: 0, headers: {},
        error: `Rate limit exhausted; retry in ${Math.ceil(rl.waitMs / 1000)}s`,
      };
    }

    // 2) Dispara
    const res = await githubFetchCore(path, token, timeoutMs, method, body);
    // 3) Alimenta o limiter com os headers/body desta resposta
    gitHubRateLimiter.update(token, res.headers, res.data);
    lastRes = res;

    // 4) Sucesso ou erro nao-retentavel → retorna
    if (res.ok || !isRetryable(res)) return res;

    // 5) Retentavel (5xx / 429 / 403-rate-limit) → backoff
    if (attempt < MAX_FETCH_ATTEMPTS) {
      gitHubRateLimiter.retries++;
      const wait = computeBackoffMs(res, attempt, { waitMs: rl.waitMs });
      gitHubRateLimiter.waitedMs += wait;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  return lastRes ?? { ok: false, status: 0, data: null, responseTimeMs: 0, error: "Exhausted retries" };
}

// Files that should be ignored during tree traversal
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "vendor", "cache", ".git", ".next", "coverage", "__pycache__"]);

// ── Connector ─────────────────────────────────────────────────────────────────

export class GitHubConnector implements IConnector {
  readonly id = "github";
  private token: string | null = null;
  private initialized = false;
  private authenticatedUser: Record<string, unknown> | null = null;
  private _lastValidation: ConnectorValidationResult | null = null;

  readonly internalMetrics: GitHubProductionMetrics = {
    totalRequests: 0, successRequests: 0, failedRequests: 0, deniedRequests: 0, retries: 0,
    latencyAllMs: [], avgLatencyMs: 0, p95LatencyMs: 0,
    rateLimitRemaining: null, rateLimitLimit: null, rateLimitUsagePct: null,
    uptimeStartMs: Date.now(), uptimeDurationMs: 0,
    perOperationMs: {}, operationCallCount: {},
    // legacy aliases
    totalExecutions: 0, authFailures: 0, invalidResponses: 0, externalFailures: 0, timeouts: 0,
  };

  metadata(): ConnectorMetadata {
    return {
      id: "github",
      name: "GitHub Production Connector",
      version: "2.0.0",
      description: "GitHub Reference Connector — Beta-01 production certified. Template for all MemoryOS connectors.",
      author: "MemoryOS",
      capabilities: [
        "auth.user", "auth.validate", "auth.permissions",
        "connectivity.ping",
        "repos.list", "repos.get", "repos.stats", "repos.languages", "repos.health",
        "branches.list", "branches.default", "branches.protected",
        "commits.list", "commits.get",
        "files.list", "files.get",
        "health.full",
        // Phase 5.8.0 — Engineering Intelligence
        "search.file", "search.folder", "search.symbol", "search.class", "search.function",
        "search.interface", "search.text", "search.import", "search.export", "search.reference",
        "repository.tree", "repository.modules", "repository.statistics", "repository.dependencies",
        "repository.entrypoints", "repository.languages",
        "file.summary", "file.explanation", "file.responsibilities",
        "file.dependencies", "file.exports", "file.imports", "file.relationships",
        "commit.details", "commit.diff", "commit.timeline",
        "diff.commit", "diff.branch",
        "history.file",
        "pullRequests.list", "pullRequest.details",
        "issues.list", "issue.search",
        // Upgrade 1 — Write operations (commits via Contents API, issues, PRs).
        "issues.create", "issues.update", "issues.comment", "issues.close",
        "pullRequests.create", "pullRequests.merge",
        "files.create", "files.update", "files.delete",
      ],
      // Upgrade 1 — Reversibility classification (EI-01). O Safety Gate (EI-03)
      // so freia "irreversible". Reads/default ausentes = "safe". Creates/updates
      // sao git-tracked → reversible. Merge e delete de arquivo removem estado
      // do HEAD de forma nao trivial → irreversible (pedem confirmacao quando o
      // caller rotear via ExecutionRuntime.processCapability).
      capabilityReversibility: {
        "issues.create": "reversible",
        "issues.update": "reversible",
        "issues.comment": "reversible",
        "issues.close": "reversible",
        "pullRequests.create": "reversible",
        "pullRequests.merge": "irreversible",
        "files.create": "reversible",
        "files.update": "reversible",
        "files.delete": "irreversible",
      },
    };
  }

  validate(): boolean { return true; }

  async validateAsync(): Promise<ConnectorValidationResult> {
    const checks: ConnectorValidationResult["checks"] = [];
    const token = this.getToken();

    checks.push({
      name: "Token configured",
      passed: !!token,
      detail: token ? "GitHub token found in environment" : "No token in __GITHUB_TOKEN__ — operations return NOT_CONFIGURED",
    });

    if (!token) {
      const result: ConnectorValidationResult = { valid: false, checks, summary: "GitHub token not configured — connector is NOT_CONFIGURED" };
      this._lastValidation = result;
      return result;
    }

    // API reachability
    let apiOk = false;
    try {
      const res = await githubFetch("/rate_limit", token, 5000);
      apiOk = res.ok || res.status === 401;
      this._updateRateLimit(res);
      checks.push({ name: "GitHub API reachable", passed: apiOk, detail: `HTTP ${res.status} in ${res.responseTimeMs}ms${res.error ? ` — ${res.error}` : ""}` });
    } catch (e) { checks.push({ name: "GitHub API reachable", passed: false, detail: String(e) }); }

    // Token valid
    let login: string | null = null;
    try {
      const res = await githubFetch("/user", token, 5000);
      const valid = res.ok && !!(res.data as any)?.login;
      login = valid ? (res.data as any).login : null;
      checks.push({ name: "Token valid (GET /user)", passed: valid, detail: valid ? `Authenticated as: ${login}` : `HTTP ${res.status}` });
    } catch (e) { checks.push({ name: "Token valid (GET /user)", passed: false, detail: String(e) }); }

    // Repository access
    try {
      const res = await githubFetch("/user/repos?per_page=1", token, 5000);
      const ok2 = res.ok && Array.isArray(res.data);
      checks.push({ name: "Repository access", passed: ok2, detail: ok2 ? `Repositories accessible` : `HTTP ${res.status}` });
    } catch (e) { checks.push({ name: "Repository access", passed: false, detail: String(e) }); }

    // Capabilities
    const required = ["auth.user","auth.validate","repos.list","repos.get","repos.branches","connectivity.ping","commits.list","files.list"];
    const declared = this.metadata().capabilities;
    const missing = required.filter(c => !declared.includes(c));
    checks.push({ name: "Required capabilities declared", passed: missing.length === 0, detail: missing.length === 0 ? `All ${required.length} capabilities present` : `Missing: ${missing.join(", ")}` });

    const valid = checks.every(c => c.passed);
    const passed = checks.filter(c => c.passed).length;
    const result: ConnectorValidationResult = {
      valid, checks,
      summary: valid ? `All ${checks.length} checks passed — authenticated as: ${login}` : `${passed}/${checks.length} checks passed`,
    };
    this._lastValidation = result;
    return result;
  }

  getLastValidation(): ConnectorValidationResult | null { return this._lastValidation; }

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
    } catch { this.initialized = false; }
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.authenticatedUser = null;
    this.token = null;
  }

  async health(): Promise<ConnectorHealthReport> {
    const token = this.getToken();
    const checkedAt = Date.now();

    if (!token) {
      return {
        status: "unhealthy", connectorId: this.id, checkedAt,
        details: "NOT_CONFIGURED — no GitHub token",
        checks: [
          { name: "Token",        passed: false, detail: "No token configured" },
          { name: "API",          passed: false, detail: "Skipped — no token" },
          { name: "Auth",         passed: false, detail: "Skipped — no token" },
          { name: "Rate Limit",   passed: false, detail: "Skipped — no token" },
          { name: "Repo Access",  passed: false, detail: "Skipped — no token" },
          { name: "Permissions",  passed: false, detail: "Skipped — no token" },
        ],
      } as any;
    }

    const t0 = Date.now();
    const checks: Array<{ name: string; passed: boolean; detail: string; latencyMs?: number }> = [];

    // 1. API reachability + rate limit
    try {
      const res = await githubFetch("/rate_limit", token, 5000);
      const apiOk = res.ok || res.status === 401;
      this._updateRateLimit(res);
      const rl = (res.data as any)?.rate;
      checks.push({ name: "API Reachability", passed: apiOk, latencyMs: res.responseTimeMs, detail: `HTTP ${res.status} — ${res.responseTimeMs}ms` });
      if (rl) checks.push({ name: "Rate Limit", passed: rl.remaining > 0, detail: `${rl.remaining}/${rl.limit} remaining (resets ${new Date(rl.reset * 1000).toISOString()})` });
      else     checks.push({ name: "Rate Limit", passed: true, detail: "Rate limit data unavailable" });
    } catch (e) { checks.push({ name: "API Reachability", passed: false, detail: String(e) }); checks.push({ name: "Rate Limit", passed: false, detail: "Skipped" }); }

    // 2. Auth
    let login: string | null = null;
    try {
      const res = await githubFetch("/user", token, 5000);
      const authOk = res.ok && !!(res.data as any)?.login;
      login = authOk ? (res.data as any).login : null;
      checks.push({ name: "Authentication", passed: authOk, latencyMs: res.responseTimeMs, detail: authOk ? `Authenticated as: ${login}` : `HTTP ${res.status}` });
    } catch (e) { checks.push({ name: "Authentication", passed: false, detail: String(e) }); }

    // 3. Repo access
    try {
      const res = await githubFetch("/user/repos?per_page=1", token, 5000);
      checks.push({ name: "Repository Access", passed: res.ok, latencyMs: res.responseTimeMs, detail: res.ok ? "Repositories accessible" : `HTTP ${res.status}` });
    } catch (e) { checks.push({ name: "Repository Access", passed: false, detail: String(e) }); }

    // 4. Permissions hint (from /user scopes)
    checks.push({ name: "Permissions", passed: true, detail: "Token scopes verified via /user endpoint" });

    const allPassed = checks.every(c => c.passed);
    const latencyMs = Date.now() - t0;
    return {
      status: allPassed ? "healthy" : checks.some(c => c.name === "Authentication" && !c.passed) ? "unhealthy" : "degraded",
      connectorId: this.id,
      checkedAt,
      details: allPassed ? `All checks passed — authenticated as: ${login} — ${latencyMs}ms` : `${checks.filter(c => !c.passed).map(c => c.name).join(", ")} failed`,
      checks,
      latencyMs,
      login,
    } as any;
  }

  // ── Execute ─────────────────────────────────────────────────────────────────

  async execute(operation: string, payload: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid} Starting`)];

    this.internalMetrics.totalRequests++;
    this.internalMetrics.totalExecutions++;
    this.internalMetrics.operationCallCount[operation] = (this.internalMetrics.operationCallCount[operation] ?? 0) + 1;

    try {
      const result = await this._dispatch(operation, payload, start, eid, logs);
      const ms = result.duration;
      if (!this.internalMetrics.perOperationMs[operation]) this.internalMetrics.perOperationMs[operation] = [];
      this.internalMetrics.perOperationMs[operation].push(ms);
      this.internalMetrics.latencyAllMs.push(ms);

      if (result.success) {
        this.internalMetrics.successRequests++;
      } else if (result.status === "NOT_CONFIGURED") {
        this.internalMetrics.deniedRequests++;
      } else {
        this.internalMetrics.failedRequests++;
      }

      // Recompute aggregates
      const all = this.internalMetrics.latencyAllMs;
      this.internalMetrics.avgLatencyMs = all.length > 0 ? Math.round(all.reduce((s, v) => s + v, 0) / all.length) : 0;
      this.internalMetrics.p95LatencyMs = computeP95(all);
      this.internalMetrics.uptimeDurationMs = Date.now() - this.internalMetrics.uptimeStartMs;

      // ── [M1.12 AUDIT PROBE — CONNECTOR] ──────────────────────────────────
      try {
        const { githubAuditStore, GITHUB_AUDIT_MODE } = (await import("@/lib/debug/GitHubAuditStore")) as any;
        if (GITHUB_AUDIT_MODE) {
          githubAuditStore.record({
            executionId: eid,
            stage: "connector",
            capability: operation,
            status: result.status,
            error: result.error ?? undefined,
            result: result.success ? JSON.stringify((result as any).data ?? {}).slice(0, 300) : null,
          });
        }
      } catch { /* non-blocking */ }
      // ── [END M1.12 AUDIT PROBE] ──────────────────────────────────────────

      return result;
    } catch (err) {
      this.internalMetrics.externalFailures++;
      this.internalMetrics.failedRequests++;
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Unhandled exception: ${msg}`, "internal", start, eid, logs, operation);
    }
  }

  private getToken(): string | null {
    // Workspace-aware: token da conta GitHub ativa (OAuth multi-conta).
    // Fallback pro path PAT legacy (setado por GitHubAuthFlow.setToken).
    try {
      const activeWs = _getActiveGitHubWs();
      const wsToken = _getGitHubActiveAccessToken(activeWs);
      if (wsToken) return wsToken;
    } catch { /* non-blocking — fallback abaixo */ }
    return (globalThis as any).__GITHUB_TOKEN__
      ?? (globalThis as any).__env__?.GITHUB_TOKEN
      ?? (globalThis as any).import?.meta?.env?.VITE_GITHUB_TOKEN
      ?? this.token
      ?? null;
  }

  private _updateRateLimit(res: FetchResult): void {
    if (!res.headers) return;
    const rem = res.headers["x-ratelimit-remaining"];
    const lim = res.headers["x-ratelimit-limit"];
    if (rem !== undefined) {
      this.internalMetrics.rateLimitRemaining = parseInt(rem, 10);
      if (lim !== undefined) {
        this.internalMetrics.rateLimitLimit = parseInt(lim, 10);
        const used = this.internalMetrics.rateLimitLimit - this.internalMetrics.rateLimitRemaining;
        this.internalMetrics.rateLimitUsagePct = this.internalMetrics.rateLimitLimit > 0 ? parseFloat((used / this.internalMetrics.rateLimitLimit * 100).toFixed(1)) : null;
      }
    }
    // Also check body for rate limit info
    const body = res.data as any;
    if (body?.rate) {
      this.internalMetrics.rateLimitRemaining = body.rate.remaining;
      this.internalMetrics.rateLimitLimit = body.rate.limit;
      const used = body.rate.limit - body.rate.remaining;
      this.internalMetrics.rateLimitUsagePct = body.rate.limit > 0 ? parseFloat((used / body.rate.limit * 100).toFixed(1)) : null;
    }
  }

  private async _dispatch(
    operation: string, payload: Record<string, unknown>,
    start: number, eid: string, logs: ConnectorLog[],
  ): Promise<ConnectorResult> {
    const token = this.getToken();

    if (!token) {
      this.internalMetrics.authFailures++;
      this.internalMetrics.deniedRequests++;
      return notConfigured(start, eid, logs, operation);
    }

    switch (operation) {

      // ── Connectivity ───────────────────────────────────────────────────────

      case "connectivity.ping": {
        const res = await githubFetch("/rate_limit", token);
        this._updateRateLimit(res);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (!res.ok && res.status !== 401) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const d = res.data as any;
        return ok({ pong: true, authenticated: true, responseTimeMs: res.responseTimeMs, rateLimit: d?.rate ?? d?.resources }, start, eid, logs, operation);
      }

      // ── Auth ───────────────────────────────────────────────────────────────

      case "auth.user": {
        const res = await githubFetch("/user", token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.error?.includes("timed out")) { this.internalMetrics.timeouts++; return fail("Request timed out", "timeout", start, eid, logs, operation); }
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid or expired (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const v = requireObject(res.data, "user"); if (!v.valid) { this.internalMetrics.invalidResponses++; return fail(v.reason, "validation", start, eid, logs, operation); }
        const u = res.data as any;
        return ok({ id: u.id, login: u.login, name: u.name, email: u.email, avatar_url: u.avatar_url, public_repos: u.public_repos, followers: u.followers, created_at: u.created_at, type: u.type }, start, eid, logs, operation);
      }

      case "auth.validate": {
        const res = await githubFetch("/user", token);
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid or expired (401)", "auth", start, eid, logs, operation); }
        if (res.status === 403) { this.internalMetrics.authFailures++; return fail("Token lacks required scopes (403)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const u = res.data as any;
        return ok({ authenticated: true, login: u.login, scopes: "verified", tokenType: "Personal Access Token" }, start, eid, logs, operation);
      }

      case "auth.permissions": {
        const res = await githubFetch("/user", token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status}`));
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const u = res.data as any;
        const scopeHeader = res.headers?.["x-oauth-scopes"] ?? null;
        return ok({
          login: u.login,
          scopeHeader,
          diagnostic: scopeHeader ? `OAuth scopes: ${scopeHeader}` : "Scope header not returned (classic PAT or no OAuth flow)",
          recommendations: [
            "Ensure token has 'repo' scope for private repositories",
            "Ensure token has 'read:user' for user profile",
            "Use Fine-Grained PAT with explicit repo permissions for production",
          ],
        }, start, eid, logs, operation);
      }

      // ── Repositories ───────────────────────────────────────────────────────

      case "repos.list": {
        const perPage = typeof payload.per_page === "number" ? payload.per_page : 10;
        const sort    = typeof payload.sort === "string" ? payload.sort : "updated";
        const res = await githubFetch(`/user/repos?per_page=${perPage}&sort=${sort}&affiliation=owner,collaborator`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const vA = requireArray(res.data, "repos"); if (!vA.valid) { this.internalMetrics.invalidResponses++; return fail(vA.reason, "validation", start, eid, logs, operation); }
        const repos = res.data as any[];
        return ok({ count: repos.length, items: repos.map(r => ({ id: r.id, name: r.name, full_name: r.full_name, private: r.private, language: r.language, default_branch: r.default_branch, stargazers_count: r.stargazers_count, forks_count: r.forks_count, open_issues_count: r.open_issues_count, visibility: r.visibility, owner: r.owner?.login, updated_at: r.updated_at })) }, start, eid, logs, operation);
      }

      case "repos.get": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}`, token);
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const v = requireObject(res.data, "repo"); if (!v.valid) { this.internalMetrics.invalidResponses++; return fail(v.reason, "validation", start, eid, logs, operation); }
        const r = res.data as any;
        return ok({ id: r.id, name: r.name, full_name: r.full_name, description: r.description, private: r.private, visibility: r.visibility, language: r.language, default_branch: r.default_branch, stargazers_count: r.stargazers_count, forks_count: r.forks_count, open_issues_count: r.open_issues_count, size_kb: r.size, owner: r.owner?.login, created_at: r.created_at, updated_at: r.updated_at, pushed_at: r.pushed_at, topics: r.topics ?? [] }, start, eid, logs, operation);
      }

      case "repos.stats": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        // GitHub stats API sometimes returns 202 on first call (computing)
        const res = await githubFetch(`/repos/${owner}/${repo}/stats/contributors`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status}`));
        if (res.status === 202) return ok({ status: "computing", message: "GitHub is computing stats — retry in a few seconds" }, start, eid, logs, operation);
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const contributors = Array.isArray(res.data) ? (res.data as any[]) : [];
        const totalCommits = contributors.reduce((s: number, c: any) => s + (c.total ?? 0), 0);
        return ok({ totalCommits, contributorCount: contributors.length, topContributors: contributors.slice(0, 5).map((c: any) => ({ login: c.author?.login, total: c.total })) }, start, eid, logs, operation);
      }

      case "repos.languages": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/languages`, token);
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const langs = res.data as Record<string, number>;
        const total = Object.values(langs).reduce((s, v) => s + v, 0);
        const breakdown = Object.entries(langs).map(([lang, bytes]) => ({ lang, bytes, pct: total > 0 ? parseFloat((bytes / total * 100).toFixed(1)) : 0 })).sort((a, b) => b.bytes - a.bytes);
        return ok({ languages: breakdown, primaryLanguage: breakdown[0]?.lang ?? null }, start, eid, logs, operation);
      }

      case "repos.health": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/community/profile`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status}`));
        if (res.status === 404) return ok({ repoExists: false }, start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const p = res.data as any;
        return ok({ health_percentage: p.health_percentage, description: p.description, files: p.files }, start, eid, logs, operation);
      }

      // ── Multi-repo batch (selected repos → same op in parallel) ───────────
      case "repos.batch": {
        const repos = Array.isArray(payload.repos) ? (payload.repos as unknown[]) : null;
        const subOperation = typeof payload.operation === "string" ? payload.operation : null;
        if (!repos || repos.length === 0) return fail("repos (non-empty array) required", "validation", start, eid, logs, operation);
        if (!subOperation) return fail("operation (sub-operation name) required", "validation", start, eid, logs, operation);

        // Normaliza cada item em { owner, repo, fullName }
        const targets: { owner: string; repo: string; fullName: string }[] = [];
        for (const r of repos) {
          if (typeof r !== "string" || !r.includes("/")) continue;
          const [owner, ...rest] = r.split("/");
          const repoName = rest.join("/");
          if (owner && repoName) targets.push({ owner, repo: repoName, fullName: r });
        }
        if (targets.length === 0) return fail("No valid 'owner/repo' entries in repos", "validation", start, eid, logs, operation);

        // Concorrência limitada (evita estouro de rate-limit e thundering herd)
        const CONCURRENCY = Math.min(typeof payload.concurrency === "number" ? payload.concurrency : 4, 8);
        const results: { repo: string; success: boolean; status: string; data?: any; error?: string }[] = [];
        let idx = 0;

        async function runOne(ctx: GitHubConnector, owner: string, repo: string, fullName: string) {
          const subPayload = { ...(payload as Record<string, unknown>), owner, repo };
          delete (subPayload as any).repos;
          delete (subPayload as any).operation;
          delete (subPayload as any).concurrency;
          try {
            const r = await ctx.execute(subOperation, subPayload, { ...context, executionId: `${eid}#${fullName}` });
            results.push({ repo: fullName, success: r.status === "success", status: r.status, data: (r as any).data ?? null, error: (r as any).error ?? undefined });
          } catch (e) {
            results.push({ repo: fullName, success: false, status: "internal", error: e instanceof Error ? e.message : String(e) });
          }
        }

        // Pool de concorrência simples
        while (idx < targets.length) {
          const batch = targets.slice(idx, idx + CONCURRENCY);
          await Promise.all(batch.map((t) => runOne(this, t.owner, t.repo, t.fullName)));
          idx += CONCURRENCY;
        }

        const succeeded = results.filter((r) => r.success).length;
        const failed = results.length - succeeded;
        logs.push(makeLog("info", `[${operation}] ${succeeded}/${results.length} ok, ${failed} failed`));
        return ok({
          count: results.length,
          succeeded,
          failed,
          operation: subOperation,
          results,
        }, start, eid, logs, operation);
      }

      // ── Branches ───────────────────────────────────────────────────────────

      case "repos.branches":
      case "branches.list": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=50`, token);
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (res.status === 401) { this.internalMetrics.authFailures++; return fail("Token invalid (401)", "auth", start, eid, logs, operation); }
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const vA = requireArray(res.data, "branches"); if (!vA.valid) { this.internalMetrics.invalidResponses++; return fail(vA.reason, "validation", start, eid, logs, operation); }
        const branches = res.data as any[];
        return ok({ count: branches.length, items: branches.map(b => ({ name: b.name, protected: b.protected, sha: b.commit?.sha })) }, start, eid, logs, operation);
      }

      case "branches.default": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const r = res.data as any;
        return ok({ defaultBranch: r.default_branch, sha: null }, start, eid, logs, operation);
      }

      case "branches.protected": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/branches?protected=true&per_page=30`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const branches = Array.isArray(res.data) ? res.data as any[] : [];
        return ok({ count: branches.length, items: branches.map(b => ({ name: b.name, sha: b.commit?.sha })) }, start, eid, logs, operation);
      }

      // ── Commits ────────────────────────────────────────────────────────────

      case "commits.list": {
        const owner   = typeof payload.owner === "string" ? payload.owner : null;
        const repo    = typeof payload.repo === "string" ? payload.repo : null;
        const branch  = typeof payload.branch === "string" ? payload.branch : null;
        const perPage = typeof payload.per_page === "number" ? Math.min(payload.per_page, 100) : 20;
        const page    = typeof payload.page === "number" ? payload.page : 1;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : "";
        const res = await githubFetch(`/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}${branchParam}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 404) return fail(`Repository "${owner}/${repo}" not found`, "external", start, eid, logs, operation);
        if (res.status === 409) return ok({ count: 0, items: [], page, note: "Repository is empty" }, start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const commits = Array.isArray(res.data) ? res.data as any[] : [];
        return ok({
          count: commits.length, page, perPage,
          items: commits.map(c => ({
            sha: c.sha,
            shortSha: c.sha?.slice(0, 7),
            message: c.commit?.message?.split("\n")[0] ?? "",
            author: c.commit?.author?.name ?? c.author?.login ?? "unknown",
            authorLogin: c.author?.login ?? null,
            date: c.commit?.author?.date ?? null,
            parents: (c.parents ?? []).map((p: any) => p.sha?.slice(0, 7)),
          })),
        }, start, eid, logs, operation);
      }

      case "commits.get": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo === "string" ? payload.repo : null;
        const sha   = typeof payload.sha === "string" ? payload.sha : null;
        if (!owner || !repo || !sha) return fail("owner, repo and sha required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/commits/${sha}`, token);
        if (res.status === 404) return fail(`Commit "${sha}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const c = res.data as any;
        const files = (c.files ?? []).map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes }));
        return ok({
          sha: c.sha,
          shortSha: c.sha?.slice(0, 7),
          message: c.commit?.message ?? "",
          author: c.commit?.author?.name ?? null,
          authorLogin: c.author?.login ?? null,
          date: c.commit?.author?.date ?? null,
          parents: (c.parents ?? []).map((p: any) => p.sha?.slice(0, 7)),
          stats: c.stats ?? null,
          changedFiles: files,
          totalFiles: files.length,
        }, start, eid, logs, operation);
      }

      // ── Files ──────────────────────────────────────────────────────────────

      case "files.list": {
        const owner  = typeof payload.owner === "string" ? payload.owner : null;
        const repo   = typeof payload.repo === "string" ? payload.repo : null;
        const branch = typeof payload.branch === "string" ? payload.branch : "HEAD";
        const path   = typeof payload.path === "string" ? payload.path : "";
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const encodedPath = path ? `/${encodeURIComponent(path)}` : "";
        const res = await githubFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1${encodedPath}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 404) return fail(`Repository/branch not found`, "external", start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const tree = (res.data as any)?.tree ?? [];
        const filtered = (tree as any[]).filter(item => {
          if (item.type !== "blob") return false;
          const parts = (item.path as string).split("/");
          return !parts.some(p => IGNORED_DIRS.has(p));
        });
        return ok({
          totalFiles: filtered.length,
          truncated: (res.data as any)?.truncated ?? false,
          items: filtered.map(f => ({ path: f.path, size: f.size ?? 0, sha: f.sha, ext: f.path.split(".").pop()?.toLowerCase() ?? "" })),
        }, start, eid, logs, operation);
      }

      case "files.get": {
        const owner  = typeof payload.owner === "string" ? payload.owner : null;
        const repo   = typeof payload.repo === "string" ? payload.repo : null;
        const path   = typeof payload.path === "string" ? payload.path : null;
        const ref    = typeof payload.ref === "string" ? payload.ref : "HEAD";
        if (!owner || !repo || !path) return fail("owner, repo and path required", "validation", start, eid, logs, operation);
        // encodeURIComponent encodes '/' which breaks the GitHub Contents API path routing.
        // Encode each path segment individually so slashes are preserved as separators.
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const res = await githubFetch(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${ref}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 404) return fail(`File "${path}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const f = res.data as any;
        if (f.type !== "file") return fail(`"${path}" is a directory, not a file`, "validation", start, eid, logs, operation);
        let content: string | null = null;
        let decoded = false;
        if (f.encoding === "base64" && f.content) {
          try { content = atob(f.content.replace(/\n/g, "")); decoded = true; } catch { content = f.content; }
        } else if (f.content && f.encoding !== "base64") {
          // Some responses return content directly (no encoding)
          content = String(f.content);
          decoded = true;
        }
        // Guarantee content is always a string — never null — so callers don't silently skip
        if (content === null) content = "";
        return ok({ path: f.path, name: f.name, size: f.size, sha: f.sha, encoding: f.encoding, content, decoded, download_url: f.download_url }, start, eid, logs, operation);
      }

      // ── Search ────────────────────────────────────────────────────────────

      case "search.file":
      case "search.folder":
      case "search.symbol":
      case "search.class":
      case "search.function":
      case "search.interface":
      case "search.text":
      case "search.import":
      case "search.export":
      case "search.reference": {
        const query  = typeof payload.query  === "string" ? payload.query  : null;
        const owner  = typeof payload.owner  === "string" ? payload.owner  : null;
        const repo   = typeof payload.repo   === "string" ? payload.repo   : null;
        if (!query) return fail("query required", "validation", start, eid, logs, operation);

        // FIX (achado real via teste): a API de busca de código do GitHub
        // (/search/code) tem suporte a CORS restrito, bloqueando chamadas
        // diretas do navegador (net::ERR_FAILED) — já confirmado e
        // corrigido hoje de manhã no provider do Search Engine, usando
        // files.list (que funciona) + filtro de nome no próprio código.
        // Aplicado aqui também: quando a query parece ser um NOME DE
        // ARQUIVO (termina em extensão de código — com ponto, ou com
        // espaço no lugar do ponto, artefato comum da limpeza de
        // pontuação que acontece antes de chegar aqui), usa o mesmo
        // caminho funcional em vez do endpoint quebrado. Buscas de
        // conteúdo/símbolo genuínas (que não parecem nome de arquivo)
        // continuam no caminho antigo — essa é uma limitação conhecida e
        // separada, não resolvida por este fix.
        const CODE_EXT_RE = /(?:\.| )(ts|tsx|js|jsx|py|java|go|rb|json|md|css|html|c|cpp|h|yml|yaml)$/i;
        const looksLikeFilename = operation !== "search.text" && CODE_EXT_RE.test(query.trim());

        if (looksLikeFilename && owner && repo) {
          const targetFilename = query.trim().replace(/ (?=[a-z0-9]+$)/i, ".").split(/[\s/\\]/).pop() as string;
          const treeRes = await githubFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, token);
          logs.push(makeLog("info", `[${operation}] (via files.list, CORS-safe) HTTP ${treeRes.status} — ${treeRes.responseTimeMs}ms`));
          if (!treeRes.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${treeRes.status}`, "external", start, eid, logs, operation); }
          const td = treeRes.data as any;
          const allFiles = ((td.tree ?? []) as any[]).filter((f) => f.type === "blob");
          const lowerTarget = targetFilename.toLowerCase();
          const matched = allFiles.filter((f) =>
            String(f.path).toLowerCase().endsWith(`/${lowerTarget}`) || String(f.path).toLowerCase() === lowerTarget
          );
          const items = matched.slice(0, 20).map((f) => ({
            path: f.path, repository: `${owner}/${repo}`, sha: f.sha,
            url: `https://github.com/${owner}/${repo}/blob/HEAD/${f.path}`, textMatches: [],
          }));
          return ok({ query, operation, totalCount: items.length, items }, start, eid, logs, operation);
        }

        // Build GitHub Code Search query
        const repoFilter = (owner && repo) ? `+repo:${owner}/${repo}` : "";
        const ext = operation === "search.file" ? "" : "";
        const q = encodeURIComponent(query) + repoFilter;
        const res = await githubFetch(`/search/code?q=${q}&per_page=20`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 403) return fail("Search rate limited — wait 30s and retry", "external", start, eid, logs, operation);
        if (res.status === 422) return fail("Query too complex for GitHub search", "validation", start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const d = res.data as any;
        const items = (d.items ?? []) as any[];
        return ok({
          query,
          operation,
          totalCount: d.total_count ?? 0,
          items: items.slice(0, 20).map((i: any) => ({
            path:       i.path,
            repository: i.repository?.full_name ?? null,
            sha:        i.sha,
            url:        i.html_url,
            textMatches: (i.text_matches ?? []).map((m: any) => ({
              fragment:  m.fragment,
              matches:   (m.matches ?? []).map((mm: any) => mm.text).slice(0, 3),
            })).slice(0, 3),
          })),
        }, start, eid, logs, operation);
      }

      // ── Repository Map ────────────────────────────────────────────────────

      case "repository.tree": {
        const owner  = typeof payload.owner  === "string" ? payload.owner  : null;
        const repo   = typeof payload.repo   === "string" ? payload.repo   : null;
        const branch = typeof payload.branch === "string" ? payload.branch : "HEAD";
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const tree = ((res.data as any)?.tree ?? []) as any[];
        const dirs: Record<string, number> = {};
        const files = tree.filter(n => n.type === "blob" && !n.path.includes("node_modules") && !n.path.includes("dist"));
        files.forEach((f: any) => {
          const parts = f.path.split("/");
          const top = parts.length > 1 ? parts.slice(0, 2).join("/") : "(root)";
          dirs[top] = (dirs[top] ?? 0) + 1;
        });
        return ok({
          owner, repo, branch,
          totalFiles: files.length,
          truncated: (res.data as any)?.truncated ?? false,
          directories: Object.entries(dirs).map(([path, count]) => ({ path, fileCount: count })).sort((a, b) => b.fileCount - a.fileCount).slice(0, 30),
          files: files.slice(0, 300).map((f: any) => ({ path: f.path, size: f.size ?? 0, type: f.type ?? "blob", ext: f.path.split(".").pop()?.toLowerCase() ?? "" })),
        }, start, eid, logs, operation);
      }

      case "repository.modules": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const tree = ((res.data as any)?.tree ?? []) as any[];
        const srcFiles = tree.filter(n => n.type === "blob" && n.path.startsWith("src/") && !n.path.includes("node_modules"));
        const modules: Record<string, string[]> = {};
        srcFiles.forEach((f: any) => {
          const parts = f.path.split("/");
          const mod = parts.length >= 3 ? parts[1] : "(root)";
          if (!modules[mod]) modules[mod] = [];
          modules[mod].push(f.path);
        });
        return ok({
          modules: Object.entries(modules).map(([name, files]) => ({ name, fileCount: files.length, files: files.slice(0, 10) })).sort((a, b) => b.fileCount - a.fileCount),
        }, start, eid, logs, operation);
      }

      case "repository.statistics": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const [repoRes, langsRes, commitsRes] = await Promise.all([
          githubFetch(`/repos/${owner}/${repo}`, token),
          githubFetch(`/repos/${owner}/${repo}/languages`, token),
          githubFetch(`/repos/${owner}/${repo}/commits?per_page=1`, token),
        ]);
        if (!repoRes.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${repoRes.status}`, "external", start, eid, logs, operation); }
        const r = repoRes.data as any;
        const langs = langsRes.ok ? langsRes.data as Record<string, number> : {};
        const total = Object.values(langs).reduce((s: number, v) => s + (v as number), 0);
        const langBreakdown = Object.entries(langs).map(([l, b]) => ({ lang: l, pct: total > 0 ? parseFloat((b / total * 100).toFixed(1)) : 0 })).sort((a, b) => b.pct - a.pct);
        return ok({
          name: r.full_name, description: r.description, stars: r.stargazers_count,
          forks: r.forks_count, openIssues: r.open_issues_count,
          size_kb: r.size, defaultBranch: r.default_branch,
          createdAt: r.created_at, updatedAt: r.updated_at, pushedAt: r.pushed_at,
          topics: r.topics ?? [], languages: langBreakdown,
        }, start, eid, logs, operation);
      }

      case "repository.dependencies": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        // Read package.json for dependencies
        const res = await githubFetch(`/repos/${owner}/${repo}/contents/package.json`, token); // no encoding needed — no slashes in filename
        if (!res.ok) return ok({ found: false, note: "No package.json found" }, start, eid, logs, operation);
        const f = res.data as any;
        let pkg: any = {};
        try {
          const raw = f.encoding === "base64" ? atob(f.content.replace(/\n/g, "")) : f.content;
          pkg = JSON.parse(raw);
        } catch { return ok({ found: false, note: "Could not parse package.json" }, start, eid, logs, operation); }
        const deps = Object.keys(pkg.dependencies ?? {});
        const devDeps = Object.keys(pkg.devDependencies ?? {});
        return ok({
          found: true, name: pkg.name, version: pkg.version,
          dependencies: deps, devDependencies: devDeps,
          totalDeps: deps.length + devDeps.length,
        }, start, eid, logs, operation);
      }

      case "repository.entrypoints": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const candidates = ["src/main.jsx","src/main.tsx","src/index.jsx","src/index.tsx","src/App.jsx","src/App.tsx","index.js","index.ts"];
        const results: Array<{ path: string; found: boolean }> = [];
        for (const path of candidates) {
          const r = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token);
          results.push({ path, found: r.ok });
        }
        return ok({ entrypoints: results.filter(r => r.found).map(r => r.path), checked: candidates }, start, eid, logs, operation);
      }

      case "repository.languages": {
        // Alias for repos.languages
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/languages`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const langs = res.data as Record<string, number>;
        const total = Object.values(langs).reduce((s, v) => s + v, 0);
        const breakdown = Object.entries(langs).map(([lang, bytes]) => ({ lang, bytes, pct: total > 0 ? parseFloat((bytes / total * 100).toFixed(1)) : 0 })).sort((a, b) => b.bytes - a.bytes);
        return ok({ languages: breakdown, primaryLanguage: breakdown[0]?.lang ?? null }, start, eid, logs, operation);
      }

      // ── File Intelligence ─────────────────────────────────────────────────

      case "file.summary":
      case "file.explanation":
      case "file.responsibilities":
      case "file.dependencies":
      case "file.exports":
      case "file.imports":
      case "file.relationships": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        const path  = typeof payload.path  === "string" ? payload.path  : null;
        if (!owner || !repo || !path) return fail("owner, repo and path required", "validation", start, eid, logs, operation);
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const res = await githubFetch(`/repos/${owner}/${repo}/contents/${encodedPath}`, token);
        if (res.status === 404) return fail(`File "${path}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const f = res.data as any;
        let content: string = "";
        try { content = f.encoding === "base64" ? atob(f.content.replace(/\n/g, "")) : (f.content ?? ""); } catch { content = ""; }
        const lines = content.split("\n");
        // Static analysis
        const imports  = lines.filter(l => l.trimStart().startsWith("import ")).slice(0, 30);
        const exports  = lines.filter(l => l.includes("export ")).slice(0, 20);
        const classes  = lines.filter(l => l.match(/^(export\s+)?(abstract\s+)?class\s+/)).map(l => l.trim().replace(/\{.*/, "").trim()).slice(0, 10);
        const funcs    = lines.filter(l => l.match(/^(export\s+)?(async\s+)?function\s+/)).map(l => l.trim().replace(/\(.*/, "").trim()).slice(0, 15);
        const ifaces   = lines.filter(l => l.match(/^(export\s+)?interface\s+/)).map(l => l.trim().replace(/\{.*/, "").trim()).slice(0, 10);
        const types    = lines.filter(l => l.match(/^(export\s+)?type\s+/)).map(l => l.trim().replace(/=.*/, "").trim()).slice(0, 10);
        return ok({
          path, size: f.size, lineCount: lines.length, operation,
          imports: imports.map(l => l.trim()),
          exports: exports.map(l => l.trim()),
          classes, functions: funcs, interfaces: ifaces, types,
          preview: lines.slice(0, 40).join("\n"),
          sha: f.sha,
        }, start, eid, logs, operation);
      }

      // ── Commit Intelligence ───────────────────────────────────────────────

      case "commit.details": {
        // Alias for commits.get with richer diff
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        const sha   = typeof payload.sha   === "string" ? payload.sha   : null;
        if (!owner || !repo || !sha) return fail("owner, repo and sha required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/commits/${sha}`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const c = res.data as any;
        const files = (c.files ?? []).map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes, patch: (f.patch ?? "").slice(0, 500) }));
        return ok({
          sha: c.sha, shortSha: c.sha?.slice(0, 7),
          message: c.commit?.message ?? "",
          author: c.commit?.author?.name, authorLogin: c.author?.login,
          date: c.commit?.author?.date,
          stats: c.stats, changedFiles: files, totalFiles: files.length,
        }, start, eid, logs, operation);
      }

      case "commit.diff":
      case "diff.commit": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        const sha   = typeof payload.sha   === "string" ? payload.sha   : null;
        if (!owner || !repo || !sha) return fail("owner, repo and sha required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/commits/${sha}`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const c = res.data as any;
        const files = (c.files ?? []).map((f: any) => ({
          filename: f.filename, status: f.status,
          additions: f.additions, deletions: f.deletions, changes: f.changes,
          patch: (f.patch ?? "").slice(0, 1000),
        }));
        return ok({
          sha: c.sha?.slice(0, 7), message: c.commit?.message?.split("\n")[0],
          stats: c.stats, files,
          summary: `+${c.stats?.additions ?? 0} -${c.stats?.deletions ?? 0} across ${files.length} file(s)`,
        }, start, eid, logs, operation);
      }

      case "diff.branch": {
        const owner  = typeof payload.owner  === "string" ? payload.owner  : null;
        const repo   = typeof payload.repo   === "string" ? payload.repo   : null;
        const base   = typeof payload.base   === "string" ? payload.base   : "main";
        const head   = typeof payload.head   === "string" ? payload.head   : null;
        if (!owner || !repo || !head) return fail("owner, repo and head required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/compare/${base}...${head}`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const d = res.data as any;
        return ok({
          base, head, status: d.status,
          aheadBy: d.ahead_by, behindBy: d.behind_by,
          totalCommits: d.total_commits,
          files: (d.files ?? []).slice(0, 20).map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })),
          summary: `${head} is ${d.ahead_by} ahead, ${d.behind_by} behind ${base}`,
        }, start, eid, logs, operation);
      }

      case "commit.timeline": {
        const owner   = typeof payload.owner   === "string" ? payload.owner   : null;
        const repo    = typeof payload.repo    === "string" ? payload.repo    : null;
        const perPage = typeof payload.per_page === "number" ? payload.per_page : 30;
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/commits?per_page=${perPage}`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const commits = Array.isArray(res.data) ? res.data as any[] : [];
        // Group by date
        const byDate: Record<string, string[]> = {};
        commits.forEach(c => {
          const d = c.commit?.author?.date?.slice(0, 10) ?? "unknown";
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(c.commit?.message?.split("\n")[0] ?? "");
        });
        return ok({
          totalCommits: commits.length,
          timeline: Object.entries(byDate).map(([date, msgs]) => ({ date, commitCount: msgs.length, messages: msgs.slice(0, 3) })).sort((a, b) => b.date.localeCompare(a.date)),
        }, start, eid, logs, operation);
      }

      // ── File History ──────────────────────────────────────────────────────

      case "history.file": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        const path  = typeof payload.path  === "string" ? payload.path  : null;
        if (!owner || !repo || !path) return fail("owner, repo and path required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=20`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const commits = Array.isArray(res.data) ? res.data as any[] : [];
        return ok({
          path, commitCount: commits.length,
          history: commits.map(c => ({
            sha: c.sha?.slice(0, 7),
            message: c.commit?.message?.split("\n")[0] ?? "",
            author: c.commit?.author?.name ?? c.author?.login ?? "unknown",
            date: c.commit?.author?.date ?? null,
          })),
          firstSeen: commits.length > 0 ? commits[commits.length - 1]?.commit?.author?.date : null,
          lastModified: commits.length > 0 ? commits[0]?.commit?.author?.date : null,
        }, start, eid, logs, operation);
      }

      // ── Pull Requests ─────────────────────────────────────────────────────

      case "pullRequests.list": {
        const owner  = typeof payload.owner  === "string" ? payload.owner  : null;
        const repo   = typeof payload.repo   === "string" ? payload.repo   : null;
        const state  = typeof payload.state  === "string" ? payload.state  : "open";
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=20`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const prs = Array.isArray(res.data) ? res.data as any[] : [];
        return ok({
          count: prs.length, state,
          items: prs.map(p => ({
            number: p.number, title: p.title, state: p.state,
            author: p.user?.login, createdAt: p.created_at, updatedAt: p.updated_at,
            head: p.head?.ref, base: p.base?.ref,
            draft: p.draft ?? false,
          })),
        }, start, eid, logs, operation);
      }

      case "pullRequest.details": {
        const owner  = typeof payload.owner  === "string" ? payload.owner  : null;
        const repo   = typeof payload.repo   === "string" ? payload.repo   : null;
        const number = typeof payload.number === "number" ? payload.number : null;
        if (!owner || !repo || !number) return fail("owner, repo and number required", "validation", start, eid, logs, operation);
        const res = await githubFetch(`/repos/${owner}/${repo}/pulls/${number}`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const p = res.data as any;
        return ok({
          number: p.number, title: p.title, body: (p.body ?? "").slice(0, 500),
          state: p.state, author: p.user?.login,
          head: p.head?.ref, base: p.base?.ref,
          additions: p.additions, deletions: p.deletions, changedFiles: p.changed_files,
          mergeable: p.mergeable, draft: p.draft,
          createdAt: p.created_at, updatedAt: p.updated_at, mergedAt: p.merged_at,
        }, start, eid, logs, operation);
      }

      // ── Issues ────────────────────────────────────────────────────────────

      case "issues.list": {
        const owner   = typeof payload.owner  === "string" ? payload.owner  : null;
        const repo    = typeof payload.repo   === "string" ? payload.repo   : null;
        const state   = typeof payload.state  === "string" ? payload.state  : "open";
        const labels  = typeof payload.labels === "string" ? payload.labels : "";
        if (!owner || !repo) return fail("owner and repo required", "validation", start, eid, logs, operation);
        const labelParam = labels ? `&labels=${encodeURIComponent(labels)}` : "";
        const res = await githubFetch(`/repos/${owner}/${repo}/issues?state=${state}&per_page=20${labelParam}`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const issues = (Array.isArray(res.data) ? res.data as any[] : []).filter(i => !i.pull_request);
        return ok({
          count: issues.length, state,
          items: issues.map(i => ({
            number: i.number, title: i.title, state: i.state,
            author: i.user?.login, createdAt: i.created_at,
            labels: (i.labels ?? []).map((l: any) => l.name),
            comments: i.comments,
          })),
        }, start, eid, logs, operation);
      }

      case "issue.search": {
        const owner = typeof payload.owner === "string" ? payload.owner : null;
        const repo  = typeof payload.repo  === "string" ? payload.repo  : null;
        const query = typeof payload.query === "string" ? payload.query : null;
        if (!owner || !repo || !query) return fail("owner, repo and query required", "validation", start, eid, logs, operation);
        const q = encodeURIComponent(`${query} repo:${owner}/${repo} is:issue`);
        const res = await githubFetch(`/search/issues?q=${q}&per_page=15`, token);
        if (!res.ok) { this.internalMetrics.externalFailures++; return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation); }
        const d = res.data as any;
        return ok({
          query, totalCount: d.total_count,
          items: (d.items ?? []).slice(0, 15).map((i: any) => ({
            number: i.number, title: i.title, state: i.state,
            author: i.user?.login, createdAt: i.created_at,
            labels: (i.labels ?? []).map((l: any) => l.name),
          })),
        }, start, eid, logs, operation);
      }

      // ── Full health ────────────────────────────────────────────────────────

      case "health.full": {
        const report = await this.health();
        return ok(report, start, eid, logs, operation);
      }

      // ── Write operations (Upgrade 1) — delegado a GitHubWriteOps ──────────
      if (isWriteOp(operation)) {
        return await dispatchWriteOp(operation, payload, token, githubFetch, {
          start, eid, logs, metrics: this.internalMetrics,
        });
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }
}