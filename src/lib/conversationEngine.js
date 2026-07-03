import { base44 } from "@/api/base44Client";

/**
 * Conversation Memory Engine
 *
 * Processa lotes de mensagens e extrai conhecimento estruturado:
 * - Resumo incremental da sessão
 * - Assuntos/tópicos
 * - Entidades (pessoas, empresas, produtos, etc.)
 * - Decisões
 * - Tarefas/próximos passos
 * - Palavras-chave
 *
 * O usuário nunca percebe esse processamento.
 */

const BATCH_SIZE = 5;

const CONVERSATION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Resumo atualizado da conversa até agora (máx 500 palavras)" },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do assunto/tema" },
          description: { type: "string", description: "Descrição breve" },
        },
        required: ["name"],
      },
      description: "Assuntos discutidos nas mensagens recentes",
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["pessoa", "empresa", "organizacao", "produto", "local", "data", "horario", "numero", "valor_monetario", "telefone", "email", "site"] },
          value: { type: "string", description: "Valor da entidade" },
          context: { type: "string", description: "Trecho onde foi mencionada" },
        },
        required: ["type", "value"],
      },
      description: "Entidades mencionadas nas mensagens",
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Decisão tomada" },
          description: { type: "string", description: "Detalhes" },
          rationale: { type: "string", description: "Razão da decisão" },
        },
        required: ["title"],
      },
      description: "Decisões tomadas na conversa",
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Tarefa ou próximo passo" },
          description: { type: "string", description: "Detalhes" },
          due_date: { type: "string", description: "Data limite (YYYY-MM-DD) se mencionada" },
          assignee: { type: "string", description: "Responsável se mencionado" },
        },
        required: ["title"],
      },
      description: "Tarefas e próximos passos identificados",
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "Palavras-chave relevantes das mensagens recentes (5-15)",
    },
  },
  required: ["summary", "keywords"],
};

/**
 * Verifica se é hora de processar um lote de mensagens.
 */
export function shouldProcessBatch(messageCount) {
  return messageCount > 0 && messageCount % BATCH_SIZE === 0;
}

/**
 * Processa um lote de mensagens de uma sessão.
 * Extrai conhecimento e atualiza o resumo incremental.
 */
export async function processConversationBatch(session, messages, projectId) {
  if (!messages || messages.length === 0) return;

  const recentMessages = messages.slice(-BATCH_SIZE);

  const conversationText = recentMessages
    .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
    .join("\n\n");

  const previousSummary = session.summary
    ? `RESUMO ANTERIOR:\n${session.summary}\n\nNOVAS MENSAGENS:`
    : "NOVAS MENSAGENS (início da conversa):";

  const knowledge = await base44.integrations.Core.InvokeLLM({
    prompt: `Você é o motor de memória do MemoryOS. Analise a conversa abaixo e extraia conhecimento estruturado.
Responda SEMPRE em português brasileiro.

${previousSummary}

${conversationText}

Extraia:
1. Um resumo ATUALIZADO que incorpora o resumo anterior + as novas mensagens (máx 500 palavras). Este resumo deve capturar decisões, ideias, entidades e contexto importantes.
2. Assuntos/tópicos discutidos nas mensagens recentes
3. Entidades mencionadas (pessoas, empresas, produtos, locais, datas, valores, etc.)
4. Decisões tomadas (se houver)
5. Tarefas/próximos passos identificados (se houver)
6. Palavras-chave relevantes (5-15)`,
    response_json_schema: CONVERSATION_SCHEMA,
  });

  // Atualizar resumo da sessão
  await base44.entities.ChatSession.update(session.id, {
    summary: knowledge.summary,
    last_message_at: new Date().toISOString(),
  });

  const lastMessage = recentMessages[recentMessages.length - 1];

  // Salvar palavras-chave
  if (knowledge.keywords?.length) {
    await base44.entities.Keyword.bulkCreate(
      knowledge.keywords.map((kw) => ({
        session_id: session.id,
        message_id: lastMessage.id,
        project_id: projectId || undefined,
        source_type: "message",
        keyword: kw.toLowerCase().trim(),
      }))
    );
  }

  // Salvar entidades
  if (knowledge.entities?.length) {
    const validEntities = knowledge.entities
      .filter((e) => e.type && e.value)
      .map((e) => ({
        session_id: session.id,
        message_id: lastMessage.id,
        project_id: projectId || undefined,
        source_type: "message",
        type: e.type,
        value: e.value,
        context: e.context || "",
        memory_tier: "active",
      }));
    if (validEntities.length) {
      await base44.entities.KnowledgeEntity.bulkCreate(validEntities);
    }
  }

  // Salvar decisões
  if (knowledge.decisions?.length) {
    for (const dec of knowledge.decisions) {
      await base44.entities.Decision.create({
        session_id: session.id,
        project_id: projectId || undefined,
        title: dec.title,
        description: dec.description || "",
        rationale: dec.rationale || "",
        decided_date: new Date().toISOString().split("T")[0],
      });
    }
  }

  // Salvar tarefas
  if (knowledge.tasks?.length) {
    for (const t of knowledge.tasks) {
      await base44.entities.Task.create({
        session_id: session.id,
        project_id: projectId || undefined,
        title: t.title,
        description: t.description || "",
        status: "pending",
        due_date: t.due_date || undefined,
        assignee: t.assignee || undefined,
      });
    }
  }

  // Salvar tópicos
  if (knowledge.topics?.length) {
    for (const topic of knowledge.topics) {
      await base44.entities.Topic.create({
        session_id: session.id,
        project_id: projectId || undefined,
        name: topic.name,
        description: topic.description || "",
        status: "active",
      });
    }
  }

  return knowledge;
}

/**
 * Cria ou recupera a sessão ativa do usuário.
 */
export async function getOrCreateActiveSession(projectId) {
  const filter = projectId
    ? { project_id: projectId, status: "active" }
    : { status: "active" };

  const sessions = await base44.entities.ChatSession.filter(filter, "-last_message_at", 1);

  if (sessions.length > 0) return sessions[0];

  // Criar nova sessão
  const session = await base44.entities.ChatSession.create({
    title: "Nova conversa",
    project_id: projectId || undefined,
    status: "active",
    message_count: 0,
  });

  return session;
}