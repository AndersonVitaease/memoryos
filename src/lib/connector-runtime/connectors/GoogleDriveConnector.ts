/**
 * GoogleDriveConnector — Implementation 006 (Adapter)
 * Sprint EF — Architectural Unification
 *
 * RESPONSABILIDADE: adapter IConnector → GWS Foundation.
 *
 * Este arquivo NÃO contém:
 *   - fetch() / driveFetch() — eliminado
 *   - URLs da Drive API — eliminadas
 *   - Lógica de Authorization header — eliminada
 *   - ensureValidToken / getAccessToken — eliminados
 *   - _mapFile() — eliminado
 *   - Tratamento HTTP (status codes, parsing) — eliminado
 *
 * Toda lógica HTTP, auth, rate limiting, audit logging e observabilidade
 * (TOKEN-PROBE, RuntimeDebug) existe SOMENTE em:
 *   src/lib/google-drive/GoogleDriveConnector.ts  (GWS Foundation)
 *
 * Arquitetura resultante:
 *   ConversationRuntimeEngine
 *     → UniversalConnectorRouter
 *       → GoogleDriveConnector [este arquivo — Adapter]
 *         → GWS Foundation (listFiles / searchFiles / readFileMetadata / downloadMedia / exportFile)
 *           → Google Drive API
 *
 * Contratos públicos preservados:
 *   - IConnector interface (id, metadata, initialize, shutdown, health, execute, validate)
 *   - ConnectorResult shape (status, success, data, duration, connectorId, executionId, logs)
 *   - capability names: drive.files.list, drive.files.get, drive.files.search,
 *                       drive.about.get, drive.downloadFile, connectivity.ping, health.full
 */

import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
} from "../ConnectorTypes";
import { makeLog } from "../ConnectorTypes";
import { isConnected, getConnection, getMetrics, getAccessToken } from "../../google-auth/GoogleAuthSession";

// ── Result builders ────────────────────────────────────────────────────────────

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

// ── Health metrics ─────────────────────────────────────────────────────────────

interface HealthMetrics {
  consecutiveFailures: number;
  lastSyncAt: number | null;
  lastCheckedAt: number | null;
  responseTimes: number[];
}

// ── GoogleDriveConnector (Adapter) ────────────────────────────────────────────

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
      version: "2.0.0",
      description: "Google Drive integration via GWS Foundation. Lists, searches, and retrieves files. Read-only.",
      author: "MemoryOS",
      capabilities: [
        "drive.files.list",
        "drive.files.get",
        "drive.files.search",
        "drive.about.get",
        "drive.downloadFile",
        "connectivity.ping",
        "health.full",
      ],
    };
  }

  validate(): boolean { return true; }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async health(): Promise<ConnectorHealthReport> {
    const checkedAt = Date.now();
    this._metrics.lastCheckedAt = checkedAt;

    const token     = getAccessToken("default");
    const connected = isConnected("default");
    const conn      = getConnection("default");
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

    // Probe Drive via GWS Foundation — getDriveHealth() reads from GoogleAuthSession
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [
      { name: "Google session", passed: connected, detail: "GoogleAuthSession: CONNECTED" },
      { name: "Access token",   passed: true,      detail: "Real access token present" },
    ];

    try {
      // Use GWS Foundation's getDriveHealth for the API probe
      const { getDriveHealth } = await import("../../google-drive/GoogleDriveConnector");
      const probe = getDriveHealth();
      const apiOk = probe.ok;
      if (apiOk) {
        this._metrics.consecutiveFailures = 0;
        this._metrics.lastSyncAt = Date.now();
      } else {
        this._metrics.consecutiveFailures++;
      }
      checks.push({ name: "Drive API", passed: apiOk, detail: probe.reason });
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
    const eid   = context.executionId ?? "";
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid} Starting`)];

    // Auth check — GWS Foundation owns ensureValidToken; we only check if token exists
    const token = getAccessToken("default");
    if (!token) {
      // Attempt refresh via GWS Foundation before giving up
      try {
        const { ensureValidToken } = await import("../../google-auth/GoogleAuthSession");
        await ensureValidToken("default");
      } catch {
        return notConfigured(start, eid, logs, operation);
      }
      // Re-check after refresh attempt
      if (!getAccessToken("default")) {
        return notConfigured(start, eid, logs, operation);
      }
    }

    try {
      const result = await this._dispatch(operation, payload, start, eid, logs);
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

  private _recordResponseTime(ms: number): void {
    this._metrics.responseTimes.push(ms);
    if (this._metrics.responseTimes.length > 10) this._metrics.responseTimes.shift();
  }

  // ── Dispatch — delegates ALL HTTP to GWS Foundation ──────────────────────

  private async _dispatch(
    operation: string,
    payload: Record<string, unknown>,
    start: number,
    eid: string,
    logs: ConnectorLog[],
  ): Promise<ConnectorResult> {

    // Lazy import GWS Foundation — single source of all Drive HTTP
    const gws = await import("../../google-drive/GoogleDriveConnector");

    switch (operation) {

      // ── Connectivity ping ───────────────────────────────────────────────────
      // GWS Foundation's getDriveHealth() is a lightweight status check.
      // For a real API round-trip ping, we use listFiles with pageSize=1.

      case "connectivity.ping": {
        const t0 = Date.now();
        try {
          const result = await gws.listFiles({ pageSize: 1 });
          const responseTimeMs = Date.now() - t0;
          this._recordResponseTime(responseTimeMs);
          logs.push(makeLog("info", `[${operation}] ping OK — ${responseTimeMs}ms`));
          return ok({ pong: true, emailAddress: null, responseTimeMs }, start, eid, logs, operation);
        } catch (e) {
          const msg = (e as Error).message;
          logs.push(makeLog("error", `[${operation}] ping FAILED — ${msg}`));
          if (msg.includes("Not authenticated") || msg.includes("NOT_AUTHENTICATED")) {
            return fail("Token invalid or expired", "auth", start, eid, logs, operation);
          }
          return fail(msg, "external", start, eid, logs, operation);
        }
      }

      // ── About ───────────────────────────────────────────────────────────────
      // GWS Foundation does not expose a direct about() — use getDriveHealth()
      // which is a lightweight session check, and enrich with connection metadata.

      case "drive.about.get": {
        const conn = getConnection("default");
        const health = gws.getDriveHealth();
        logs.push(makeLog("info", `[${operation}] health=${health.ok} reason="${health.reason}"`));
        if (!health.ok) {
          return fail(health.reason, "auth", start, eid, logs, operation);
        }
        return ok({
          user: {
            displayName:  conn?.displayName  ?? null,
            emailAddress: conn?.email        ?? null,
            photoLink:    conn?.avatarUrl    ?? null,
          },
          storageQuota: null,  // not exposed by GWS Foundation getDriveHealth()
          maxUploadSize: null,
        }, start, eid, logs, operation);
      }

      // ── Files List ──────────────────────────────────────────────────────────
      // Delegates to GWS Foundation listFiles() — which owns all HTTP, auth,
      // rate limiting, audit logging, and TOKEN-PROBE instrumentation.

      case "drive.files.list": {
        const pageSize  = typeof payload.pageSize  === "number" ? Math.min(payload.pageSize, 100) : 20;
        const orderBy   = typeof payload.orderBy   === "string" ? payload.orderBy : "modifiedTime desc";
        const pageToken = typeof payload.pageToken === "string" ? payload.pageToken : undefined;
        const folderId  = typeof payload.folderId  === "string" ? payload.folderId : undefined;

        const result = await gws.listFiles({ pageSize, orderBy, pageToken, folderId });
        this._recordResponseTime(result.durationMs);
        logs.push(makeLog("info", `[${operation}] ${result.files.length} files — ${result.durationMs}ms`));

        return ok({
          files:          result.files.map(this._mapDriveFile),
          nextPageToken:  result.nextPageToken ?? null,
        }, start, eid, logs, operation);
      }

      // ── Files Search ────────────────────────────────────────────────────────
      // Delegates to GWS Foundation searchFiles() — which owns all HTTP.
      // Sprint C-01 behaviour preserved: empty q falls back to listing all.

      case "drive.files.search": {
        const q        = (typeof payload.q === "string" && payload.q.trim().length > 0)
          ? payload.q.trim()
          : "trashed=false";
        const pageSize = typeof payload.pageSize === "number" ? Math.min(payload.pageSize, 100) : 20;

        const result = await gws.searchFiles(q, { pageSize });
        this._recordResponseTime(result.durationMs);
        logs.push(makeLog("info", `[${operation}] q=${q} ${result.files.length} files — ${result.durationMs}ms`));

        return ok({
          query:         q,
          files:         result.files.map(this._mapDriveFile),
          nextPageToken: result.nextPageToken ?? null,
        }, start, eid, logs, operation);
      }

      // ── Files Get ───────────────────────────────────────────────────────────
      // Delegates to GWS Foundation readFileMetadata().

      case "drive.files.get": {
        const fileId = typeof payload.fileId === "string" ? payload.fileId : null;
        if (!fileId) return fail("fileId is required", "validation", start, eid, logs, operation);

        const t0     = Date.now();
        const result = await gws.readFileMetadata(fileId);
        this._recordResponseTime(Date.now() - t0);
        logs.push(makeLog("info", `[${operation}] fileId=${fileId} ok=${result.ok}`));

        if (!result.ok || !result.data) {
          const msg = result.error ?? `File "${fileId}" not found`;
          if (msg.includes("404") || msg.includes("not found")) return fail(msg, "external", start, eid, logs, operation);
          if (msg.includes("401") || msg.includes("Token")) return fail(msg, "auth", start, eid, logs, operation);
          return fail(msg, "external", start, eid, logs, operation);
        }

        return ok({
          ...this._mapDriveFile(result.data),
          description:    (result.data as any).description    ?? null,
          md5Checksum:    (result.data as any).md5Checksum    ?? null,
          sha256Checksum: (result.data as any).sha256Checksum ?? null,
          capabilities:   (result.data as any).capabilities   ?? null,
        }, start, eid, logs, operation);
      }

      // ── Download File ────────────────────────────────────────────────────────
      // Delegates to DriveDownloadExecutor (unchanged) which already delegates
      // all HTTP to GWS Foundation. Token param kept for interface compat.

      case "drive.downloadFile": {
        const { executeDriveDownload } = await import("../../google-drive/DriveDownloadExecutor");
        const enrichedPayload = { ...payload, _debugExecutionId: eid };
        const result = await executeDriveDownload(enrichedPayload, "");

        if (!result.ok) {
          return fail(result.message, "external", start, eid, logs, operation);
        }

        return ok({
          fileId:     result.fileId,
          fileName:   result.fileName,
          mimeType:   result.mimeType,
          exportMime: result.exportMime,
          strategy:   result.strategy,
          content:    result.content,
          encoding:   result.encoding,
          sizeBytes:  result.sizeBytes,
          resolvedBy: result.resolvedBy,
          apiUsed:    result.apiUsed,
          durationMs: result.durationMs,
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

  // ── Map GWS Foundation DriveFile → Connector Runtime shape ────────────────
  // GWS Foundation returns a richer DriveFile type; we extract only the fields
  // the Connector Runtime declared in its original _mapFile().

  private _mapDriveFile(f: Record<string, unknown>) {
    return {
      id:           f.id,
      name:         f.name,
      mimeType:     f.mimeType,
      size:         f.size ?? null,
      modifiedTime: f.modifiedTime ?? null,
      createdTime:  f.createdTime  ?? null,
      owners:       Array.isArray(f.owners)
        ? (f.owners as Array<{ emailAddress?: string; displayName?: string }>).map((o) => ({
            displayName:  o.displayName  ?? null,
            emailAddress: o.emailAddress ?? null,
          }))
        : [],
      parents:      Array.isArray(f.parents) ? f.parents : [],
      webViewLink:  f.webViewLink  ?? null,
      thumbnailLink:f.thumbnailLink ?? null,
      trashed:      f.trashed      ?? false,
    };
  }
}