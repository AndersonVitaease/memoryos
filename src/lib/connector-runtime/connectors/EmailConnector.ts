/**
 * EmailConnector.ts — P4 Official Connector
 *
 * Email abstraction connector — production implementation.
 * Delegates to GmailConnector for Google-authenticated users.
 * Falls back gracefully when no provider is configured.
 *
 * Pattern: identical to GmailConnector / GoogleCalendarConnector.
 * Pipeline: ConnectorBootstrap → ConnectorRegistry → UCRBridge → execute()
 *
 * Supported operations:
 *   - email.send
 *   - email.read
 *   - email.search
 *   - email.listInbox
 *   - email.createDraft
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
  "email.send",
  "email.read",
  "email.search",
  "email.listInbox",
  "email.createDraft",
  "connectivity.ping",
]);

// ── Result builders (same pattern as GoogleCalendarConnector) ─────────────────

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "email", executionId: eid, logs };
}

function fail(
  error: string,
  category: "validation" | "auth" | "external" | "internal",
  start: number, eid: string, logs: ConnectorLog[], op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED [${category}] ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error: `[${category}] ${error}`, duration, connectorId: "email", executionId: eid, logs };
}

function notConfigured(start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("warn", `[${op}] NOT_CONFIGURED — no email provider connected`));
  return {
    status: "NOT_CONFIGURED",
    success: false,
    error: "No email provider configured. Connect your Google Workspace in /connections.",
    duration,
    connectorId: "email",
    executionId: eid,
    logs,
  };
}

// ── EmailConnector ─────────────────────────────────────────────────────────────

export class EmailConnector implements IConnector {
  readonly id = "email";

  metadata(): ConnectorMetadata {
    return {
      id: "email",
      name: "Email Connector",
      version: "1.0.0",
      description: "Official email abstraction connector — delegates to active provider (Gmail).",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      // EI-01 (RFC-008/ADR-015): per-capability reversibility. Default "safe".
      capabilityReversibility: {
        "email.listInbox": "safe",
        "email.read": "safe",
        "email.search": "safe",
        "email.createDraft": "reversible",
        "email.send": "irreversible",
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
        ? "Email provider connected (Google Workspace)"
        : "No email provider connected — configure Google Workspace in /connections",
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

    // Resolve active provider — currently Gmail
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

    switch (operation) {

      case "connectivity.ping": {
        logs.push(makeLog("info", `[${operation}] Provider: Gmail`));
        return ok({ pong: true, provider: "gmail" }, start, eid, logs, operation);
      }

      case "email.listInbox": {
        const { listMessages } = await import("@/lib/gmail/GmailConnector");
        const result = await listMessages({
          maxResults: (payload.maxResults as number) ?? 20,
          labelIds:   (payload.labelIds as string)   ?? undefined,
          pageToken:  (payload.pageToken as string)  ?? undefined,
        });
        const r = result as any;
        if (!r?.ok) return fail(r?.error ?? "listInbox failed", "external", start, eid, logs, operation);
        return ok(r.data, start, eid, logs, operation);
      }

      case "email.search": {
        const { smartQueryBuilder } = await import("@/lib/gmail/SmartQueryBuilder");
        const { smartQueryExecutor } = await import("@/lib/gmail/SmartQueryExecutor");
        const rawQuery   = (payload.query as string) ?? "";
        const maxResults = (payload.maxResults as number) ?? 20;
        const strategy = smartQueryBuilder.build(rawQuery);
        const { GmailSearchProvider } = await import("@/lib/connector-runtime/search-providers/GmailSearchProvider");
        const searchProvider = new GmailSearchProvider();
        const result = await smartQueryExecutor.execute(
          strategy,
          async (q, max) => {
            const r = await searchProvider.searchRaw(q, { maxResults: max });
            return { ok: r.error === null, data: r.value, error: r.error };
          },
          maxResults,
        );
        return ok(result.data, start, eid, logs, operation);
      }

      case "email.read": {
        const { readEmail } = await import("@/lib/gmail/GmailReadEmail");
        const result = await readEmail((payload.messageId as string) ?? "");
        const r = result as any;
        if (!r?.ok) return fail(r?.error ?? "readEmail failed", "external", start, eid, logs, operation);
        return ok(r.data, start, eid, logs, operation);
      }

      case "email.createDraft": {
        const { createDraft } = await import("@/lib/gmail/GmailActions");
        const result = await createDraft({
          to:      (payload.to as string[])    ?? [],
          subject: (payload.subject as string) ?? "",
          body:    (payload.body as string)    ?? "",
        });
        const r = result as any;
        if (!r?.ok) return fail(r?.error ?? "createDraft failed", "external", start, eid, logs, operation);
        return ok(r.data, start, eid, logs, operation);
      }

      case "email.send": {
        const { sendEmail } = await import("@/lib/gmail/GmailActions");
        const result = await sendEmail({
          to:      (payload.to as string[])    ?? [],
          subject: (payload.subject as string) ?? "",
          body:    (payload.body as string)    ?? "",
        });
        const r = result as any;
        if (!r?.ok) return fail(r?.error ?? "sendEmail failed", "external", start, eid, logs, operation);
        return ok(r.data, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown operation: "${operation}"`, "internal", start, eid, logs, operation);
    }
  }
}