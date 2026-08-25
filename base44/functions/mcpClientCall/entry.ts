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
 *
 * Logica compartilhada (connect, resolveHeaders, etc) em base44/shared/mcpClient.ts.
 *
 * Runtime refresh note (2026-08-20): harmless redeploy marker so newly-added
 * application secrets are loaded by the deployed backend function environment.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  connect,
  resolveHeaders,
  truncateError,
  tryRecoverResultFromError,
  buildToolCatalog,
  validateToolCatalog,
  writeToolCatalog,
  resolveToolGovernance,
  type MCPServerConfigRecord,
} from '../../shared/mcpClient.ts';

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

    const { serverId, action, toolName, arguments: toolArgs, bearerToken, confirmation } = body as {
      serverId?: string;
      action?: 'list' | 'call';
      toolName?: string;
      arguments?: Record<string, unknown>;
      bearerToken?: string;
      confirmation?: { toolName: string };
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

    // UMG-3: Tool governance gate — before connection (DENY never wastes a connection).
    // UNKNOWN ≠ SAFE: tools without explicit policy default to "irreversible".
    // Tool-scoped confirmation: confirmation.toolName must match the requested toolName.
    if (action === 'call') {
      const governance = resolveToolGovernance(server, toolName as string, confirmation);
      if (!governance.allowed) {
        await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
          last_error: truncateError(`GOVERNANCE_DENIED: ${governance.reason}`),
        });
        return Response.json({
          error: 'GOVERNANCE_DENIED',
          reason: governance.reason,
          toolName: governance.toolName,
          reversibility: governance.reversibility,
        }, { status: 403 });
      }
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
          let res: any;
          try {
            res = await session.client.listTools({ cursor });
          } catch (innerErr) {
            const recovered = tryRecoverResultFromError(innerErr);
            if (!recovered) throw innerErr;
            console.warn('[mcpClientCall] SDK lancou erro mas resultado valido foi recuperado (bug conhecido do transporte)');
            res = recovered;
          }
          allTools.push(...(res.tools ?? []));
          cursor = res.nextCursor;
        } while (cursor);

        // UMG-1.3: Validate before committing cache. On failure: preserve previous catalog.
        const validation = validateToolCatalog(allTools);
        if (!validation.valid) {
          await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
            last_error: truncateError(`CATALOG_VALIDATION_FAILED: ${validation.error}`),
          });
          return Response.json({
            error: `Catalog validation failed: ${validation.error}`,
            toolCount: validation.toolCount,
            transport: session.transportUsed,
          }, { status: 502 });
        }

        // UMG-1.4: Upload catalog to file storage, store only URL in discovered_tools.
        const catalogUrl = await writeToolCatalog(base44, server.id, server.name, allTools as any[]);
        await base44.asServiceRole.entities.MCPServerConfig.update(serverId, {
          discovered_tools: catalogUrl,
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

      let result: any;
      try {
        result = await session.client.callTool({ name: toolName as string, arguments: toolArgs ?? {} });
      } catch (innerErr) {
        const recovered = tryRecoverResultFromError(innerErr);
        if (!recovered) throw innerErr;
        console.warn('[mcpClientCall] SDK lancou erro mas resultado valido foi recuperado (bug conhecido do transporte)');
        result = recovered;
      }

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