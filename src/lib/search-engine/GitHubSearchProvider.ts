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

const CODE_FILENAME_RE = /\b([a-zA-Z0-9_-]+\.(ts|tsx|js|jsx|py|java|go|rb|json|md))\b/;

function toItems(capability: string, data: unknown): SearchResultItem[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  // FIX (achado real via teste): antes, o corte pros primeiros 20
  // arquivos acontecia AQUI, antes de qualquer filtro por nome — num
  // repositório com milhares de arquivos, o arquivo procurado
  // frequentemente não estava entre os primeiros 20 (a ordem retornada
  // pela API não é garantida), fazendo a busca por nome falhar mesmo
  // quando o arquivo existia. Agora devolve a lista completa aqui; o
  // corte de exibição acontece DEPOIS de filtrar (em search()).
  if (capability === "files.list" && Array.isArray(d.items)) {
    return (d.items as Array<Record<string, unknown>>).map((f) => ({
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
      if (decision.isGitHubQuery) return decision.confidence;
    } catch {
      // segue pro fallback abaixo
    }
    return CODE_FILENAME_RE.test(query) ? 0.55 : 0;
  }

  async search(query: string, _options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    let capability: string | null = null;
    let payload: Record<string, unknown> = {};
    let confidence = 0;
    let targetFilename: string | null = null;

    try {
      const decision = _router.route(query);
      if (decision.isGitHubQuery && decision.capability) {
        capability = decision.capability;
        payload = decision.payload ?? {};
        confidence = decision.confidence;
      }
    } catch {
      // segue pro fallback abaixo
    }

    if (!capability) {
      const filenameMatch = query.match(CODE_FILENAME_RE);
      if (filenameMatch) {
        capability = "files.list";
        payload = {};
        targetFilename = filenameMatch[1];
        confidence = 0.55;
      }
    }

    if (!capability) {
      return {
        success: false, confidence: 0, items: [], provider: this.id,
        durationMs: Date.now() - t0,
        error: "Nenhuma capacidade GitHub identificada para esta pergunta.",
      };
    }

    try {
      const { GitHubConnector } = await import("@/lib/connector-runtime/connectors/GitHubConnector");
      const connector = new GitHubConnector();
      const fullPayload = {
        owner: DEFAULT_OWNER,
        repo: DEFAULT_REPO,
        ...payload,
      };
      const result = await connector.execute(capability, fullPayload, {
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

      let items = toItems(capability, result.data);

      // Filtra client-side pelo nome do arquivo específico que a
      // pergunta mencionou, em vez de devolver a árvore inteira do repo.
      if (targetFilename) {
        const lowerTarget = targetFilename.toLowerCase();
        const filtered = items.filter((it) => it.title.toLowerCase().endsWith(`/${lowerTarget}`) || it.title.toLowerCase() === lowerTarget);
        items = filtered.length > 0 ? filtered : items.filter((it) => it.title.toLowerCase().includes(lowerTarget));
      }

      // Corte de exibição só agora, DEPOIS do filtro — antes acontecia
      // cedo demais (dentro de toItems()) e descartava o arquivo
      // procurado se ele não estivesse entre os primeiros 20 de um
      // repositório com milhares de arquivos.
      items = items.slice(0, 20);

      return {
        success: true,
        confidence: items.length > 0 ? confidence : 0.2,
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

