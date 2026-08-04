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

    const { query, maxResults, depth } = body as { query?: string; maxResults?: number; depth?: number };
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

    // Pesquisa progressiva (EPIC-PWS): 1=robusta (web), 2=muito (web+news),
    // 3=super (web+news+videos). Quanto maior o depth, mais fontes agregadas.
    const d = Math.min(3, Math.max(1, Math.floor(Number(depth) || 1)));
    const limit = maxResults ?? (d === 1 ? 10 : d === 2 ? 20 : 30);
    const serperHeaders = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' };

    const seen = new Set<string>();
    const items: any[] = [];
    const keyOf = (title: string, link?: string) => (link || title || '').toLowerCase();

    // Otimizacao: dispara todos os endpoints necessarios em paralelo (Promise.allSettled).
    // Antes eram sequenciais (soma das latencias); agora o tempo total e o da
    // chamada mais lenta. /search e obrigatorio (502 se falhar); /news e /videos
    // sao opcionais (non-blocking) e so rodam nos depths correspondentes.
    const endpoints: { url: string; body: Record<string, unknown> }[] = [
      { url: 'https://google.serper.dev/search', body: { q: query, num: limit } },
    ];
    if (d >= 2) endpoints.push({ url: 'https://google.serper.dev/news', body: { q: query, num: 10 } });
    if (d >= 3) endpoints.push({ url: 'https://google.serper.dev/videos', body: { q: query, num: 10 } });

    const responses = await Promise.allSettled(
      endpoints.map((e) => fetch(e.url, { method: 'POST', headers: serperHeaders, body: JSON.stringify(e.body) })),
    );

    // /search (index 0) e obrigatorio
    const webRes = responses[0];
    if (webRes.status === 'rejected' || !webRes.value.ok) {
      const errText = webRes.status === 'fulfilled' ? await webRes.value.text() : String(webRes.reason);
      return Response.json(
        { error: `Serper retornou erro no /search: ${errText.slice(0, 300)}`, durationMs: Date.now() - t0 },
        { status: 502 },
      );
    }

    const webData = await webRes.value.json();
    const organic = Array.isArray(webData?.organic) ? webData.organic : [];
    for (const r of organic) {
      const title = r.title ?? '';
      const link = r.link ?? undefined;
      const k = keyOf(title, link);
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ title, snippet: r.snippet ?? '', url: link, source: 'serper_web' });
    }
    // Knowledge Graph (quando existe) — agrega como item de destaque no topo
    const kg = webData?.knowledgeGraph;
    if (kg?.title && kg?.description) {
      items.unshift({
        title: String(kg.title),
        snippet: String(kg.description).slice(0, 500),
        url: kg.website ?? undefined,
        source: 'serper_kg',
      });
    }

    // /news (index 1, se existir) — optional, non-blocking
    if (responses[1]?.status === 'fulfilled' && responses[1].value.ok) {
      try {
        const newsData = await responses[1].value.json();
        const news = Array.isArray(newsData?.news) ? newsData.news : [];
        for (const r of news) {
          const title = r.title ?? '';
          const link = r.link ?? undefined;
          const k = keyOf(title, link);
          if (seen.has(k)) continue;
          seen.add(k);
          items.push({ title, snippet: r.snippet ?? r.date ?? '', url: link, source: 'serper_news' });
        }
      } catch { /* non-blocking */ }
    }

    // /videos (index 2, se existir) — optional, non-blocking
    if (responses[2]?.status === 'fulfilled' && responses[2].value.ok) {
      try {
        const vidData = await responses[2].value.json();
        const videos = Array.isArray(vidData?.videos) ? vidData.videos : [];
        for (const r of videos) {
          const title = r.title ?? '';
          const link = r.link ?? undefined;
          const k = keyOf(title, link);
          if (seen.has(k)) continue;
          seen.add(k);
          items.push({ title, snippet: r.source ?? r.date ?? '', url: link, source: 'serper_videos' });
        }
      } catch { /* non-blocking */ }
    }

    return Response.json({ items, count: items.length, depth: d, durationMs: Date.now() - t0 });
  } catch (e) {
    return Response.json({ error: (e as Error).message, durationMs: Date.now() - t0 }, { status: 500 });
  }
});