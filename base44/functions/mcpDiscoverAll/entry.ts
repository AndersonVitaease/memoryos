/**
 * mcpDiscoverAll — Discovery periodico de servidores MCP.
 *
 * Invocado pelo workflow agendado "MCP Discovery". Itera todos os
 * MCPServerConfig habilitados (enabled=true), roda tools/list em cada
 * um e atualiza discovered_tools / last_discovered_at / last_error.
 *
 * Padrao de auth: mesmo do watchSchedulerTick — isAuthenticated() guard
 * (o workflow injeta contexto autenticado) + asServiceRole para entidades.
 *
 * Nao suporta auth_type='oauth' (esses exigem um bearerToken de sessao
 * que so existe no front; o discovery periodico nao tem usuario). Para
 * esses, resolveHeaders registra last_error explicando e segue.
 *
 * Logica compartilhada em base44/shared/mcpClient.ts.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  connect,
  resolveHeaders,
  truncateError,
  tryRecoverResultFromError,
  buildToolCatalog,
  validateToolCatalog,
  type MCPServerConfigRecord,
} from '../../shared/mcpClient.ts';

async function discoverOne(base44: any, server: MCPServerConfigRecord): Promise<{ ok: boolean; toolCount: number; error?: string }> {
  const { headers, error: headerError } = resolveHeaders(server);
  if (headerError) {
    await base44.asServiceRole.entities.MCPServerConfig.update(server.id, { last_error: truncateError(headerError) });
    return { ok: false, toolCount: 0, error: headerError };
  }

  let session: Awaited<ReturnType<typeof connect>> | null = null;
  try {
    session = await connect(server.server_url, headers);
  } catch (e) {
    const errMsg = `Conexao/handshake falhou: ${(e as Error).message}`;
    await base44.asServiceRole.entities.MCPServerConfig.update(server.id, { last_error: truncateError(errMsg) });
    return { ok: false, toolCount: 0, error: errMsg };
  }

  console.log(`[mcpDiscoverAll] server=${server.name} discovery_started`);
  let pagesFetched = 0;
  try {
    const allTools: unknown[] = [];
    let cursor: string | undefined;
    do {
      let res: any;
      try {
        res = await session.client.listTools({ cursor });
      } catch (innerErr) {
        const recovered = tryRecoverResultFromError(innerErr);
        if (!recovered) throw innerErr;
        res = recovered;
      }
      allTools.push(...(res.tools ?? []));
      cursor = res.nextCursor;
      pagesFetched++;
    } while (cursor);

    console.log(`[mcpDiscoverAll] server=${server.name} pages_fetched=${pagesFetched} tool_count=${allTools.length}`);

    // UMG-1.3: Atomic catalog swap — validate BEFORE commit.
    // On validation failure: preserve previous catalog (do NOT update discovered_tools).
    const validation = validateToolCatalog(allTools);
    if (!validation.valid) {
      await base44.asServiceRole.entities.MCPServerConfig.update(server.id, {
        last_error: truncateError(`CATALOG_VALIDATION_FAILED: ${validation.error}`),
      });
      console.log(`[mcpDiscoverAll] server=${server.name} validation=fail swap=preserved error='${validation.error}'`);
      return { ok: false, toolCount: allTools.length, error: `Catalog validation failed: ${validation.error}` };
    }

    // UMG-1.1 + UMG-1.2: Build catalog with canonicalId + namespace, no truncation.
    await base44.asServiceRole.entities.MCPServerConfig.update(server.id, {
      discovered_tools: buildToolCatalog(server.id, server.name, allTools as any[]),
      last_discovered_at: new Date().toISOString(),
      last_error: '',
    });
    console.log(`[mcpDiscoverAll] server=${server.name} validation=pass swap=success tool_count=${allTools.length}`);
    return { ok: true, toolCount: allTools.length };
  } catch (e) {
    // UMG-1.3: Preserve previous catalog on unexpected error — do NOT update discovered_tools.
    const errMsg = `tools/list falhou: ${(e as Error).message}`;
    await base44.asServiceRole.entities.MCPServerConfig.update(server.id, { last_error: truncateError(errMsg) });
    console.log(`[mcpDiscoverAll] server=${server.name} discovery_failed reason=exception swap=preserved`);
    return { ok: false, toolCount: 0, error: errMsg };
  } finally {
    try {
      if (session.transportUsed === 'streamable-http' && typeof (session.transport as any).terminateSession === 'function') {
        await (session.transport as any).terminateSession();
      }
      await session.client.close();
    } catch { /* best-effort */ }
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const servers = (await base44.asServiceRole.entities.MCPServerConfig.filter({ enabled: true })) as MCPServerConfigRecord[];

    const totals = { processed: 0, succeeded: 0, failed: 0, totalTools: 0 };
    const results: Array<{ name: string; ok: boolean; toolCount: number; error?: string }> = [];

    for (const server of servers) {
      totals.processed++;
      const r = await discoverOne(base44, server);
      if (r.ok) {
        totals.succeeded++;
        totals.totalTools += r.toolCount;
      } else {
        totals.failed++;
      }
      results.push({ name: server.name, ok: r.ok, toolCount: r.toolCount, error: r.error });
    }

    return Response.json({ ok: true, ...totals, results, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}