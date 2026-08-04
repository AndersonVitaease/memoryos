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

    // 1. /search (web organico) — todos os niveis
    const webRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: serperHeaders,
      body: JSON.stringify({ q: query, num: limit }),
    });

    if (!webRes.ok) {
      const errText = await webRes.text();
      return Response.json(
        { error: `Serper retornou HTTP ${webRes.status}: ${errText.slice(0, 300)}`, durationMs: Date.now() - t0 },
        { status: 502 },
      );
    }

    const webData = await webRes.json();
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

    // 2. /news — depth >= 2 ("muito")
    if (d >= 2) {
      try {
        const newsRes = await fetch('https://google.serper.dev/news', {
          method: 'POST',
          headers: serperHeaders,
          body: JSON.stringify({ q: query, num: 10 }),
        });
        if (newsRes.ok) {
          const newsData = await newsRes.json();
          const news = Array.isArray(newsData?.news) ? newsData.news : [];
          for (const r of news) {
            const title = r.title ?? '';
            const link = r.link ?? undefined;
            const k = keyOf(title, link);
            if (seen.has(k)) continue;
            seen.add(k);
            items.push({ title, snippet: r.snippet ?? r.date ?? '', url: link, source: 'serper_news' });
          }
        }
      } catch { /* non-blocking — web results ja estao disponiveis */ }
    }

    // 3. /videos — depth 3 ("super")
    if (d >= 3) {
      try {
        const vidRes = await fetch('https://google.serper.dev/videos', {
          method: 'POST',
          headers: serperHeaders,
          body: JSON.stringify({ q: query, num: 10 }),
        });
        if (vidRes.ok) {
          const vidData = await vidRes.json();
          const videos = Array.isArray(vidData?.videos) ? vidData.videos : [];
          for (const r of videos) {
            const title = r.title ?? '';
            const link = r.link ?? undefined;
            const k = keyOf(title, link);
            if (seen.has(k)) continue;
            seen.add(k);
            items.push({ title, snippet: r.source ?? r.date ?? '', url: link, source: 'serper_videos' });
          }
        }
      } catch { /* non-blocking */ }
    }

    return Response.json({ items, count: items.length, depth: d, durationMs: Date.now() - t0 });
  } catch (e) {
    return Response.json({ error: (e as Error).message, durationMs: Date.now() - t0 }, { status: 500 });
  }
});