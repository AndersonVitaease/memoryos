/**
 * WebSearchProvider.ts — Search Engine (Passo 3b: Provider Web Search)
 *
 * LIMITAÇÃO CONHECIDA E DOCUMENTADA (decisão consciente do usuário):
 * diferente dos outros providers do Search Engine, este NÃO consegue
 * ser 100% livre de LLM — a plataforma Base44 não expõe uma forma de
 * "só buscar" sem passar pela IA (a busca e a extração de fatos
 * acontecem numa única chamada de InvokeLLM com
 * add_context_from_internet=true). Ainda assim, vale a pena: em vez de
 * várias chamadas de LLM espalhadas pelo pipeline principal, fica UMA
 * chamada isolada e controlada, e a resposta final (a mais cara) só
 * roda se a confiança aqui for baixa.
 *
 * NO FUTURO: se o usuário decidir integrar uma API de busca externa
 * verdadeiramente sem LLM (ex: Bing, SerpAPI), basta criar um novo
 * arquivo implementando a mesma interface SearchProvider e trocar o
 * registro no lugar deste — nada mais no sistema precisa mudar
 * (Liskov Substitution / Open-Closed).
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

export class WebSearchProvider implements SearchProvider {
  readonly id = "web_search";
  readonly name = "Pesquisa Web (Base44/Gemini)";

  canHandle(query: string): number {
    const lower = query.toLowerCase();
    const matched = firstMatch(lower, WEB_SEARCH_KEYWORDS);
    return matched ? 0.5 : 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    const conversationContext =
      typeof options?.context?.sessionSummary === "string" ? options.context.sessionSummary : "";
    const contextBlock = conversationContext
      ? `\nCONTEXTO DA CONVERSA (use para entender do que "${query}" está falando — a pergunta pode ser vaga/curta e depender deste contexto):\n${conversationContext}\n`
      : "";

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Pesquise na internet informações atualizadas e objetivas sobre: "${query}".
${contextBlock}
Retorne apenas fatos, dados, números, datas e informações verificáveis.
Priorize fontes oficiais: documentação, órgãos reguladores, fabricantes, literatura científica.
Se houver divergência entre fontes, apresente ambas.

Formato: lista de fatos objetivos, sem opinião ou interpretação.`,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            facts:   { type: "array", items: { type: "string" }, description: "Fatos objetivos encontrados na pesquisa" },
            sources: { type: "array", items: { type: "string" }, description: "Fontes consultadas (URLs ou nomes)" },
          },
        },
      });

      const facts: string[] = Array.isArray(result?.facts) ? result.facts : [];
      const sources: string[] = Array.isArray(result?.sources) ? result.sources : [];

      if (facts.length === 0) {
        return {
          success: true, confidence: 0, items: [], provider: this.id,
          durationMs: Date.now() - t0,
        };
      }

      const items: SearchResultItem[] = facts.slice(0, options?.maxResults ?? 10).map((fact, i) => ({
        title: fact.slice(0, 80),
        snippet: fact,
        url: sources[i] ?? undefined,
        source: "web_search",
      }));

      const confidence = Math.min(0.5 + facts.length * 0.08, 0.85);

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

export const webSearchProvider = new WebSearchProvider();
