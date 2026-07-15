/**
 * GmailConnector — Implementation 003
 * Google Workspace Gmail Integration
 *
 * Segue exatamente o padrão do GitHubConnector (Beta-01 Reference Connector).
 *
 * Autenticação:
 *   - Obtém credenciais exclusivamente via interface pública do GoogleAuthSession:
 *       ensureValidToken(workspaceId) → GoogleConnection | null
 *       getConnection(workspaceId)    → GoogleConnection | null
 *       isConnected(workspaceId)      → boolean
 *   - O GmailConnector NÃO acessa estados internos do GoogleAuthSession.
 *   - O GmailConnector NÃO usa variáveis globais como fluxo principal.
 *
 * LIMITAÇÃO DOCUMENTADA (remanescente):
 *   O GoogleAuthSession (Impl-001) armazena apenas tokenRef opaco (gw-tok-*).
 *   Sem backend function de token exchange, o access_token real não está
 *   disponível. O conector retorna NOT_CONFIGURED honestamente nesse caso.
 *   Quando o backend OAuth estiver implementado e o GoogleAuthSession expuser
 *   um método getAccessToken() com token real, este conector funcionará sem
 *   nenhuma alteração de código.
 *   Ver: src/lib/google-auth/GoogleAuthSession.js
 */

import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
} from "../ConnectorTypes";
import { makeLog, makeExecutionId } from "../ConnectorTypes";
import { isConnected, ensureValidToken, getConnection, getMetrics } from "../../google-auth/GoogleAuthSession";

const GMAIL_API = "https://gmail.googleapis.com";
const DEFAULT_TIMEOUT_MS = 10000;

// ── Result builders (same pattern as GitHubConnector) ──────────────────────────

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "google", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal" | "timeout",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "google", executionId: eid, logs };
}

function notConfigured(start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("warn", `[${op}] NOT_CONFIGURED — no Google access token available. Complete OAuth flow in /connections.`));
  return {
    status: "NOT_CONFIGURED",
    success: false,
    error: "Google access token not configured. Connect your Google Workspace in /connections to enable Gmail integration.",
    duration,
    connectorId: "google",
    executionId: eid,
    logs,
  };
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

async function gmailFetch(path: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{
  ok: boolean; status: number; data: unknown; responseTimeMs: number; error?: string;
}> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GMAIL_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    let data: unknown = null;
    try { data = await res.json(); } catch { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, data, responseTimeMs: Date.now() - t0 };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = (err as Error).name === "AbortError";
    return { ok: false, status: 0, data: null, responseTimeMs: Date.now() - t0, error: isAbort ? "Request timed out" : (err as Error).message };
  }
}

// ── GmailConnector ─────────────────────────────────────────────────────────────

// ── Health metrics (in-memory per connector instance) ─────────────────────────

interface HealthMetrics {
  consecutiveFailures: number;
  lastSyncAt: number | null;
  lastCheckedAt: number | null;
  responseTimes: number[];   // last 10 response times for avg calculation
}

export class GmailConnector implements IConnector {
  readonly id = "google";
  private initialized = false;
  private _metrics: HealthMetrics = {
    consecutiveFailures: 0,
    lastSyncAt: null,
    lastCheckedAt: null,
    responseTimes: [],
  };

  metadata(): ConnectorMetadata {
    return {
      id: "google",
      name: "Google Workspace — Gmail Connector",
      version: "1.0.0",
      description: "Gmail integration via Google OAuth 2.0. Reads messages, threads, labels, and profile. Read-only.",
      author: "MemoryOS",
      capabilities: [
        "auth.profile",
        "gmail.messages.list",
        "gmail.messages.get",
        "gmail.threads.list",
        "gmail.threads.get",
        "gmail.labels.list",
        "connectivity.ping",
        "health.full",
      ],
    };
  }

  validate(): boolean { return true; }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Token availability is checked lazily at execute time
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async health(): Promise<ConnectorHealthReport> {
    const checkedAt = Date.now();
    this._metrics.lastCheckedAt = checkedAt;

    const token = this._getToken();
    const connected = isConnected("default");
    const conn = getConnection("default");
    const gaMetrics = getMetrics();

    // ── Derived health metrics ──────────────────────────────────────────────────
    const avgResponseTimeMs = this._metrics.responseTimes.length > 0
      ? Math.round(this._metrics.responseTimes.reduce((a, b) => a + b, 0) / this._metrics.responseTimes.length)
      : null;

    const healthExtra = {
      lastSyncAt:            this._metrics.lastSyncAt ? new Date(this._metrics.lastSyncAt).toISOString() : null,
      consecutiveFailures:   this._metrics.consecutiveFailures,
      avgResponseTimeMs,
      lastCheckedAt:         new Date(checkedAt).toISOString(),
      googleSessionConnectedAt: conn?.connectedAt ? new Date(conn.connectedAt).toISOString() : null,
      googleSessionExpiresAt:   conn?.expiresAt   ? new Date(conn.expiresAt).toISOString()   : null,
      totalWorkspaces:       gaMetrics.totalWorkspaces,
    };

    if (!token) {
      return {
        status: "unhealthy",
        connectorId: this.id,
        checkedAt,
        details: "NOT_CONFIGURED — no Google access token. Connect Google Workspace in /connections.",
        checks: [
          { name: "Google session",  passed: connected, detail: connected ? "GoogleAuthSession: CONNECTED" : "GoogleAuthSession: NOT_CONNECTED" },
          { name: "Access token",    passed: false,     detail: "No real access token — OAuth backend token exchange required" },
          { name: "Gmail API",       passed: false,     detail: "Skipped — no token" },
        ],
        ...healthExtra,
      } as any;
    }

    // Real token available — probe Gmail API
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [
      { name: "Google session", passed: connected, detail: "GoogleAuthSession: CONNECTED" },
      { name: "Access token",   passed: true,      detail: "Real access token present" },
    ];

    try {
      const res = await gmailFetch("/gmail/v1/users/me/profile", token, 5000);
      const apiOk = res.ok && !!(res.data as any)?.emailAddress;
      this._recordResponseTime(res.responseTimeMs);
      if (apiOk) {
        this._metrics.consecutiveFailures = 0;
        this._metrics.lastSyncAt = Date.now();
      } else {
        this._metrics.consecutiveFailures++;
      }
      checks.push({
        name: "Gmail API",
        passed: apiOk,
        detail: apiOk
          ? `Authenticated as: ${(res.data as any).emailAddress} (${res.responseTimeMs}ms)`
          : `HTTP ${res.status} — ${res.responseTimeMs}ms`,
      });
    } catch (e) {
      this._metrics.consecutiveFailures++;
      checks.push({ name: "Gmail API", passed: false, detail: String(e) });
    }

    const allPassed = checks.every(c => c.passed);
    return {
      status: allPassed ? "healthy" : "degraded",
      connectorId: this.id,
      checkedAt,
      details: allPassed ? "All checks passed" : `${checks.filter(c => !c.passed).map(c => c.name).join(", ")} failed`,
      checks,
      ...healthExtra,
    } as any;
  }

  async execute(operation: string, payload: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid} Starting`)];

    // Use GoogleAuthSession's public API exclusively — no global vars, no internal state access.
    // ensureValidToken will refresh the session if near expiry.
    await ensureValidToken("default");

    const token = this._getToken();
    if (!token) {
      return notConfigured(start, eid, logs, operation);
    }

    try {
      const result = await this._dispatch(operation, payload, start, eid, logs, token);
      if (result.success) {
        this._metrics.consecutiveFailures = 0;
        this._metrics.lastSyncAt = Date.now();
      } else {
        this._metrics.consecutiveFailures++;
      }
      return result;
    } catch (err) {
      this._metrics.consecutiveFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Unhandled exception: ${msg}`, "internal", start, eid, logs, operation);
    }
  }

  /**
   * Obtain access token via GoogleAuthSession's public interface only.
   *
   * LIMITATION (Impl-003):
   *   GoogleAuthSession (Impl-001) currently stores only an opaque tokenRef
   *   (gw-tok-*), not a real OAuth access token. A backend function performing
   *   the OAuth code→token exchange is required before real API calls can be made.
   *   This method returns null intentionally until that backend is available.
   *   No globalThis or internal state is accessed here.
   */
  private _getToken(): string | null {
    // GoogleAuthSession's public API does not yet expose a real access token.
    // When getAccessToken() or equivalent is added to GoogleAuthSession's public API
    // after backend OAuth exchange is implemented, this is the only method to update.
    return null;
  }

  private _recordResponseTime(ms: number): void {
    this._metrics.responseTimes.push(ms);
    if (this._metrics.responseTimes.length > 10) {
      this._metrics.responseTimes.shift();
    }
  }

  private async _dispatch(
    operation: string,
    payload: Record<string, unknown>,
    start: number,
    eid: string,
    logs: ConnectorLog[],
    token: string,
  ): Promise<ConnectorResult> {

    switch (operation) {

      // ── Connectivity ─────────────────────────────────────────────────────────

      case "connectivity.ping": {
        const res = await gmailFetch("/gmail/v1/users/me/profile", token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid or expired (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const d = res.data as any;
        return ok({ pong: true, email: d?.emailAddress, responseTimeMs: res.responseTimeMs }, start, eid, logs, operation);
      }

      // ── Auth / Profile ───────────────────────────────────────────────────────

      case "auth.profile": {
        const res = await gmailFetch("/gmail/v1/users/me/profile", token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const d = res.data as any;
        return ok({
          emailAddress: d.emailAddress,
          messagesTotal: d.messagesTotal,
          threadsTotal: d.threadsTotal,
          historyId: d.historyId,
        }, start, eid, logs, operation);
      }

      // ── Messages ─────────────────────────────────────────────────────────────

      case "gmail.messages.list": {
        const maxResults = typeof payload.maxResults === "number" ? Math.min(payload.maxResults, 50) : 20;
        const q = typeof payload.q === "string" ? `&q=${encodeURIComponent(payload.q)}` : "";
        const labelIds = typeof payload.labelIds === "string" ? `&labelIds=${encodeURIComponent(payload.labelIds)}` : "";
        const res = await gmailFetch(`/gmail/v1/users/me/messages?maxResults=${maxResults}${q}${labelIds}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const d = res.data as any;
        return ok({
          messages: (d.messages ?? []).map((m: any) => ({ id: m.id, threadId: m.threadId })),
          resultSizeEstimate: d.resultSizeEstimate ?? 0,
          nextPageToken: d.nextPageToken ?? null,
        }, start, eid, logs, operation);
      }

      case "gmail.messages.get": {
        const id = typeof payload.id === "string" ? payload.id : null;
        if (!id) return fail("message id required", "validation", start, eid, logs, operation);
        const format = typeof payload.format === "string" ? payload.format : "metadata";
        const res = await gmailFetch(`/gmail/v1/users/me/messages/${id}?format=${format}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (res.status === 404) return fail(`Message "${id}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const msg = res.data as any;
        const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>;
        const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
        return ok({
          id: msg.id,
          threadId: msg.threadId,
          labelIds: msg.labelIds ?? [],
          snippet: msg.snippet ?? "",
          subject: getHeader("Subject"),
          from: getHeader("From"),
          to: getHeader("To"),
          date: getHeader("Date"),
          internalDate: msg.internalDate,
          sizeEstimate: msg.sizeEstimate,
        }, start, eid, logs, operation);
      }

      // ── Threads ──────────────────────────────────────────────────────────────

      case "gmail.threads.list": {
        const maxResults = typeof payload.maxResults === "number" ? Math.min(payload.maxResults, 50) : 20;
        const q = typeof payload.q === "string" ? `&q=${encodeURIComponent(payload.q)}` : "";
        const res = await gmailFetch(`/gmail/v1/users/me/threads?maxResults=${maxResults}${q}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const d = res.data as any;
        return ok({
          threads: (d.threads ?? []).map((t: any) => ({ id: t.id, snippet: t.snippet ?? "" })),
          resultSizeEstimate: d.resultSizeEstimate ?? 0,
          nextPageToken: d.nextPageToken ?? null,
        }, start, eid, logs, operation);
      }

      case "gmail.threads.get": {
        const id = typeof payload.id === "string" ? payload.id : null;
        if (!id) return fail("thread id required", "validation", start, eid, logs, operation);
        const res = await gmailFetch(`/gmail/v1/users/me/threads/${id}?format=metadata`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (res.status === 404) return fail(`Thread "${id}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const thread = res.data as any;
        return ok({
          id: thread.id,
          snippet: thread.snippet ?? "",
          historyId: thread.historyId,
          messageCount: (thread.messages ?? []).length,
          messages: (thread.messages ?? []).map((m: any) => {
            const hdrs = (m.payload?.headers ?? []) as Array<{ name: string; value: string }>;
            const h = (name: string) => hdrs.find(x => x.name.toLowerCase() === name.toLowerCase())?.value ?? null;
            return { id: m.id, subject: h("Subject"), from: h("From"), date: h("Date"), snippet: m.snippet ?? "" };
          }),
        }, start, eid, logs, operation);
      }

      // ── Labels ───────────────────────────────────────────────────────────────

      case "gmail.labels.list": {
        const res = await gmailFetch("/gmail/v1/users/me/labels", token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const d = res.data as any;
        return ok({
          labels: (d.labels ?? []).map((l: any) => ({
            id: l.id,
            name: l.name,
            type: l.type,
            messagesTotal: l.messagesTotal,
            messagesUnread: l.messagesUnread,
          })),
        }, start, eid, logs, operation);
      }

      // ── Full health ──────────────────────────────────────────────────────────

      case "health.full": {
        const report = await this.health();
        return ok(report, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }
}