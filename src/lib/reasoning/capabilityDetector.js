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

const CAPABILITY_RULES = {
  web_search: {
    keywords: [
      "pesquise", "pesquisar", "pesquisa", "internet", "web", "google",
      "consulte a documentação", "documentação", "veja se mudou", "verifique se",
      "notícias", "noticia", "atualizado", "atualização", "legislação atualizada",
      "preço atual", "preços", "tendências", "tendencia", "fórum", "forum",
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
 * Detecta capacidades necessárias com base na mensagem, memória recuperada e contexto.
 *
 * @param {string} message - Mensagem do usuário
 * @param {Object} memory - Resultado do Memory Pipeline { context, sources, sessionSummary }
 * @param {Object} goal - Objetivo detectado pelo Goal Detector
 * @returns {Object} { capabilities, matchedReasons, hasEnoughInfo, missingInfoHint }
 */
export function detectCapabilities(message, memory = {}, goal = {}) {
  const normalized = normalize(message);
  const { context = "", sources = [] } = memory;

  const capabilities = {
    memory: true, // sempre — o pipeline já corre
    documents: false,
    web_search: false,
    calculation: false,
    comparison: false,
    planning: false,
    specialists: true, // Skills Engine decide independentemente
    needs_more_info: false,
    connector: null,
  };

  const matchedReasons = {};

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

  // === WEB SEARCH: apenas quando explicitamente solicitado ou quando memória é insuficiente ===
  const webMatch = matchKeywords(normalized, CAPABILITY_RULES.web_search.keywords);
  const hasMemoryForTopic = context && context.length > 100;
  // Ativa web search se:
  // (a) usuário pediu explicitamente, OU
  // (b) não há memória suficiente E o objetivo envolve localizar informação ou gerar conhecimento
  const explicitlyRequested = webMatch.length > 0;
  const memoryInsufficient = !hasMemoryForTopic && (goal.id === "locate_info" || goal.id === "generate_knowledge");

  if (explicitlyRequested || memoryInsufficient) {
    capabilities.web_search = true;
    matchedReasons.web_search = explicitlyRequested
      ? `Solicitado: ${webMatch.slice(0, 3).join(", ")}`
      : "Memória insuficiente para o tópico";
  }

  // === CONNECTOR: detecta se a intenção requer um conector (ex: Gmail) ===
  const CONNECTOR_INTENTS = {
    gmail: ["email", "e-mail", "gmail", "enviar email", "ler email", "caixa de entrada", "inbox"],
  };
  for (const [connectorId, keywords] of Object.entries(CONNECTOR_INTENTS)) {
    const match = matchKeywords(normalized, keywords);
    if (match.length > 0) {
      capabilities.connector = connectorId;
      matchedReasons.connector = `Intenção detectada: ${match.slice(0, 3).join(", ")}`;
      break;
    }
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