import { base44 } from "@/api/base44Client";

/**
 * Recuperação Inteligente de Contexto
 *
 * Em vez de carregar toda a conversa, busca apenas o conhecimento relevante
 * para a pergunta do usuário.
 *
 * Estratégia:
 * 1. Extrair palavras-chave da pergunta
 * 2. Buscar entidades + keywords que correspondam
 * 3. Recuperar documentos relacionados
 * 4. Combinar: resumo da sessão + contexto relevante + mensagens recentes
 * 5. Limitar tokens injetados
 */

const MAX_CONTEXT_CHARS = 8000;
const RECENT_MESSAGES_COUNT = 6;

/**
 * Extrai palavras-chave de uma pergunta usando LLM (rápido, schema simples).
 */
async function extractQueryKeywords(question) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Extraia 3-8 palavras-chave de busca da seguinte pergunta em português.
Retorne apenas as palavras, sem explicações.

Pergunta: "${question}"`,
      response_json_schema: {
        type: "object",
        properties: {
          keywords: { type: "array", items: { type: "string" } },
        },
        required: ["keywords"],
      },
    });
    return result.keywords || [];
  } catch {
    // Fallback: dividir por espaços e filtrar stopwords
    const stopwords = ["o", "a", "os", "as", "de", "da", "do", "das", "dos", "e", "ou", "que", "para", "com", "em", "um", "uma", "no", "na", "nos", "nas", "quando", "como", "qual", "quais", "quem", "onde", "foi", "ser", "tem", "ha", "muito", "muita", "esse", "essa", "este", "esta"];
    return question
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopwords.includes(w))
      .slice(0, 6);
  }
}

/**
 * Recupera contexto relevante para uma pergunta.
 * @param {string} question - Pergunta do usuário
 * @param {string} sessionId - Sessão ativa
 * @param {string} projectId - Projeto (opcional)
 * @returns {Object} { context, sources, recentMessages }
 */
export async function retrieveContext(question, sessionId, projectId) {
  // 1. Extrair palavras-chave da pergunta
  const queryKeywords = await extractQueryKeywords(question);

  // 2. Buscar paralelamente: resumo da sessão, mensagens recentes, conhecimento relevante
  const [sessions, recentMessages, allEntities, allKeywords, documents] = await Promise.all([
    sessionId ? base44.entities.ChatSession.filter({ id: sessionId }, "-updated_date", 1) : [],
    sessionId ? base44.entities.Message.filter({ session_id: sessionId }, "-created_date", RECENT_MESSAGES_COUNT) : [],
    base44.entities.KnowledgeEntity.filter(
      projectId ? { project_id: projectId } : {},
      "-created_date", 200
    ),
    base44.entities.Keyword.filter(
      projectId ? { project_id: projectId } : {},
      "-created_date", 200
    ),
    projectId
      ? base44.entities.Document.filter({ project_id: projectId, processing_status: "completed" }, "-created_date", 50)
      : base44.entities.Document.filter({ processing_status: "completed" }, "-created_date", 50),
  ]);

  const session = sessions[0];
  const sessionSummary = session?.summary || "";

  // 3. Filtrar entidades e keywords por relevância à pergunta
  const questionLower = question.toLowerCase();

  const relevantEntities = allEntities.filter((e) => {
    const valueMatch = queryKeywords.some((kw) => e.value?.toLowerCase().includes(kw));
    const directMatch = e.value && questionLower.includes(e.value.toLowerCase());
    return valueMatch || directMatch;
  }).slice(0, 30);

  const relevantKeywords = allKeywords.filter((k) => {
    return queryKeywords.some((qk) => k.keyword?.includes(qk) || qk.includes(k.keyword));
  }).slice(0, 20);

  // 4. Filtrar documentos relevantes (por keywords ou entidades)
  const relevantDocIds = new Set();
  for (const kw of relevantKeywords) {
    if (kw.document_id) relevantDocIds.add(kw.document_id);
  }
  for (const ent of relevantEntities) {
    if (ent.document_id) relevantDocIds.add(ent.document_id);
  }

  const relevantDocs = documents.filter((d) => relevantDocIds.has(d.id));
  // Se não encontrou docs relevantes, usar os mais recentes como fallback (top 5)
  const docsToUse = relevantDocs.length > 0 ? relevantDocs : documents.slice(0, 5);

  // 5. Construir contexto (com limite de tokens)
  let context = "";
  const sources = [];

  // Resumo da sessão
  if (sessionSummary) {
    context += `## RESUMO DA CONVERSA\n${sessionSummary}\n\n`;
  }

  // Documentos relevantes (apenas resumos)
  for (const doc of docsToUse) {
    const docContent = doc.summary || doc.extracted_text?.substring(0, 800) || "";
    if (!docContent) continue;
    const docBlock = `### ${doc.name} (${doc.category || "sem categoria"})\n${docContent}\n\n`;
    if ((context + docBlock).length > MAX_CONTEXT_CHARS) break;
    context += docBlock;
    sources.push({ type: "document", id: doc.id, name: doc.name });
  }

  // Entidades relevantes
  if (relevantEntities.length > 0) {
    const entityBlock = "## ENTIDADES RELEVANTES\n" +
      relevantEntities.map((e) => `- ${e.type}: ${e.value}`).join("\n") + "\n\n";
    if ((context + entityBlock).length < MAX_CONTEXT_CHARS) {
      context += entityBlock;
    }
  }

  // Keywords relevantes
  if (relevantKeywords.length > 0) {
    const kwBlock = "## PALAVRAS-CHAVE RELACIONADAS\n" +
      relevantKeywords.map((k) => k.keyword).join(", ") + "\n\n";
    if ((context + kwBlock).length < MAX_CONTEXT_CHARS) {
      context += kwBlock;
    }
  }

  // Inverter mensagens recentes (cronológico)
  const sortedRecent = [...recentMessages].reverse();

  return {
    context: context.trim(),
    sources,
    recentMessages: sortedRecent,
    sessionSummary,
  };
}