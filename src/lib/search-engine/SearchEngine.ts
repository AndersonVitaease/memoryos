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
// Max time to wait for any single provider before giving up the whole search.
// Prevents slow external APIs (mcp_registry, etc.) from blocking the LLM step.
const SEARCH_ENGINE_TIMEOUT_MS = 800;

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

    // FIX (achado real via teste): antes usava Promise.all e esperava
    // TODOS os providers terminarem, mesmo depois de um deles ja trazer
    // uma resposta boa (ex: serper_search em 1.9s). Se outro provider
    // (ex: mcp_registry, API externa em preview, ate 15s de timeout)
    // estivesse lento naquele momento, o usuario esperava o pior caso
    // inteiro por nada. Agora: resolve assim que QUALQUER provider bater
    // o limiar de confianca (MIN_CONFIDENCE_TO_SKIP_LLM) — os que ainda
    // estao rodando continuam em segundo plano so pra log, nunca
    // bloqueiam a resposta. Se nenhum bater o limiar, o comportamento
    // cai pro mesmo de antes (espera todos, escolhe o melhor disponivel).
    const providerPromises = candidates.map(({ provider }) => {
      const tProvider = Date.now();
      return provider.search(query, options).catch((err) => ({
        success: false,
        confidence: 0,
        items: [],
        provider: provider.id,
        durationMs: Date.now() - tProvider,
        error: err instanceof Error ? err.message : String(err),
      } as SearchResult));
    });

    const allResults: SearchResult[] = [];
    let earlyWinner: SearchResult | null = null;
    const pending = new Set(providerPromises);

    // Global timeout — if no provider wins within SEARCH_ENGINE_TIMEOUT_MS,
    // abort waiting and fall through to best available result (or nothing).
    const _deadline = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SEARCH_ENGINE_TIMEOUT_MS)
    );

    while (pending.size > 0 && !earlyWinner) {
      const wrapped = [...pending].map((p) => p.then((r) => ({ p, r })));
      const settled = await Promise.race([...wrapped, _deadline.then((v) => v)]);
      if (settled === null) break; // deadline hit — stop waiting
      pending.delete(settled.p);
      allResults.push(settled.r);
      if (settled.r.success && settled.r.items.length > 0 && settled.r.confidence >= MIN_CONFIDENCE_TO_SKIP_LLM) {
        earlyWinner = settled.r;
      }
    }

    if (pending.size > 0) {
      // Providers restantes continuam rodando, mas nao sao mais aguardados
      // — so logados quando (se) terminarem, sem impacto na resposta atual.
      Promise.all([...pending]).then((rest) => {
        console.log(
          "[SearchEngine] Providers restantes terminaram em segundo plano (nao aguardados):",
          rest.map((r) => ({ provider: r.provider, success: r.success, durationMs: r.durationMs })),
        );
      }).catch(() => {});
    }


    const successful = allResults.filter((r) => r.success && r.items.length > 0);
    const bestResult = successful.length > 0
      ? successful.reduce((best, current) => (current.confidence > best.confidence ? current : best))
      : null;

    const durationMs = Date.now() - t0;
    const resolved = Boolean(bestResult && bestResult.confidence >= MIN_CONFIDENCE_TO_SKIP_LLM);

    console.log("[SearchEngine] Detalhes de cada provider tentado (JSON): " + JSON.stringify(allResults.map((r) => ({
      provider: r.provider,
      success: r.success,
      confidence: r.confidence,
      itemCount: r.items.length,
      error: r.error ?? null,
      durationMs: r.durationMs,
    }))));

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