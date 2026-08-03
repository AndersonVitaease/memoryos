/**
 * MicrosoftGraphConnector.ts — conector nativo para Microsoft 365
 * (Outlook Mail, Calendar, OneDrive, e futuros servicos) via Microsoft Graph API.
 *
 * ADR-013 / RFC-006 — padrao Capability Executors (Caminho 2).
 *
 * Este arquivo e um SHELL FINO: mantem apenas token, health, metadata e
 * roteamento (operation -> executor). Toda logica de servico vive em
 * Capability Executors isolados em ./microsoft/*.ts.
 *
 * Adicionar um servico novo NAO mexe aqui — apenas em MicrosoftCapabilityRegistry
 * + um novo arquivo de executor.
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
import { isConnected, getConnection, ensureValidToken, getAccessToken } from "@/lib/microsoft-auth/MicrosoftAuthSession";
import { fail } from "./microsoft/MicrosoftGraphHelper";
import { resolveCapability, listAllOperations } from "./microsoft/MicrosoftCapabilityRegistry";
import "./microsoft/MicrosoftWatchProvider"; // side-effect: registra "microsoft" no ConnectorGateway do Watch Engine (MS-EXP-05)

export class MicrosoftGraphConnector implements IConnector {
  readonly id = "microsoft-graph";

  metadata(): ConnectorMetadata {
    return {
      id: "microsoft-graph",
      name: "Microsoft 365",
      version: "1.0.0",
      description: "Outlook Mail, Calendar e OneDrive via Microsoft Graph API.",
      author: "MemoryOS",
      capabilities: listAllOperations(),
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Token checado sob demanda em cada execute(), mesmo padrao do Gmail.
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
        : "Microsoft 365 nao conectado",
    };
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid}`)];

    try {
      try {
        await ensureValidToken("default");
      } catch {
        return fail("Microsoft 365 não conectado. Conecte em /connections.", start, eid, logs, operation);
      }
      const accessToken = getAccessToken("default");
      if (!accessToken) {
        return fail("Microsoft 365 não conectado. Conecte em /connections.", start, eid, logs, operation);
      }

      const capability = resolveCapability(operation);
      if (!capability) {
        return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }

      return await capability.execute(operation, payload, accessToken, { start, eid, logs });
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  }
}