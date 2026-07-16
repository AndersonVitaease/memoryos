/**
 * GmailConnector.ts — Engineering Sprint E-02.5
 * Real implementation of IConnector for Gmail.
 *
 * SRP: implementar IConnector delegando TODA a lógica de API/OAuth
 *      para a infraestrutura existente (GmailConnector.js + GmailActions.js
 *      + GoogleAuthSession.js). Sem duplicação de código.
 *
 * Dependency Inversion: implementa IConnector — o Router nunca precisa
 * saber que este arquivo existe; ele só conhece o contrato.
 *
 * Open/Closed: nenhuma camada acima (Runtime, Dispatcher, Router) precisa
 * ser modificada para que este connector funcione.
 *
 * Nenhuma lógica de OAuth aqui — tudo delegado a GoogleAuthSession.js.
 * Nenhuma lógica de HTTP aqui — tudo delegado a GmailConnector.js / GmailActions.js.
 */

import type {
  IConnector,
  ConnectorCapability,
  ConnectorInput,
  ConnectorResult,
  ConnectorHealth,
  ConnectorMetadata,
  ConnectorResultStatus,
} from "../UCRTypes";
import { getConnection, isConnected } from "@/lib/google-auth/GoogleAuthSession";

// ── Capabilities declaration ──────────────────────────────────────────────────

const CAPABILITIES: readonly ConnectorCapability[] = Object.freeze([
  Object.freeze({ id: "readInbox",    version: "1.0", description: "Lista as ultimas mensagens da caixa de entrada", requiresAuthentication: true,  requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 800,  timeoutMs: 12000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "searchEmails", version: "1.0", description: "Pesquisa emails pela sintaxe do Gmail",          requiresAuthentication: true,  requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 900,  timeoutMs: 12000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "readMessage",  version: "1.0", description: "Le o conteudo completo de uma mensagem",         requiresAuthentication: true,  requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 500,  timeoutMs: 10000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "listLabels",   version: "1.0", description: "Lista todas as labels do usuario",               requiresAuthentication: true,  requiresConfirmation: false, supportsStreaming: false, estimatedCostMs: 300,  timeoutMs: 8000,  metadata: Object.freeze({}) }),
  Object.freeze({ id: "createDraft",  version: "1.0", description: "Cria um rascunho no Gmail",                      requiresAuthentication: true,  requiresConfirmation: true,  supportsStreaming: false, estimatedCostMs: 600,  timeoutMs: 10000, metadata: Object.freeze({}) }),
  Object.freeze({ id: "sendEmail",    version: "1.0", description: "Envia um e-mail (requer confirmacao)",           requiresAuthentication: true,  requiresConfirmation: true,  supportsStreaming: false, estimatedCostMs: 700,  timeoutMs: 10000, metadata: Object.freeze({}) }),
]);

// ── GmailConnector ────────────────────────────────────────────────────────────

export class GmailConnector implements IConnector {
  private static readonly WORKSPACE_ID = "default";

  connectorId(): string {
    return "gmail";
  }

  capabilities(): readonly ConnectorCapability[] {
    return CAPABILITIES;
  }

  /**
   * Routes capability to the correct underlying implementation.
   * All real API/OAuth logic is in the existing Gmail modules.
   * Never throws — always returns ConnectorResult.
   */
  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const t0 = Date.now();

    try {
      const result = await this._dispatch(input);
      const durationMs = Date.now() - t0;

      // Normalize from legacy format { ok, data, error, status } → ConnectorResult
      if (result === null || result === undefined) {
        return this._failure("No result returned", durationMs, input.capability);
      }

      const legacyOk    = (result as Record<string, unknown>).ok === true;
      const legacyData  = (result as Record<string, unknown>).data;
      const legacyError = (result as Record<string, unknown>).error as string | null;
      const legacyStatus = (result as Record<string, unknown>).status as string;

      if (legacyOk) {
        return Object.freeze({
          connectorId: "gmail",
          capability:  input.capability,
          status:      "success" as ConnectorResultStatus,
          output:      legacyData,
          error:       null,
          durationMs,
        });
      }

      // Map legacy status to ConnectorResultStatus
      const connStatus: ConnectorResultStatus =
        legacyStatus === "expired" || legacyStatus === "disconnected" ? "failed" :
        legacyStatus === "timeout" ? "timeout" :
        "failed";

      return Object.freeze({
        connectorId: "gmail",
        capability:  input.capability,
        status:      connStatus,
        output:      null,
        error:       legacyError ?? "Gmail operation failed",
        durationMs,
      });

    } catch (err) {
      return this._failure((err as Error).message, Date.now() - t0, input.capability);
    }
  }

  health(): ConnectorHealth {
    const conn = getConnection(GmailConnector.WORKSPACE_ID);
    const connected = isConnected(GmailConnector.WORKSPACE_ID);

    if (!conn) {
      return Object.freeze({ status: "unavailable", message: "Google Workspace nao conectado", checkedAt: Date.now() });
    }
    if (!connected) {
      return Object.freeze({ status: "degraded", message: "Token expirado ou invalido — necessita refresh", checkedAt: Date.now() });
    }
    return Object.freeze({ status: "healthy", message: `Conectado como ${conn.email ?? "usuario"}`, checkedAt: Date.now() });
  }

  metadata(): ConnectorMetadata {
    return Object.freeze({
      name:        "Gmail",
      version:     "1.0.0",
      description: "Conector oficial do Gmail para o MemoryOS",
      author:      "MemoryOS",
      tags:        Object.freeze(["email", "google", "gmail", "workspace"]),
    });
  }

  // ── Private dispatch ────────────────────────────────────────────────────────

  private async _dispatch(input: ConnectorInput): Promise<unknown> {
    const p = input.parameters as Record<string, unknown>;

    switch (input.capability) {
      case "readInbox": {
        const { listMessages } = await import("@/lib/gmail/GmailConnector");
        return listMessages({
          maxResults: (p["maxResults"] as number) ?? 20,
          labelIds:   (p["labelIds"] as string)   ?? undefined,
          pageToken:  (p["pageToken"] as string)  ?? undefined,
        });
      }

      case "searchEmails": {
        // E-02.9: GmailConnector is a thin orchestrator only.
        // Knowledge → EmailAliasRegistry / DomainRegistry
        // Strategy  → SmartQueryBuilder
        // Execution → SmartQueryExecutor
        const { searchMessages }   = await import("@/lib/gmail/GmailConnector");
        const { smartQueryBuilder } = await import("@/lib/gmail/SmartQueryBuilder");
        const { smartQueryExecutor } = await import("@/lib/gmail/SmartQueryExecutor");

        const rawQuery   = (p["query"] as string) ?? "";
        const maxResults = (p["maxResults"] as number) ?? 20;

        const strategy = smartQueryBuilder.build(rawQuery);
        const result   = await smartQueryExecutor.execute(
          strategy,
          (q, max) => searchMessages(q, max) as Promise<{ ok: boolean; data: unknown; error: string | null }>,
          maxResults,
        );

        result.log.forEach((line) => console.log(line));

        return {
          ok:     true,
          data:   result.data ?? { messages: [], resultSizeEstimate: 0, _noResults: true, _entity: rawQuery },
          error:  null,
          status: "success",
          _smartMeta: {
            entity:       result.entity,
            winningQuery: result.winningQuery,
            totalFound:   result.totalFound,
            totalDurationMs: result.totalDurationMs,
            attempts: result.strategy.attempts.map((a) => ({
              attempt:   a.attempt,
              query:     a.query,
              strategy:  a.strategy,
              results:   a.results,
              succeeded: a.succeeded,
              durationMs: a.durationMs,
            })),
          },
        };
      }

      case "readMessage": {
        const { getMessage } = await import("@/lib/gmail/GmailConnector");
        return getMessage((p["messageId"] as string) ?? "");
      }

      case "listLabels": {
        const { listLabels } = await import("@/lib/gmail/GmailConnector");
        return listLabels();
      }

      case "createDraft": {
        const { createDraft } = await import("@/lib/gmail/GmailActions");
        return createDraft({
          to:      (p["to"] as string[])      ?? [],
          subject: (p["subject"] as string)   ?? "",
          body:    (p["body"] as string)       ?? "",
          cc:      (p["cc"] as string[])       ?? undefined,
          bcc:     (p["bcc"] as string[])      ?? undefined,
          isHtml:  (p["isHtml"] as boolean)   ?? false,
        });
      }

      case "sendEmail": {
        const { sendEmail } = await import("@/lib/gmail/GmailActions");
        return sendEmail({
          to:      (p["to"] as string[])     ?? [],
          subject: (p["subject"] as string)  ?? "",
          body:    (p["body"] as string)      ?? "",
          cc:      (p["cc"] as string[])      ?? undefined,
          bcc:     (p["bcc"] as string[])     ?? undefined,
          isHtml:  (p["isHtml"] as boolean)  ?? false,
        });
      }

      default:
        return { ok: false, data: null, error: `Capability desconhecida: ${input.capability}`, status: "error" };
    }
  }

  private _failure(error: string, durationMs: number, capability: string): ConnectorResult {
    return Object.freeze({
      connectorId: "gmail",
      capability,
      status:      "failed" as ConnectorResultStatus,
      output:      null,
      error,
      durationMs,
    });
  }
}

// ── Factory + auto-registration helper ───────────────────────────────────────

/**
 * Creates a GmailConnector and registers it in the provided registry.
 * Usage in Sprint E-02.5 runtime bootstrap:
 *   registerGmailConnector(registry);
 */
export function registerGmailConnector(
  registry: { register(c: IConnector): void },
): GmailConnector {
  const connector = new GmailConnector();
  registry.register(connector);
  return connector;
}