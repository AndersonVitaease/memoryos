/**
 * Capability Detector
 *
 * Decide automaticamente quais capacidades do MemoryOS devem ser utilizadas
 * antes de gerar a resposta. Análise instantânea (sem chamada de API).
 *
 * Capacidades detectadas:
 * - memory:         consulta memória (sempre true — pipeline já corre)
 * - documents:       consulta documentos anexados à sessão
 * - web_search:      pesquisa externa (web)
 * - calculation:     cálculo determinístico
 * - comparison:      comparação entre fontes/versões
 * - planning:        estruturação de plano/roadmap
 * - specialists:     usar Skills Engine (decidido pelo Skills Engine)
 * - needs_more_info: informação insuficiente — solicitar dados ao usuário
 *
 * Regra de prioridade (explicitada no spec):
 *   Memória → Documentos → Especialistas → Pesquisa externa → Cálculo → Comparação
 *
 * Pesquisa web NÃO é feita se a memória já contém informação suficiente.
 */

import { OFFICIAL_LIBRARY_KEYWORDS } from "./capabilities/officialLibraryCapability";
import { base44 } from "@/api/base44Client";

const CAPABILITY_RULES = {
  official_library: {
    keywords: OFFICIAL_LIBRARY_KEYWORDS,
  },
  web_search: {
    keywords: [
      "pesquise", "pesquisar", "pesquisa", "internet", "web", "google",
      "consulte a documentação", "veja se mudou", "verifique se",
      "notícias", "noticia", "legislação atualizada",
      "preço atual", "preços", "tendências", "tendencia", "fórum", "forum",
      // FIX (auditoria cognição): "documentação" e "atualizado"/
      // "atualização" sozinhas foram removidas — disparavam web_search
      // em qualquer mensagem sobre o próprio código/projeto ("preciso
      // escrever a documentação da API", "o arquivo já está
      // atualizado"), fazendo o Orchestrator ativar pesquisa externa
      // sem necessidade nenhuma. As frases mais específicas que já
      // existiam ("consulte a documentação", "legislação atualizada")
      // continuam cobrindo os casos em que o usuário realmente quer
      // que algo seja checado/pesquisado por fora.
      "compare com sites", "pesquise na internet", "busque online", "online",
    ],
    // Nunca ativar web search se for pergunta que a memória pode responder
    negators: [],
  },
  calculation: {
    keywords: [
      "calcule", "calcular", "cálculo", "calculo", "quanto custa", "qual o valor",
      "total", "soma", "somar", "média", "media", "margem", "lucro", "preço",
      "orçamento", "estimativa", "quantos", "quantas", "proporção", "proporcao",
      "percentual", "porcentagem", "rendimento", "lote", "peso", "produção",
      "projeção", "projecao", "multiplique", "divida", "subtraia", "x ", "vezes",
    ],
  },
  comparison: {
    keywords: [
      "compare", "comparar", "comparação", "comparativo", "diferenças", "diferença",
      "versus", "vs", "melhor que", "pior que", "qual é melhor", "mudanças", "mudança",
      "versões", "versao", "antes e depois", "divergência", "divergencias",
    ],
  },
  planning: {
    keywords: [
      "plano", "planejar", "planejamento", "cronograma", "passos", "etapas",
      "roadmap", "estratégia de execução", "próximos passos", "implementação",
      "como implementar", "como fazer",
    ],
  },
  documents: {
    keywords: [
      "pdf", "documento", "documentos", "planilha", "excel", "word",
      "imagem", "áudio", "audio", "arquivo", "anexo", "contrato", "nota fiscal",
      "esse arquivo", "este arquivo", "esse documento", "este documento",
    ],
  },
};

function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchKeywords(normalizedText, keywords) {
  const matched = [];
  for (const kw of keywords) {
    if (normalizedText.includes(normalize(kw))) {
      matched.push(kw);
    }
  }
  return matched;
}

/**
 * FIX (auditoria cognição — generalização): antes, web_search só disparava
 * com um verbo exato de uma lista fixa ("pesquise", "procure", "busque",
 * "encontre"...). Isso nunca escala — cada pessoa fala de um jeito
 * diferente ("verifique", "confirme", "dá uma olhada", "tem algo sobre
 * X?", "cola aí o que existe"...), e manter crescendo a lista de palavras
 * pra sempre não é uma solução real (além de reintroduzir risco de falso
 * positivo, como "verifique o código" que não tem nada a ver com internet).
 *
 * Em vez disso, quando o caminho rápido por palavra-chave não decide nada,
 * este fallback pergunta a um modelo leve e rápido (mesmo padrão já usado
 * em interpretIntent(), no memoryPipeline.js) se a mensagem realmente pede
 * uma verificação externa — julgamento por entendimento da frase, não por
 * casar string. Só roda quando o caminho rápido não decidiu nada, então
 * não adiciona custo às mensagens já óbvias (rotineiras, sem ambiguidade).
 */
async function semanticWebSearchCheck(message) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `A mensagem abaixo pede, direta ou indiretamente, para pesquisar, verificar, confirmar ou checar algo que exige informação externa e atual (não presente na memória do usuário, e que não é conhecimento geral estável que qualquer assistente já saberia)?

Mensagem: "${message}"

Exemplos que SIM precisam: "verifique se existe um servidor MCP pra X", "confirma se essa lib ainda é mantida", "tem algo novo sobre Y", "dá uma olhada no preço atual de Z".
Exemplos que NÃO precisam: "verifique o código que colei", "confirma se entendeu", "dá uma olhada nessa lógica", perguntas sobre a própria conversa/memória/arquivos já carregados.`,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          needs_web_search: { type: "boolean", description: "true se precisa de busca externa real" },
          reason: { type: "string", description: "motivo em poucas palavras" },
        },
        required: ["needs_web_search"],
      },
    });
    return { needed: result?.needs_web_search === true, reason: result?.reason ?? "" };
  } catch {
    // Falha na chamada nunca bloqueia a resposta — só não ativa web_search.
    return { needed: false, reason: "" };
  }
}

/**
 * Detecta capacidades necessárias com base na mensagem, memória recuperada e contexto.
 *
 * @param {string} message - Mensagem do usuário
 * @param {Object} memory - Resultado do Memory Pipeline { context, sources, sessionSummary }
 * @param {Object} goal - Objetivo detectado pelo Goal Detector
 * @returns {Object} { capabilities, matchedReasons, hasEnoughInfo, missingInfoHint }
 */
export async function detectCapabilities(message, memory = {}, goal = {}) {
  const normalized = normalize(message);
  const { context = "", sources = [] } = memory;

  const capabilities = {
    memory: true, // sempre — o pipeline já corre
    documents: false,
    web_search: false,
    calculation: false,
    comparison: false,
    planning: false,
    official_library: false,
    specialists: true, // Skills Engine decide independentemente
    needs_more_info: false,
  };

  const matchedReasons = {};

  // === OFFICIAL_LIBRARY: pergunta sobre a Biblioteca Oficial do MemoryOS ===
  const libMatch = matchKeywords(normalized, CAPABILITY_RULES.official_library.keywords);
  if (libMatch.length > 0) {
    capabilities.official_library = true;
    matchedReasons.official_library = `Mencionou: ${libMatch.slice(0, 3).join(", ")}`;
  }

  // === DOCUMENTS: mencionou arquivo/PDF/documento OU existem documentos nas fontes ===
  const docKeywordMatch = matchKeywords(normalized, CAPABILITY_RULES.documents.keywords);
  const hasDocumentSources = sources.some((s) => s.type === "Documento");
  if (docKeywordMatch.length > 0 || hasDocumentSources) {
    capabilities.documents = true;
    matchedReasons.documents = docKeywordMatch.length > 0
      ? `Mencionou: ${docKeywordMatch.slice(0, 3).join(", ")}`
      : "Documentos recuperados na memória";
  }

  // === CALCULATION: keywords de cálculo na mensagem ===
  const calcMatch = matchKeywords(normalized, CAPABILITY_RULES.calculation.keywords);
  // Goal "calculate" também ativa cálculo
  if (calcMatch.length > 0 || goal.id === "calculate") {
    capabilities.calculation = true;
    matchedReasons.calculation = calcMatch.length > 0
      ? `Mencionou: ${calcMatch.slice(0, 3).join(", ")}`
      : "Objetivo: cálculo";
  }

  // === COMPARISON: keywords de comparação ===
  const compMatch = matchKeywords(normalized, CAPABILITY_RULES.comparison.keywords);
  // Goal "compare" também ativa comparação
  if (compMatch.length > 0 || goal.id === "compare") {
    capabilities.comparison = true;
    matchedReasons.comparison = compMatch.length > 0
      ? `Mencionou: ${compMatch.slice(0, 3).join(", ")}`
      : "Objetivo: comparar";
  }

  // === PLANNING: keywords de planejamento ===
  const planMatch = matchKeywords(normalized, CAPABILITY_RULES.planning.keywords);
  if (planMatch.length > 0 || goal.id === "plan" || goal.id === "create_strategy") {
    capabilities.planning = true;
    matchedReasons.planning = planMatch.length > 0
      ? `Mencionou: ${planMatch.slice(0, 3).join(", ")}`
      : "Objetivo: planejamento";
  }

  // === WEB SEARCH: explicitamente solicitado, memória insuficiente, ou detecção semântica ===
  const webMatch = matchKeywords(normalized, CAPABILITY_RULES.web_search.keywords);
  const hasMemoryForTopic = context && context.length > 100;
  let explicitlyRequested = webMatch.length > 0;
  const memoryInsufficient = !hasMemoryForTopic && (goal.id === "locate_info" || goal.id === "generate_knowledge");

  let semanticReason = "";
  if (!explicitlyRequested && !memoryInsufficient) {
    const semantic = await semanticWebSearchCheck(message);
    if (semantic.needed) {
      explicitlyRequested = true;
      semanticReason = semantic.reason;
    }
  }

  if (explicitlyRequested || memoryInsufficient) {
    capabilities.web_search = true;
    matchedReasons.web_search = webMatch.length > 0
      ? `Solicitado: ${webMatch.slice(0, 3).join(", ")}`
      : memoryInsufficient
        ? "Memória insuficiente para o tópico"
        : `Detecção semântica: ${semanticReason || "mensagem pede verificação externa"}`;
  }

  // === NEEDS_MORE_INFO: detecção de informação insuficiente ===
  // Se cálculo foi solicitado mas não há valores/parâmetros na mensagem nem na memória
  let missingInfoHint = null;
  if (capabilities.calculation && !explicitlyRequested) {
    // Heurística simples: se pediu cálculo mas não há números na mensagem nem na memória
    const hasNumbers = /\d/.test(message) || /\d/.test(context);
    if (!hasNumbers) {
      capabilities.needs_more_info = true;
      missingInfoHint = "Cálculo solicitado, mas não há valores numéricos suficientes na mensagem ou na memória para realizá-lo.";
    }
  }

  return { capabilities, matchedReasons, hasEnoughInfo: !capabilities.needs_more_info, missingInfoHint };
}
