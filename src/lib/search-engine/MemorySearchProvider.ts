/**
 * MemorySearchProvider.ts — Search Engine (Passo 3d: Memória Persistente)
 *
 * 100% sem LLM: memoryService.retrieve() já é uma consulta estruturada
 * ao banco de decisões/tarefas/tópicos do usuário — nenhuma chamada de
 * IA envolvida nessa recuperação em si.
 */

import type { SearchProvider, SearchResult, SearchOptions } from "./SearchProviderTypes";
import { memoryService } from "@/lib/memory-kernel/MemoryServiceFactory";

const MEMORY_KEYWORDS = [
  "lembro", "lembrar", "recordo", "recordar", "memoria", "memória",
  "remember", "memory", "recall",
  "o que eu disse", "o que falamos", "discutimos", "conversamos",
  "resumo", "resumir", "summarize", "summary", "recap", "recapitular",
  "sessao", "sessão", "session", "conversa anterior",
  "ultimas conversas", "últimas conversas", "historico", "histórico",
  "quem faz", "quem é responsável", "quem cuida de", "decidimos",
];

function firstMatch(lower: string, list: string[]): string | null {
  for (const s of list) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

export class MemorySearchProvider implements SearchProvider {
  readonly id = "memory";
  readonly name = "Memória Persistente";

  canHandle(query: string): number {
    const lower = query.toLowerCase();
    return firstMatch(lower, MEMORY_KEYWORDS) ? 0.6 : 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    try {
      const sessionId = typeof options?.context?.sessionId === "string" ? options.context.sessionId : "search-engine";
      const projectId = typeof options?.context?.projectId === "string" ? (options.context.projectId as string) : null;

      const result = await memoryService.retrieve({
        userMessage: query,
        sessionId,
        projectId,
      });

      const hasContent = Boolean(result.memories && result.memories.trim().length > 0);
      const sourceCount = result.sources?.length ?? 0;

      if (!hasContent || sourceCount === 0) {
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      const queryWords = query.toLowerCase().split(/[^a-zà-ú0-9]+/).filter((w) => w.length >= 4);
      const bulletItems = result.memories
        .split(/\n(?=[*\-•]\s)/)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

      const relevantItems = queryWords.length > 0
        ? bulletItems.filter((b) => {
            const lowerB = b.toLowerCase();
            return queryWords.some((w) => lowerB.includes(w));
          })
        : [];

      const sourceTypes = [...new Set((result.sources ?? []).map((s) => s.type))];

      if (relevantItems.length === 0) {
        return {
          success: true,
          confidence: 0.25,
          items: [{
            title: `Memória geral recuperada (${sourceTypes.join(", ")}) — sem correspondência específica`,
            snippet: result.memories.slice(0, 400),
            source: "memory",
            raw: { sources: result.sources, sessionSummary: result.sessionSummary },
          }],
          provider: this.id,
          durationMs: Date.now() - t0,
        };
      }

      const snippet = relevantItems.slice(0, options?.maxResults ?? 5).join("\n\n");

      return {
        success: true,
        confidence: Math.min(0.55 + relevantItems.length * 0.1, 0.9),
        items: [{
          title: `Memória recuperada (${sourceTypes.join(", ")})`,
          snippet,
          source: "memory",
          raw: { sources: result.sources, sessionSummary: result.sessionSummary },
        }],
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

export const memorySearchProvider = new MemorySearchProvider();
