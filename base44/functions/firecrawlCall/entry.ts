/**
 * firecrawlCall — Backend function
 *
 * Proxy seguro para a API do Firecrawl (api.firecrawl.dev). A API key nunca
 * chega ao frontend — fica no secret FIRECRAWL_API_KEY, mesmo padrao do
 * serperSearch/mcpClientCall.
 *
 * Operations:
 *   search  -> {query, limit} -> busca web com conteudo markdown extraido
 *   scrape  -> {url}          -> converte 1 URL em markdown limpo
 *   crawl   -> {url, limit}   -> rastreia multiplas paginas de um dominio (async + poll)
 *
 * Usado pelo FirecrawlSearchProvider (search-engine) e disponivel para o
 * DeepResearch quando ele identifica URLs/dominios especificos para extrair.
 */
const BASE_URL = "https://api.firecrawl.dev";
const TIMEOUT_MS = 60000;
const CRAWL_POLL_INTERVAL_MS = 2000;
const CRAWL_MAX_WAIT_MS = 45000;

function getApiKey(): string {
  return Deno.env.get("FIRECRAWL_API_KEY") ?? "";
}

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout contacting Firecrawl")), TIMEOUT_MS)
    ),
  ]);
}

export default async function (req: Request): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) return jsonError(500, "Secret 'FIRECRAWL_API_KEY' nao configurada");

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const operation = String(body.operation ?? "search");

  try {
    // ── search: busca web com markdown extraido de cada resultado ──
    if (operation === "search") {
      const query = String(body.query ?? "");
      const limit = Math.min(20, Math.max(1, Number(body.limit ?? 8)));
      if (!query) return jsonError(400, "query required");

      const r = await withTimeout(fetch(`${BASE_URL}/v2/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit,
          sources: ["web"],
          scrapeOptions: { formats: ["markdown"] },
        }),
      }));
      if (!r.ok) return jsonError(r.status, `Firecrawl search failed: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      const data = await r.json();
      // v2/search retorna {success, data: {web: [...], news: [...], images: [...]}}
      const webResults = Array.isArray(data?.data?.web) ? data.data.web : [];
      const newsResults = Array.isArray(data?.data?.news) ? data.data.news : [];
      const rawItems = [...webResults, ...newsResults];
      const items = rawItems.map((d: any) => ({
        title: d?.metadata?.title ?? d?.metadata?.sourceURL ?? "",
        url: d?.metadata?.sourceURL ?? d?.metadata?.url ?? "",
        markdown: typeof d?.markdown === "string" ? d.markdown : "",
        source: "firecrawl_search",
      }));
      return Response.json({ ok: true, items, count: items.length, operation: "search" });
    }

    // ── scrape: converte 1 URL em markdown limpo ──
    if (operation === "scrape") {
      const url = String(body.url ?? "");
      if (!url) return jsonError(400, "url required");
      const r = await withTimeout(fetch(`${BASE_URL}/v2/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      }));
      if (!r.ok) return jsonError(r.status, `Firecrawl scrape failed: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      const data = await r.json();
      return Response.json({
        ok: true,
        operation: "scrape",
        markdown: data?.data?.markdown ?? "",
        title: data?.data?.metadata?.title ?? "",
        url: data?.data?.metadata?.sourceURL ?? url,
        metadata: data?.data?.metadata ?? null,
      });
    }

    // ── crawl: rastreia multiplas paginas (async + poll) ──
    if (operation === "crawl") {
      const url = String(body.url ?? "");
      const limit = Math.min(100, Math.max(1, Number(body.limit ?? 20)));
      if (!url) return jsonError(400, "url required");

      const startRes = await withTimeout(fetch(`${BASE_URL}/v2/crawl`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          limit,
          scrapeOptions: { formats: ["markdown"] },
        }),
      }));
      if (!startRes.ok) return jsonError(startRes.status, `Firecrawl crawl start failed: ${(await startRes.text().catch(() => "")).slice(0, 300)}`);
      const startData = await startRes.json();
      const jobId = startData?.id;
      if (!jobId) return jsonError(502, "Firecrawl crawl did not return a job id");

      // Poll ate completar ou atingir CRAWL_MAX_WAIT_MS
      const deadline = Date.now() + CRAWL_MAX_WAIT_MS;
      let status = "scraping";
      let crawlData: any = null;
      while (status !== "completed" && Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, CRAWL_POLL_INTERVAL_MS));
        const pr = await withTimeout(fetch(`${BASE_URL}/v2/crawl/${jobId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        }));
        if (!pr.ok) continue;
        const pData = await pr.json();
        status = pData?.status ?? "scraping";
        if (status === "completed") crawlData = pData;
        if (status === "failed") return jsonError(502, `Firecrawl crawl failed: ${(pData?.error ?? "").slice(0, 300)}`);
      }

      if (status !== "completed") {
        return jsonError(504, `Firecrawl crawl timed out after ${CRAWL_MAX_WAIT_MS}ms (job ${jobId} still ${status})`);
      }

      const rawPages = Array.isArray(crawlData?.data) ? crawlData.data : [];
      const pages = rawPages.map((d: any) => ({
        markdown: typeof d?.markdown === "string" ? d.markdown : "",
        url: d?.metadata?.sourceURL ?? d?.metadata?.url ?? "",
        title: d?.metadata?.title ?? "",
      }));
      return Response.json({ ok: true, operation: "crawl", pages, count: pages.length, jobId });
    }

    return jsonError(400, `Unknown operation: ${operation}`);
  } catch (e) {
    return jsonError(500, `firecrawlCall error: ${e instanceof Error ? e.message : String(e)}`);
  }
}