import { base44 } from "@/api/base44Client";
import moment from "moment";
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
 * Passo 1: Interpretar a intenção da pergunta via LLM.
 */
async function interpretIntent(question) {
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

Regra: quando houver dúvida, inclua mais tipos em vez de menos. É melhor consultar demais do que de menos.

Pergunta: "${question}"`,
      response_json_schema: INTENT_SCHEMA,
    });
  } catch {
    const stopwords = ["o", "a", "os", "as", "de", "da", "do", "das", "dos", "e", "ou", "que", "para", "com", "em", "um", "uma", "no", "na", "nos", "nas", "quando", "como", "qual", "quais", "quem", "onde", "foi", "ser", "tem", "ha"];
    return {
      query_types: ["projects", "documents", "decisions", "tasks", "topics", "entities", "sessions", "keywords"],
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
    queries.decisions = base44.entities.Decision.list("-decided_date", 30);
  }
  if (query_types.includes("tasks")) {
    queries.tasks = base44.entities.Task.list("-created_date", 50);
  }
  if (query_types.includes("topics")) {
    queries.topics = base44.entities.Topic.list("-created_date", 30);
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
    queries.messages = base44.entities.Message.list("-created_date", 50);
  }

  const keys = Object.keys(queries);
  const values = await Promise.all(Object.values(queries));
  const result = {};
  keys.forEach((k, i) => {
    result[k] = values[i];
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
        if (d.decided_date) context += ` [${moment(d.decided_date).format("DD/MM/YYYY")}]`;
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
        if (t.due_date) context += ` — Prazo: ${moment(t.due_date).format("DD/MM")}`;
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