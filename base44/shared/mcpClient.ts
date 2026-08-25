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

// ── UMG-1: Tool Catalog Foundation ─────────────────────────────────────────
// No truncation. Each tool entry carries both a stable canonical identity
// (serverId + rawToolName) and a friendly display namespace (serverName + rawToolName).

/** Sanitizes a string for use as a namespace/display prefix. */
function sanitizeNamespacePart(s: string): string {
  const cleaned = String(s ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return cleaned || 'server';
}

/**
 * UMG-1.2: Canonical stable identity for a tool.
 * Based on serverId (globally unique, never changes on rename) + rawToolName.
 * No hashing — serverId already guarantees uniqueness.
 */
export function buildCanonicalId(serverId: string, rawToolName: string): string {
  return `${serverId}.${rawToolName}`;
}

/**
 * UMG-1.2: Friendly/display qualified name for a tool.
 * Based on serverName (human-readable, may change on rename) + rawToolName.
 */
export function buildNamespace(serverName: string, rawToolName: string): string {
  return `${sanitizeNamespacePart(serverName)}.${rawToolName}`;
}

export interface ToolCatalogEntry {
  name: string;
  canonicalId: string;
  namespace: string;
  serverId: string;
  serverName: string;
  description: string;
  inputSchema: unknown;
}

export interface CatalogValidationResult {
  valid: boolean;
  error?: string;
  toolCount: number;
  duplicateNames: string[];
}

/**
 * UMG-1.3: Validates a raw tools/list result before committing to cache.
 * Pure function — no side effects. Returns valid=false on any structural issue.
 */
export function validateToolCatalog(allTools: unknown[]): CatalogValidationResult {
  if (!Array.isArray(allTools)) {
    return { valid: false, error: 'tools/list result is not an array', toolCount: 0, duplicateNames: [] };
  }
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (let i = 0; i < allTools.length; i++) {
    const tool = allTools[i] as Record<string, unknown>;
    if (!tool || typeof tool !== 'object') {
      return { valid: false, error: `tool at index ${i} is not an object`, toolCount: i, duplicateNames: duplicates };
    }
    const name = tool.name;
    if (typeof name !== 'string' || !name.trim()) {
      return { valid: false, error: `tool at index ${i} has empty or non-string name`, toolCount: i, duplicateNames: duplicates };
    }
    if (seen.has(name)) {
      duplicates.push(name);
    } else {
      seen.add(name);
    }
    const schema = tool.inputSchema;
    if (schema !== undefined && schema !== null && (typeof schema !== 'object' || Array.isArray(schema))) {
      return { valid: false, error: `tool '${name}' has invalid inputSchema (must be object or null)`, toolCount: i, duplicateNames: duplicates };
    }
  }
  if (duplicates.length > 0) {
    return { valid: false, error: `duplicate tool names: ${duplicates.join(', ')}`, toolCount: allTools.length, duplicateNames: duplicates };
  }
  return { valid: true, toolCount: allTools.length, duplicateNames: [] };
}

/**
 * UMG-1.1: Builds the tool catalog JSON string for persistence in
 * MCPServerConfig.discovered_tools. No truncation — all tools are preserved.
 * Description is capped at 200 chars for cache efficiency (inputSchema passes full).
 * UMG-1.2: Each entry includes canonicalId (stable) and namespace (display).
 */
export function buildToolCatalog(serverId: string, serverName: string, allTools: any[]): string {
  const catalog: ToolCatalogEntry[] = allTools.map((t) => {
    const rawName = typeof t?.name === 'string' ? t.name : String(t?.name ?? '');
    return {
      name: rawName,
      canonicalId: buildCanonicalId(serverId, rawName),
      namespace: buildNamespace(serverName, rawName),
      serverId,
      serverName,
      description: typeof t?.description === 'string' ? t.description.slice(0, 200) : '',
      inputSchema: t?.inputSchema ?? null,
    };
  });
  return JSON.stringify(catalog);
}

// ── UMG-1.4: UploadFile-based catalog storage ────────────────────────────────
// Platform string fields are limited to ~20KB. Catalogs with >50 tools exceed
// this limit. Solution: upload the catalog JSON as a file and store only the URL
// in discovered_tools. readToolCatalog handles both URL and inline JSON formats.

export async function writeToolCatalog(
  base44: any,
  serverId: string,
  serverName: string,
  tools: any[],
): Promise<string> {
  const catalog = buildToolCatalog(serverId, serverName, tools);
  const blob = new Blob([catalog], { type: 'application/json' });
  const file = new File([blob], `mcp-catalog-${serverId}.json`, { type: 'application/json' });
  const result = await base44.integrations.Core.UploadFile({ file });
  if (!result?.file_url) {
    throw new Error('UploadFile did not return a file_url');
  }
  return result.file_url as string;
}

export async function readToolCatalog(
  catalogFieldValue: string | null | undefined,
): Promise<any[]> {
  if (!catalogFieldValue) return [];
  const trimmed = catalogFieldValue.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(`Failed to fetch catalog from ${trimmed}: ${res.status} ${res.statusText}`);
    }
    const parsed = await res.json();
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tools) ? parsed.tools : []);
  }
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}