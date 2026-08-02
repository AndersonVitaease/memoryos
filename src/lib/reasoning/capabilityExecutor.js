import { base44 } from "@/api/base44Client";
import { executeOfficialLibraryQuery } from "./capabilities/officialLibraryCapability";

/**
 * Capability Executor
 *
 * Executa capacidades decididas pelo Capability Orchestrator.
 *
 * IMPORTANTE — regra de UMA chamada LLM por resposta:
 * - As capacidades executadas aqui NÃO chamam o LLM diretamente.
 * - Elas produzem dados brutos (texto de pesquisa, valores calculados,
 *   texto de documentos) que são injetados no Context Builder.
 * - O LLM é chamado UMA ÚNICA vez pelo Planner, já com todos os
 *   resultados consolidados.
 *
 * Capacidades:
 * - web_search:     InvokeLLM com add_context_from_internet=true (Gemini)
 *                    Retorna fatos/dados — NÃO é uma resposta ao usuário.
 * - calculation:    Extrai expressão numérica da mensagem e resolve deterministicamente.
 * - documents:      Consulta documentos da sessão (reaproveita do pipeline se possível).
 */

/**
 * Executa pesquisa web e retorna dados estruturados (não resposta final).
 * Usa Gemini com add_context_from_internet=true.
 *
 * FIX (auditoria cognição): antes, só a mensagem atual (query) era
 * enviada, sem nenhum contexto da conversa. Mensagens de acompanhamento
 * curtas/vagas ("pesquise qual seria o melhor servidor pra mim") ficam
 * ambíguas sem o assunto discutido antes (ex: "servidor" sozinho pode
 * significar servidor MCP, servidor web, infraestrutura de nuvem...) —
 * resultado real observado: a busca retornou dados sobre AWS/NVIDIA em
 * vez de servidores MCP do Mercado Livre. Agora recebe um resumo do
 * contexto (sessionSummary) pra ancorar a busca no assunto real.
 */
/**
 * Constrói uma query de busca otimizada para o Serper.
 * Quando a mensagem do usuário é vaga ("Descubra", "Como conectar") ou curta,
 * extrai o tópico real do contexto da conversa e monta uma query descritiva.
 */
async function buildSearchQuery(userMessage, conversationContext) {
  const normalized = userMessage.trim().toLowerCase();
  const isVague = userMessage.length < 40 ||
    /^(descubra|pesquise|busque|investigue|procure|encontre|tente|como conectar|como integrar|como usar|execute|faça|faz)\s*\.?$/i.test(normalized);

  if (!isVague) return userMessage;

  // Mensagem vaga — extrai o tópico do contexto e monta query descritiva
  if (!conversationContext || conversationContext.length < 20) return userMessage;

  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Dado o contexto da conversa abaixo e a mensagem curta do usuário, gere uma query de busca Google otimizada (máximo 10 palavras, em inglês se for sobre tecnologia externa) que capture o que o usuário realmente quer descobrir.

Contexto da conversa (resumo):
${conversationContext.slice(0, 800)}

Mensagem do usuário: "${userMessage}"

Retorne APENAS a query de busca, sem explicações. Exemplo: "Higgsfield AI integration API developers"`,
      model: "gemini_3_flash",
    });
    const q = typeof result === "string" ? result.trim().replace(/^["']|["']$/g, "") : "";
    return q.length > 5 ? q : userMessage;
  } catch {
    return userMessage;
  }
}

async function executeWebSearch(query, conversationContext = "") {
  const { ensureProvidersRegistered } = await import("@/lib/search-engine/registerProviders");
  const { searchEngine } = await import("@/lib/search-engine/SearchEngine");

  ensureProvidersRegistered();

  // Constrói query otimizada quando a mensagem original é vaga/curta
  const optimizedQuery = await buildSearchQuery(query, conversationContext);
  if (optimizedQuery !== query) {
    console.log(`[WebSearch] Query otimizada: "${query}" → "${optimizedQuery}"`);
  }

  const outcome = await searchEngine.search(optimizedQuery, {
    context: { sessionSummary: conversationContext },
  });

  // Usa bestResult se disponível, senão tenta qualquer resultado com itens
  const bestWithItems = outcome.bestResult?.items?.length > 0
    ? outcome.bestResult
    : outcome.allResults?.find((r) => r.items?.length > 0) ?? null;

  const items = bestWithItems?.items ?? [];
  if (items.length === 0) {
    return { facts: [], sources: [], divergences: [] };
  }

  return {
    facts: items.map((it) => `${it.title ?? ""}: ${it.snippet ?? ""}`.trim()).filter(Boolean),
    sources: items.map((it) => it.url).filter(Boolean),
    divergences: [],
  };
}

/**
 * Extrai e resolve expressões numéricas de forma determinística.
 * Suporta: soma, subtração, multiplicação, divisão, porcentagem.
 * Retorna null se não encontrar expressão válida.
 */
function executeCalculation(message) {
  // Normaliza a mensagem para extrair expressão
  const normalized = message
    .replace(/\bvezes\b/gi, "*")
    .replace(/\bmais\b/gi, "+")
    .replace(/\bmenos\b/gi, "-")
    .replace(/\bdividido por\b/gi, "/")
    .replace(/\bx\b/gi, "*")
    .replace(/,/g, ".");

  // Busca padrões: "quanto é X + Y", "calcule X * Y", "X% de Y"
  const percentMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%\s*(?:de)?\s*(\d+(?:\.\d+)?)/i);
  if (percentMatch) {
    const percent = parseFloat(percentMatch[1]);
    const value = parseFloat(percentMatch[2]);
    const result = (percent / 100) * value;
    return {
      expression: `${percent}% de ${value}`,
      result: Math.round(result * 100) / 100,
    };
  }

  // Expressão aritmética simples
  const exprMatch = normalized.match(/(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)/);
  if (exprMatch) {
    const a = parseFloat(exprMatch[1]);
    const op = exprMatch[2];
    const b = parseFloat(exprMatch[3]);
    // FIX (auditoria cognição): divisão por zero retornava `null`, e
    // `Math.round(null * 100) / 100` avalia para 0 (null vira 0 na
    // coerção numérica do JS) — o resultado ia pro prompt como
    // "Resultado: 0", um valor matematicamente ERRADO apresentado com
    // a mesma confiança de um cálculo válido ("Use este resultado como
    // base"). Agora retorna um erro explícito em vez de um número.
    if (op === "/" && b === 0) {
      return { error: true, message: "Divisão por zero — não é possível calcular." };
    }
    let result;
    switch (op) {
      case "+": result = a + b; break;
      case "-": result = a - b; break;
      case "*": result = a * b; break;
      case "/": result = a / b; break;
      default: return null;
    }
    return {
      expression: `${a} ${op} ${b}`,
      result: Math.round(result * 100) / 100,
    };
  }

  return null;
}

/**
 * Consulta documentos da sessão ativa.
 * Reaproveita o que o Memory Pipeline já recuperou quando possível.
 */
async function executeDocumentQuery(sessionId, projectId) {
  try {
    const filter = projectId
      ? { project_id: projectId, processing_status: "completed" }
      : { processing_status: "completed" };
    const docs = await base44.entities.Document.filter(filter, "-created_date", 10);
    return docs.map((d) => ({
      name: d.name,
      summary: d.summary || "",
      category: d.category || "",
      extractedText: d.extracted_text ? d.extracted_text.substring(0, 500) : "",
    }));
  } catch {
    return [];
  }
}

/**
 * Executa todas as capacidades ativas em paralelo.
 *
 * @param {Object} capabilities - Flags de capacidades ativas
 * @param {Object} params - { message, sessionId, projectId, memory }
 * @returns {Object} Resultados por capacidade: { webSearch, calculation, documents }
 */
export async function executeCapabilities(capabilities, { message, sessionId, projectId, memory }) {
  const tasks = {};

  if (capabilities.web_search) {
    // FIX (auditoria cognição): repassa o contexto da conversa (resumo da
    // sessão + memória recuperada) pra busca não ficar "cega" quando a
    // mensagem atual é vaga/curta (ver executeWebSearch acima).
    const conversationContext = [memory?.sessionSummary, memory?.context]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 1500); // limite razoável — só precisa ancorar o assunto, não replicar tudo
    tasks.webSearch = executeWebSearch(message, conversationContext).catch((err) => ({
      error: true,
      message: err?.message || "Falha na pesquisa web",
    }));
  }

  if (capabilities.calculation) {
    // Cálculo é síncrono e determinístico
    const calcResult = executeCalculation(message);
    tasks.calculation = Promise.resolve(calcResult);
  }

  if (capabilities.documents) {
    tasks.documents = executeDocumentQuery(sessionId, projectId).catch(() => []);
  }

  if (capabilities.official_library) {
    tasks.officialLibrary = executeOfficialLibraryQuery(message).catch((err) => ({
      error: true,
      message: err?.message || "Falha ao consultar Biblioteca Oficial",
    }));
  }

  const keys = Object.keys(tasks);
  const values = await Promise.all(Object.values(tasks));
  const results = {};
  keys.forEach((k, i) => {
    results[k] = values[i];
  });

  return results;
}