/**
 * GmailConnector.ts — Engineering Sprint 8.3
 * Native connector-runtime implementation of Gmail.
 *
 * Implements connector-runtime/IConnector directly.
 * Delegates ALL API/OAuth logic to the existing Gmail modules (zero duplication).
 * This is the single source of truth for Gmail in the connector-runtime stack.
 *
 * Pipeline: ConnectorBootstrap → ConnectorRegistry → UCRBridge → UCR → execute()
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
import { isConnected, getConnection } from "@/lib/google-auth/GoogleAuthSession";

const CAPABILITIES = Object.freeze([
  "readInbox",
  "searchEmails",
  "readMessage",
  "readEmail",
  "listLabels",
  "createDraft",
  "sendEmail",
]);

export class GmailConnector implements IConnector {
  readonly id = "gmail";

  metadata(): ConnectorMetadata {
    return {
      id: "gmail",
      name: "Gmail",
      version: "2.0.0",
      description: "Conector oficial do Gmail para o MemoryOS — Sprint 8.3",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Token checked lazily at execute time
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    const connected = isConnected("default");
    const conn = getConnection("default");
    return {
      status: connected ? "healthy" : "unhealthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: connected
        ? `Conectado como ${conn?.email ?? "usuario"}`
        : "Google Workspace nao conectado",
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

    try {
      const raw = await this._dispatch(operation, payload);

      // Normalize legacy { ok, data, error } → ConnectorResult
      const legacyOk    = (raw as any)?.ok === true;
      const legacyData  = (raw as any)?.data;
      const legacyError = (raw as any)?.error as string | null;

      if (legacyOk) {
        logs.push(makeLog("info", `[${operation}] SUCCESS in ${Date.now() - start}ms`));
        return {
          status: "SUCCESS",
          success: true,
          data: legacyData,
          duration: Date.now() - start,
          connectorId: this.id,
          executionId: eid,
          logs,
        };
      }

      logs.push(makeLog("error", `[${operation}] FAILED — ${legacyError}`));
      return {
        status: "FAILED",
        success: false,
        error: legacyError ?? "Gmail operation failed",
        duration: Date.now() - start,
        connectorId: this.id,
        executionId: eid,
        logs,
      };
    } catch (err) {
      const msg = (err as Error).message;
      logs.push(makeLog("error", `[${operation}] EXCEPTION — ${msg}`));
      return {
        status: "FAILED",
        success: false,
        error: msg,
        duration: Date.now() - start,
        connectorId: this.id,
        executionId: eid,
        logs,
      };
    }
  }

  private async _dispatch(op: string, p: Record<string, unknown>): Promise<unknown> {
    switch (op) {
      case "readInbox": {
        const { listMessages } = await import("@/lib/gmail/GmailConnector");
        return listMessages({
          maxResults: (p["maxResults"] as number) ?? 20,
          labelIds:   (p["labelIds"] as string)   ?? undefined,
          pageToken:  (p["pageToken"] as string)  ?? undefined,
        });
      }
      case "searchEmails": {
        const { searchMessages }    = await import("@/lib/gmail/GmailConnector");
        const { smartQueryBuilder } = await import("@/lib/gmail/SmartQueryBuilder");
        const { smartQueryExecutor } = await import("@/lib/gmail/SmartQueryExecutor");
        const rawQuery   = (p["query"] as string) ?? "";
        const maxResults = (p["maxResults"] as number) ?? 20;
        const strategy   = smartQueryBuilder.build(rawQuery);
        const result     = await smartQueryExecutor.execute(
          strategy,
          (q, max) => searchMessages(q, max) as Promise<{ ok: boolean; data: unknown; error: string | null }>,
          maxResults,
        );
        return {
          ok: true,
          data: result.data ?? { messages: [], resultSizeEstimate: 0 },
          error: null,
        };
      }
      case "readMessage": {
        const { getMessage } = await import("@/lib/gmail/GmailConnector");
        return getMessage((p["messageId"] as string) ?? "");
      }
      case "readEmail": {
        const { readEmail } = await import("@/lib/gmail/GmailReadEmail");
        return readEmail((p["messageId"] as string) ?? "");
      }
      case "listLabels": {
        const { listLabels } = await import("@/lib/gmail/GmailConnector");
        return listLabels();
      }
      case "createDraft": {
        const { createDraft } = await import("@/lib/gmail/GmailActions");
        return createDraft({
          to:      (p["to"] as string[])    ?? [],
          subject: (p["subject"] as string) ?? "",
          body:    (p["body"] as string)    ?? "",
        });
      }
      case "sendEmail": {
        const { sendEmail } = await import("@/lib/gmail/GmailActions");
        return sendEmail({
          to:      (p["to"] as string[])    ?? [],
          subject: (p["subject"] as string) ?? "",
          body:    (p["body"] as string)    ?? "",
        });
      }
      default:
        return { ok: false, data: null, error: `Unknown operation: ${op}` };
    }
  }
}