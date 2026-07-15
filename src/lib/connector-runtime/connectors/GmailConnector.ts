/**
 * GmailConnector — Implementation 002
 * Google Workspace Gmail Integration
 *
 * Segue exatamente o padrão do GitHubConnector (Beta-01 Reference Connector).
 *
 * Autenticação:
 *   - Em produção: usa o access_token real obtido via PKCE OAuth flow.
 *   - Atualmente: usa o tokenRef do GoogleAuthSession. Como o tokenRef é
 *     uma referência opaca (gw-tok-*), a Gmail API retornará 401 —
 *     o conector retorna NOT_CONFIGURED honestamente.
 *   - Quando um GOOGLE_ACCESS_TOKEN real for injetado via:
 *       globalThis.__GOOGLE_ACCESS_TOKEN__
 *     as chamadas reais funcionam imediatamente sem alteração de código.
 *
 * LIMITAÇÃO DOCUMENTADA:
 *   OAuth real requer backend function para token exchange.
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
import { isConnected, ensureValidToken } from "../../google-auth/GoogleAuthSession";

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

export class GmailConnector implements IConnector {
  readonly id = "google";
  private initialized = false;

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
    const token = this._getToken();
    const connected = isConnected("default");

    if (!token) {
      return {
        status: "unhealthy",
        connectorId: this.id,
        checkedAt,
        details: "NOT_CONFIGURED — no Google access token. Connect Google Workspace in /connections.",
        checks: [
          { name: "Google session", passed: connected, detail: connected ? "GoogleAuthSession: CONNECTED" : "GoogleAuthSession: NOT_CONNECTED" },
          { name: "Access token", passed: false, detail: "No real access token available — OAuth backend required" },
          { name: "Gmail API", passed: false, detail: "Skipped — no token" },
        ],
      } as any;
    }

    // Real token available — test Gmail API
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [
      { name: "Google session", passed: connected, detail: "GoogleAuthSession: CONNECTED" },
      { name: "Access token", passed: true, detail: "Real access token present" },
    ];

    try {
      const res = await gmailFetch("/gmail/v1/users/me/profile", token, 5000);
      const authOk = res.ok && !!(res.data as any)?.emailAddress;
      checks.push({
        name: "Gmail API",
        passed: authOk,
        detail: authOk
          ? `Authenticated as: ${(res.data as any).emailAddress}`
          : `HTTP ${res.status}`,
      });
    } catch (e) {
      checks.push({ name: "Gmail API", passed: false, detail: String(e) });
    }

    const allPassed = checks.every(c => c.passed);
    return {
      status: allPassed ? "healthy" : "degraded",
      connectorId: this.id,
      checkedAt,
      details: allPassed ? "All checks passed" : `${checks.filter(c => !c.passed).map(c => c.name).join(", ")} failed`,
      checks,
    } as any;
  }

  async execute(operation: string, payload: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid} Starting`)];

    // Ensure token is valid (refreshes if needed)
    await ensureValidToken("default");

    const token = this._getToken();
    if (!token) {
      return notConfigured(start, eid, logs, operation);
    }

    try {
      return await this._dispatch(operation, payload, start, eid, logs, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Unhandled exception: ${msg}`, "internal", start, eid, logs, operation);
    }
  }

  private _getToken(): string | null {
    // Priority 1: real access token injected at runtime (future: from backend OAuth exchange)
    const envToken = (globalThis as any).__GOOGLE_ACCESS_TOKEN__
      ?? (globalThis as any).__env__?.GOOGLE_ACCESS_TOKEN
      ?? null;
    if (envToken) return envToken;

    // Priority 2: check GoogleAuthSession — returns opaque tokenRef (not a real token)
    // When backend OAuth is complete, the real token replaces the tokenRef here.
    // For now, this is NOT a real access token and will 401 on the Gmail API.
    // This is intentional: NOT_CONFIGURED is returned honestly.
    return null;
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