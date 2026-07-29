/**
 * SearchEngine.ts — Search Engine (Passo 2: Motor de Decisão)
 *
 * Orquestra os providers registrados. NÃO conhece nenhum provider
 * específico (GitHub, Web Search, etc.) — só conhece a interface
 * SearchProvider.
 */

import type { SearchProvider, SearchResult, SearchOptions } from "./SearchProviderTypes";

const MIN_CONFIDENCE_TO_SKIP_LLM = 0.6;
const MAX_PROVIDERS_PER_QUERY = 3;
const MIN_CANHANDLE_SCORE = 0.15;

export interface SearchEngineOutcome {
  resolved: boolean;
  bestResult: SearchResult | null;
  allResults: SearchResult[];
  durationMs: number;
}

export class SearchEngine {
  private _providers: SearchProvider[] = [];

  registerProvider(provider: SearchProvider): void {
    if (this._providers.some((p) => p.id === provider.id)) {
      console.warn(`[SearchEngine] Provider "${provider.id}" já registrado — ignorando duplicata.`);
      return;
    }
    this._providers.push(provider);
  }

  listProviders(): { id: string; name: string }[] {
    return this._providers.map((p) => ({ id: p.id, name: p.name }));
  }

  async search(query: string, options?: SearchOptions): Promise<SearchEngineOutcome> {
    const t0 = Date.now();

    if (!query || !query.trim()) {
      return { resolved: false, bestResult: null, allResults: [], durationMs: Date.now() - t0 };
    }

    const scored = this._providers
      .map((provider) => {
        let score = 0;
        try {
          score = provider.canHandle(query);
        } catch (err) {
          console.warn(`[SearchEngine] canHandle() falhou em "${provider.id}":`, err);
        }
        return { provider, score };
      })
      .filter((s) => s.score >= MIN_CANHANDLE_SCORE)
      .sort((a, b) => b.score - a.score);

    console.log("[SearchEngine] Providers candidatos:", scored.map((s) => `${s.provider.id}=${s.score.toFixed(2)}`));

    if (scored.length === 0) {
      return { resolved: false, bestResult: null, allResults: [], durationMs: Date.now() - t0 };
    }

    const candidates = scored.slice(0, MAX_PROVIDERS_PER_QUERY);
    const allResults = await Promise.all(
      candidates.map(async ({ provider }) => {
        const tProvider = Date.now();
        try {
          return await provider.search(query, options);
        } catch (err) {
          return {
            success: false,
            confidence: 0,
            items: [],
            provider: provider.id,
            durationMs: Date.now() - tProvider,
            error: err instanceof Error ? err.message : String(err),
          } as SearchResult;
        }
      })
    );

    const successful = allResults.filter((r) => r.success && r.items.length > 0);
    const bestResult = successful.length > 0
      ? successful.reduce((best, current) => (current.confidence > best.confidence ? current : best))
      : null;

    const durationMs = Date.now() - t0;
    const resolved = Boolean(bestResult && bestResult.confidence >= MIN_CONFIDENCE_TO_SKIP_LLM);

    console.log("[SearchEngine] Resultado:", {
      resolved,
      bestProvider: bestResult?.provider ?? null,
      bestConfidence: bestResult?.confidence ?? null,
      durationMs,
    });

    return { resolved, bestResult, allResults, durationMs };
  }
}

const _KEY = "__MEMORYOS_SEARCH_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new SearchEngine();
}
export const searchEngine: SearchEngine = (
  globalThis as unknown as Record<string, SearchEngine>
)[_KEY];
