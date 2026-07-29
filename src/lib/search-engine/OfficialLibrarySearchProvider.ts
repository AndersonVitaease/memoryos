/**
 * OfficialLibrarySearchProvider.ts — Search Engine (Passo 3c: Biblioteca Oficial)
 *
 * 100% sem LLM: os documentos já estão embutidos no próprio app
 * (OfficialLibraryManager.js), então "buscar" aqui é só carregar o
 * texto e procurar o trecho relevante — nenhuma chamada externa.
 *
 * Reaproveita a MESMA lógica de mapeamento sigla → documento que já
 * corrigimos hoje (IA-064/074) — sem duplicar e arriscar reintroduzir
 * o bug de "MAS"/"MES" não sendo reconhecidos.
 */

import type { SearchProvider, SearchResult, SearchOptions, SearchResultItem } from "./SearchProviderTypes";
import OfficialLibraryManager from "@/lib/officialLibraryManager";

const ACRONYM_TO_DOC: Record<string, string> = {
  MV:  "MV-MemoryOS-Vision",
  MPS: "MPS-MemoryOS-Product-Specification",
  MAS: "MAS-MemoryOS-Architecture-Specification",
  MES: "MES-MemoryOS-Engineering-Specification",
};

const ACRONYM_RE = /\b(MAS|MES|MV|MPS)\b/g;

function detectAcronyms(query: string): string[] {
  const matches = query.match(ACRONYM_RE) ?? [];
  return [...new Set(matches)];
}

function extractRelevantSnippet(docText: string, query: string): string {
  const queryWords = query
    .toLowerCase()
    .split(/[^a-zà-ú0-9]+/)
    .filter((w) => w.length >= 4);

  const paragraphs = docText.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  for (const p of paragraphs) {
    const lowerP = p.toLowerCase();
    if (queryWords.some((w) => lowerP.includes(w))) {
      return p.trim().slice(0, 600);
    }
  }

  return paragraphs[0]?.trim().slice(0, 600) ?? docText.slice(0, 600);
}

export class OfficialLibrarySearchProvider implements SearchProvider {
  readonly id = "official_library";
  readonly name = "Biblioteca Oficial do MemoryOS";

  canHandle(query: string): number {
    const acronyms = detectAcronyms(query);
    if (acronyms.length > 0) return 0.8;

    const lower = query.toLowerCase();
    if (/\bbiblioteca oficial\b|\bespecifica[cç][aã]o\b|\barquitetura do memoryos\b/.test(lower)) {
      return 0.4;
    }
    return 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    try {
      if (!OfficialLibraryManager.isReady()) {
        await OfficialLibraryManager.load();
      }

      const acronyms = detectAcronyms(query);
      const docNames = acronyms.length > 0
        ? acronyms.map((a) => ACRONYM_TO_DOC[a]).filter(Boolean)
        : OfficialLibraryManager.getDocNames();

      const items: SearchResultItem[] = [];
      for (const docName of docNames.slice(0, options?.maxResults ?? 3)) {
        const content = OfficialLibraryManager.getDoc(docName);
        if (!content) continue;
        items.push({
          title: docName,
          snippet: extractRelevantSnippet(content, query),
          source: "official_library",
        });
      }

      if (items.length === 0) {
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      const confidence = acronyms.length > 0 ? 0.9 : 0.5;

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

export const officialLibrarySearchProvider = new OfficialLibrarySearchProvider();
