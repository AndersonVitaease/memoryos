/**
 * serperSearch — Backend function
 *
 * Proxy seguro para a API da Serper (google.serper.dev). A API key nunca
 * chega ao navegador do usuario — fica no servidor (secret SERPER_API_KEY),
 * igual o padrao ja usado em mcpClientCall/memoriRecall.
 *
 * Substitui o WebSearchProvider antigo (que usava InvokeLLM com
 * add_context_from_internet=true e levava 26-43 segundos). Essa function
 * chama a Serper diretamente — busca pura, sem LLM no meio — e devolve
 * em segundos.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const t0 = Date.now();
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

    const { query, maxResults } = body as { query?: string; maxResults?: number };
    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Missing required field: query' }, { status: 400 });
    }

    const apiKey = Deno.env.get('SERPER_API_KEY');
    if (!apiKey) {
      return Response.json(
        { error: "Secret 'SERPER_API_KEY' nao configurada (use: base44 secrets set SERPER_API_KEY=<key>)" },
        { status: 500 },
      );
    }

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query }),
    });

    const durationMs = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        { error: `Serper retornou HTTP ${res.status}: ${errText.slice(0, 300)}`, durationMs },
        { status: 502 },
      );
    }

    const data = await res.json();
    const organic = Array.isArray(data?.organic) ? data.organic : [];
    const limit = maxResults ?? 10;

    const items = organic.slice(0, limit).map((r: any) => ({
      title: r.title ?? '',
      snippet: r.snippet ?? '',
      url: r.link ?? undefined,
      source: 'serper',
    }));

    return Response.json({ items, count: items.length, durationMs });
  } catch (e) {
    return Response.json({ error: (e as Error).message, durationMs: Date.now() - t0 }, { status: 500 });
  }
});
