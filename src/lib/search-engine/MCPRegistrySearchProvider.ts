/**
 * MCPRegistrySearchProvider.ts — Search Engine (Passo 4: MCP Registry)
 *
 * 100% sem LLM: consulta direta à API REST do registro oficial de
 * servidores MCP (registry.modelcontextprotocol.io), mantido pela
 * Anthropic — confirmado real via pesquisa em 29/07/2026 (API v0.1,
 * em preview desde setembro/2025).
 *
 * Documentação oficial: https://modelcontextprotocol.io/registry/registry-aggregators
 * Endpoint usado: GET /v0/servers?search=<termo>&limit=<n>
 */

import type { SearchProvider, SearchResult, SearchOptions, SearchResultItem } from "./SearchProviderTypes";

const REGISTRY_BASE = "https://registry.modelcontextprotocol.io";
const REQUEST_TIMEOUT_MS = 8000;

const FILLER_WORDS = new Set([
  "pesquise", "pesquisar", "pesquisa", "procure", "procurar", "verifique", "verificar",
  "existe", "existem", "ha", "há", "tem", "servidor", "servidores", "mcp", "oficial",
  "conector", "conectores", "para", "da", "de", "do", "das", "dos", "um", "uma", "algum",
  "alguma", "se", "o", "a", "os", "as", "e",
]);

function extractSearchTerm(query: string): string {
  const words = query.replace(/[?!.,]/g, "").split(/\s+/).filter((w) => w.length > 0);
  const filtered = words.filter((w) => !FILLER_WORDS.has(w.toLowerCase()));
  return filtered.join(" ").trim();
}

interface RegistryServerEntry {
  server?: {
    name?: string;
    title?: string;
    description?: string;
    repository?: { url?: string; source?: string };
    version?: string;
  };
  _meta?: {
    "io.modelcontextprotocol.registry/official"?: { status?: string };
  };
}

export class MCPRegistrySearchProvider implements SearchProvider {
  readonly id = "mcp_registry";
  readonly name = "Registro Oficial de Servidores MCP";

  canHandle(query: string): number {
    const lower = query.toLowerCase();
    const hasMcp = /\bmcp\b/i.test(lower);
    const hasServerContext = /\bservidor(es)?\b|\bconector(es)?\b|\bregistry\b|\bregistro\b/i.test(lower);
    if (hasMcp && hasServerContext) return 0.65;
    return 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    const term = extractSearchTerm(query);
    if (!term) {
      return { success: false, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0, error: "Não foi possível extrair um termo de busca da pergunta." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = `${REGISTRY_BASE}/v0/servers?search=${encodeURIComponent(term)}&limit=${options?.maxResults ?? 10}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return { success: false, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0, error: `Registro MCP retornou HTTP ${res.status}.` };
      }

      const data = await res.json();
      const rawEntries: RegistryServerEntry[] = Array.isArray(data?.servers) ? data.servers : [];

      const lowerTerm = term.toLowerCase();
      const entries = rawEntries.filter((e) => {
        const name = (e.server?.name ?? "").toLowerCase();
        const desc = (e.server?.description ?? "").toLowerCase();
        const title = (e.server?.title ?? "").toLowerCase();
        return name.includes(lowerTerm) || desc.includes(lowerTerm) || title.includes(lowerTerm);
      });

      if (entries.length === 0) {
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      const items: SearchResultItem[] = entries.map((e) => ({
        title: e.server?.name ?? "(sem nome)",
        snippet: `${e.server?.description ?? "Sem descrição."}${e.server?.version ? ` (v${e.server.version})` : ""}${e._meta?.["io.modelcontextprotocol.registry/official"]?.status ? ` — status: ${e._meta["io.modelcontextprotocol.registry/official"].status}` : ""}`,
        url: e.server?.repository?.url,
        source: "mcp_registry",
        raw: e,
      }));

      return {
        success: true,
        confidence: 0.85,
        items,
        provider: this.id,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return {
        success: false, confidence: 0, items: [], provider: this.id,
        durationMs: Date.now() - t0,
        error: isAbort ? "Timeout ao consultar o registro MCP." : (err instanceof Error ? err.message : String(err)),
      };
    }
  }
}

export const mcpRegistrySearchProvider = new MCPRegistrySearchProvider();
