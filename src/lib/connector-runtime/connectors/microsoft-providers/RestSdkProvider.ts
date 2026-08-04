/**
 * RestSdkProvider.ts — STUB interface-conforme (ADR-014 / RFC-007, Fase 3).
 *
 * Slot reservado para um provedor baseado no Graph JS SDK oficial ou um
 * cliente REST alternativo no futuro. NAO e implementacao ativa —
 * isAvailable()=false sempre e operations=[] (nunca cobre nenhuma operation,
 * nunca e selecionado pelo router).
 *
 * Para ativar: implementar os metodos aqui (provavelmente usando
 * @microsoft/microsoft-graph-client ou fetch direto) e mudar operations para
 * as capabilities reais — nenhum outro arquivo muda.
 */
import type { ConnectorResult } from "../../ConnectorTypes";
import type { MicrosoftProvider, MicrosoftProviderContext } from "./MicrosoftProviderTypes";

const NOT_IMPLEMENTED =
  "RestSdkProvider: slot reservado para Graph JS SDK / REST alternativo. Nao implementado.";

export const RestSdkProvider: MicrosoftProvider = {
  id: "rest-sdk",
  displayName: "Microsoft 365 via REST/SDK (stub — não implementado)",
  isOfficial: false,
  operations: [],

  async isAvailable(_workspaceId: string): Promise<boolean> {
    return false;
  },

  async execute(
    _operation: string,
    _payload: Record<string, unknown>,
    ctx: MicrosoftProviderContext,
  ): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;
    logs.push({ timestamp: Date.now(), level: "warn", message: NOT_IMPLEMENTED });
    return {
      status: "NOT_SUPPORTED",
      success: false,
      error: NOT_IMPLEMENTED,
      duration: Date.now() - start,
      connectorId: "microsoft-graph",
      executionId: eid,
      logs,
    };
  },
};