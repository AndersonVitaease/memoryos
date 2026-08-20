/**
 * MCPConnector.ts — conector generico para servidores MCP externos.
 *
 * Mesmo padrao do MemoriConnector: implementa IConnector e delega toda
 * chamada sensivel (handshake MCP, credenciais) para a backend function
 * segura `mcpClientCall` (base44/functions), que usa o SDK oficial
 * @modelcontextprotocol/client com Streamable HTTP + SSE. Nada de chaves
 * no navegador.
 *
 * Servidores sao registrados na entidade MCPServerConfig (name, server_url,
 * auth_type, api_key_secret_name). O conector resolve `serverName` -> `id`
 * filtrando MCPServerConfig; `serverId` explicito tem prioridade.
 *
 * Capabilities:
 *   - mcp.listTools  -> action "list"  (tools/list, cacheia em discovered_tools)
 *   - mcp.callTool   -> action "call"  (tools/call com {toolName, arguments})
 *
 * Reversibility: ambas "safe" — listTools e leitura; callTool delega ao
 * servidor externo (o proprio MCP server decide o efeito). Se um servidor
 * MCP expuser ferramentas destrutivas, o dono deve restringir no servidor.
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
import { base44 } from "@/api/base44Client";

const CAPABILITIES = Object.freeze([
  "mcp.listTools",
  "mcp.callTool",
]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "mcp", executionId: eid, logs };
}

function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED - ${error} - ${duration}ms`));
  return { status: "FAILED", success: false, error, duration, connectorId: "mcp", executionId: eid, logs };
}

async function resolveServerId(
  payload: Record<string, unknown>,
): Promise<{ serverId: string | null; error: string | null }> {
  const explicitId = typeof payload.serverId === "string" ? payload.serverId.trim() : null;
  if (explicitId) return { serverId: explicitId, error: null };

  const serverName = typeof payload.serverName === "string" ? payload.serverName.trim() : null;
  if (!serverName) {
    return {
      serverId: null,
      error: "serverId ou serverName e obrigatorio (registre o servidor MCP na entidade MCPServerConfig)",
    };
  }
  try {
    const matches = await base44.entities.MCPServerConfig.filter({ name: serverName });
    if (matches.length > 0) return { serverId: matches[0].id, error: null };
    return {
      serverId: null,
      error: `Nenhum MCPServerConfig com name='${serverName}' (cadastre o servidor MCP em /connections ou via entidade MCPServerConfig)`,
    };
  } catch (e) {
    return { serverId: null, error: `Falha ao resolver serverName='${serverName}': ${(e as Error).message}` };
  }
}

export class MCPConnector implements IConnector {
  readonly id = "mcp";

  metadata(): ConnectorMetadata {
    return {
      id: "mcp",
      name: "MCP",
      version: "1.0.0",
      description:
        "Cliente MCP generico - chama servidores MCP externos registrados em MCPServerConfig via backend function mcpClientCall (Streamable HTTP + SSE).",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      capabilityReversibility: {
        "mcp.listTools": "safe",
        "mcp.callTool": "safe",
      },
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Nada a inicializar - credenciais ficam no backend, resolvidas a cada chamada.
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    return {
      status: "healthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: "MCP connector pronto - servidores resolvidos via MCPServerConfig a cada chamada.",
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
      const { serverId, error: resolveError } = await resolveServerId(payload);
      if (resolveError) {
        return fail(resolveError, start, eid, logs, operation);
      }

      switch (operation) {
        case "mcp.listTools": {
          const res = await base44.functions.invoke("mcpClientCall", { serverId, action: "list" });
          const d = (res.data ?? res) as Record<string, unknown> | null;
          if (d?.error) return fail(String(d.error), start, eid, logs, operation);
          logs.push(makeLog("info", `[${operation}] count=${d?.count} transport=${d?.transport}`));
          return ok(
            { tools: d?.tools ?? [], count: d?.count ?? 0, transport: d?.transport ?? null },
            start,
            eid,
            logs,
            operation,
          );
        }

        case "mcp.callTool": {
          const toolName = typeof payload.toolName === "string" ? payload.toolName.trim() : null;
          if (!toolName) {
            return fail("toolName e obrigatorio para mcp.callTool", start, eid, logs, operation);
          }
          const toolArgs =
            payload.arguments && typeof payload.arguments === "object"
              ? (payload.arguments as Record<string, unknown>)
              : {};
          const bearerToken = typeof payload.bearerToken === "string" ? payload.bearerToken : undefined;
          const res = await base44.functions.invoke("mcpClientCall", {
            serverId,
            action: "call",
            toolName,
            arguments: toolArgs,
            ...(bearerToken ? { bearerToken } : {}),
          });
          const d = (res.data ?? res) as Record<string, unknown> | null;
          if (d?.error) return fail(String(d.error), start, eid, logs, operation);
          logs.push(makeLog("info", `[${operation}] tool=${toolName} transport=${d?.transport}`));
          return ok({ result: d?.result ?? null, transport: d?.transport ?? null }, start, eid, logs, operation);
        }

        default:
          return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }
    } catch (e: any) {
      // Base44 functions.invoke usa um envelope HTTP generico em falhas (ex. 500/502).
      // Preserve a causa devolvida pela backend function quando disponivel.
      const realError =
        e?.response?.data?.error ||
        (typeof e?.response?.data === "string" ? e.response.data : null) ||
        e?.data?.error ||
        e?.message ||
        String(e);
      return fail(String(realError), start, eid, logs, operation);
    }
  }
}