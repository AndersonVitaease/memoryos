/**
 * FileSystemConnector.ts — P4 Official Connector
 *
 * File system abstraction connector — production implementation.
 * Delegates to GoogleDriveConnector for Google-authenticated users.
 * Falls back gracefully when no provider is configured.
 *
 * Pattern: identical to GmailConnector / GoogleCalendarConnector.
 * Pipeline: ConnectorBootstrap → ConnectorRegistry → UCRBridge → execute()
 *
 * Supported operations:
 *   - fs.list           — list files/folders at a path
 *   - fs.read           — read file content
 *   - fs.search         — search files by name/content
 *   - fs.upload         — upload a file
 *   - fs.delete         — delete a file
 *   - fs.createFolder   — create a folder
 *   - connectivity.ping
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
import { isConnected } from "@/lib/google-auth/GoogleAuthSession";

const CAPABILITIES = Object.freeze([
  "fs.list",
  "fs.read",
  "fs.search",
  "fs.upload",
  "fs.delete",
  "fs.createFolder",
  "connectivity.ping",
]);

// ── Result builders (same pattern as GoogleCalendarConnector) ─────────────────

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "filesystem", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "filesystem", executionId: eid, logs };
}

function notConfigured(start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("warn", `[${op}] NOT_CONFIGURED — no file system provider connected`));
  return {
    status: "NOT_CONFIGURED",
    success: false,
    error: "No file system provider configured. Connect your Google Workspace in /connections.",
    duration,
    connectorId: "filesystem",
    executionId: eid,
    logs,
  };
}

// ── FileSystemConnector ────────────────────────────────────────────────────────

export class FileSystemConnector implements IConnector {
  readonly id = "filesystem";

  metadata(): ConnectorMetadata {
    return {
      id: "filesystem",
      name: "File System Connector",
      version: "1.0.0",
      description: "Official file system abstraction connector — delegates to active provider (Google Drive).",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      // EI-01 (RFC-008/ADR-015): per-capability reversibility. Default "safe".
      capabilityReversibility: {
        "fs.list": "safe",
        "fs.read": "safe",
        "fs.search": "safe",
        "fs.upload": "reversible",
        "fs.createFolder": "reversible",
        "fs.delete": "irreversible",
        "connectivity.ping": "safe",
      },
    };
  }

  validate(): boolean { return true; }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Provider resolved lazily at execute time
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    const connected = isConnected("default");
    return {
      status: connected ? "healthy" : "unhealthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: connected
        ? "File system provider connected (Google Drive)"
        : "No file system provider connected — configure Google Workspace in /connections",
    };
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid   = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid}`)];

    const connected = isConnected("default");
    if (!connected) return notConfigured(start, eid, logs, operation);

    try {
      return await this._dispatch(operation, payload, start, eid, logs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Unhandled exception: ${msg}`, "internal", start, eid, logs, operation);
    }
  }

  private async _dispatch(
    operation: string,
    payload: Record<string, unknown>,
    start: number,
    eid: string,
    logs: ConnectorLog[],
  ): Promise<ConnectorResult> {

    // Delegate all operations to the Google Drive connector
    const { GoogleDriveConnector } = await import("./GoogleDriveConnector");
    const drive = new GoogleDriveConnector();

    const ctx: ConnectorContext = {
      executionId: eid,
      userId: "system",
      projectId: "",
      sessionId: "",
    };

    switch (operation) {

      case "connectivity.ping": {
        logs.push(makeLog("info", `[${operation}] Provider: Google Drive`));
        return ok({ pong: true, provider: "google-drive" }, start, eid, logs, operation);
      }

      case "fs.list": {
        const result = await drive.execute("drive.files.list", {
          folderId:   payload.path ?? payload.folderId ?? "root",
          maxResults: payload.maxResults ?? 50,
        }, ctx);
        if (!result.success) return fail(result.error ?? "fs.list failed", "external", start, eid, logs, operation);
        return ok(result.data, start, eid, logs, operation);
      }

      case "fs.read": {
        const result = await drive.execute("drive.files.get", {
          fileId: payload.fileId ?? payload.path,
        }, ctx);
        if (!result.success) return fail(result.error ?? "fs.read failed", "external", start, eid, logs, operation);
        return ok(result.data, start, eid, logs, operation);
      }

      case "fs.search": {
        const result = await drive.execute("drive.files.search", {
          query:      payload.query,
          maxResults: payload.maxResults ?? 20,
        }, ctx);
        if (!result.success) return fail(result.error ?? "fs.search failed", "external", start, eid, logs, operation);
        return ok(result.data, start, eid, logs, operation);
      }

      case "fs.upload": {
        const result = await drive.execute("drive.files.upload", {
          name:     payload.name,
          content:  payload.content,
          mimeType: payload.mimeType ?? "text/plain",
          folderId: payload.folderId ?? "root",
        }, ctx);
        if (!result.success) return fail(result.error ?? "fs.upload failed", "external", start, eid, logs, operation);
        return ok(result.data, start, eid, logs, operation);
      }

      case "fs.delete": {
        const result = await drive.execute("drive.files.delete", {
          fileId: payload.fileId ?? payload.path,
        }, ctx);
        if (!result.success) return fail(result.error ?? "fs.delete failed", "external", start, eid, logs, operation);
        return ok(result.data, start, eid, logs, operation);
      }

      case "fs.createFolder": {
        const result = await drive.execute("drive.folders.create", {
          name:     payload.name,
          parentId: payload.parentId ?? "root",
        }, ctx);
        if (!result.success) return fail(result.error ?? "fs.createFolder failed", "external", start, eid, logs, operation);
        return ok(result.data, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }
}