/**
 * SerperSearchProvider.ts — Search Engine (substitui WebSearchProvider)
 *
 * Busca real via API da Serper (google.serper.dev), sem LLM no meio —
 * resposta em ~1-2 segundos, contra 26-43 segundos do provider antigo
 * baseado em InvokeLLM(add_context_from_internet=true).
 *
 * A chave da API nunca aparece aqui nem em nenhum arquivo de frontend —
 * essa classe só chama a function `serperSearch`, que roda no servidor
 * e le a secret SERPER_API_KEY. Mesma interface SearchProvider do
 * WebSearchProvider antigo (Liskov Substitution) — troca 1:1 no
 * registerProviders.ts, nada mais no sistema precisa mudar.
 */
import type { SearchProvider, SearchResult, SearchOptions, SearchResultItem } from "./SearchProviderTypes";
import { base44 } from "@/api/base44Client";

const WEB_SEARCH_KEYWORDS = [
  "pesquise", "pesquisar", "pesquisa", "internet", "web", "google",
  "consulte a documentação", "veja se mudou", "verifique se",
  "notícias", "noticia", "legislação atualizada",
  "preço atual", "preços", "tendências", "tendencia", "fórum", "forum",
  "compare com sites", "pesquise na internet", "busque online", "online",
];

function firstMatch(lower: string, list: string[]): string | null {
  for (const s of list) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

export class SerperSearchProvider implements SearchProvider {
  readonly id = "serper_search";
  readonly name = "Pesquisa Web (Serper)";

  canHandle(query: string): number {
    const lower = query.toLowerCase();
    const matched = firstMatch(lower, WEB_SEARCH_KEYWORDS);
    return matched ? 0.5 : 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    try {
      const res = await base44.functions.invoke("serperSearch", {
        query,
        maxResults: options?.maxResults ?? 10,
      });
      const d = (res as any)?.data ?? res;

      if (d?.error) {
        return {
          success: false, confidence: 0, items: [], provider: this.id,
          durationMs: Date.now() - t0, error: d.error,
        };
      }

      const rawItems: SearchResultItem[] = Array.isArray(d?.items) ? d.items : [];
      if (rawItems.length === 0) {
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      const confidence = Math.min(0.5 + rawItems.length * 0.05, 0.85);
      return { success: true, confidence, items: rawItems, provider: this.id, durationMs: Date.now() - t0 };
    } catch (err) {
      return {
        success: false, confidence: 0, items: [], provider: this.id,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const serperSearchProvider = new SerperSearchProvider();
