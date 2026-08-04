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

export class SerperSearchProvider implements SearchProvider {
  readonly id = "serper_search";
  readonly name = "Pesquisa Web (Serper)";

  canHandle(query: string): number {
    // Serper é o provider de busca web padrão — sempre disponível (0.2 base).
    // Score sobe para 0.9 quando há palavra-chave explícita de busca.
    const lower = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalizedKeywords = WEB_SEARCH_KEYWORDS.map((k) =>
      k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );
    const matched = normalizedKeywords.some((k) => lower.includes(k));
    return matched ? 0.9 : 0.2;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    // Pesquisa progressiva (EPIC-PWS): depth 1=robusta, 2=muito (web+news),
    // 3=super (web+news+videos + sintese IA). Resolvido pelo SearchDepthTracker
    // no planner e injetado via options.context.depth.
    const depth = Number(options?.context?.depth ?? 1) || 1;
    try {
      const res = await base44.functions.invoke("serperSearch", {
        query,
        maxResults: options?.maxResults ?? 10,
        depth,
      });
      const d = (res as any)?.data ?? res;

      if (d?.error) {
        return {
          success: false, confidence: 0, items: [], provider: this.id,
          durationMs: Date.now() - t0, error: d.error,
        };
      }

      const rawItems: SearchResultItem[] = Array.isArray(d?.items) ? d.items : [];

      // Depth 3 ("super"): alem de agregar mais fontes (web+news+videos),
      // aciona uma sintese por IA com web grounding (Gemini) pra entregar um
      // resumo profundo e atualizado. So roda no 3o nivel — quando o usuario
      // insistiu — porque e mais lento e custa creditos de integracao.
      if (depth >= 3 && rawItems.length > 0) {
        try {
          const synth = await base44.integrations.Core.InvokeLLM({
            prompt:
              `Pesquise na internet e sintetize uma resposta detalhada, atualizada e bem estruturada em português sobre: "${query}". ` +
              `Cubra os pontos mais relevantes, contextos recentes, dados-chave e, quando aplicável, nomes/fontes verificáveis. ` +
              `Seja aprofundado — esta é uma pesquisa "super" solicitada após o usuário insistir no tema.`,
            add_context_from_internet: true,
            model: "gemini_3_flash",
          });
          const synthText = typeof synth === "string" ? synth : String(synth ?? "");
          if (synthText.trim().length > 0) {
            rawItems.unshift({
              title: "Síntese da pesquisa profunda",
              snippet: synthText.slice(0, 2500),
              url: undefined,
              source: "serper_synthesis",
            });
          }
        } catch (e) {
          // Sintese falhou — mantem so os resultados agregados do Serper.
          console.warn("[SerperSearchProvider] Sintese IA (depth 3) falhou, mantendo só Serper:", e);
        }
      }

      if (rawItems.length === 0) {
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      // Confidence escala com o depth: mais fontes (e sintese) = mais confiavel.
      const baseConfidence = depth >= 3 ? 0.9 : depth === 2 ? 0.82 : 0.75;
      const confidence = Math.max(baseConfidence, Math.min(0.5 + rawItems.length * 0.03, 0.97));
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