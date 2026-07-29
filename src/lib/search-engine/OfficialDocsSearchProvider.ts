/**
 * OfficialDocsSearchProvider.ts — Search Engine (Passo 5: Documentação Oficial)
 *
 * Desenho híbrido: consulta um índice persistente (entidade
 * OfficialDocCache, compartilhada entre todos os usuários do app)
 * primeiro — 100% sem LLM, consulta direta ao banco. Se não encontrar
 * nada, pesquisa de verdade (1 chamada de LLM) e GRAVA o resultado no
 * índice, pra próximas perguntas sobre o mesmo assunto serem
 * respondidas na hora.
 *
 * Requer a entidade OfficialDocCache já publicada no Base44.
 */

import type { SearchProvider, SearchResult, SearchOptions, SearchResultItem } from "./SearchProviderTypes";
import { base44 } from "@/api/base44Client";

const DOC_KEYWORDS = [
  "documentação", "documentacao", "documentação oficial", "docs oficial",
  "qual é a api", "qual a api", "como autenticar", "limite de requisições",
  "limite de requisicoes", "rate limit", "endpoint", "credenciais da api",
  "api key", "partner id", "partner key",
];

function firstMatch(lower: string, list: string[]): string | null {
  for (const s of list) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

interface DocCacheRecord {
  id: string;
  search_term: string;
  fact: string;
  source_url?: string;
  source_name?: string;
}

async function queryIndex(term: string): Promise<DocCacheRecord[]> {
  try {
    const results = await base44.entities.OfficialDocCache.filter(
      { search_term: { $regex: term, $options: "i" } },
      "-created_date",
      10
    );
    return results as unknown as DocCacheRecord[];
  } catch {
    return [];
  }
}

async function writeToIndex(term: string, facts: string[], sources: string[]): Promise<void> {
  try {
    await base44.entities.OfficialDocCache.bulkCreate(
      facts.map((fact, i) => ({
        search_term: term,
        fact,
        source_url: sources[i]?.startsWith("http") ? sources[i] : undefined,
        source_name: sources[i] && !sources[i].startsWith("http") ? sources[i] : undefined,
      }))
    );
  } catch (err) {
    console.warn("[OfficialDocsSearchProvider] Falha ao gravar no índice:", err);
  }
}

export class OfficialDocsSearchProvider implements SearchProvider {
  readonly id = "official_docs";
  readonly name = "Documentação Oficial (índice + pesquisa)";

  canHandle(query: string): number {
    const lower = query.toLowerCase();
    return firstMatch(lower, DOC_KEYWORDS) ? 0.5 : 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();

    const cached = await queryIndex(query);
    if (cached.length > 0) {
      const items: SearchResultItem[] = cached.slice(0, options?.maxResults ?? 10).map((r) => ({
        title: r.fact.slice(0, 80),
        snippet: r.fact,
        url: r.source_url,
        source: "official_docs",
        raw: r,
      }));
      return {
        success: true,
        confidence: 0.8,
        items,
        provider: this.id,
        durationMs: Date.now() - t0,
      };
    }

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Pesquise na documentação oficial e fontes técnicas confiáveis sobre: "${query}".
Retorne apenas fatos objetivos, técnicos e verificáveis (limites, formatos, requisitos de autenticação, endpoints).
Priorize a documentação oficial do serviço/produto mencionado.

Formato: lista de fatos objetivos, sem opinião ou interpretação.`,
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            facts:   { type: "array", items: { type: "string" }, description: "Fatos objetivos encontrados" },
            sources: { type: "array", items: { type: "string" }, description: "Fontes consultadas (URLs ou nomes)" },
          },
        },
      });

      const facts: string[] = Array.isArray(result?.facts) ? result.facts : [];
      const sources: string[] = Array.isArray(result?.sources) ? result.sources : [];

      if (facts.length === 0) {
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      writeToIndex(query, facts, sources);

      const items: SearchResultItem[] = facts.slice(0, options?.maxResults ?? 10).map((fact, i) => ({
        title: fact.slice(0, 80),
        snippet: fact,
        url: sources[i]?.startsWith("http") ? sources[i] : undefined,
        source: "official_docs",
      }));

      return {
        success: true,
        confidence: Math.min(0.5 + facts.length * 0.08, 0.85),
        items,
        provider: this.id,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        success: false, confidence: 0, items: [], provider: this.id,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const officialDocsSearchProvider = new OfficialDocsSearchProvider();
