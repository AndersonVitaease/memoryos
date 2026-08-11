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
 *   - resolveActiveSession: encontra ou cria a sessao ativa do workspace ativo
 *   - listSessions        : lista sessoes do workspace ativo
 *   - integrityReport    : (admin) diagnostico de registros sem workspace_id
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

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

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const op = body.operation;
    const userId = user.id;
    // auth.me() nao hidrata os campos custom do User (active_workspace_id,
    // workspace_ids). Busca o registro completo via asServiceRole para obter
    // o seletor de workspace ativo validado.
    const fullUser = await base44.asServiceRole.entities.User.get(userId).catch(() => null);
    const activeWs = (fullUser as any)?.active_workspace_id || user.data?.active_workspace_id || null;

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