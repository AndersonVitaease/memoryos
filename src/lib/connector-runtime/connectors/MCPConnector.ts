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

// ── MCP Argument Resolution (generico, schema-driven) ───────────────────────
// Resolve arguments quando ausentes: cache -> list fallback -> InvokeLLM(inputSchema).
// Nunca conhece nomes de campos especificos — 100% dirigido pelo inputSchema da tool.

function isValidBasicType(value: unknown, expectedType: unknown): boolean {
  switch (expectedType) {
    case "string":  return typeof value === "string";
    case "number":  return typeof value === "number";
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "array":   return Array.isArray(value);
    case "object":  return typeof value === "object" && value !== null && !Array.isArray(value);
    default:        return true; // tipo nao declarado/desconhecido — aceita.
  }
}

async function resolveMcpArguments(
  serverId: string,
  toolName: string,
  rawText: string,
  logs: ConnectorLog[],
): Promise<{ arguments: Record<string, unknown>; error: null } | { arguments: null; error: string }> {
  // 1. Obter inputSchema da tool selecionada (cache primeiro).
  let inputSchema: Record<string, unknown> | null = null;
  try {
    const server = await base44.entities.MCPServerConfig.get(serverId);
    const cachedRaw = server?.discovered_tools;
    if (cachedRaw) {
      const trimmed = cachedRaw.trim();
      let cached: any[] = [];
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const res = await fetch(trimmed);
        const fetched = await res.json();
        cached = Array.isArray(fetched) ? fetched : [];
      } else if (trimmed.startsWith("[")) {
        cached = JSON.parse(trimmed);
      }
      const found = Array.isArray(cached)
        ? cached.find((t: any) => t && t.name === toolName)
        : null;
      if (found && found.inputSchema && typeof found.inputSchema === "object") {
        inputSchema = found.inputSchema as Record<string, unknown>;
      }
    }
  } catch (e) {
    logs.push(makeLog("warn", `[mcp.callTool] cache read falhou: ${(e as Error).message}`));
  }

  // Fallback: listTools fresco quando o cache nao tem o schema.
  if (!inputSchema) {
    try {
      const res = await base44.functions.invoke("mcpClientCall", { serverId, action: "list" });
      const d = (res.data ?? res) as Record<string, unknown> | null;
      const tools = (d?.tools as any[]) ?? [];
      const found = tools.find((t) => t && t.name === toolName);
      if (found && found.inputSchema && typeof found.inputSchema === "object") {
        inputSchema = found.inputSchema as Record<string, unknown>;
      }
    } catch (e) {
      logs.push(makeLog("warn", `[mcp.callTool] list fallback falhou: ${(e as Error).message}`));
    }
  }

  if (!inputSchema) {
    return { arguments: null, error: `Nao foi possivel obter o inputSchema da tool '${toolName}'.` };
  }

  // 2. CASO B: sem required fields -> arguments vazio, zero LLM.
  const required = Array.isArray(inputSchema.required) ? (inputSchema.required as string[]) : [];
  if (required.length === 0) {
    logs.push(makeLog("info", `[mcp.callTool] sem required fields em '${toolName}' -> arguments={}`));
    return { arguments: {}, error: null };
  }

  // 3. CASO C: required fields mas sem rawText -> nao inferir, nao inventar.
  if (!rawText) {
    return {
      arguments: null,
      error: `Tool '${toolName}' exige argumentos obrigatorios (${required.join(", ")}) mas nenhum rawText foi fornecido para resolucao.`,
    };
  }

  // 4. Argument Resolution via InvokeLLM (somente rawText + inputSchema da tool).
  logs.push(makeLog("info", `[mcp.callTool] resolvendo ${required.length} required field(s) via InvokeLLM`));
  const llmResult = await base44.integrations.Core.InvokeLLM({
    prompt: rawText,
    response_json_schema: inputSchema as object,
  });

  // 5. Validacao defensiva minima (nao e um JSON Schema validator completo).
  if (!llmResult || typeof llmResult !== "object" || Array.isArray(llmResult)) {
    return { arguments: null, error: `InvokeLLM nao retornou um objeto valido para '${toolName}'.` };
  }
  const produced = llmResult as Record<string, unknown>;
  const properties =
    inputSchema.properties && typeof inputSchema.properties === "object"
      ? (inputSchema.properties as Record<string, any>)
      : {};

  for (const field of required) {
    if (!(field in produced) || produced[field] === undefined || produced[field] === null) {
      return { arguments: null, error: `Argumento obrigatorio '${field}' ausente no resultado da resolucao.` };
    }
  }
  for (const field of required) {
    const declared = properties[field];
    if (!declared || typeof declared !== "object") continue;
    const expectedType = Array.isArray(declared.type) ? declared.type[0] : declared.type;
    if (!isValidBasicType(produced[field], expectedType)) {
      return {
        arguments: null,
        error: `Argumento '${field}' com tipo invalido (esperado ${expectedType ?? "unknown"}, recebido ${Array.isArray(produced[field]) ? "array" : typeof produced[field]}).`,
      };
    }
  }

  return { arguments: produced, error: null };
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
      // CT-01: step timeout especifico para mcp.callTool.
      // O COMPOSITE_EXECUTION_POLICY.stepTimeoutMs padrao (240s) e longo demais
      // para baseline steps (git.status, git.log) — se ENG-MCP estiver lento,
      // o fluxo supervisionado trava por 240s antes do timeout. 30s e suficiente
      // para operacoes rapidas; verificacoes longas (typecheck, testes) rodam
      // apos Approval 2 e nao afetam o caminho critico pre-Approval-2.
      capabilityTimeout: {
        "mcp.callTool": 30_000,
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
          const rawText = typeof payload.rawText === "string" ? payload.rawText.trim() : "";
          // CASO A: arguments explicitos nao-vazios sao usados diretamente — zero LLM.
          let toolArgs: Record<string, unknown>;
          const explicitArgs =
            payload.arguments && typeof payload.arguments === "object"
              ? (payload.arguments as Record<string, unknown>)
              : {};
          if (Object.keys(explicitArgs).length > 0) {
            toolArgs = explicitArgs;
          } else {
            // CASO B/C: resolver via inputSchema (cache -> list fallback -> InvokeLLM).
            const resolution = await resolveMcpArguments(serverId, toolName, rawText, logs);
            if (resolution.error) {
              return fail(resolution.error, start, eid, logs, operation);
            }
            toolArgs = resolution.arguments;
          }
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