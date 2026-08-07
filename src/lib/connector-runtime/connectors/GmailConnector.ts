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
import { findAccountByEmail } from "@/lib/google-auth/GoogleMultiAccount";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";
import { isMultiCandidateResolutionEnabled } from "@/lib/google-drive/MultiCandidateResolutionFeatureFlag";
import {
  resourceResolutionEngine,
  type ResourceCandidateSelector,
} from "@/lib/resource-resolution-engine";
import { GmailSearchProvider, type GmailSearchData } from "../search-providers/GmailSearchProvider";
import { gmailResolutionAuditStore } from "../search-providers/GmailResolutionAuditStore";

const CAPABILITIES = Object.freeze([
  "readInbox",
  "searchEmails",
  "readMessage",
  "readEmail",
  "getThread",
  "getAttachment",
  "listLabels",
  "createDraft",
  "sendDraft",
  "sendEmail",
]);

export class GmailConnector implements IConnector {
  readonly id = "gmail";

  private _searchProvider = new GmailSearchProvider();

  metadata(): ConnectorMetadata {
    return {
      id: "gmail",
      name: "Gmail",
      version: "2.0.0",
      description: "Conector oficial do Gmail para o MemoryOS — Sprint 8.3",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      // EI-01 (RFC-008/ADR-015): per-capability reversibility. Default "safe".
      capabilityReversibility: {
        readInbox: "safe",
        searchEmails: "safe",
        readMessage: "safe",
        readEmail: "safe",
        getThread: "safe",
        getAttachment: "safe",
        listLabels: "safe",
        createDraft: "reversible",
        sendDraft: "irreversible",
        sendEmail: "irreversible",
      },
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
    // FEATURE (múltiplas contas — Fase 3): se o payload trouxer um
    // accountEmail (resolvido a partir de uma menção na mensagem do
    // usuário, ex: "verifica o e-mail da amazonnoconta01"), usa a conta
    // correspondente. Sem isso, continua usando a conta principal
    // ("default"), exatamente como sempre funcionou.
    const _baseWorkspaceId = getActiveWorkspaceId();
    const _accountEmail = (p["accountEmail"] as string) ?? null;
    const _resolvedAccount = _accountEmail ? findAccountByEmail(_baseWorkspaceId, _accountEmail) : null;
    const _workspaceId = _resolvedAccount?.workspaceId ?? _baseWorkspaceId;
    if (_accountEmail && !_resolvedAccount) {
      console.warn(`[GmailConnector] accountEmail "${_accountEmail}" foi pedido mas não corresponde a nenhuma conta conectada — usando a conta principal.`);
    }

    const parseCandidateSelectors = (): ResourceCandidateSelector[] => {
      const raw = p["candidateSelectors"];
      if (!Array.isArray(raw)) return [];

      const parsed: ResourceCandidateSelector[] = [];
      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id : "";
        const value = typeof rec.value === "string" ? rec.value : "";
        const strategy = typeof rec.strategy === "string" ? rec.strategy : "unknown";
        const priority = typeof rec.priority === "number" ? rec.priority : Number.MAX_SAFE_INTEGER;
        const confidence = typeof rec.confidence === "number" ? rec.confidence : 0;
        if (!id || !value) continue;
        parsed.push(Object.freeze({ id, value, strategy, priority, confidence }));
      }

      return parsed;
    };

    const runLegacySearch = async (rawQuery: string, maxResults: number): Promise<GmailSearchData> => {
      const { smartQueryBuilder } = await import("@/lib/gmail/SmartQueryBuilder");
      const { smartQueryExecutor } = await import("@/lib/gmail/SmartQueryExecutor");
      const strategy = smartQueryBuilder.build(rawQuery);
      const result = await smartQueryExecutor.execute(
        strategy,
        async (q, max) => {
          const providerResult = await this._searchProvider.searchRaw(q, { maxResults: max });
          return {
            ok: providerResult.error === null,
            data: providerResult.value,
            error: providerResult.error,
          };
        },
        maxResults,
      );

      return (result.data as GmailSearchData) ?? Object.freeze({ messages: [], resultSizeEstimate: 0, query: rawQuery });
    };

    const resolveByEngine = async (rawQuery: string, maxResults: number): Promise<{
      readonly data: GmailSearchData;
      readonly provider: string;
      readonly usedFallback: boolean;
      readonly totalAttempts: number;
      readonly winnerCandidate: string | null;
      readonly winnerStrategy: string | null;
      readonly success: boolean;
      readonly durationMs: number;
    }> => {
      const t0 = Date.now();
      const candidateSelectors = parseCandidateSelectors();
      const featureEnabled = isMultiCandidateResolutionEnabled();

      const resolution = await resourceResolutionEngine.resolve<GmailSearchData, null>({
        connector: "gmail",
        featureEnabled,
        candidateSelectors,
        metadata: Object.freeze({ operation: op, provider: this._searchProvider.providerId }),
        searchCallback: async (candidate) => {
          const result = await this._searchProvider.searchCandidate(candidate, { maxResults });
          return Object.freeze({
            success: result.success,
            reason: result.reason,
            value: result.value,
            failure: null,
          });
        },
        fallbackCallback: async () => {
          const data = await runLegacySearch(rawQuery, maxResults);
          return Object.freeze({
            success: true,
            reason: "legacy_fallback",
            value: data,
            failure: null,
          });
        },
      });

      gmailResolutionAuditStore.record(Object.freeze({
        provider: this._searchProvider.providerId,
        connector: "gmail",
        winnerCandidate: resolution.winnerCandidate?.id ?? null,
        winnerStrategy: resolution.winnerStrategy,
        totalAttempts: resolution.attempts.length,
        fallback: resolution.usedFallback,
        success: resolution.success,
        durationMs: Date.now() - t0,
      }));

      return Object.freeze({
        data: resolution.result ?? Object.freeze({ messages: [], resultSizeEstimate: 0, query: rawQuery }),
        provider: this._searchProvider.providerId,
        usedFallback: resolution.usedFallback,
        totalAttempts: resolution.attempts.length,
        winnerCandidate: resolution.winnerCandidate?.id ?? null,
        winnerStrategy: resolution.winnerStrategy,
        success: resolution.success,
        durationMs: Date.now() - t0,
      });
    };

    switch (op) {
      case "readInbox": {
        const { listMessages } = await import("@/lib/gmail/GmailConnector");
        return listMessages({
          maxResults: (p["maxResults"] as number) ?? 20,
          labelIds:   (p["labelIds"] as string)   ?? undefined,
          pageToken:  (p["pageToken"] as string)  ?? undefined,
          workspaceId: _workspaceId,
        });
      }
      case "searchEmails": {
        const rawQuery   = (p["query"] as string) ?? "";
        const maxResults = (p["maxResults"] as number) ?? 20;
        const resolved = await resolveByEngine(rawQuery, maxResults);
        return {
          ok: true,
          data: {
            ...(resolved.data ?? { messages: [], resultSizeEstimate: 0 }),
            _resolution: {
              provider: resolved.provider,
              usedFallback: resolved.usedFallback,
              totalAttempts: resolved.totalAttempts,
              winnerCandidate: resolved.winnerCandidate,
              winnerStrategy: resolved.winnerStrategy,
              success: resolved.success,
              durationMs: resolved.durationMs,
            },
          },
          error: null,
        };
      }
      case "readMessage": {
        const { getMessage } = await import("@/lib/gmail/GmailConnector");
        return getMessage((p["messageId"] as string) ?? "", _workspaceId);
      }
      case "readEmail": {
        const { readEmail } = await import("@/lib/gmail/GmailReadEmail");
        return readEmail((p["messageId"] as string) ?? "");
      }
      case "getThread": {
        const { getThread } = await import("@/lib/gmail/GmailConnector");
        return getThread((p["threadId"] as string) ?? "", _workspaceId);
      }
      case "getAttachment": {
        const { getAttachment } = await import("@/lib/gmail/GmailConnector");
        let messageId = ((p["messageId"] as string) ?? "").trim();
        const attachmentId = ((p["attachmentId"] as string) ?? "").trim();

        if (!messageId && attachmentId) {
          const rawQuery = ((p["query"] as string) ?? (p["rawText"] as string) ?? "").trim();
          const maxResults = (p["maxResults"] as number) ?? 20;
          if (rawQuery) {
            const resolved = await resolveByEngine(rawQuery, maxResults);
            const firstMessageId = resolved.data.messages?.[0]?.id;
            if (typeof firstMessageId === "string" && firstMessageId.trim()) {
              messageId = firstMessageId.trim();
            }
          }
        }

        return getAttachment(
          messageId,
          attachmentId,
          _workspaceId,
        );
      }
      case "listLabels": {
        const { listLabels } = await import("@/lib/gmail/GmailConnector");
        return listLabels(_workspaceId);
      }
      case "createDraft": {
        const { createDraft } = await import("@/lib/gmail/GmailActions");
        return createDraft({
          to:      (p["to"] as string[])    ?? [],
          subject: (p["subject"] as string) ?? "",
          body:    (p["body"] as string)    ?? "",
        }, _workspaceId);
      }
      case "sendDraft": {
        const { sendDraft } = await import("@/lib/gmail/GmailActions");
        return sendDraft((p["draftId"] as string) ?? "", _workspaceId);
      }
      case "sendEmail": {
        const { sendEmail } = await import("@/lib/gmail/GmailActions");
        return sendEmail({
          to:      (p["to"] as string[])    ?? [],
          subject: (p["subject"] as string) ?? "",
          body:    (p["body"] as string)    ?? "",
        }, _workspaceId);
      }
      default:
        return { ok: false, data: null, error: `Unknown operation: ${op}` };
    }
  }
}