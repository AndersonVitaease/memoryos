import { base44 } from "@/api/base44Client";

/**
 * Recuperacao inteligente de contexto (legado, usado por SearchPage).
 *
 * Estrategia: extrai palavras-chave da query -> busca Entidades, Documentos
 * e Mensagens relacionadas -> monta um bloco de contexto textual + lista de
 * fontes + mensagens recentes da sessao (quando aplicavel).
 *
 * Contrato: retrieveContext(query, sessionId, projectId) ->
 *   { context: string, sources: Document[], recentMessages: Message[] }
 */

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "ou", "um", "uma",
  "uns", "umas", "no", "na", "nos", "nas", "em", "para", "por", "com", "que",
  "se", "ao", "aos", "pelo", "pela", "pelos", "pelas", "me", "te", "lhe", "nos",
  "vos", "lhes", "isso", "este", "esta", "estes", "estas", "esse", "essa",
  "esses", "essas", "aquele", "aquela", "quando", "onde", "como", "qual",
  "quais", "sobre", "apos", "ate", "entre", "desde", "the", "is", "at", "of",
]);

function extractKeywords(query) {
  const tokens = (query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  // Remove duplicados preservando ordem
  return Array.from(new Set(tokens)).slice(0, 12);
}

function buildRegex(keywords) {
  if (!keywords.length) return null;
  // Match any keyword as whole word (case-insensitive)
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i");
}

/**
 * Recupera contexto relevante para a query do usuario.
 */
export async function retrieveContext(query, sessionId = null, projectId = null) {
  const keywords = extractKeywords(query);
  const regex = buildRegex(keywords);

  // Sem keywords uteis: retorna historico recente da sessao (se houver) sem contexto
  if (!regex) {
    const recentMessages = sessionId ? await loadRecentMessages(sessionId, 8) : [];
    return { context: "", sources: [], recentMessages };
  }

  // Busca paralela: Entidades, Documentos, Mensagens por keyword
  const [entities, documents, recentMessages] = await Promise.all([
    searchEntities(regex, projectId),
    searchDocuments(regex, projectId),
    sessionId ? loadRecentMessages(sessionId, 8) : Promise.resolve([]),
  ]);

  // Monta o bloco de contexto textual
  const parts = [];

  if (entities.length > 0) {
    parts.push(
      "ENTIDADES CONHECIDAS:\n" +
        entities
          .slice(0, 15)
          .map((e) => `- ${e.type}: ${e.value}${e.context ? ` (ctx: ${e.context.slice(0, 120)})` : ""}`)
          .join("\n")
    );
  }

  if (documents.length > 0) {
    parts.push(
      "DOCUMENTOS RELACIONADOS:\n" +
        documents
          .slice(0, 10)
          .map((d) => `- ${d.name}${d.summary ? ` — ${d.summary.slice(0, 180)}` : ""}`)
          .join("\n")
    );
  }

  // Mensagens recentes relevantes (das carregadas, filtra as que tocam keywords)
  const relevantMessages = recentMessages.filter(
    (m) => m.content && regex.test(m.content)
  );
  if (relevantMessages.length > 0) {
    parts.push(
      "MENSAGENS RECENTES RELACIONADAS:\n" +
        relevantMessages
          .slice(0, 8)
          .map((m) => `${m.role === "user" ? "Usuario" : "Assistente"}: ${m.content.slice(0, 280)}`)
          .join("\n\n")
    );
  }

  const context = parts.join("\n\n");
  return { context, sources: documents, recentMessages };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function searchEntities(regex, projectId) {
  try {
    // Carrega um lote razoavel e filtra em memoria por relevancia (sem full-text)
    const filter = projectId ? { project_id: projectId } : {};
    const all = await base44.entities.KnowledgeEntity.filter(filter, "-created_date", 200);
    return (all || []).filter(
      (e) => (e.value && regex.test(e.value)) || (e.context && regex.test(e.context))
    );
  } catch {
    return [];
  }
}

async function searchDocuments(regex, projectId) {
  try {
    const filter = projectId ? { project_id: projectId } : {};
    const all = await base44.entities.Document.filter(filter, "-created_date", 100);
    return (all || []).filter(
      (d) =>
        (d.name && regex.test(d.name)) ||
        (d.summary && regex.test(d.summary)) ||
        (d.extracted_text && regex.test(d.extracted_text))
    );
  } catch {
    return [];
  }
}

async function loadRecentMessages(sessionId, limit) {
  try {
    const msgs = await base44.entities.Message.filter(
      { session_id: sessionId },
      "-created_date",
      limit
    );
    return (msgs || []).reverse();
  } catch {
    return [];
  }
}