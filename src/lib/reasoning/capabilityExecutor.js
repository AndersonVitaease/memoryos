import { base44 } from "@/api/base44Client";

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
 */
async function executeWebSearch(query) {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Pesquise na internet informações atualizadas e objetivas sobre: "${query}".

Retorne apenas fatos, dados, números, datas e informações verificáveis.
Priorize fontes oficiais: documentação, órgãos reguladores, fabricantes, literatura científica.
Se houver divergência entre fontes, apresente ambas.

Formato: lista de fatos objetivos, sem opinião ou interpretação.`,
    add_context_from_internet: true,
    model: "gemini_3_flash",
    response_json_schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: { type: "string" },
          description: "Fatos objetivos encontrados na pesquisa",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Fontes consultadas (URLs ou nomes)",
        },
        divergences: {
          type: "array",
          items: { type: "string" },
          description: "Divergências encontradas entre fontes, se houver",
        },
      },
    },
  });

  return {
    facts: result?.facts || [],
    sources: result?.sources || [],
    divergences: result?.divergences || [],
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
    let result;
    switch (op) {
      case "+": result = a + b; break;
      case "-": result = a - b; break;
      case "*": result = a * b; break;
      case "/": result = b !== 0 ? a / b : null; break;
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
export async function executeCapabilities(capabilities, { message, sessionId, projectId }) {
  const tasks = {};

  if (capabilities.web_search) {
    tasks.webSearch = executeWebSearch(message).catch((err) => ({
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

  const keys = Object.keys(tasks);
  const values = await Promise.all(Object.values(tasks));
  const results = {};
  keys.forEach((k, i) => {
    results[k] = values[i];
  });

  return results;
}