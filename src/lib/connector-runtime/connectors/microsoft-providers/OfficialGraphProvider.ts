/**
 * OfficialGraphProvider.ts — provedor de acesso ao Microsoft Graph via OAuth
 * proprio (Flow 1 do RFC-007).
 *
 * Re-home da logica que vivia em MicrosoftGraphConnector.execute() (ADR-013):
 * pega token (ensureValidToken + getAccessToken por workspaceId), resolve a
 * capability via MicrosoftCapabilityRegistry e delega ao executor.
 *
 * Comportamento identico ao shell antigo — paridade das 32 operations. Apenas
 * mudou o endereco: agora e um provider registrado no MicrosoftProviderRegistry,
 * e o shell delega a ele via resolveProvider().
 *
 * Multi-conta: extrai token por workspaceId (ja suportado pelo
 * MicrosoftAuthSession). O shell antigo pega sempre "default"; este provider
 * respeita o workspaceId recebido no ctx.
 */
import type { ConnectorResult } from "../../ConnectorTypes";
import {
  ensureValidToken,
  getAccessToken,
  isConnected,
} from "@/lib/microsoft-auth/MicrosoftAuthSession";
import { fail } from "../microsoft/MicrosoftGraphHelper";
import {
  resolveCapability,
  listAllOperations,
} from "../microsoft/MicrosoftCapabilityRegistry";
import type {
  MicrosoftProvider,
  MicrosoftProviderContext,
  MicrosoftAccountInfo,
} from "./MicrosoftProviderTypes";
import { listConnections } from "@/lib/microsoft-auth/MicrosoftAuthSession";

const NOT_CONNECTED_MSG =
  "Microsoft 365 não conectado. Conecte em /connections.";

export const OfficialGraphProvider: MicrosoftProvider = {
  id: "official-graph",
  displayName: "Microsoft 365 (OAuth próprio)",
  isOfficial: true,

  get operations(): readonly string[] {
    // Herda as 32 operations dos 11 executors (MicrosoftCapabilityRegistry).
    // Getter para refler mudancas no registry sem reinstanciar.
    return listAllOperations();
  },

  async isAvailable(workspaceId: string): Promise<boolean> {
    // Conectado e com token em memoria? Sincrono no MicrosoftAuthSession.
    return isConnected(workspaceId);
  },

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    ctx: MicrosoftProviderContext,
  ): Promise<ConnectorResult> {
    const { workspaceId, start, eid, logs } = ctx;

    try {
      try {
        await ensureValidToken(workspaceId);
      } catch {
        return fail(NOT_CONNECTED_MSG, start, eid, logs, operation);
      }
      const accessToken = getAccessToken(workspaceId);
      if (!accessToken) {
        return fail(NOT_CONNECTED_MSG, start, eid, logs, operation);
      }

      const capability = resolveCapability(operation);
      if (!capability) {
        return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }

      return await capability.execute(operation, payload, accessToken, {
        start,
        eid,
        logs,
      });
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  },
};

/**
 * Lista contas conhecidas por este provider (para UI de switcher multi-conta).
 * Le o metadata do MicrosoftAuthSession (sem tokens — tokens nunca saem do backend).
 * Stub pronto para a UI da Fase 2/4; sem consumidor hoje, mas interface-conforme.
 */
export function listOfficialAccounts(): MicrosoftAccountInfo[] {
  return listConnections().map((c) => ({
    workspaceId: c.workspaceId,
    email: c.email ?? "",
    providerId: "official-graph",
  }));
}