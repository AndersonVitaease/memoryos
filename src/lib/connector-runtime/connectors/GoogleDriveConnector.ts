/**
 * GoogleDriveConnector — Implementation 005
 * Google Drive Integration via Google OAuth 2.0
 *
 * Segue exatamente o mesmo padrao arquitetural do GmailConnector (Impl-003)
 * e GoogleCalendarConnector (Impl-004).
 *
 * Autenticacao:
 *   - Obtem credenciais exclusivamente via interface publica do GoogleAuthSession:
 *       ensureValidToken(workspaceId) -> GoogleConnection | null
 *       getConnection(workspaceId)    -> GoogleConnection | null
 *       isConnected(workspaceId)      -> boolean
 *   - Nenhuma variavel global e acessada.
 *   - Nenhum estado interno do GoogleAuthSession e acessado.
 *
 * Operacoes suportadas:
 *   - drive.files.list
 *   - drive.files.get
 *   - drive.files.search
 *   - drive.about.get
 *   - connectivity.ping
 *   - health.full
 *
 * LIMITACAO DOCUMENTADA (remanescente):
 *   O GoogleAuthSession (Impl-001) armazena apenas tokenRef opaco (gw-tok-*).
 *   Sem backend function de token exchange, o access_token real nao esta
 *   disponivel. O conector retorna NOT_CONFIGURED honestamente nesse caso.
 *   Quando o backend OAuth estiver implementado, apenas _getToken() precisara
 *   ser atualizado — nenhuma outra alteracao neste conector.
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
import { isConnected, ensureValidToken, getConnection, getMetrics, getAccessToken } from "../../google-auth/GoogleAuthSession";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DEFAULT_TIMEOUT_MS = 10000;

// -- Result builders (same pattern as GmailConnector / GoogleCalendarConnector) -

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "google-drive", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal" | "timeout",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "google-drive", executionId: eid, logs };
}

function notConfigured(start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("warn", `[${op}] NOT_CONFIGURED — no Google access token available. Complete OAuth flow in /connections.`));
  return {
    status: "NOT_CONFIGURED",
    success: false,
    error: "Google access token not configured. Connect your Google Workspace in /connections to enable Google Drive integration.",
    duration,
    connectorId: "google-drive",
    executionId: eid,
    logs,
  };
}

// -- HTTP helper (same pattern as GmailConnector) ------------------------------

async function driveFetch(path: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{
  ok: boolean; status: number; data: unknown; responseTimeMs: number; error?: string;
}> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DRIVE_API}${path}`, {
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

// -- Health metrics (in-memory per connector instance) ------------------------

interface HealthMetrics {
  consecutiveFailures: number;
  lastSyncAt: number | null;
  lastCheckedAt: number | null;
  responseTimes: number[]; // last 10 response times for avg calculation
}

// -- GoogleDriveConnector -----------------------------------------------------

export class GoogleDriveConnector implements IConnector {
  readonly id = "google-drive";
  private initialized = false;
  private _metrics: HealthMetrics = {
    consecutiveFailures: 0,
    lastSyncAt: null,
    lastCheckedAt: null,
    responseTimes: [],
  };

  metadata(): ConnectorMetadata {
    return {
      id: "google-drive",
      name: "Google Workspace — Drive Connector",
      version: "1.0.0",
      description: "Google Drive integration via Google OAuth 2.0. Lists, searches, and retrieves files. Read-only.",
      author: "MemoryOS",
      capabilities: [
        "drive.files.list",
        "drive.files.get",
        "drive.files.search",
        "drive.about.get",
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
          { name: "Google session", passed: connected, detail: connected ? "GoogleAuthSession: CONNECTED" : "GoogleAuthSession: NOT_CONNECTED" },
          { name: "Access token",   passed: false,     detail: "No real access token — OAuth backend token exchange required" },
          { name: "Drive API",      passed: false,     detail: "Skipped — no token" },
        ],
        ...healthExtra,
      } as any;
    }

    // Real token available — probe Drive API
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [
      { name: "Google session", passed: connected, detail: "GoogleAuthSession: CONNECTED" },
      { name: "Access token",   passed: true,      detail: "Real access token present" },
    ];

    try {
      const res = await driveFetch("/about?fields=user", token, 5000);
      const apiOk = res.ok && !!(res.data as any)?.user;
      this._recordResponseTime(res.responseTimeMs);
      if (apiOk) {
        this._metrics.consecutiveFailures = 0;
        this._metrics.lastSyncAt = Date.now();
      } else {
        this._metrics.consecutiveFailures++;
      }
      checks.push({
        name: "Drive API",
        passed: apiOk,
        detail: apiOk
          ? `Authenticated as: ${(res.data as any)?.user?.emailAddress ?? "unknown"} (${res.responseTimeMs}ms)`
          : `HTTP ${res.status} — ${res.responseTimeMs}ms`,
      });
    } catch (e) {
      this._metrics.consecutiveFailures++;
      checks.push({ name: "Drive API", passed: false, detail: String(e) });
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
   * Obtain real access token via GoogleAuthSession's public getAccessToken() API.
   * Implementation 007: real OAuth token available after backend exchange.
   * Token is stored in memory by GoogleAuthSession — never in localStorage.
   */
  private _getToken(): string | null {
    return getAccessToken("default");
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

      // -- Connectivity --------------------------------------------------------

      case "connectivity.ping": {
        const res = await driveFetch("/about?fields=user", token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid or expired (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        const d = res.data as any;
        return ok({ pong: true, emailAddress: d?.user?.emailAddress ?? null, responseTimeMs: res.responseTimeMs }, start, eid, logs, operation);
      }

      // -- About ---------------------------------------------------------------

      case "drive.about.get": {
        const fields = "user,storageQuota,maxImportSizes,maxUploadSize";
        const res = await driveFetch(`/about?fields=${encodeURIComponent(fields)}`, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        this._recordResponseTime(res.responseTimeMs);
        const d = res.data as any;
        return ok({
          user: {
            displayName: d.user?.displayName ?? null,
            emailAddress: d.user?.emailAddress ?? null,
            photoLink: d.user?.photoLink ?? null,
          },
          storageQuota: d.storageQuota
            ? {
                limit: d.storageQuota.limit ?? null,
                usage: d.storageQuota.usage ?? null,
                usageInDrive: d.storageQuota.usageInDrive ?? null,
                usageInDriveTrash: d.storageQuota.usageInDriveTrash ?? null,
              }
            : null,
          maxUploadSize: d.maxUploadSize ?? null,
        }, start, eid, logs, operation);
      }

      // -- Files List ----------------------------------------------------------

      case "drive.files.list": {
        const pageSize = typeof payload.pageSize === "number" ? Math.min(payload.pageSize, 100) : 20;
        const orderBy = typeof payload.orderBy === "string" ? payload.orderBy : "modifiedTime desc";
        const fields = "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,owners,parents,webViewLink,thumbnailLink,trashed)";
        const pageToken = typeof payload.pageToken === "string" ? `&pageToken=${encodeURIComponent(payload.pageToken)}` : "";

        const path = `/files?pageSize=${pageSize}&orderBy=${encodeURIComponent(orderBy)}&fields=${encodeURIComponent(fields)}${pageToken}`;
        const res = await driveFetch(path, token);
        logs.push(makeLog("info", `[${operation}] HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        this._recordResponseTime(res.responseTimeMs);
        const d = res.data as any;
        return ok({
          files: (d.files ?? []).map((f: any) => this._mapFile(f)),
          nextPageToken: d.nextPageToken ?? null,
        }, start, eid, logs, operation);
      }

      // -- Files Search --------------------------------------------------------

      case "drive.files.search": {
        // Sprint C-01: when "q" is absent or empty, fall back to listing all
        // non-trashed files (same semantics as drive.files.list but via search path).
        // This eliminates the [validation] 'q' is required error that occurred when
        // the Planner produced a search step with no query parameter.
        const q = (typeof payload.q === "string" && payload.q.trim().length > 0)
          ? payload.q
          : "trashed=false";
        const pageSize = typeof payload.pageSize === "number" ? Math.min(payload.pageSize, 100) : 20;
        const fields = "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,owners,parents,webViewLink,thumbnailLink,trashed)";

        const path = `/files?q=${encodeURIComponent(q)}&pageSize=${pageSize}&fields=${encodeURIComponent(fields)}`;
        const res = await driveFetch(path, token);
        logs.push(makeLog("info", `[${operation}] q=${q} HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        this._recordResponseTime(res.responseTimeMs);
        const d = res.data as any;
        return ok({
          query: q,
          files: (d.files ?? []).map((f: any) => this._mapFile(f)),
          nextPageToken: d.nextPageToken ?? null,
        }, start, eid, logs, operation);
      }

      // -- Files Get -----------------------------------------------------------

      case "drive.files.get": {
        // ── FILEID LIFECYCLE — STEP 7+8: Payload received by drive.files.get
        console.group("%c[FILEID-LIFECYCLE][7-DRIVE-FILES-GET-PAYLOAD]", "color:#ef4444;font-weight:bold");
        console.log("timestamp         :", new Date().toISOString());
        console.log("operation         :", operation);
        console.log("executionId       :", eid);
        console.log("payload (full)    :", JSON.stringify(payload));
        console.log("payload.fileId    :", payload.fileId ?? "ABSENT");
        console.log("payload.fileName  :", payload.fileName ?? "ABSENT");
        console.log("typeof fileId     :", typeof payload.fileId);
        console.log("fileId is truthy  :", !!(payload.fileId));
        // Stack trace to see call chain
        console.log("call stack        :", new Error("stack-capture").stack);
        console.groupEnd();

        const fileId = typeof payload.fileId === "string" ? payload.fileId : null;

        // ── FILEID LIFECYCLE — STEP 9: Validation result
        console.group("%c[FILEID-LIFECYCLE][9-VALIDATION]", fileId ? "color:#22c55e;font-weight:bold" : "color:#ef4444;font-weight:bold");
        console.log("timestamp         :", new Date().toISOString());
        console.log("resolvedFileId    :", fileId ?? "NULL — VALIDATION WILL FAIL");
        console.log("source            :", "payload.fileId (string coercion)");
        console.log("WILL_FAIL         :", !fileId);
        console.groupEnd();

        if (!fileId) return fail("fileId is required", "validation", start, eid, logs, operation);
        const fields = "id,name,mimeType,size,modifiedTime,createdTime,owners,parents,webViewLink,thumbnailLink,trashed,description,md5Checksum,sha256Checksum,capabilities";

        const res = await driveFetch(`/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`, token);
        logs.push(makeLog("info", `[${operation}] fileId=${fileId} HTTP ${res.status} — ${res.responseTimeMs}ms`));
        if (res.status === 401) return fail("Token invalid (401)", "auth", start, eid, logs, operation);
        if (res.status === 404) return fail(`File "${fileId}" not found`, "external", start, eid, logs, operation);
        if (!res.ok) return fail(`HTTP ${res.status}`, "external", start, eid, logs, operation);
        this._recordResponseTime(res.responseTimeMs);
        const f = res.data as any;
        return ok({
          ...this._mapFile(f),
          description: f.description ?? null,
          md5Checksum: f.md5Checksum ?? null,
          sha256Checksum: f.sha256Checksum ?? null,
          capabilities: f.capabilities ?? null,
        }, start, eid, logs, operation);
      }

      // -- Full health ---------------------------------------------------------

      case "health.full": {
        const report = await this.health();
        return ok(report, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }

  // -- Private helpers --------------------------------------------------------

  private _mapFile(f: any) {
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ?? null,
      modifiedTime: f.modifiedTime ?? null,
      createdTime: f.createdTime ?? null,
      owners: (f.owners ?? []).map((o: any) => ({
        displayName: o.displayName ?? null,
        emailAddress: o.emailAddress ?? null,
      })),
      parents: f.parents ?? [],
      webViewLink: f.webViewLink ?? null,
      thumbnailLink: f.thumbnailLink ?? null,
      trashed: f.trashed ?? false,
    };
  }
}