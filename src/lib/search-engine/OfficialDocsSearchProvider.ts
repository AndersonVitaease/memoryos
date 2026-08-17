/**
 * OfficialDocsSearchProvider.ts — Search Engine (Documentação Oficial)
 *
 * Fluxo evidence-first:
 *   1. consulta cache persistente;
 *   2. em cache miss, descobre URLs candidatas de documentação oficial;
 *   3. lê as páginas reais via firecrawlCall;
 *   4. extrai fatos SOMENTE do markdown lido, sem internet no estágio de extração;
 *   5. persiste fatos com provenance mínima e marcação verified_official.
 *
 * Connector Documentation Mode:
 *   - detecta intenção de instalar/integrar/conectar uma API/conector;
 *   - procura documentação oficial por categorias técnicas relevantes;
 *   - consolida requisitos estruturados para futura comparação com o estado do MemoryOS.
 *
 * O provider nunca promove um fato novo a "oficial" apenas porque um LLM o
 * afirmou. Para verified_official=true é necessário ter URL válida, domínio
 * consistente e conteúdo efetivamente lido via Firecrawl.
 */

import type { SearchProvider, SearchResult, SearchOptions, SearchResultItem } from "./SearchProviderTypes";
import { base44 } from "@/api/base44Client";

const DOC_KEYWORDS = [
  "documentação", "documentacao", "documentação oficial", "docs oficial",
  "qual é a api", "qual a api", "como autenticar", "limite de requisições",
  "limite de requisicoes", "rate limit", "endpoint", "credenciais da api",
  "api key", "partner id", "partner key", "oauth", "scope", "scopes",
  "webhook", "webhooks", "api reference", "developer docs",
];

const CONNECTOR_INTENT_KEYWORDS = [
  "instalar conector", "instalar connector", "novo conector", "novo connector",
  "criar conector", "criar connector", "integrar", "integração", "integracao",
  "conectar ao", "conectar com", "conector para", "connector for", "connector para",
  "api integration", "integration requirements", "requisitos da api",
];

const CONNECTOR_DOC_CATEGORIES = [
  "getting_started",
  "authentication",
  "api_reference",
  "scopes_permissions",
  "rate_limits",
  "errors",
  "webhooks",
] as const;

type ConnectorDocCategory = typeof CONNECTOR_DOC_CATEGORIES[number];

const MAX_DISCOVERY_URLS = 3;
const MAX_CONNECTOR_DISCOVERY_URLS = 8;
const MAX_MARKDOWN_PER_PAGE = 16000;

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function firstMatch(lower: string, list: string[]): string | null {
  for (const s of list) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

export function isConnectorDocumentationRequest(query: string): boolean {
  const normalized = normalizeText(query);
  return CONNECTOR_INTENT_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
}

interface DocCacheRecord {
  id: string;
  search_term: string;
  fact: string;
  source_url?: string;
  source_name?: string;
  official_domain?: string;
  verified_official?: boolean;
  retrieved_at?: string;
}

interface OfficialCandidate {
  url: string;
  official_domain: string;
  title?: string;
  category?: ConnectorDocCategory;
}

interface ScrapedOfficialDoc {
  url: string;
  officialDomain: string;
  title: string;
  markdown: string;
  category?: ConnectorDocCategory;
}

interface ExtractedFact {
  fact: string;
  source_url: string;
  category?: ConnectorDocCategory;
}

interface ConnectorRequirementsPackage {
  mode: "connector_documentation";
  verifiedOfficial: boolean;
  officialDomains: string[];
  categoriesRequested: ConnectorDocCategory[];
  categoriesCovered: ConnectorDocCategory[];
  categoriesMissing: ConnectorDocCategory[];
  requirements: Partial<Record<ConnectorDocCategory, Array<{ fact: string; source_url: string }>>>;
  sourceUrls: string[];
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function isKnownCategory(value: unknown): value is ConnectorDocCategory {
  return typeof value === "string" && (CONNECTOR_DOC_CATEGORIES as readonly string[]).includes(value);
}

export function isCandidateOnOfficialDomain(url: string, officialDomain: string): boolean {
  const host = hostnameOf(url);
  const domain = normalizeDomain(officialDomain);
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
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

async function writeVerifiedFacts(term: string, facts: ExtractedFact[], docs: ScrapedOfficialDoc[]): Promise<void> {
  if (facts.length === 0) return;
  const byUrl = new Map(docs.map((d) => [d.url, d]));
  try {
    await base44.entities.OfficialDocCache.bulkCreate(
      facts.map(({ fact, source_url }) => {
        const doc = byUrl.get(source_url);
        return {
          search_term: term,
          fact,
          source_url,
          source_name: doc?.title || "Official documentation",
          official_domain: doc?.officialDomain,
          verified_official: true,
          retrieved_at: new Date().toISOString(),
        };
      })
    );
  } catch (err) {
    console.warn("[OfficialDocsSearchProvider] Falha ao gravar fatos verificados no índice:", err);
  }
}

async function discoverOfficialCandidates(query: string, connectorMode: boolean): Promise<OfficialCandidate[]> {
  const categoryInstruction = connectorMode
    ? `\nEsta é uma solicitação de integração/conector. Procure, quando existirem, páginas oficiais específicas para estas categorias:\n${CONNECTOR_DOC_CATEGORIES.map((c) => `- ${c}`).join("\n")}\nPara cada candidato inclua category usando exatamente um desses valores.`
    : "";

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Identifique APENAS páginas de documentação oficial para responder tecnicamente à consulta abaixo.\n\nConsulta: "${query}"\n\nRegras:\n- Priorize portal oficial de desenvolvedores/API do produto ou empresa mencionada.\n- Não retorne blogs, fóruns, agregadores, Reddit, Stack Overflow ou páginas de terceiros.\n- Retorne URLs específicas de documentação quando possível, não apenas homepage.\n- Para cada URL, informe o domínio oficial ao qual ela pertence.\n- Se não conseguir confirmar documentação oficial, retorne lista vazia.${categoryInstruction}`,
    add_context_from_internet: true,
    model: "gemini_3_flash",
    response_json_schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              official_domain: { type: "string" },
              title: { type: "string" },
              category: { type: "string" },
            },
            required: ["url", "official_domain"],
          },
        },
      },
    },
  });

  const raw = Array.isArray(result?.candidates) ? result.candidates : [];
  const deduped = new Map<string, OfficialCandidate>();
  const limit = connectorMode ? MAX_CONNECTOR_DISCOVERY_URLS : MAX_DISCOVERY_URLS;

  for (const candidate of raw) {
    if (!candidate || typeof candidate.url !== "string" || typeof candidate.official_domain !== "string") continue;
    if (!/^https:\/\//i.test(candidate.url)) continue;
    if (!isCandidateOnOfficialDomain(candidate.url, candidate.official_domain)) continue;
    if (!deduped.has(candidate.url)) {
      deduped.set(candidate.url, {
        url: candidate.url,
        official_domain: normalizeDomain(candidate.official_domain),
        title: typeof candidate.title === "string" ? candidate.title : undefined,
        category: isKnownCategory(candidate.category) ? candidate.category : undefined,
      });
    }
    if (deduped.size >= limit) break;
  }
  return [...deduped.values()];
}

async function scrapeOfficialCandidates(candidates: OfficialCandidate[]): Promise<ScrapedOfficialDoc[]> {
  const docs: ScrapedOfficialDoc[] = [];
  for (const candidate of candidates) {
    try {
      const res = await base44.functions.invoke("firecrawlCall", {
        operation: "scrape",
        url: candidate.url,
      });
      const d = (res as any)?.data ?? res;
      if (!d?.ok || typeof d?.markdown !== "string" || !d.markdown.trim()) continue;
      const finalUrl = typeof d?.url === "string" ? d.url : candidate.url;
      if (!isCandidateOnOfficialDomain(finalUrl, candidate.official_domain)) continue;
      docs.push({
        url: finalUrl,
        officialDomain: candidate.official_domain,
        title: typeof d?.title === "string" && d.title.trim() ? d.title : candidate.title || finalUrl,
        markdown: d.markdown.slice(0, MAX_MARKDOWN_PER_PAGE),
        category: candidate.category,
      });
    } catch (err) {
      console.warn("[OfficialDocsSearchProvider] Falha ao ler documentação oficial:", candidate.url, err);
    }
  }
  return docs;
}

async function extractFactsFromDocs(query: string, docs: ScrapedOfficialDoc[], connectorMode: boolean): Promise<ExtractedFact[]> {
  if (docs.length === 0) return [];
  const evidence = docs.map((doc, i) => (
    `\n--- DOCUMENTO ${i + 1} ---\nURL: ${doc.url}\nTÍTULO: ${doc.title}\nCATEGORIA SUGERIDA: ${doc.category ?? "não classificada"}\nCONTEÚDO:\n${doc.markdown}`
  )).join("\n");

  const connectorInstruction = connectorMode
    ? `\n- Esta consulta é para instalação/integração de conector. Classifique cada fato em uma destas categorias quando sustentado: ${CONNECTOR_DOC_CATEGORIES.join(", ")}.\n- Não force categorias ausentes. Se a documentação lida não cobre uma categoria, ela deve permanecer ausente.`
    : "";

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Responda à consulta técnica usando EXCLUSIVAMENTE os documentos fornecidos abaixo.\n\nConsulta: "${query}"\n\nRegras obrigatórias:\n- Não use conhecimento próprio.\n- Não pesquise na internet neste estágio.\n- Não complete lacunas nem infira requisitos ausentes.\n- Extraia apenas fatos explicitamente sustentados pelo conteúdo.\n- Priorize autenticação, endpoints, scopes/permissões, rate limits, schemas/formats, erros, webhooks, versões e requisitos técnicos quando presentes.\n- Cada fato deve apontar para uma das URLs fornecidas.\n- Se a documentação não sustenta um fato, não o inclua.${connectorInstruction}\n\nDOCUMENTOS:${evidence}`,
    add_context_from_internet: false,
    model: "gemini_3_flash",
    response_json_schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fact: { type: "string" },
              source_url: { type: "string" },
              category: { type: "string" },
            },
            required: ["fact", "source_url"],
          },
        },
      },
    },
  });

  const allowedUrls = new Set(docs.map((d) => d.url));
  const raw = Array.isArray(result?.facts) ? result.facts : [];
  return raw
    .filter((item: any) => item && typeof item.fact === "string" && item.fact.trim() && typeof item.source_url === "string" && allowedUrls.has(item.source_url))
    .map((item: any) => ({
      fact: item.fact.trim(),
      source_url: item.source_url,
      category: isKnownCategory(item.category) ? item.category : docs.find((d) => d.url === item.source_url)?.category,
    }));
}

function buildConnectorRequirementsPackage(docs: ScrapedOfficialDoc[], facts: ExtractedFact[]): ConnectorRequirementsPackage {
  const requirements: ConnectorRequirementsPackage["requirements"] = {};

  for (const fact of facts) {
    if (!fact.category) continue;
    const bucket = requirements[fact.category] ?? [];
    bucket.push({ fact: fact.fact, source_url: fact.source_url });
    requirements[fact.category] = bucket;
  }

  const categoriesCovered = CONNECTOR_DOC_CATEGORIES.filter((category) => (requirements[category]?.length ?? 0) > 0);
  const categoriesMissing = CONNECTOR_DOC_CATEGORIES.filter((category) => !categoriesCovered.includes(category));

  return {
    mode: "connector_documentation",
    verifiedOfficial: docs.length > 0 && facts.length > 0,
    officialDomains: [...new Set(docs.map((d) => d.officialDomain))],
    categoriesRequested: [...CONNECTOR_DOC_CATEGORIES],
    categoriesCovered,
    categoriesMissing,
    requirements,
    sourceUrls: [...new Set(docs.map((d) => d.url))],
  };
}

export class OfficialDocsSearchProvider implements SearchProvider {
  readonly id = "official_docs";
  readonly name = "Documentação Oficial (evidence-first)";

  canHandle(query: string): number {
    if (isConnectorDocumentationRequest(query)) return 0.95;
    const lower = query.toLowerCase();
    return firstMatch(lower, DOC_KEYWORDS) ? 0.75 : 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const t0 = Date.now();
    const maxResults = options?.maxResults ?? 10;
    const connectorMode = isConnectorDocumentationRequest(query);

    const cached = await queryIndex(query);
    if (cached.length > 0 && !connectorMode) {
      const verified = cached.filter((r) => r.verified_official === true && Boolean(r.source_url));
      const selected = verified.length > 0 ? verified : cached;
      const items: SearchResultItem[] = selected.slice(0, maxResults).map((r) => ({
        title: r.fact.slice(0, 80),
        snippet: r.fact,
        url: r.source_url,
        source: "official_docs",
        raw: r,
      }));
      return {
        success: true,
        confidence: verified.length > 0 ? 0.9 : 0.45,
        items,
        provider: this.id,
        durationMs: Date.now() - t0,
      };
    }

    try {
      // Connector mode intentionally refreshes official evidence instead of
      // trusting query-shaped cache: installation requirements can change.
      const candidates = await discoverOfficialCandidates(query, connectorMode);
      const docs = await scrapeOfficialCandidates(candidates);
      if (docs.length === 0) {
        return {
          success: true,
          confidence: 0,
          items: [],
          provider: this.id,
          durationMs: Date.now() - t0,
          metadata: connectorMode ? {
            connectorRequirements: buildConnectorRequirementsPackage([], []),
          } : undefined,
        };
      }

      const facts = await extractFactsFromDocs(query, docs, connectorMode);
      if (facts.length === 0) {
        return {
          success: true,
          confidence: 0,
          items: [],
          provider: this.id,
          durationMs: Date.now() - t0,
          metadata: connectorMode ? {
            connectorRequirements: buildConnectorRequirementsPackage(docs, []),
          } : undefined,
        };
      }

      void writeVerifiedFacts(query, facts, docs);

      const items: SearchResultItem[] = facts.slice(0, maxResults).map(({ fact, source_url, category }) => ({
        title: fact.slice(0, 80),
        snippet: fact,
        url: source_url,
        source: "official_docs",
        raw: {
          verified_official: true,
          official_domain: docs.find((d) => d.url === source_url)?.officialDomain,
          connector_mode: connectorMode,
          requirement_category: category,
        },
      }));

      const connectorRequirements = connectorMode ? buildConnectorRequirementsPackage(docs, facts) : undefined;
      const coverageRatio = connectorRequirements
        ? connectorRequirements.categoriesCovered.length / connectorRequirements.categoriesRequested.length
        : 1;

      return {
        success: true,
        // Connector mode only reaches high confidence with real official evidence;
        // incomplete category coverage is surfaced in metadata instead of invented.
        confidence: connectorMode ? Math.min(0.8 + coverageRatio * 0.15, 0.95) : 0.92,
        items,
        provider: this.id,
        durationMs: Date.now() - t0,
        metadata: connectorRequirements ? { connectorRequirements } : undefined,
      };
    } catch (err) {
      return {
        success: false,
        confidence: 0,
        items: [],
        provider: this.id,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const officialDocsSearchProvider = new OfficialDocsSearchProvider();