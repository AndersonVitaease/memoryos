/**
 * FirecrawlSearchProvider.ts — Search Engine (provider de documentação/conteúdo web)
 *
 * Usa o Firecrawl (api.firecrawl.dev) para buscar e extrair conteúdo web em
 * markdown limpo. Diferente do Serper (que retorna só snippets), o Firecrawl
 * retorna o markdown completo de cada página — ideal para documentação,
 * conteúdo profundo e queries que precisam do texto verbatim.
 *
 * Arquitetura SOLID — mesma interface SearchProvider dos demais providers
 * (Liskov Substitution): troca/compoe sem mudar o SearchEngine. A API key
 * fica no backend (firecrawlCall + secret FIRECRAWL_API_KEY), nunca no
 * frontend.
 *
 * canHandle scores alto quando a query pede conteúdo/documentação profunda
 * ou menciona uma URL específica (scrape). Caso contrário score baixo —
 * Serper continua sendo o provider de busca web padrão.
 */
import type { SearchProvider, SearchResult, SearchOptions, SearchResultItem } from "./SearchProviderTypes";
import { base44 } from "@/api/base44Client";

// Palavras-chave que indicam necessidade de conteúdo profundo (não só links)
const DEEP_CONTENT_KEYWORDS = [
  "documentação", "documentacao", "docs", "documentação oficial",
  "scrape", "scraping", "crawl", "extrair conteúdo", "extrair conteudo",
  "conteúdo da página", "conteudo da pagina", "ler o site", "leia o site",
  "pesquise a fundo", "pesquisa profunda", "deep research", "a fundo",
];

function hasUrl(query: string): boolean {
  return /\bhttps?:\/\/[^\s)]+/i.test(query);
}

function extractUrl(query: string): string | null {
  const m = query.match(/\b(https?:\/\/[^\s)]+)/i);
  return m ? m[1] : null;
}

// Sinais que distinguem "owner/repo" (referência a repo GitHub) de paths
// comuns (src/components, node_modules/x). Sem um sinal, não trata como repo.
const REPO_SIGNALS = ["github", "repositorio", "repositório", "repo", "readme", "documentação", "documentacao", "docs"];

// Diretórios de path que NÃO são owners de repo GitHub — evita falso positivo
// em "src/components", "lib/utils", "node_modules/react", etc.
const NON_REPO_DIRS = ["src", "lib", "node_modules", "dist", "build", "public", "test", "tests", "docs", "api", "app", "components", "utils", "config", "scripts", "assets", "styles", "types", "interfaces", "models", "views", "pages", "hooks", "context", "store", "services"];

function extractRepo(query: string): { owner: string; repo: string } | null {
  // Se a query já tem URL, extractUrl cuida disso — não competir.
  if (hasUrl(query)) return null;
  const lower = normalize(query);
  const hasSignal = REPO_SIGNALS.some((s) => lower.includes(normalize(s)));
  if (!hasSignal) return null;
  const m = query.match(/\b([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9]?)?)\/([a-zA-Z0-9._-]{2,})\b/);
  if (!m) return null;
  if (NON_REPO_DIRS.includes(m[1].toLowerCase())) return null;
  return { owner: m[1], repo: m[2] };
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export class FirecrawlSearchProvider implements SearchProvider {
  readonly id = "firecrawl_search";
  readonly name = "Conteúdo Web Profundo (Firecrawl)";

  canHandle(query: string): number {
    // URL explícita na query → scrape direto (score alto)
    if (hasUrl(query)) return 0.95;
    // "owner/repo" com sinal de repo/docs → scrape do README do repo (score alto)
    if (extractRepo(query)) return 0.9;

    const lower = normalize(query);
    const matched = DEEP_CONTENT_KEYWORDS.some((k) => lower.includes(normalize(k)));
    return matched ? 0.85 : 0.1;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    const maxResults = options?.maxResults ?? 8;
    try {
      // Se a query tem URL → scrape direto (1 página, markdown completo)
      const url = extractUrl(query);
      if (url) {
        const res = await base44.functions.invoke("firecrawlCall", {
          operation: "scrape",
          url,
        });
        const d = (res as any)?.data ?? res;
        if (d?.ok && d?.markdown) {
          const items: SearchResultItem[] = [{
            title: d?.title || url,
            snippet: d.markdown.slice(0, 2000),
            url: d?.url || url,
            source: "firecrawl_scrape",
            raw: { markdown: d.markdown, url: d?.url || url, title: d?.title },
          }];
          return { success: true, confidence: 0.92, items, provider: this.id, durationMs: Date.now() - t0 };
        }
        return {
          success: false, confidence: 0, items: [], provider: this.id,
          durationMs: Date.now() - t0, error: d?.error ?? "scrape returned no markdown",
        };
      }

      // "owner/repo" (sem URL) → scrape do README do repo GitHub público.
      // O githubSearchProvider é escopado a um repo hardcoded (memoryos); este
      // caminho cobre QUALQUER repo público via renderização do GitHub → markdown.
      const repo = extractRepo(query);
      if (repo) {
        const repoRes = await base44.functions.invoke("firecrawlCall", {
          operation: "scrape",
          url: `https://github.com/${repo.owner}/${repo.repo}`,
        });
        const rd = (repoRes as any)?.data ?? repoRes;
        if (rd?.ok && rd?.markdown) {
          const repoUrl = `https://github.com/${repo.owner}/${repo.repo}`;
          const items: SearchResultItem[] = [{
            title: `${repo.owner}/${repo.repo} (README)`,
            snippet: rd.markdown.slice(0, 2000),
            url: repoUrl,
            source: "firecrawl_github_repo",
            raw: { markdown: rd.markdown, owner: repo.owner, repo: repo.repo, url: repoUrl },
          }];
          return { success: true, confidence: 0.9, items, provider: this.id, durationMs: Date.now() - t0 };
        }
        // Scrape falhou → cai pra busca web abaixo
      }

      // Sem URL e sem repo → busca web com markdown extraído de cada resultado
      const res = await base44.functions.invoke("firecrawlCall", {
        operation: "search",
        query,
        limit: maxResults,
      });
      const d = (res as any)?.data ?? res;

      if (d?.error) {
        return {
          success: false, confidence: 0, items: [], provider: this.id,
          durationMs: Date.now() - t0, error: d.error,
        };
      }

      const rawItems: any[] = Array.isArray(d?.items) ? d.items : [];
      if (rawItems.length === 0) {
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      const items: SearchResultItem[] = rawItems.map((it) => ({
        title: it.title || it.url || "",
        snippet: (it.markdown || "").slice(0, 2000) || it.url || "",
        url: it.url || "",
        source: "firecrawl_search",
        raw: { markdown: it.markdown, url: it.url },
      }));

      const confidence = Math.min(0.6 + rawItems.length * 0.05, 0.9);
      return { success: true, confidence, items, provider: this.id, durationMs: Date.now() - t0 };
    } catch (err) {
      return {
        success: false, confidence: 0, items: [], provider: this.id,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const firecrawlSearchProvider = new FirecrawlSearchProvider();