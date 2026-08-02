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
      "compare com sites", "pesquise na internet", "busque online", "online",
      // Perguntas de integração/conexão entre serviços externos
      "como conectar", "como integrar", "como usar", "como acessar",
      "tem api", "tem uma api", "possui api", "api disponível", "api publica",
      "documentação oficial", "docs oficiais", "site oficial",
      "como é feito", "como ele faz", "como funciona", "investigue", "descubra",
      "verifique como", "verifica como", "consegue se conectar", "consegue integrar",
      "existe mcp", "existe api", "existe conector", "existe integração",
      "como fazer integração", "como fazer a integração",
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
  const SEMANTIC_CHECK_TIMEOUT_MS = 8000;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("semanticWebSearchCheck timeout")), SEMANTIC_CHECK_TIMEOUT_MS)
    );
    const result = await Promise.race([
      base44.integrations.Core.InvokeLLM({
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
      }),
      timeoutPromise,
    ]);
    return { needed: result?.needs_web_search === true, reason: result?.reason ?? "" };
  } catch {
    // Falha OU timeout na chamada nunca bloqueia a resposta — só não ativa web_search.
    // FIX: antes sem limite de tempo — uma unica chamada podia segurar o
    // pipeline inteiro por dezenas de segundos sem aviso nenhum.
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
export async function detectCapabilities(message, memory = {}, goal = {}, sessionId = null) {
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
  // FIX (auditoria cognição): as keywords originais só cobriam frases
  // exatas como "mas memoryos"/"mes memoryos" — ninguém fala assim.
  // Uso real é "aderência ao MAS/MES", "arquitetura MAS", que nunca
  // batiam, então a Biblioteca Oficial nunca carregava o conteúdo real
  // dessas siglas, e o modelo ficava sem grounding pra responder o que
  // MAS/MES significam de verdade — confirmado: ele inventou definições
  // erradas ("Multi-Agent System"/"Memory Execution System") em vez das
  // reais (MemoryOS Architecture/Engineering Specification).
  // Aqui usamos a mensagem ORIGINAL (sem lowercase) pra detectar as
  // siglas em CAIXA ALTA — isso distingue "MAS" (sigla) de "mas"
  // (conjunção comum) e "MES" (sigla) de "mês"/"mes" (mês do calendário
  // ou erro de digitação), sinal que o normalize() descarta.
  const hasAcronymSignal = /\b(MAS|MES|MV|MPS)\b/.test(message);
  if (libMatch.length > 0 || hasAcronymSignal) {
    capabilities.official_library = true;
    matchedReasons.official_library = libMatch.length > 0
      ? `Mencionou: ${libMatch.slice(0, 3).join(", ")}`
      : "Sigla em maiúsculas detectada (MAS/MES/MV/MPS)";
  }

  // === DOCUMENTS: só ativa se há sinal EXPLÍCITO de arquivo específico na mensagem ===
  // Palavras genéricas como "arquivo" ou "documento" sozinhas não bastam —
  // exige um contexto mais específico (PDF, planilha, nome de arquivo, etc.)
  // ou referência direta ("esse arquivo", "o pdf que enviei").
  const STRONG_DOC_KEYWORDS = [
    "pdf", "planilha", "excel", "word", "docx", "csv",
    "esse arquivo", "este arquivo", "esse documento", "este documento",
    "o arquivo", "o documento", "anexo", "nota fiscal", "contrato",
    "que enviei", "que subi", "que anexei", "que uplodei",
  ];
  const docKeywordMatch = matchKeywords(normalized, STRONG_DOC_KEYWORDS);
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
  // Mensagens curtas de acompanhamento que claramente pedem execução/descoberta
  const SHORT_ACTION_TRIGGERS = ["descubra", "pesquise", "busque", "investigue", "procure", "encontre", "como conectar", "como integrar", "como usar a api", "tente", "execute", "faça isso", "faz isso"];
  const isShortActionFollowUp = SHORT_ACTION_TRIGGERS.some((t) => normalize(normalized).includes(normalize(t)));
  let explicitlyRequested = webMatch.length > 0 || isShortActionFollowUp;
  // Nunca ativar memoryInsufficient para perguntas de identidade/saudação puras
  // BUG FIX: "como" foi removido — "Como conectar X?", "Como integrar Y?" são perguntas
  // de pesquisa externa, não conversacionais. Só excluir saudações e pronomes pessoais.
  const _CONVERSATIONAL_MSG = /^(qual|quem|o que|me diga|me fale|você|voce|vc|seu|sua|oi|olá|ola|bom dia|boa)\b/i;
  const _isConversationalMsg = _CONVERSATIONAL_MSG.test(message.trim());
  const memoryInsufficient = !hasMemoryForTopic && !_isConversationalMsg && (goal.id === "locate_info" || goal.id === "generate_knowledge");

  let semanticReason = "";
  // BUG FIX: "como" removido do skip — "Como conectar", "Como fazer integração"
  // precisam de busca externa e não devem pular o semanticWebSearchCheck.
  const _CONVERSATIONAL_SKIP = /^(qual|quem|o que|me diga|me fale|você|voce|vc|seu|sua|teu|tua)\b/i;
  // Expandido: agora também captura "higgsfield", "conectar", "integrar", nomes de serviços externos
  const _hasExternalSignal = /\b(existe|disponivel|lancou|lançou|saiu|mudou|funcionando|funciona.*ainda|novo.*versao|nova.*versao|preco.*atual|rate.?limit|limite.*api|conectar|integrar|higgsfield|descubra|descubrir|api.*publica|mcp.*server|servidor.*mcp)\b/i;
  if (!explicitlyRequested && !memoryInsufficient && !hasMemoryForTopic) {
    // Pula a chamada LLM para perguntas conversacionais simples
    const isConversational = _CONVERSATIONAL_SKIP.test(message.trim());
    const hasExternalSignal = _hasExternalSignal.test(message);
    if (!isConversational && hasExternalSignal) {
      const semantic = await semanticWebSearchCheck(message);
      if (semantic.needed) {
        explicitlyRequested = true;
        semanticReason = semantic.reason;
      }
    }
  }

  // === [EF-413] SESSION ENTITY CACHE CHECK ===
  // Só roda se: (1) web_search seria ativado, (2) temos sessionId, (3) sessão não é nova.
  // Query lazy de KnowledgeEntity — feita UMA VEZ, apenas quando necessário.
  // Suprime web_search se a mensagem menciona uma entidade já conhecida nesta sessão.
  if ((explicitlyRequested || memoryInsufficient) && sessionId) {
    try {
      const sessionEntities = await base44.entities.KnowledgeEntity.filter(
        { session_id: sessionId }, '-created_date', 60
      );
      if (sessionEntities && sessionEntities.length >= 3) {
        // Deduplicar por value+type e normalizar para comparação
        const seen = new Map();
        for (const e of sessionEntities) {
          const key = `${e.value}|${e.type}`;
          if (!seen.has(key)) seen.set(key, normalize(e.value));
        }
        const knownValues = [...seen.values()];
        const msgNorm = normalize(message);
        const matchedEntity = knownValues.find(v => v.length > 2 && msgNorm.includes(v));
        if (matchedEntity) {
          explicitlyRequested = false;
          console.log(`[EF-413][cache-hit] Entidade conhecida '${matchedEntity}' detectada — web_search suprimida`);
        } else {
          console.log(`[EF-413][cache-miss] Nenhuma entidade conhecida na mensagem — web_search prossegue`);
        }
      }
    } catch {
      // Falha silenciosa — web_search prossegue normalmente
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