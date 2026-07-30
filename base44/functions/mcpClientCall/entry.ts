/**
 * mcpClientCall — Backend function
 *
 * Proxy generico para chamar QUALQUER servidor MCP externo, a partir de um
 * registro em MCPServerConfig. Usa o SDK oficial (@modelcontextprotocol/client)
 * com handshake real, Streamable HTTP + fallback SSE.
 *
 * Suporta duas formas de autenticacao:
 *   1. Secret fixa no servidor (auth_type: 'api_key' no MCPServerConfig)
 *   2. Token OAuth passado na propria chamada (bearerToken no body) — usado
 *      quando o cliente ja tem um token valido (ex: reaproveitar o OAuth do
 *      Google que os conectores nativos de Gmail/Drive/Calendar ja usam,
 *      em vez de pedir consentimento de novo).
 *
 * Suporta duas acoes:
 *   - action: "list"  -> tools/list (paginado), cacheia em discovered_tools.
 *   - action: "call"  -> tools/call com { toolName, arguments }.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
  createMiddleware,
  applyMiddlewares,
} from 'npm:@modelcontextprotocol/client';

interface MCPServerConfigRecord {
  id: string;
  name: string;
  server_url: string;
  auth_type: string; // 'none' | 'api_key' | 'oauth'
  api_key_secret_name?: string;
  auth_header_name?: string;
  extra_headers?: string; // JSON string
  enabled?: boolean;
}

/** Monta os headers fixos que devem ir em toda requisicao. */
function resolveHeaders(
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

  // Token OAuth passado na chamada tem prioridade sobre a secret fixa —
  // permite reaproveitar um token de sessao ja obtido (ex: Google OAuth
  // que os conectores nativos ja usam), sem precisar guardar nada novo
  // no servidor.
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
    headers[headerName] = headerName.toLowerCase() === 'authorization' ? `Bearer ${apiKey}` : apiKey;
  } else if (server.auth_type === 'oauth' && !bearerToken) {
    return { headers, error: `auth_type='oauth' mas nenhum bearerToken foi passado na chamada para '${server.name}'` };
  }

  return { headers };
}

function fetchWithHeaders(headers: Record<string, string>) {
  const middleware = createMiddleware(async (next: any, input: any, init: any) => {
    const merged = new Headers(init?.headers);
    for (const [k, v] of Object.entries(headers)) merged.set(k, v);
    return next(input, { ...init, headers: merged });
  });
  return applyMiddlewares(middleware)(fetch);
}

/** Trunca mensagens de erro antes de salvar — campos de entity tem limite
 * de tamanho, e um erro grande demais (ex: corpo HTML de erro do servidor
 * remoto) causava uma FALHA SECUNDARIA ao tentar salvar, mascarando o
 * erro real por tras de "Field last_error exceeds the maximum allowed size". */
function truncateError(msg: string, max = 4000): string {
  return msg.length > max ? msg.slice(0, max) + "... (truncado)" : msg;
}

/**
 * FIX (bug real, confirmado com Google Workspace MCP em Developer Preview):
 * o SDK oficial as vezes lanca "Error POSTing to endpoint: <JSON>" mesmo
 * quando o <JSON> embutido na propria mensagem de erro e uma resposta
 * JSON-RPC de SUCESSO (tem campo "result"). E um bug conhecido do SDK
 * nesse tipo de transporte com certos servidores (ver issues #804 e #340
 * do repositorio oficial modelcontextprotocol/typescript-sdk — o padrao
 * "diz que conectou certinho mas ainda assim lanca erro" e documentado).
 * Em vez de falhar a chamada, extrai o resultado real de dentro da
 * mensagem de erro.
 */
function tryRecoverResultFromError(err: unknown): any | null {
  const msg = err instanceof Error ? err.message : String(err);
  const jsonStart = msg.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(msg.slice(jsonStart));
    if (parsed && typeof parsed === 'object' && 'result' in parsed && !('error' in parsed)) {
      return parsed.result;
    }
  } catch {
    // Nao era JSON valido de verdade — segue como erro normal.
  }
  return null;
}

async function connect(serverUrl: string, headers: Record<string, string>) {
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

Deno.serve(async (req) => {
  const START_MS = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { serverId, action, toolName, arguments: toolArgs, bearerToken } = body as {
      serverId?: string;
      action?: 'list' | 'call';
      toolName?: string;
      arguments?: Record<string, unknown>;
      bearerToken?: string;
    };

    if (!serverId) return Response.json({ error: 'Missing required field: serverId' }, { status: 400 });
    if (action !== 'list' && action !== 'call') {
      return Response.json({ error: "Missing/invalid field: action (must be 'list' or 'call')" }, { status: 400 });
    }
    if (action === 'call' && !toolName) {
      return Response.json({ error: "action='call' requires toolName" }, { status: 400 });
    }

    const server = (await base44.asServiceRole.entities.MCPServerConfig.get(serverId)) as
      | MCPServerConfigRecord
      | null;
    if (!server) return Response.json({ error: `MCPServerConfig '${serverId}' nao encontrado` }, { status: 404 });
    if (server.enabled === false) {
      return Response.json({ error: `Servidor '${server.name}' esta desabilitado (enabled=false)` }, { status: 409 });
    }

    const { headers, error: headerError } = resolveHeaders(server, bearerToken);
    if (headerError) {
      await base44.asServiceRole.entities.MCPServerConfig.update(serverId, { last_error: truncateError(headerError) });
      return Response.json({ error: headerError }, { status: 500 });
    }

    let session: Awaited<ReturnType<typeof connect>> | null = null;
    const t0 = Date.now();
    try {
      session = await connect(server.server_url, headers);
    } catch (e) {
      const errMsg = `Conexao/handshake falhou com '${server.name}': ${(e as Error).message}`;
      console.error('[mcpClientCall]', errMsg);
      await base44.asServiceRole.entities.MCPServerConfig.update(serverId, { last_error: truncateError(errMsg) });
      return Response.json({ error: errMsg }, { status: 502 });
    }

    try {
      if (action === 'list') {
        const allTools: unknown[] = [];
        let cursor: string | undefined;
        do {
          const res: any = await session.client.listTools({ cursor });
          allTools.push(...(res.tools ?? []));
          cursor = res.nextCursor;
        } while (cursor);

        await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
          discovered_tools: JSON.stringify(allTools),
          last_discovered_at: new Date().toISOString(),
          last_error: '',
        });

        return Response.json({
          tools: allTools,
          count: allTools.length,
          transport: session.transportUsed,
          durationMs: Date.now() - t0,
          totalMs: Date.now() - START_MS,
        });
      }

      const result: any = await session.client.callTool({ name: toolName as string, arguments: toolArgs ?? {} });

      if (result.isError) {
        const errMsg = result.content?.[0]?.text ?? `Tool error em '${server.name}'`;
        console.error('[mcpClientCall] Tool error', errMsg);
        await base44.asServiceRole.entities.MCPServerConfig.update(serverId, { last_error: truncateError(errMsg) });
        return Response.json({ error: errMsg }, { status: 502 });
      }

      return Response.json({
        result: result.structuredContent ?? result.content ?? null,
        transport: session.transportUsed,
        durationMs: Date.now() - t0,
        totalMs: Date.now() - START_MS,
      });
    } catch (e) {
      const errMsg = `Chamada MCP falhou em '${server.name}': ${(e as Error).message}`;
      console.error('[mcpClientCall]', errMsg);
      await base44.asServiceRole.entities.MCPServerConfig.update(serverId, { last_error: truncateError(errMsg) });
      return Response.json({ error: errMsg }, { status: 502 });
    } finally {
      try {
        if (session.transportUsed === 'streamable-http' && typeof (session.transport as any).terminateSession === 'function') {
          await (session.transport as any).terminateSession();
        }
        await session.client.close();
      } catch {
        // Best-effort.
      }
    }
  } catch (e) {
    console.error('[mcpClientCall] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
