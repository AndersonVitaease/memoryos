/**
 * GoogleCalendarConnector — Implementation 004
 * Google Calendar Integration via Google OAuth 2.0
 *
 * Segue exatamente o mesmo padrão arquitetural do GmailConnector (Impl-003).
 *
 * Autenticação:
 *   - Obtém credenciais exclusivamente via interface pública do GoogleAuthSession:
 *       ensureValidToken(workspaceId) → GoogleConnection | null
 *       getConnection(workspaceId)    → GoogleConnection | null
 *       isConnected(workspaceId)      → boolean
 *   - Nenhuma variável global é acessada.
 *   - Nenhum estado interno do GoogleAuthSession é acessado.
 *
 * Operações suportadas:
 *   - calendar.events.list
 *   - calendar.events.get
 *   - calendar.calendars.list
 *   - connectivity.ping
 *   - health.full
 *
 * LIMITAÇÃO DOCUMENTADA (remanescente):
 *   O GoogleAuthSession (Impl-001) armazena apenas tokenRef opaco (gw-tok-*).
 *   Sem backend function de token exchange, o access_token real não está
 *   disponível. O conector retorna NOT_CONFIGURED honestamente nesse caso.
 *   Quando o backend OAuth estiver implementado, apenas _getToken() precisará
 *   ser atualizado — nenhuma outra alteração neste conector.
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

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_TIMEOUT_MS = 10000;

// ── Result builders (same pattern as GmailConnector) ──────────────────────────

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "google-calendar", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal" | "timeout",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "google-calendar", executionId: eid, logs };
}

function notConfigured(start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("warn", `[${op}] NOT_CONFIGURED — no Google access token available. Complete OAuth flow in /connections.`));
  return {
    status: "NOT_CONFIGURED",
    success: false,
    error: "Google access token not configured. Connect your Google Workspace in /connections to enable Google Calendar integration.",
    duration,
    connectorId: "google-calendar",
    executionId: eid,
    logs,
  };
}

// ── HTTP helper (same pattern as GmailConnector) ───────────────────────────────

async function calendarFetch(path: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{
  ok: boolean; status: number; data: unknown; responseTimeMs: number; error?: string;
}> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${CALENDAR_API}${path}`, {
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

// ── Health metrics (in-memory per connector instance) ─────────────────────────

interface HealthMetrics {
  consecutiveFailures: number;
  lastSyncAt: number | null;
  lastCheckedAt: number | null;
  responseTimes: number[]; // last 10 response times for avg calculation
}

// ── GoogleCalendarConnector ───────────────────────────────────────────────────

export class GoogleCalendarConnector implements IConnector {
  readonly id = "google-calendar";
  private initialized = false;
  private _metrics: HealthMetrics = {
    consecutiveFailures: 0,
    lastSyncAt: null,
    lastCheckedAt: null,
    responseTimes: [],
  };

  metadata(): ConnectorMetadata {
    return {
      id: "google-calendar",
      name: "Google Workspace — Calendar Connector",
      version: "1.0.0",
      description: "Google Calendar integration via Google OAuth 2.0. Lists calendars and events. Read-only.",
      author: "MemoryOS",
      capabilities: [
        "calendar.events.list",
        "calendar.events.get",
        "calendar.calendars.list",
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
      lastSyncAt:               this._metrics.lastSyncAt ? new Date(this._metrics.lastSyncAt).toISOString() : null,
      consecutiveFailures:      this._metrics.consecutiveFailures,
      avgResponseTimeMs,
      lastCheckedAt:            new Date(checkedAt).toISOString(),
      googleSessionConnectedAt: conn?.connectedAt ? new Date(conn.connectedAt).toISOString() : null,
      googleSessionExpiresAt:   conn?.expiresAt   ? new Date(conn.expiresAt).toISOString()   : null,
      totalWorkspaces:          gaMetrics.totalWorkspaces,
    };

    if (!token) {
      return {
        status: "unhealthy",
        connectorId: this.id,
        checkedAt,
        details: "NOT_CONFIGURED — no Google access token. Connect Google Workspace in /connections.",
        checks: [
          { name: "Google session",   passed: connected, detail: connected ? "GoogleAuthSession: CONNECTED" : "GoogleAuthSession: NOT_CONNECTED" },
          { name: "Access token",     passed: false,     detail: "No real access token — OAuth backend token exchange required" },
          { name: "Calendar API",     passed: false,     detail: "Skipped — no token" },
        ],
        ...healthExtra,
      } as any;
    }

    // Real token available — probe Calendar API
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [
      { name: "Google session", passed: connected, detail: "GoogleAuthSession: CONNECTED" },
      { name: "Access token",   passed: true,      detail: "Real access token present" },
    ];

    try {
      const res = await calendarFetch("/users/me/calendarList?maxResults=1", token, 5000);
      const apiOk = res.ok;
      this._recordResponseTime(res.responseTimeMs);
      if (apiOk) {
        this._metrics.consecutiveFailures = 0;
        this._metrics.lastSyncAt = Date.now();
      } else {
        this._metrics.consecutiveFailures++;
      }
      checks.push({
        name: "Calendar API",
        passed: apiOk,
        detail: apiOk
          ? `Calendar API reachable (${res.responseTimeMs}ms)`
          : `HTTP ${res.status} — ${res.responseTimeMs}ms`,
      });
    } catch (e) {
      this._metrics.consecutiveFailures++;
      checks.push({ name: "Calendar API", passed: false, detail: String(e) });
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
   * LIMITATION (Impl-004):
   *   GoogleAuthSession (Impl-001) currently stores only an opaque tokenRef
   *   (gw-tok-*), not a real OAuth access token. A backend function performing
   *   the OAuth code→token exchange is required before real API calls can be made.
   *   This method returns null intentionally until that backend is available.
   *   No globalThis or internal state is accessed here.
   */
  private _getToken(): string | null {
    // When getAccessToken() is added to GoogleAuthSession's public API
    // after backend OAuth exchange is implemented, update only this method.
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
        const res = await calendarFetch("/users/me/calendarList?maxResults=1", token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid or expired (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        return ok({ pong: true, responseTimeMs: res.responseTimeMs }, start, eid, logs, operation);
      }

      // ── Calendars ─────────────────────────────────────────────────────────────

      case "calendar.calendars.list": {
        const maxResults = typeof payload.maxResults === "number" ? Math.min(payload.maxResults, 100) : 50;
        const res = await calendarFetch(`/users/me/calendarList?maxResults=${maxResults}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        this._recordResponseTime(res.responseTimeMs);
        const d = res.data as any;
        return ok({
          calendars: (d.items ?? []).map((c: any) => ({
            id: c.id,
            summary: c.summary,
            description: c.description ?? null,
            primary: c.primary ?? false,
            accessRole: c.accessRole,
            backgroundColor: c.backgroundColor ?? null,
          })),
          nextPageToken: d.nextPageToken ?? null,
        }, start, eid, logs, operation);
      }

      // ── Events ────────────────────────────────────────────────────────────────

      case "calendar.events.list": {
        const calendarId = typeof payload.calendarId === "string" ? payload.calendarId : "primary";
        const maxResults = typeof payload.maxResults === "number" ? Math.min(payload.maxResults, 100) : 20;
        const timeMin = typeof payload.timeMin === "string" ? `&timeMin=${encodeURIComponent(payload.timeMin)}` : "";
        const timeMax = typeof payload.timeMax === "string" ? `&timeMax=${encodeURIComponent(payload.timeMax)}` : "";
        const q = typeof payload.q === "string" ? `&q=${encodeURIComponent(payload.q)}` : "";
        const singleEvents = "&singleEvents=true&orderBy=startTime";

        const path = `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=${maxResults}${timeMin}${timeMax}${q}${singleEvents}`;
        const res = await calendarFetch(path, token);
        logs.push(makeLog("info", `[${operation}] calendar=${calendarId} HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (res.status === 404) return fail(`Calendar "${calendarId}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        this._recordResponseTime(res.responseTimeMs);
        const d = res.data as any;
        return ok({
          calendarId,
          events: (d.items ?? []).map((e: any) => ({
            id: e.id,
            summary: e.summary ?? "(No title)",
            description: e.description ?? null,
            location: e.location ?? null,
            status: e.status,
            start: e.start?.dateTime ?? e.start?.date ?? null,
            end: e.end?.dateTime ?? e.end?.date ?? null,
            allDay: !e.start?.dateTime,
            organizer: e.organizer?.email ?? null,
            attendees: (e.attendees ?? []).map((a: any) => ({
              email: a.email,
              displayName: a.displayName ?? null,
              responseStatus: a.responseStatus,
            })),
            htmlLink: e.htmlLink ?? null,
            recurringEventId: e.recurringEventId ?? null,
          })),
          nextPageToken: d.nextPageToken ?? null,
          summary: d.summary ?? calendarId,
          timeZone: d.timeZone ?? null,
        }, start, eid, logs, operation);
      }

      case "calendar.events.get": {
        const calendarId = typeof payload.calendarId === "string" ? payload.calendarId : "primary";
        const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
        if (!eventId) return fail("eventId required", "validation", start, eid, logs, operation);

        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        const res = await calendarFetch(path, token);
        logs.push(makeLog("info", `[${operation}] calendar=${calendarId} event=${eventId} HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (res.status === 404) return fail(`Event "${eventId}" not found in calendar "${calendarId}"`, "external", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        this._recordResponseTime(res.responseTimeMs);
        const e = res.data as any;
        return ok({
          id: e.id,
          summary: e.summary ?? "(No title)",
          description: e.description ?? null,
          location: e.location ?? null,
          status: e.status,
          start: e.start?.dateTime ?? e.start?.date ?? null,
          end: e.end?.dateTime ?? e.end?.date ?? null,
          allDay: !e.start?.dateTime,
          organizer: e.organizer?.email ?? null,
          creator: e.creator?.email ?? null,
          attendees: (e.attendees ?? []).map((a: any) => ({
            email: a.email,
            displayName: a.displayName ?? null,
            responseStatus: a.responseStatus,
            organizer: a.organizer ?? false,
          })),
          htmlLink: e.htmlLink ?? null,
          created: e.created ?? null,
          updated: e.updated ?? null,
          recurringEventId: e.recurringEventId ?? null,
          recurrence: e.recurrence ?? null,
          conferenceData: e.conferenceData
            ? {
                entryPoints: (e.conferenceData.entryPoints ?? []).map((ep: any) => ({
                  entryPointType: ep.entryPointType,
                  uri: ep.uri,
                  label: ep.label ?? null,
                })),
              }
            : null,
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