/**
 * workspaceCreate — Cria um Workspace e torna o caller owner.
 *
 * Fluxo autorizado (frontend NUNCA toca WorkspaceMember):
 *  1. Cria Workspace (type=empresa|equipe, owner_id=caller).
 *  2. Cria WorkspaceMember(role=owner, status=active).
 *  3. syncUserWorkspaceIds (espelha em User.workspace_ids).
 *  4. Seta active_workspace_id = novo workspace.
 * Retorna { ok, workspace_id, workspace }.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { syncUserWorkspaceIds } from '../../shared/workspaceAuth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const { name, description, type } = body;
    if (!name || !name.trim()) return Response.json({ error: 'Nome obrigatório' }, { status: 400 });

    const wsType = ['empresa', 'equipe', 'pessoal'].includes(type) ? type : 'equipe';
    const ws = await base44.asServiceRole.entities.Workspace.create({
      name: name.trim(),
      description: description || null,
      type: wsType,
      owner_id: user.id,
      plan: 'free',
    });
    await base44.asServiceRole.entities.WorkspaceMember.create({
      workspace_id: ws.id,
      user_id: user.id,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    });
    await syncUserWorkspaceIds(base44, user.id);
    await base44.asServiceRole.entities.User.update(user.id, { active_workspace_id: ws.id });
    return Response.json({ ok: true, workspace_id: ws.id, workspace: ws });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});