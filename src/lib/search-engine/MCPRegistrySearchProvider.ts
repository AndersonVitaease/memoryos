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
// FIX (achado real via teste): 8s não foi suficiente — a API do
// registro MCP está documentada oficialmente como "preview" (pode ter
// instabilidade/lentidão). Aumentado pra 15s.
const REQUEST_TIMEOUT_MS = 15000;

// Palavras de preenchimento comuns em perguntas sobre servidores MCP —
// removidas pra extrair só o termo de busca real (nome do serviço/produto).
// FIX (achado real via teste): faltavam vários verbos de comando comuns
// em pedaços decompostos (ex: "confere se tem MCP do Mercado Livre" —
// sem remover "confere", o termo de busca virava "confere Mercado
// Livre", e como nenhum servidor real se chama "confere" algo, o filtro
// de relevância descartava tudo, mesmo com resultados reais existindo).
// Lista expandida reaproveitando os mesmos verbos já validados no
// MessageDecomposer.ts.
const FILLER_WORDS = new Set([
  "pesquise", "pesquisar", "pesquisa", "procure", "procurar", "verifique", "verificar",
  "existe", "existem", "ha", "há", "tem", "servidor", "servidores", "mcp", "oficial",
  "conector", "conectores", "para", "da", "de", "do", "das", "dos", "um", "uma", "algum",
  "alguma", "se", "o", "a", "os", "as", "e",
  "confere", "confira", "conferir", "agenda", "agende", "manda", "mande", "envia", "envie",
  "le", "lê", "leia", "resume", "resuma", "cria", "crie", "abre", "abra", "busca", "busque",
  "procura", "liste", "lista", "deleta", "delete", "exclui", "exclua", "renomeia", "renomeie",
  "copia", "copie", "move", "mova", "baixa", "baixe", "desconecta", "desconecte",
  "conecta", "conecte", "adiciona", "adicione",
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
    // FIX (achado real via teste — regressão de confabulação): antes,
    // exigia "mcp" JUNTO com "servidor/conector/registry/registro" na
    // mesma frase. Isso funcionava pra frases completas ("existe
    // servidor mcp oficial da X"), mas falhava em pedaços decompostos
    // mais curtos (ex: "confere se tem MCP do Mercado Livre" — sem a
    // palavra "servidor"). Quando o provider não disparava, a pergunta
    // caía de volta no LLM puro, que reinventava nomes de repositório
    // falsos (ex: "rg-mcp-mercadolivre" — já confirmado fabricado hoje
    // de manhã). "mcp" sozinho já é um termo raro o suficiente em
    // português pra não precisar desse reforço.
    if (/\bmcp\b/i.test(lower)) return 0.65;
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

      // FIX (achado real via teste): um teste direto contra a API real
      // mostrou que o parâmetro "search=" nem sempre filtra
      // corretamente — uma busca por "shopee" devolveu resultados sem
      // nenhuma relação (inference.sh, Tandem docs, etc.). Em vez de
      // confiar cegamente na API, confere no próprio código se o nome
      // ou a descrição de cada resultado realmente menciona o termo
      // buscado antes de aceitar como relevante — evita mostrar um
      // resultado errado com aparência de confiante.
      const lowerTerm = term.toLowerCase();

      // FIX (achado real via teste — refinamento de precisão): antes,
      // qualquer menção do termo em QUALQUER lugar (mesmo só na
      // descrição) contava igual, misturando projetos de terceiros com
      // possíveis donos oficiais, e trazendo duplicatas da mesma
      // ferramenta em versões antigas. Agora: separa correspondências
      // no NAMESPACE do dono (ex: "com.openai/...", sinal forte de
      // propriedade real) das que só mencionam o termo em algum lugar
      // (sinal fraco, projeto de terceiro/comunidade); e mantém só a
      // versão mais recente (isLatest) de cada servidor, descartando
      // duplicatas de versões antigas.
      function namespaceOwnerMatches(name: string): boolean {
        const namespace = name.split("/")[0]?.toLowerCase() ?? "";
        return new RegExp(`(^|\\.)${lowerTerm}(\\.|$)`).test(namespace);
      }

      const relevant = rawEntries.filter((e) => {
        const name = (e.server?.name ?? "").toLowerCase();
        const desc = (e.server?.description ?? "").toLowerCase();
        const title = (e.server?.title ?? "").toLowerCase();
        return name.includes(lowerTerm) || desc.includes(lowerTerm) || title.includes(lowerTerm);
      });

      // Deduplica por nome, mantendo só a versão mais recente de cada.
      const latestByName = new Map<string, RegistryServerEntry>();
      for (const e of relevant) {
        const name = e.server?.name ?? "";
        const isLatest = e._meta?.["io.modelcontextprotocol.registry/official"] as { isLatest?: boolean } | undefined;
        const existing = latestByName.get(name);
        if (!existing || isLatest?.isLatest) latestByName.set(name, e);
      }
      const deduped = [...latestByName.values()];

      const ownerMatches = deduped.filter((e) => namespaceOwnerMatches(e.server?.name ?? ""));
      const entries = ownerMatches.length > 0 ? ownerMatches : deduped;
      const isOwnerVerified = ownerMatches.length > 0;

      if (entries.length === 0) {
        // Busca real, sem resultados relevantes — confiança 0, mas
        // SUCESSO (não é erro; é uma resposta negativa legítima e
        // verificada, não apenas "a API não filtrou direito").
        return { success: true, confidence: 0, items: [], provider: this.id, durationMs: Date.now() - t0 };
      }

      const items: SearchResultItem[] = entries.slice(0, 10).map((e) => ({
        title: e.server?.name ?? "(sem nome)",
        snippet: `${e.server?.description ?? "Sem descrição."}${e.server?.version ? ` (v${e.server.version})` : ""}${e._meta?.["io.modelcontextprotocol.registry/official"]?.status ? ` — status: ${e._meta["io.modelcontextprotocol.registry/official"].status}` : ""}${isOwnerVerified ? "" : " [projeto de terceiro/comunidade — namespace não corresponde ao termo buscado]"}`,
        url: e.server?.repository?.url,
        source: "mcp_registry",
        raw: e,
      }));

      return {
        success: true,
        // Confiança mais alta quando o namespace do dono realmente bate
        // com o termo buscado (indício real de propriedade oficial);
        // mais moderada quando são só menções de terceiros/comunidade.
        confidence: isOwnerVerified ? 0.85 : 0.55,
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
