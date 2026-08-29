/**
 * conversationContext — Autoridade server-side do contexto de Workspace
 * para criacao de ChatSession e Message.
 *
 * Principio: o backend NAO confia no workspace_id enviado pelo frontend.
 * O workspace e RESOLVIDO no servidor a partir do usuario autenticado:
 *   - ChatSession: workspace_id = user.active_workspace_id (validado por membership)
 *   - Message:     workspace_id = workspace_id da ChatSession pai (validado por membership)
 *
 * Qualquer workspace_id enviado pelo payload e IGNORADO. Isso torna o
 * spoofing de workspace impossivel pelo frontend.
 *
 * Operacoes:
 *   - createSession      : cria ChatSession no workspace ativo do usuario
 *   - persistMessage     : cria Message herdando o workspace da sessao
 *   - processMemoryBatch : extracao assincrona de memoria (batch -> openrouterChat -> entidades UCME)
 *   - resolveActiveSession: encontra ou cria a sessao ativa do workspace ativo
 *   - listSessions        : lista sessoes do workspace ativo
 *   - integrityReport    : (admin) diagnostico de registros sem workspace_id
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

// Cópia mínima e fiel de CONVERSATION_SCHEMA de src/lib/conversationEngine.js.
// Duplicação explícita: o backend Deno não pode importar módulos do frontend Vite.
// Mantenha sincronizado manualmente com o arquivo frontend.
const CONVERSATION_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Resumo atualizado da conversa até agora (máx 500 palavras)' },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do assunto/tema' },
          description: { type: 'string', description: 'Descrição breve' },
        },
        required: ['name'],
      },
      description: 'Assuntos discutidos nas mensagens recentes',
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['pessoa', 'empresa', 'organizacao', 'produto', 'local', 'data', 'horario', 'numero', 'valor_monetario', 'telefone', 'email', 'site'] },
          value: { type: 'string', description: 'Valor da entidade' },
          context: { type: 'string', description: 'Trecho onde foi mencionada' },
        },
        required: ['type', 'value'],
      },
      description: 'Entidades mencionadas nas mensagens',
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Decisão tomada' },
          description: { type: 'string', description: 'Detalhes' },
          rationale: { type: 'string', description: 'Razão da decisão' },
        },
        required: ['title'],
      },
      description: 'Decisões tomadas na conversa',
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tarefa ou próximo passo' },
          description: { type: 'string', description: 'Detalhes' },
          due_date: { type: 'string', description: 'Data limite (YYYY-MM-DD) se mencionada' },
          assignee: { type: 'string', description: 'Responsável se mencionado' },
        },
        required: ['title'],
      },
      description: 'Tarefas e próximos passos identificados',
    },
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Palavras-chave relevantes das mensagens recentes (5-15)',
    },
  },
  required: ['summary', 'keywords'],
};

// Regras de extração: cópia fiel do prompt de processConversationBatch()
// (src/lib/conversationEngine.js), sem regressão semântica.
function buildExtractionPrompt(sessionSummary: string | null, conversationText: string): string {
  const previousSummary = sessionSummary
    ? `RESUMO ANTERIOR:\n${sessionSummary}\n\nNOVAS MENSAGENS:`
    : 'NOVAS MENSAGENS (início da conversa):';
  return `Você é o motor de memória do MemoryOS. Analise a conversa abaixo e extraia conhecimento estruturado.
Responda SEMPRE em português brasileiro.

${previousSummary}

${conversationText}

Extraia:
1. Um resumo ATUALIZADO que incorpora o resumo anterior + as novas mensagens (máx 500 palavras). Este resumo deve capturar decisões, ideias, entidades e contexto importantes.
2. Assuntos/tópicos discutidos nas mensagens recentes
3. Entidades mencionadas (pessoas, empresas, produtos, locais, datas, valores, etc.)
4. Decisões tomadas (se houver)
5. Tarefas/próximos passos identificados (se houver)
6. Palavras-chave relevantes (5-15)

REGRA CRÍTICA (IA-016): mensagens do "Assistente" nesta conversa podem conter afirmações técnicas não confirmadas sobre status de conector, conexão, autenticação, sincronização ou execução (ex: "conector conectado", "handshake bem-sucedido", "arquivo encontrado e processado", nomes de arquivo ou dados mencionados sem uma listagem/resultado real anexado). NÃO extraia essas afirmações do Assistente como Decisão, Tarefa, Entidade ou fato do resumo, a menos que a mesma informação também apareça de forma clara na mensagem do "Usuário" ou seja um resultado técnico literal (ex: uma lista de arquivos, um erro do sistema). Na dúvida, não extraia — é preferível perder uma informação incerta do que gravar algo falso como memória permanente.

REGRA CRÍTICA (auditoria cognição): mensagens do "Assistente" frequentemente PROPÕEM ou SUGEREM tarefas e decisões sem que o Usuário tenha confirmado nada ainda — ex: "Você prefere que eu inicie o desenho da estrutura?", "Podemos focar em X ou Y primeiro?", "Como quer prosseguir?", listas de "próximos passos possíveis" apresentadas como opções. Isso NÃO são tarefas ou decisões reais — são perguntas abertas do Assistente aguardando resposta. NUNCA extraia como Tarefa ou Decisão algo que só apareceu como proposta, pergunta ou opção do Assistente. Só extraia uma Tarefa/Decisão quando o Usuário tiver claramente pedido, confirmado ou decidido aquilo em sua própria mensagem — a intenção precisa vir do Usuário, não do Assistente tentando adivinhar o que fazer a seguir. Isso evita que uma sugestão não confirmada vire "memória real" permanente e se autoalimente em conversas futuras, cada vez com mais detalhes fabricados.

SAIDA (structured output): responda APENAS com UM unico objeto JSON valido, sem texto antes ou depois e sem markdown, no formato: {"summary": "string", "topics": [{"name": "string", "description": "string"}], "entities": [{"type": "pessoa|empresa|organizacao|produto|local|data|horario|numero|valor_monetario|telefone|email|site", "value": "string", "context": "string"}], "decisions": [{"title": "string", "description": "string", "rationale": "string"}], "tasks": [{"title": "string", "description": "string", "due_date": "YYYY-MM-DD", "assignee": "string"}], "keywords": ["string"]};
}

// processMemoryBatch: extração estruturada de um lote de mensagens de uma
// sessão persistida, para memória persistente de agentes externos (Codex).
// Reutiliza openrouterChat via chamada function→function autenticada com o
// secret AGENT_MEMORY_MCP_SECRET (mesmo padrão do eng-mcp/src/memory.ts).
async function processMemoryBatch(base44: any, sessionId: string, projectId: string, userId?: string): Promise<any> {
  diagnosticStage = 'STAGE_4_PROCESS_MEMORY_BATCH_ENTERED';
  const session = await base44.asServiceRole.entities.ChatSession.get(sessionId).catch(() => null);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  diagnosticStage = 'STAGE_5_SESSION_LOADED';

  // Caminho com usuario: valida membership do workspace da sessao (mesma
  // regra do persistMessage). Caminho server-to-server (token) ja passou
  // pelo gate de secret no topo do handler.
  if (userId && session.workspace_id) {
    await assertMember(base44, session.workspace_id, userId);
  }

  const messages = await base44.asServiceRole.entities.Message
    .filter({ session_id: sessionId }, '-created_date', 10)
    .catch(() => []);
  if (!messages || messages.length === 0) return { skipped: 'NO_MESSAGES' };

  diagnosticStage = 'STAGE_6_MESSAGES_LOADED';
  const recent = messages.slice(0, 5).reverse();
  const conversationText = recent
    .map((m: any) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
    .join('\n\n');

  // Mecanismo interno entre Base44 functions. invoke() do SDK nao tem canal de
  // headers (invoke(fn, data)); functions.fetch() (mesmo modulo, API
  // documentada) aceita RequestInit e faz merge dos headers custom com os de
  // auth. No fluxo token-only do bridge nao ha usuario autenticado, entao o
  // MESMO secret do gate e encaminhado explicitamente a openrouterChat.
  // Modelo default = DEFAULT_MODEL do OpenRouterLLMProvider (openrouterChat
  // exige model explicito). Sem acesso direto ao OpenRouter e sem InvokeLLM.
  const chatRes: any = await (
  diagnosticStage = 'STAGE_7_OPENROUTER_CALL_START';
    await base44.functions.fetch('/openrouterChat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-memory-token': String(secrets.get('AGENT_MEMORY_MCP_SECRET') ?? ''),
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: buildExtractionPrompt(session.summary ?? null, conversationText) }],
        maxTokens: 2048,
      }),
    })
  ).json();
  const chatData = chatRes?.data ?? chatRes;
  if (!chatData || chatData.error) {
    throw new Error(`OPENROUTER_CHAT_FAILED:${chatData?.error ?? 'sem resposta'}`);
  }
  // openrouterChat retorna reply como STRING e ignora response_json_schema -
  // o structured output e garantido pela instrucao JSON-only do prompt e
  // parseado com tolerancia (cercas de codigo, texto ao redor).
  const raw = String(chatData.reply ?? '').trim();
  let jsonText = raw;
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  let knowledge: any = null;
  try {
    knowledge = JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      try { knowledge = JSON.parse(match[0]); } catch { knowledge = null; }
    }
  }
  if (!knowledge || typeof knowledge !== 'object') throw new Error('EXTRACTION_PARSE_FAILED');

  const lastMessage = recent[recent.length - 1];

  if (knowledge.summary) {
    await base44.asServiceRole.entities.ChatSession.update(session.id, {
      summary: knowledge.summary,
      last_message_at: new Date().toISOString(),
    }).catch(() => {});
  }

  if (knowledge.keywords?.length) {
    // bulkCreate nao e garantido no SDK server-side; usa .create por item.
    for (const kw of knowledge.keywords) {
      const keyword = String(kw).toLowerCase().trim();
      if (!keyword) continue;
      await base44.asServiceRole.entities.Keyword.create({
        session_id: session.id,
        message_id: lastMessage.id,
        project_id: projectId || undefined,
        workspace_id: session.workspace_id || undefined,
        source_type: 'message',
        keyword,
      }).catch(() => {});
    }
  }

  if (knowledge.entities?.length) {
    for (const e of knowledge.entities) {
      if (!e.type || !e.value) continue;
      await base44.asServiceRole.entities.KnowledgeEntity.create({
        session_id: session.id,
        message_id: lastMessage.id,
        project_id: projectId || undefined,
        workspace_id: session.workspace_id || undefined,
        source_type: 'message',
        type: e.type,
        value: e.value,
        context: e.context || '',
        memory_tier: 'active',
      }).catch(() => {});
    }
  }

  if (knowledge.decisions?.length) {
    for (const dec of knowledge.decisions) {
      await base44.asServiceRole.entities.Decision.create({
        session_id: session.id,
        project_id: projectId || undefined,
        workspace_id: session.workspace_id || undefined,
        title: dec.title,
        description: dec.description || '',
        rationale: dec.rationale || '',
        decided_date: new Date().toISOString().split('T')[0],
      }).catch(() => {});
    }
  }

  if (knowledge.tasks?.length) {
    for (const t of knowledge.tasks) {
      await base44.asServiceRole.entities.Task.create({
        session_id: session.id,
        project_id: projectId || undefined,
        workspace_id: session.workspace_id || undefined,
        title: t.title,
        description: t.description || '',
        status: 'pending',
        due_date: t.due_date || undefined,
        assignee: t.assignee || undefined,
      }).catch(() => {});
    }
  }

  if (knowledge.topics?.length) {
    for (const topic of knowledge.topics) {
      await base44.asServiceRole.entities.Topic.create({
        session_id: session.id,
        project_id: projectId || undefined,
        workspace_id: session.workspace_id || undefined,
        name: topic.name,
        description: topic.description || '',
        status: 'active',
      }).catch(() => {});
    }
  }

  return { ok: true };
}

async function assertMember(base44: any, workspaceId: string, userId: string) {
  if (!workspaceId) throw new Error('Workspace ativo ausente. Defina um workspace antes de continuar.');
  const members = await base44.asServiceRole.entities.WorkspaceMember.filter({
    workspace_id: workspaceId,
    user_id: userId,
    status: 'active',
  });
  if (!members || members.length === 0) {
    throw new Error('Voce nao e membro ativo do workspace ativo.');
  }
  return members[0];
}

function scopeFor(type: string): string {
  return type === 'pessoal' ? 'personal' : 'workspace';
}

let diagnosticStage = 'STAGE_0_START';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const op = body.operation ?? body.op;

    // processMemoryBatch e acionado server-to-server pelo agentMemoryBridge
    // (x-agent-memory-token / memoryBatchToken - o MESMO secret
    // AGENT_MEMORY_MCP_SECRET do bridge, sem novo credential). Sem usuario
    // autenticado, apenas esta operacao e aceita mediante token valido; todas
    // as demais operacoes continuam exigindo usuario autenticado.
    //
    // Gate token-only movido PARA ANTES de qualquer autenticacao de usuario:
    // sem JWT de usuario, auth.me() lanca de forma sincrona e o erro
    // ("Authentication required to view users") escapa do .catch e chega ao
    // catch externo como 500 antes de qualquer validacao. Com token valido,
    // o fluxo token-only segue SEM chamar auth.me(); para qualquer outro op,
    // auth.me() e a exigencia de usuario sao preservadas exatamente como antes.
    let user: any = null;
    if (op === 'processMemoryBatch') {
      const expected = secrets.get('AGENT_MEMORY_MCP_SECRET');
      const provided = req.headers.get('x-agent-memory-token') || String(body.memoryBatchToken ?? '');
      if (!expected || !provided || provided !== expected) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // token valido: caminho interno segue com user = null, sem auth.me()
    } else {
      user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

  diagnosticStage = 'STAGE_1_TOKEN_GATE_PASSED';
    const userId = user?.id;
    // auth.me() nao hidrata os campos custom do User (active_workspace_id,
    // workspace_ids). Busca o registro completo via asServiceRole para obter
    // o seletor de workspace ativo validado.
    const fullUser = userId
      ? await base44.asServiceRole.entities.User.get(userId).catch(() => null)
      : null;
  diagnosticStage = 'STAGE_2_USER_LOOKUP_SKIPPED';
    const activeWs = (fullUser as any)?.active_workspace_id || (user as any)?.data?.active_workspace_id || null;

    // ── createSession ──────────────────────────────────────────────────
    if (op === 'createSession') {
      if (!activeWs) {
        return Response.json(
          { error: 'Nenhum workspace ativo. Selecione ou crie um workspace antes de iniciar uma conversa.' },
          { status: 400 }
        );
      }
      await assertMember(base44, activeWs, userId);
      const ws = await base44.asServiceRole.entities.Workspace.get(activeWs).catch(() => null);
      const scope = ws?.type === 'pessoal' ? 'personal' : 'workspace';
      const session = await base44.asServiceRole.entities.ChatSession.create({
        title: body.title || 'Nova conversa',
        status: 'active',
        message_count: 0,
        workspace_id: activeWs,
        scope,
        project_id: body.projectId || undefined,
      });
      return Response.json({ ok: true, session });
    }

    // ── persistMessage ─────────────────────────────────────────────────
    if (op === 'persistMessage') {
      const sessionId = body.sessionId;
      if (!sessionId) return Response.json({ error: 'sessionId ausente' }, { status: 400 });
      // Resolve a sessao pelo id (autoridade server-side).
      const session = await base44.asServiceRole.entities.ChatSession.get(sessionId).catch(() => null);
      if (!session) return Response.json({ error: 'Sessao nao encontrada' }, { status: 404 });

      const wsId = session.workspace_id;
      if (!wsId) {
        return Response.json(
          { error: 'Sessao sem workspace_id. Nao e possivel persistir mensagens em sessoes sem workspace.' },
          { status: 400 }
        );
      }
      // Valida que o usuario e membro do workspace da sessao.
      await assertMember(base44, wsId, userId);

      // IGNORA qualquer workspace_id/scope enviado pelo frontend — herda da sessao.
      const message = await base44.asServiceRole.entities.Message.create({
        session_id: sessionId,
        project_id: body.projectId || session.project_id || undefined,
        workspace_id: wsId,
        scope: session.scope || 'workspace',
        role: body.role,
        content: body.content,
        memory_tier: body.memoryTier || 'active',
        sources_used: body.sourcesUsed || [],
      });

      // Incrementa contadores da sessao (fire-and-forget)
      base44.asServiceRole.entities.ChatSession.updateMany(
        { id: sessionId },
        { $inc: { message_count: 1 }, $currentDate: { last_message_at: true } }
      ).catch(() => {});

      return Response.json({ ok: true, message });
    }

    // processMemoryBatch: extração estruturada de memória persistente para
    // sessões de agentes externos (ex: Codex). Chamada assincronamente pelo
    // agentMemoryBridge; o capture não espera a extração terminar.
    if (op === 'processMemoryBatch') {
      const sessionId = body.sessionId;
      if (!sessionId) return Response.json({ error: 'sessionId ausente' }, { status: 400 });
      if (!body.projectId) return Response.json({ error: 'projectId ausente' }, { status: 400 });

      try {
    diagnosticStage = 'STAGE_3_DISPATCH_ENTERED';
        const result = await processMemoryBatch(base44, sessionId, body.projectId, userId);
        return Response.json({ ok: true, data: result });
      } catch (e: any) {
        console.error('[conversationContext] processMemoryBatch error:', e?.message || String(e));
        return Response.json({ error: e?.message || 'INTERNAL_ERROR', diagnosticStage }, { status: 500 });
      }
    }

    // ── resolveActiveSession ───────────────────────────────────────────
    if (op === 'resolveActiveSession') {
      if (!activeWs) {
        return Response.json(
          { error: 'Nenhum workspace ativo. Selecione ou crie um workspace antes de iniciar uma conversa.' },
          { status: 400 }
        );
      }
      await assertMember(base44, activeWs, userId);

      // Restaura pelo lastSessionId se fornecido e pertencente ao workspace ativo
      if (body.lastSessionId) {
        const s = await base44.asServiceRole.entities.ChatSession.get(body.lastSessionId).catch(() => null);
        if (s && s.workspace_id === activeWs && s.status === 'active') {
          return Response.json({ ok: true, session: s });
        }
      }

      // Busca sessao ativa com mensagens no workspace ativo (e escopo de projeto)
      const filter: any = { workspace_id: activeWs, status: 'active' };
      if (body.projectId) filter.project_id = body.projectId;
      else filter.project_id = null;
      const sessions = await base44.asServiceRole.entities.ChatSession.filter(filter, '-last_message_at', 10);
      const withMsgs = (sessions || []).filter((s: any) => s.message_count && s.message_count > 0 && s.last_message_at);
      if (withMsgs.length > 0) return Response.json({ ok: true, session: withMsgs[0] });
      if (sessions && sessions.length > 0) return Response.json({ ok: true, session: sessions[0] });

      // Cria nova sessao no workspace ativo
      const ws = await base44.asServiceRole.entities.Workspace.get(activeWs).catch(() => null);
      const scope = ws?.type === 'pessoal' ? 'personal' : 'workspace';
      const session = await base44.asServiceRole.entities.ChatSession.create({
        title: 'Nova conversa',
        status: 'active',
        message_count: 0,
        workspace_id: activeWs,
        scope,
        project_id: body.projectId || undefined,
      });
      return Response.json({ ok: true, session });
    }

    // ── listSessions ────────────────────────────────────────────────────
    if (op === 'listSessions') {
      if (!activeWs) return Response.json({ ok: true, sessions: [] });
      await assertMember(base44, activeWs, userId);
      const filter: any = { workspace_id: activeWs, status: 'active' };
      if (body.projectId) filter.project_id = body.projectId;
      else filter.project_id = null;
      const limit = Math.min(Number(body.limit) || 50, 100);
      const sessions = await base44.asServiceRole.entities.ChatSession.filter(filter, '-last_message_at', limit);
      return Response.json({ ok: true, sessions: sessions || [] });
    }

    // ── integrityReport (admin) ─────────────────────────────────────────
    if (op === 'integrityReport') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      const targets = [
        'ChatSession', 'Message', 'Document', 'KnowledgeEntity', 'Decision',
        'Topic', 'Task', 'Keyword', 'TimelineEvent', 'Person', 'Tag', 'Watch',
      ];
      const report: any = {};
      for (const name of targets) {
        try {
          const ent: any = (base44.asServiceRole.entities as any)[name];
          if (!ent || typeof ent.filter !== 'function') { report[name] = { skipped: true }; continue; }
          // registros sem workspace_id
          const missing = await ent.filter({ workspace_id: null }, '-created_date', 200).catch(() => []);
          // total recente (amostra)
          const recent = await ent.list('-created_date', 1).catch(() => []);
          report[name] = {
            missingWorkspaceId: (missing || []).length,
            hasRecords: (recent || []).length > 0,
          };
        } catch (e: any) {
          report[name] = { error: e?.message || String(e) };
        }
      }
      return Response.json({ ok: true, report });
    }

    return Response.json({ error: `Operacao desconhecida: ${op}` }, { status: 400 });
  } catch (error) {
    const status = (error as any)?.message?.includes('membro') || (error as any)?.message?.includes('workspace ativo') ? 403 : 500;
    return Response.json({ error: (error as any)?.message || 'Internal error' }, { status });
  }
}
