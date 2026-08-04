/**
 * MicrosoftGraphConnector.ts — conector nativo para Microsoft 365
 * (Outlook Mail, Calendar, OneDrive, e futuros servicos) via Microsoft Graph API.
 *
 * ADR-013 / RFC-006 — padrao Capability Executors (Caminho 2).
 * ADR-014 / RFC-007 — camada de Provider Router (workspaceId-aware).
 *
 * Este arquivo e um SHELL FINO: mantem apenas health, metadata e roteamento
 * (operation -> provider -> executor). A decisao de "qual credencial usar"
 * (OAuth proprio vs App-User Connector vs MCP vs SDK) vive no
 * MicrosoftProviderRegistry (./microsoft-providers/). A logica de servico
 * vive em Capability Executors isolados em ./microsoft/*.ts.
 *
 * Adicionar um servico novo NAO mexe aqui — apenas em MicrosoftCapabilityRegistry
 * + um novo arquivo de executor. Adicionar um provedor novo NAO mexe aqui —
 * apenas em MicrosoftProviderRegistry + um novo arquivo de provider.
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
import { isConnected, getConnection } from "@/lib/microsoft-auth/MicrosoftAuthSession";
import { getActiveMicrosoftWorkspaceId } from "@/lib/microsoft-auth/MicrosoftMultiAccount";
import { fail } from "./microsoft/MicrosoftGraphHelper";
import { listAllOperations } from "./microsoft/MicrosoftCapabilityRegistry";
import { microsoftProviderRegistry } from "./microsoft-providers/MicrosoftProviderRegistry";
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

    // workspaceId: multi-conta (ADR-014 / RFC-007). Se identityContext especificar
    // microsoftWorkspaceId, usa ele; senao cai na conta ativa do switcher em
    // /connections (getActiveMicrosoftWorkspaceId), que por default e "default".
    const workspaceId =
      (context.identityContext?.microsoftWorkspaceId as string | undefined) ??
      getActiveMicrosoftWorkspaceId();

    try {
      const provider = await microsoftProviderRegistry.resolveProvider(operation, workspaceId);
      if (!provider) {
        return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }
      return await provider.execute(operation, payload, { workspaceId, start, eid, logs });
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  }
}