/**
 * Objetivo (Goal) Detector
 *
 * Classifica instantaneamente qual problema o usuário está tentando resolver,
 * sem chamada de API. Baseado em keyword matching + análise de intenção.
 *
 * O objetivo detectado guia a estratégia do Planner — instrui o LLM sobre
 * qual formato de resposta é mais adequado (comparação, cálculo, resumo, etc.)
 */

const GOALS = [
  {
    id: "compare",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Comparar",
    keywords: ["comparar", "comparação", "diferença", "diferenças", "versus", "vs", "melhor que", "pior que", "qual é melhor", "comparativo"],
    strategy: "Estruture a resposta como comparação: crie uma tabela ou lista lado a lado destacando diferenças, semelhanças e recomendação final quando apropriado.",
  },
  {
    id: "calculate",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Calcular",
    keywords: ["calcule", "calcular", "cálculo", "quanto custa", "qual o valor", "total", "soma", "média", "margem", "lucro", "preço", "orçamento", "estimativa", "quantos", "quantas", "proporção", "percentual", "porcentagem"],
    strategy: "Mostre o raciocínio passo a passo antes do resultado final. Separe valores de entrada, fórmula/operacao e resultado. Nunca apresente apenas o número.",
  },
  {
    id: "summarize",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Resumir",
    keywords: ["resuma", "resumo", "resumir", "síntese", "sintetize", "tl;dr", "em poucas palavras", "em resumo", "pontos principais"],
    strategy: "Produce um resumo estruturado com pontos-chave em destaque. Elimine detalhes periféricos. Preserve datas, valores e nomes importantes.",
  },
  {
    id: "plan",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Planejar",
    keywords: ["plano", "planejar", "planejamento", "cronograma", "passos", "etapas", "roadmap", "como fazer", "estratégia de execução", "próximos passos"],
    strategy: "Estruture como plano de ação com etapas numeradas, responsáveis, prazos e dependências quando aplicável.",
  },
  {
    id: "decide",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Decidir",
    keywords: ["decidir", "decisão", "vale a pena", "devo", "qual escolher", "qual opção", "recomenda", "recomendação"],
    strategy: "Apresente critérios de decisão, analise cada opção contra os critérios, e faça uma recomendação clara justificada.",
  },
  {
    id: "analyze_risks",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Analisar Riscos",
    keywords: ["risco", "riscos", "ameaça", "problema", "perigo", "preocupação", "o que pode dar errado", "armadilhas", "pitfalls"],
    strategy: "Identifique riscos por categoria (operacional, financeiro, jurídico, técnico). Para cada risco, indique probabilidade, impacto e mitigação.",
  },
  {
    id: "create_strategy",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Criar Estratégia",
    keywords: ["estratégia", "estratégico", "como vender", "como crescer", "como escalar", "posicionamento", "diferencial", "vantagem competitiva", "go to market", "gtm"],
    strategy: "Construa uma estratégia com: contexto, objetivo, pilares de ação, métricas de sucesso e riscos. Conecte com memória de decisões anteriores.",
  },
  {
    id: "locate_info",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Localizar Informação",
    keywords: ["onde está", "qual é o", "quando foi", "quem é", "encontrar", "buscar", "procurar", "tem no", "existe"],
    strategy: "Localize a informação na memória e cite de onde veio naturalmente. Se não encontrar, diga claramente que não há registro.",
  },
  {
    id: "execute_task",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Executar Tarefa",
    keywords: ["crie", "escreva", "redija", "monte", "gere", "faça", "envie", "agende", "prepare", "rascunho", "draft"],
    strategy: "Execute a tarefa diretamente. Entregue o artefato solicitado (texto, rascunho, estrutura) pronto para uso.",
  },
  {
    id: "learn_concept",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Aprender Conceito",
    keywords: ["o que é", "como funciona", "explique", "ensine", "entender", "conceito", "significa", "definição", "o que significa"],
    strategy: "Explique o conceito de forma simples com analogia. Use exemplos concretos. Conecte com conhecimento que o usuário já possui.",
  },
  {
    id: "generate_knowledge",
    type: "general",
    priority: "normal",
    metadata: {},
    label: "Gerar Conhecimento",
    keywords: ["analise", "análise", "insights", "padrões", "tendências", "o que você acha", "sua opinião", "conclusão", "síntese geral"],
    strategy: "Sintetize insights a partir da memória recuperada. Conecte informações de fontes diferentes. Gere conhecimento novo a partir de padrões.",
  },
  {
    id: "audit_architecture",
    type: "specialist",
    priority: "high",
    metadata: { specialistCategory: "architecture" },
    label: "Auditar Arquitetura",
    keywords: [
      "auditoria arquitetural", "auditoria de arquitetura", "auditar arquitetura",
      "audite a arquitetura", "faça uma auditoria", "execute uma auditoria",
      "rodar auditoria", "iniciar auditoria", "architecture auditor",
      "conformidade arquitetural", "conformidade da arquitetura",
      // FIX (auditoria cognição): "macr" sozinho removido — colidia como
      // substring com "macro" (macro do Excel, macro de código), palavra
      // comum que não tem nada a ver com auditoria arquitetural. Disparava
      // o Architecture Auditor Specialist (pipeline completo de auditoria)
      // pra qualquer mensagem mencionando "macro". As frases mais
      // específicas abaixo já cobrem a intenção real de MACR/compliance.
      "compliance report", "relatório de conformidade",
      "auditar o projeto", "auditoria do projeto", "audit the project",
    ],
    strategy: "Delegar ao Architecture Auditor Specialist oficial. NÃO responder diretamente — o Specialist executa o pipeline completo de auditoria (ProjectReader → OfficialLibraryReader → CodeAnalyzer → ReportBuilder) e retorna o MACR.",
  },
];

const DEFAULT_GOAL = {
  id: "answer_question",
  type: "general",
  priority: "normal",
  metadata: {},
  label: "Responder Dúvida",
  keywords: [],
  strategy: "Responda de forma direta e natural, adaptando o tamanho ao nível da pergunta. Perguntas simples recebem respostas curtas.",
};

function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Verifica se `sig` aparece em `text` como palavra/frase INTEIRA.
 * FIX (auditoria cognição): detectGoal() usava .includes() puro, que
 * colidia como substring em vários casos reais: "total" (goal
 * calculate) dentro de "totalmente" — uma das palavras mais comuns do
 * português —, "gere" (execute_task) dentro de "gerente", "devo"
 * (decide) dentro de "devolução", "faça" (execute_task) dentro de
 * "satisfaça", "risco" (analyze_risks) dentro de "arrisco", "monte"
 * (execute_task) dentro de "Monte Everest". Fronteira Unicode resolve
 * todos de uma vez, sem precisar remover as palavras (que continuam
 * válidas como match de palavra inteira).
 */
function _matchesWhole(text, sig) {
  const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
  return pattern.test(text);
}

/**
 * Detecta o objetivo da pergunta do usuário.
 * @param {string} message
 * @returns {Object} { id, label, strategy, matchedKeywords }
 */
export function detectGoal(message) {
  if (!message || !message.trim()) return DEFAULT_GOAL;

  const normalized = normalize(message);
  let best = DEFAULT_GOAL;
  let bestScore = 0;

  for (const goal of GOALS) {
    let score = 0;
    const matched = [];
    for (const kw of goal.keywords) {
      if (_matchesWhole(normalized, normalize(kw))) {
        score++;
        matched.push(kw);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = { ...goal, matchedKeywords: matched };
    }
  }

  if (bestScore === 0) {
    return { ...DEFAULT_GOAL, matchedKeywords: [] };
  }

  return best;
}
