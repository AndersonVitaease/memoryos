/**
 * OfficialLibrarySearchProvider.ts — Search Engine (Passo 3c: Biblioteca Oficial)
 *
 * 100% sem LLM: os documentos já estão embutidos no próprio app
 * (OfficialLibraryManager.js), então "buscar" aqui é só carregar o
 * texto e procurar o trecho relevante — nenhuma chamada externa.
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
    .split(/[^a-zA-Zà-úÀ-Ú0-9]+/)
    .filter((w) => w.length >= 4 || /^[A-Z]{2,}$/.test(w))
    .map((w) => w.toLowerCase());

  const allParagraphs = docText.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  const MIN_CONTENT_LENGTH = 80;
  const contentParagraphs = allParagraphs.filter((p) => p.trim().length >= MIN_CONTENT_LENGTH);

  for (let i = 0; i < contentParagraphs.length; i++) {
    const lowerP = contentParagraphs[i].toLowerCase();
    if (queryWords.some((w) => lowerP.includes(w))) {
      const next = contentParagraphs[i + 1] ? `\n\n${contentParagraphs[i + 1]}` : "";
      return `${contentParagraphs[i].trim()}${next}`.slice(0, 900);
    }
  }

  return contentParagraphs[0]?.trim().slice(0, 900) ?? allParagraphs[0]?.trim().slice(0, 900) ?? docText.slice(0, 900);
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
