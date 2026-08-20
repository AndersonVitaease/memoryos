/**
 * mcpClient.ts — Logica compartilhada de cliente MCP.
 *
 * Usada por mcpClientCall (chamada user-driven, action list/call) e
 * mcpDiscoverAll (discovery periodico, service-role). Modulo puro: sem
 * Deno.serve, so helpers. Importa o SDK oficial @modelcontextprotocol/client.
 */
import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
  createMiddleware,
  applyMiddlewares,
} from 'npm:@modelcontextprotocol/client';

export interface MCPServerConfigRecord {
  id: string;
  name: string;
  server_url: string;
  auth_type: string; // 'none' | 'api_key' | 'oauth'
  api_key_secret_name?: string;
  auth_header_name?: string;
  auth_token_prefix?: string;
  extra_headers?: string; // JSON string
  enabled?: boolean;
}

/** Trunca mensagens de erro antes de salvar (limite de tamanho dos campos). */
export function truncateError(msg: string, max = 4000): string {
  return msg.length > max ? msg.slice(0, max) + '... (truncado)' : msg;
}

/** Bug conhecido do SDK: lanca erro mesmo quando o JSON-RPC de sucesso veio embutido na mensagem. */
export function tryRecoverResultFromError(err: unknown): any | null {
  const msg = err instanceof Error ? err.message : String(err);
  const jsonStart = msg.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(msg.slice(jsonStart));
    if (parsed && typeof parsed === 'object' && 'result' in parsed && !('error' in parsed)) return parsed.result;
  } catch { /* nao era JSON valido */ }
  return null;
}

/** Monta os headers fixos. bearerToken (OAuth de sessao) tem prioridade sobre a secret fixa. */
export function resolveHeaders(
  server: MCPServerConfigRecord,
  bearerToken?: string,
): { headers: Record<string, string>; error?: string } {
  const headers: Record<string, string> = {};
  if (server.extra_headers) {
    try {
      Object.assign(headers, JSON.parse(server.extra_headers) as Record<string, string>);
    } catch {
      return { headers, error: `extra_headers invalido (nao e JSON valido) em '${server.name}'` };
    }
  }
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
    return { headers };
  }
  if (server.auth_type === 'api_key') {
    if (!server.api_key_secret_name) {
      return { headers, error: `auth_type='api_key' mas api_key_secret_name nao configurado em '${server.name}'` };
    }
    const apiKey = Deno.env.get(server.api_key_secret_name);
    if (!apiKey) {
      return { headers, error: `Secret '${server.api_key_secret_name}' nao configurada (use: base44 secrets set)` };
    }
    const headerName = server.auth_header_name || 'Authorization';
    const tokenPrefix = server.auth_token_prefix || 'Bearer';
    headers[headerName] = headerName.toLowerCase() === 'authorization' ? `${tokenPrefix} ${apiKey}` : apiKey;
  } else if (server.auth_type === 'oauth' && !bearerToken) {
    return { headers, error: `auth_type='oauth' mas nenhum bearerToken foi passado para '${server.name}'` };
  }
  return { headers };
}

export function fetchWithHeaders(headers: Record<string, string>) {
  const middleware = createMiddleware(async (next: any, input: any, init: any) => {
    const merged = new Headers(init?.headers);
    for (const [k, v] of Object.entries(headers)) merged.set(k, v);
    return next(input, { ...init, headers: merged });
  });
  return applyMiddlewares(middleware)(fetch);
}

/** Conecta tentando Streamable HTTP primeiro, fallback SSE. */
export async function connect(serverUrl: string, headers: Record<string, string>) {
  const boundFetch = fetchWithHeaders(headers);
  const url = new URL(serverUrl);
  try {
    const client = new Client({ name: 'memoryos', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(url, { fetch: boundFetch });
    await client.connect(transport);
    return { client, transport, transportUsed: 'streamable-http' as const };
  } catch (streamableErr) {
    try {
      const client = new Client({ name: 'memoryos', version: '1.0.0' });
      const transport = new SSEClientTransport(url, { fetch: boundFetch } as any);
      await client.connect(transport);
      return { client, transport, transportUsed: 'sse' as const };
    } catch (sseErr) {
      throw new Error(
        `Falha ao conectar (streamable-http: ${(streamableErr as Error).message}; sse: ${(sseErr as Error).message})`,
      );
    }
  }
}

/** Compacta tools para cache (nome + descricao curta) respeitando o limite de campo. */
export function compactToolsForCache(allTools: any[]): string {
  const compact = allTools.map((t) => ({
    name: t.name,
    description: typeof t.description === 'string' ? t.description.slice(0, 200) : '',
    inputSchema: t.inputSchema ?? null,
  }));
  let json = JSON.stringify(compact);
  if (json.length > 20000) json = JSON.stringify(compact.slice(0, 20));
  return json;
}