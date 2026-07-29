/**
 * GitHubSearchProvider.ts — Search Engine (Passo 3a: Provider GitHub)
 *
 * NÃO reimplementa nada — só adapta o que já existe e é real:
 *   - GitHubQueryRouter.ts decide QUAL capacidade usar (sem LLM, já era
 *     assim antes de hoje).
 *   - GitHubConnector.ts (connector-runtime) EXECUTA a chamada real à
 *     API do GitHub.
 * Este arquivo só costura os dois na interface SearchProvider.
 */

import type { SearchProvider, SearchResult, SearchOptions, SearchResultItem } from "./SearchProviderTypes";
import { GitHubQueryRouter } from "@/lib/conversation-cognitive-gateway/GitHubQueryRouter";

const DEFAULT_OWNER = "AndersonVitaease";
const DEFAULT_REPO = "memoryos";

const _router = new GitHubQueryRouter();

function toItems(capability: string, data: unknown): SearchResultItem[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  if (capability === "files.list" && Array.isArray(d.items)) {
    return (d.items as Array<Record<string, unknown>>).slice(0, 20).map((f) => ({
      title: String(f.path ?? "(sem nome)"),
      snippet: `${f.path} — ${f.size ?? "?"} bytes`,
      source: "github",
      raw: f,
    }));
  }

  if (capability === "files.get") {
    const path = typeof d.path === "string" ? d.path : "arquivo";
    const content = typeof d.content === "string" ? d.content
      : typeof d.decodedContent === "string" ? d.decodedContent
      : null;
    return [{
      title: path,
      snippet: content ? content.slice(0, 500) : `Arquivo ${path} encontrado (conteúdo não textual ou binário).`,
      source: "github",
      raw: d,
    }];
  }

  return [{
    title: `Resultado (${capability})`,
    snippet: JSON.stringify(d).slice(0, 500),
    source: "github",
    raw: d,
  }];
}

export class GitHubSearchProvider implements SearchProvider {
  readonly id = "github";
  readonly name = "GitHub (repositório conectado)";

  canHandle(query: string): number {
    try {
      const decision = _router.route(query);
      return decision.isGitHubQuery ? decision.confidence : 0;
    } catch {
      return 0;
    }
  }

  async search(query: string, _options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    let decision;
    try {
      decision = _router.route(query);
    } catch (err) {
      return {
        success: false, confidence: 0, items: [], provider: this.id,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (!decision.isGitHubQuery || !decision.capability) {
      return {
        success: false, confidence: 0, items: [], provider: this.id,
        durationMs: Date.now() - t0,
        error: "Nenhuma capacidade GitHub identificada para esta pergunta.",
      };
    }

    try {
      const { GitHubConnector } = await import("@/lib/connector-runtime/connectors/GitHubConnector");
      const connector = new GitHubConnector();
      const payload = {
        owner: DEFAULT_OWNER,
        repo: DEFAULT_REPO,
        ...decision.payload,
      };
      const result = await connector.execute(decision.capability, payload, {
        executionId: `search-engine-${Date.now()}`,
        userId: "search-engine",
        projectId: "default",
        sessionId: "search-engine",
      });

      if (!result.success) {
        return {
          success: false, confidence: 0, items: [], provider: this.id,
          durationMs: Date.now() - t0,
          error: result.error ?? "Falha desconhecida na chamada ao GitHub.",
        };
      }

      const items = toItems(decision.capability, result.data);
      return {
        success: true,
        confidence: items.length > 0 ? decision.confidence : 0.2,
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

export const githubSearchProvider = new GitHubSearchProvider();
