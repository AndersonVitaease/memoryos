/**
 * workspaceSetActive — Define o workspace ativo do usuario, VALIDANDO membership.
 *
 * Nao confia no workspaceId enviado pelo frontend: chama assertWorkspaceMember
 * (consulta WorkspaceMember, fonte da verdade) e so persiste se o usuario for
 * membro ativo. Caso contrario, rejeita com 403.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { assertWorkspaceMember } from '../../shared/workspaceAuth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const { workspaceId } = body;
    if (!workspaceId) return Response.json({ error: 'workspaceId obrigatório' }, { status: 400 });

    try {
      const { role } = await assertWorkspaceMember(base44, user.id, workspaceId);
      await base44.asServiceRole.entities.User.update(user.id, { active_workspace_id: workspaceId });
      return Response.json({ ok: true, workspace_id: workspaceId, role });
    } catch (e) {
      return Response.json({ error: e.message || 'Não é membro ativo deste workspace' }, { status: 403 });
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});