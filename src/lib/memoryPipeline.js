import { base44 } from "@/api/base44Client";
import { safeFormat } from "@/lib/utils/safeDateFormat";
import { buildEnrichedContext } from "@/lib/memory-intelligence/EnrichedContextBuilder";

/**
 * Memory Retrieval Pipeline
 *
 * Camada de inteligência sobre todo o banco de dados do MemoryOS.
 * Antes de gerar qualquer resposta, este pipeline:
 *
 * 1. Interpreta a intenção da pergunta
 * 2. Identifica quais tipos de memória são relevantes
 * 3. Consulta automaticamente todas as entidades do banco
 * 4. Recupera apenas os registros mais relevantes
 * 5. Monta um contexto único para o LLM
 * 6. Informa ao LLM quais fontes foram utilizadas
 */

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    query_types: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "projects",
          "documents",
          "decisions",
          "tasks",
          "topics",
          "entities",
          "sessions",
          "keywords",
          "messages",
        ],
      },
      description: "Tipos de memória a consultar no banco",
    },
    is_list_query: {
      type: "boolean",
      description: "True se a pergunta pede para listar tudo de um tipo (ex: 'Quais projetos existem?')",
    },
    search_keywords: {
      type: "array",
      items: { type: "string" },
      description: "Palavras-chave extraídas da pergunta para filtrar registros",
    },
  },
  required: ["query_types", "search_keywords"],
};

/**
 * Atalho rapido (sem LLM) para perguntas de listagem MUITO especificas e
 * inequivocas, sobre um unico tipo de memoria. Qualquer sinal de pergunta
 * composta/ambigua faz retornar null, caindo pro fluxo normal de LLM —
 * mesma filosofia de "quando em duvida, inclua mais" que ja existe no
 * fallback de erro logo abaixo. So cobre o caso mais comum e mais seguro:
 * "quais sao minhas tarefas/projetos/decisoes/documentos/assuntos".
 */
function quickIntentGuess(question) {
  const q = question.toLowerCase().trim();

  const mixSignals = /\b(e |com |sobre |considerando|relacionado)/;
  if (mixSignals.test(q)) return null;

  const patterns = [
    { re: /\b(minhas?|quais)\s+(tarefas?|to-?dos?)\b/, type: "tasks" },
    { re: /\b(meus?|quais)\s+projetos?\b/, type: "projects" },
    { re: /\b(minhas?|quais)\s+decis(a|õ)(o|e)s?\b/, type: "decisions" },
    { re: /\b(meus?|minhas?|quais)\s+documentos?\b/, type: "documents" },
    { re: /\b(meus?|minhas?|quais)\s+assuntos?\b/, type: "topics" },
    // Perguntas de identidade/sistema — não precisam consultar nenhuma entidade do banco
    { re: /\b(qual.*seu\s+nome|como\s+(te\s+)?chama|quem\s+[eé]\s+(voc[eê]|vc)|o\s+que\s+[eé]\s+voc[eê]|me\s+(apresente|fale\s+sobre\s+voc[eê]))\b/, type: "_identity" },
  ];

  for (const p of patterns) {
    if (p.re.test(q)) {
      const isList = /\b(quais|todas?|todos?|lista)\b/.test(q);
      return { query_types: [p.type], is_list_query: isList, search_keywords: [] };
    }
  }
  return null;
}

/**
 * Passo 1: Interpretar a intenção da pergunta via LLM.
 * FIX (otimizacao de latencia): pergunta simples e inequivoca pula a
 * chamada de LLM inteira via quickIntentGuess() — corta ~1-3s do tempo
 * total pra esses casos, sem chamar InvokeLLM. Qualquer duvida cai pro
 * fluxo de LLM original, comportamento identico ao de antes.
 */
async function interpretIntent(question) {
  const quick = quickIntentGuess(question);
  if (quick) {
    console.log(`[DIAG][memoryPipeline] interpretIntent: atalho rapido usado (sem LLM) — ${JSON.stringify(quick)}`);
    return quick;
  }
  try {
    return await base44.integrations.Core.InvokeLLM({
      prompt: `Analise a pergunta do usuário e determine quais tipos de memória do sistema MemoryOS devem ser consultados.

Tipos disponíveis: projects, documents, decisions, tasks, topics, entities, sessions, keywords, messages

Exemplos:
- "Quais projetos existem?" → query_types: ["projects"], is_list_query: true, search_keywords: []
- "Qual foi nossa última decisão?" → query_types: ["decisions"], is_list_query: false, search_keywords: []
- "Quais tarefas estão abertas?" → query_types: ["tasks"], is_list_query: true, search_keywords: []
- "Quais empresas já discutimos?" → query_types: ["entities"], is_list_query: true, search_keywords: ["empresa"]
- "O que decidimos sobre o fornecedor ACME?" → query_types: ["decisions", "entities", "documents"], is_list_query: false, search_keywords: ["fornecedor", "ACME"]
- "Continuar de onde paramos" → query_types: ["sessions", "messages"], is_list_query: false, search_keywords: []
- "O que você sabe sobre a empresa XYZ?" → query_types: ["entities", "documents", "decisions", "messages"], is_list_query: false, search_keywords: ["XYZ"]
- "Me fale sobre o Hermes Agent" → query_types: ["messages", "documents", "topics", "entities"], is_list_query: false, search_keywords: ["hermes", "agent"]
- "O que é X?" / "Me fale sobre X" / "Fale sobre X" → query_types: ["messages", "documents", "topics", "entities", "decisions"], is_list_query: false, search_keywords: ["X"]

Regra CRÍTICA: perguntas do tipo "me fale sobre X", "o que é X", "fale sobre X" onde X é um nome específico (pessoa, produto, projeto, conceito) SEMPRE incluem "messages" nos query_types — o usuário pode ter mencionado X em uma conversa anterior. Quando houver dúvida, inclua mais tipos em vez de menos.

Pergunta: "${question}"`,
      response_json_schema: INTENT_SCHEMA,
    });
  } catch {
    const stopwords = ["o", "a", "os", "as", "de", "da", "do", "das", "dos", "e", "ou", "que", "para", "com", "em", "um", "uma", "no", "na", "nos", "nas", "quando", "como", "qual", "quais", "quem", "onde", "foi", "ser", "tem", "ha"];
    return {
      query_types: ["projects", "documents", "decisions", "tasks", "topics", "entities", "sessions", "keywords", "messages"],
      is_list_query: false,
      search_keywords: question
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopwords.includes(w))
        .slice(0, 8),
    };
  }
}

/**
 * Filtra registros por palavras-chave (client-side).
 */
function filterByKeywords(records, keywords, fields) {
  if (!keywords || keywords.length === 0) return records;
  const lower = keywords.map((k) => k.toLowerCase());
  return records.filter((r) =>
    fields.some((f) => {
      const val = r[f];
      if (!val) return false;
      return lower.some((kw) => String(val).toLowerCase().includes(kw));
    })
  );
}

/**
 * Passo 2: Consultar todos os tipos de memória relevantes em paralelo.
 */
async function queryEntities(intent, sessionId, projectId) {
  const { query_types } = intent;
  const queries = {};

  // Pergunta de identidade/sistema — só precisa do resumo da sessão, sem queries extras
  if (query_types.includes("_identity")) {
    const session = sessionId
      ? await base44.entities.ChatSession.filter({ id: sessionId }, "-updated_date", 1)
      : [];
    return { sessionSummary: session[0]?.summary || "" };
  }

  // Sempre busca a sessão atual (para o resumo)
  queries._session = sessionId
    ? base44.entities.ChatSession.filter({ id: sessionId }, "-updated_date", 1)
    : Promise.resolve([]);

  if (query_types.includes("projects")) {
    queries.projects = base44.entities.Project.list("-created_date", 50);
  }
  if (query_types.includes("documents")) {
    queries.documents = projectId
      ? base44.entities.Document.filter({ project_id: projectId, processing_status: "completed" }, "-created_date", 30)
      : base44.entities.Document.filter({ processing_status: "completed" }, "-created_date", 30);
  }
  if (query_types.includes("decisions")) {
    // FIX (auditoria cognição): antes ignorava projectId — trazia as 30
    // decisões mais recentes de TODA a conta, misturando projetos/assuntos
    // não relacionados no contexto do LLM. Agora escopado como
    // documents/entities/keywords já faziam.
    queries.decisions = projectId
      ? base44.entities.Decision.filter({ project_id: projectId }, "-decided_date", 30)
      : base44.entities.Decision.list("-decided_date", 30);
  }
  if (query_types.includes("tasks")) {
    // FIX (auditoria cognição): mesmo problema — tarefas de qualquer
    // projeto apareciam junto, mesmo perguntando sobre um assunto específico.
    queries.tasks = projectId
      ? base44.entities.Task.filter({ project_id: projectId }, "-created_date", 50)
      : base44.entities.Task.list("-created_date", 50);
  }
  if (query_types.includes("topics")) {
    // FIX (auditoria cognição): mesmo problema — assuntos de qualquer
    // projeto apareciam junto.
    queries.topics = projectId
      ? base44.entities.Topic.filter({ project_id: projectId }, "-created_date", 30)
      : base44.entities.Topic.list("-created_date", 30);
  }
  if (query_types.includes("entities")) {
    queries.entities = projectId
      ? base44.entities.KnowledgeEntity.filter({ project_id: projectId }, "-created_date", 100)
      : base44.entities.KnowledgeEntity.list("-created_date", 100);
  }
  if (query_types.includes("sessions")) {
    queries.sessions = base44.entities.ChatSession.list("-updated_date", 10);
  }
  if (query_types.includes("keywords")) {
    queries.keywords = projectId
      ? base44.entities.Keyword.filter({ project_id: projectId }, "-created_date", 30)
      : base44.entities.Keyword.list("-created_date", 30);
  }
  if (query_types.includes("messages")) {
    // Busca mensagens de todas as sessões para memória cross-session
    queries.messages = base44.entities.Message.list("-created_date", 100);
  }

  const keys = Object.keys(queries);
  const values = await Promise.all(Object.values(queries));
  const result = {};
  keys.forEach((k, i) => {
    result[k] = values[i];
  });

  // IA-030: filtro de contaminação — bloqueia registros que ainda carreguem
  // a narrativa fictícia de "auditoria arquitetural MAS/MES/Biblioteca Oficial"
  // (nunca aconteceu de verdade — ver IA-010/015/016/021/022/029). Como a
  // limpeza manual de Decisions/Tasks/KnowledgeEntity nunca cobriu 100% dos
  // registros antigos, esse filtro barra qualquer um que ainda reste,
  // resolvendo na raiz em vez de depender de faxina manual completa.
  const _CONTAMINATION_MARKERS = [
    "biblioteca oficial", "mas e mes", "mas/mes", " mas ", " mes ",
    "macr", "compliance report", "auditoria arquitetural",
    "módulo de acesso de segurança", "módulo de execução de serviços",
    "módulo de visão", "módulo de processamento de sistema",
  ];
  function _isContaminated(record) {
    try {
      const text = JSON.stringify(record).toLowerCase();
      return _CONTAMINATION_MARKERS.some((marker) => text.includes(marker));
    } catch {
      return false;
    }
  }
  ["decisions", "tasks", "entities", "documents", "topics", "keywords", "sessions", "messages"].forEach((key) => {
    if (Array.isArray(result[key])) {
      const before = result[key].length;
      result[key] = result[key].filter((r) => !_isContaminated(r));
      const removed = before - result[key].length;
      if (removed > 0) {
        console.log(`[IA-030] Filtrados ${removed} registro(s) contaminado(s) de "${key}"`);
      }
    }
  });

  result.sessionSummary = result._session?.[0]?.summary || "";
  return result;
}

const ENTITY_LABELS = {
  pessoa: "Pessoa",
  empresa: "Empresa",
  organizacao: "Organização",
  produto: "Produto",
  local: "Local",
  data: "Data",
  horario: "Horário",
  numero: "Número",
  valor_monetario: "Valor",
  telefone: "Telefone",
  email: "Email",
  site: "Site",
};

/**
 * Passo 3: Montar contexto único com os registros mais relevantes.
 */
function buildContext(data, intent, sessionId) {
  let context = "";
  const sources = [];
  const { is_list_query, search_keywords } = intent;

  // PROJETOS
  if (data.projects) {
    const items = is_list_query
      ? data.projects
      : filterByKeywords(data.projects, search_keywords, ["name", "description", "type"]);
    if (items.length > 0) {
      context += `### PROJETOS (${items.length})\n`;
      items.forEach((p) => {
        context += `- ${p.name}${p.type ? ` (${p.type})` : ""}${p.message_count ? ` — ${p.message_count} mensagens` : ""}\n`;
        if (p.description) context += `  ${p.description}\n`;
        sources.push({ type: "Projeto", id: p.id, name: p.name });
      });
      context += "\n";
    }
  }

  // DECISÕES
  if (data.decisions) {
    const items = is_list_query
      ? data.decisions
      : filterByKeywords(data.decisions, search_keywords, ["title", "description", "rationale"]);
    if (items.length > 0) {
      context += `### DECISÕES (${items.length})\n`;
      items.forEach((d) => {
        context += `- ${d.title}`;
        const decidedDateStr = safeFormat(d.decided_date, "dd/MM/yyyy");
        if (decidedDateStr) context += ` [${decidedDateStr}]`;
        context += "\n";
        if (d.description) context += `  ${d.description}\n`;
        if (d.rationale) context += `  Motivo: ${d.rationale}\n`;
        sources.push({ type: "Decisão", id: d.id, name: d.title });
      });
      context += "\n";
    }
  }

  // TAREFAS
  if (data.tasks) {
    const items = is_list_query
      ? data.tasks
      : filterByKeywords(data.tasks, search_keywords, ["title", "description", "assignee"]);
    if (items.length > 0) {
      const pending = items.filter((t) => t.status !== "done").length;
      context += `### TAREFAS (${items.length}, ${pending} pendentes)\n`;
      items.forEach((t) => {
        context += `- [${t.status === "done" ? "x" : " "}] ${t.title}`;
        const dueDateStr = safeFormat(t.due_date, "dd/MM");
        if (dueDateStr) context += ` — Prazo: ${dueDateStr}`;
        if (t.assignee) context += ` — Resp: ${t.assignee}`;
        context += "\n";
        if (t.description) context += `  ${t.description}\n`;
        sources.push({ type: "Tarefa", id: t.id, name: t.title });
      });
      context += "\n";
    }
  }

  // ASSUNTOS
  if (data.topics) {
    const items = is_list_query
      ? data.topics
      : filterByKeywords(data.topics, search_keywords, ["name", "description"]);
    if (items.length > 0) {
      context += `### ASSUNTOS (${items.length})\n`;
      items.forEach((t) => {
        context += `- ${t.name}${t.status ? ` (${t.status})` : ""}\n`;
        if (t.description) context += `  ${t.description}\n`;
        sources.push({ type: "Assunto", id: t.id, name: t.name });
      });
      context += "\n";
    }
  }

  // ENTIDADES
  if (data.entities) {
    let items = data.entities;
    if (is_list_query && search_keywords.length > 0) {
      items = data.entities.filter(
        (e) => search_keywords.some((kw) => e.type?.includes(kw) || kw.includes(e.type?.toLowerCase()))
      );
    } else if (!is_list_query) {
      items = filterByKeywords(data.entities, search_keywords, ["value", "context", "type"]);
    }
    if (items.length > 0) {
      context += `### ENTIDADES (${items.length})\n`;
      items.forEach((e) => {
        context += `- ${ENTITY_LABELS[e.type] || e.type}: ${e.value}\n`;
        if (e.context) context += `  Contexto: ${e.context.substring(0, 120)}\n`;
        sources.push({ type: "Entidade", id: e.id, name: `${ENTITY_LABELS[e.type] || e.type}: ${e.value}` });
      });
      context += "\n";
    }
  }

  // DOCUMENTOS
  if (data.documents) {
    const items = is_list_query
      ? data.documents
      : filterByKeywords(data.documents, search_keywords, ["name", "summary", "extracted_text", "category"]);
    if (items.length > 0) {
      context += `### DOCUMENTOS (${items.length})\n`;
      items.forEach((d) => {
        context += `- ${d.name}${d.category ? ` (${d.category})` : ""}\n`;
        if (d.summary) context += `  ${d.summary.substring(0, 200)}\n`;
        sources.push({ type: "Documento", id: d.id, name: d.name });
      });
      context += "\n";
    }
  }

  // SESSÕES
  if (data.sessions) {
    const items = data.sessions;
    if (items.length > 0) {
      context += `### SESSÕES DE CONVERSA (${items.length})\n`;
      items.forEach((s) => {
        context += `- ${s.title} — ${s.message_count || 0} mensagens`;
        if (s.status) context += ` (${s.status})`;
        context += "\n";
        if (s.summary) context += `  ${s.summary.substring(0, 200)}\n`;
        sources.push({ type: "Sessão", id: s.id, name: s.title });
      });
      context += "\n";
    }
  }

  // PALAVRAS-CHAVE
  if (data.keywords) {
    const items = is_list_query
      ? data.keywords
      : filterByKeywords(data.keywords, search_keywords, ["keyword"]);
    if (items.length > 0) {
      const kwList = [...new Set(items.map((k) => k.keyword))].slice(0, 20);
      context += `### PALAVRAS-CHAVE RELACIONADAS\n${kwList.join(", ")}\n\n`;
    }
  }

  // MENSAGENS DE OUTRAS SESSÕES (memória cross-session)
  if (data.messages) {
    const otherSessionMessages = data.messages.filter((m) => m.session_id !== sessionId);
    const relevant = filterByKeywords(otherSessionMessages, search_keywords, ["content"]);
    if (relevant.length > 0) {
      context += `### MENSAGENS RELACIONADAS DE OUTRAS SESSÕES (${Math.min(relevant.length, 5)})\n`;
      relevant.slice(0, 5).forEach((m) => {
        context += `- [${m.role}] ${m.content.substring(0, 150)}\n`;
      });
      context += "\n";
    }
  }

  return { context: context.trim(), sources };
}

/**
 * Executa o pipeline completo de recuperação de memória.
 *
 * @param {string} question - Pergunta do usuário
 * @param {string} sessionId - Sessão ativa
 * @param {string} projectId - Projeto (opcional)
 * @returns {Object} { context, sources, intent, sessionSummary }
 */
export async function runMemoryPipeline(question, sessionId, projectId) {
  // Passo 1: Interpretar a intenção da pergunta
  const intent = await interpretIntent(question);

  // Passo 2: Consultar todos os tipos de memória relevantes em paralelo
  const data = await queryEntities(intent, sessionId, projectId);

  // Passo 3: MIP — Score composto, Ranking, Consolidação, Grafo, Contexto Enriquecido
  const { context, sources, ranked, health, graph } = buildEnrichedContext(data, intent, sessionId);

  return {
    context,
    sources,
    intent,
    sessionSummary: data.sessionSummary,
    // MIP metadata (disponível para COP e dashboard)
    mip: { ranked, health, graph },
  };
}