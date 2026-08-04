/**
 * McpMicrosoftProvider.ts — STUB interface-conforme (ADR-014 / RFC-007, Fase 3).
 *
 * Slot reservado para um servidor MCP compativel com o Microsoft Graph no
 * futuro. NAO e implementacao ativa — isAvailable()=false sempre e operations=[]
 * (nunca cobre nenhuma operation, nunca e selecionado pelo router).
 *
 * Softeria MS-365 MCP Server PERMANECE DESCARTADO (dead end: incompativel com
 * sandbox Deno, exige stdio/WAM local, risco de provisioning tenant-wide de
 * Dataverse). Quando um MCP compativel surgir, implementar os metodos aqui e
 * mudar operations para as capabilities reais — nenhum outro arquivo muda.
 */
import type { ConnectorResult } from "../../ConnectorTypes";
import type { MicrosoftProvider, MicrosoftProviderContext } from "./MicrosoftProviderTypes";

const NOT_IMPLEMENTED =
  "McpMicrosoftProvider: slot reservado para MCP compativel (Softeria descartado). Nao implementado.";

export const McpMicrosoftProvider: MicrosoftProvider = {
  id: "mcp-microsoft",
  displayName: "Microsoft 365 via MCP (stub — não implementado)",
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