/**
 * workspaceMembership — Mutacoes de membership com sync fail-closed.
 *
 * Operacoes:
 *  - listMine: lista workspaces do usuario (via WorkspaceMember).
 *  - addMember: admin/owner adiciona usuario a um workspace (status=active).
 *  - removeMember: admin/owner remove (status=removed) — access cortado pelo sync.
 *  - leave: usuario sai de um workspace (self-remove).
 *
 * Seguranca:
 *  - addMember/removeMember exigem que o CALLER seja admin global ou owner/admin
 *    do workspace alvo (validado server-side). RLS de WorkspaceMember.create/update
 *    e admin-only, entao estas mutacoes so funcionam via asServiceRole + validacao
 *    manual da autoridade do caller.
 *  - Toda mutacao chama syncUserWorkspaceIds (fail-closed) para espelhar em
 *    User.workspace_ids, que e o que o RLS le.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { syncUserWorkspaceIds, assertWorkspaceMember } from '../../shared/workspaceAuth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const { operation } = body;

    if (operation === 'listMine') {
      const members = await base44.asServiceRole.entities.WorkspaceMember.filter({
        user_id: user.id,
        status: 'active',
      });
      const ids = (members || []).map((m) => m.workspace_id).filter(Boolean);
      const workspaces = [];
      for (const id of ids) {
        try {
          const ws = await base44.asServiceRole.entities.Workspace.get(id);
          workspaces.push({ ...ws, role: members.find((m) => m.workspace_id === id)?.role });
        } catch (e) { /* workspace removido: ignora */ }
      }
      return Response.json({ ok: true, workspaces, active_workspace_id: (await base44.asServiceRole.entities.User.get(user.id))?.active_workspace_id });
    }

    if (operation === 'addMember') {
      const { workspaceId, targetUserId, role } = body;
      if (!workspaceId || !targetUserId) return Response.json({ error: 'workspaceId e targetUserId obrigatorios' }, { status: 400 });
      // Caller deve ser admin global OU owner/admin do workspace
      await requireWorkspaceAuthority(base44, user, workspaceId);
      // Nao duplicar
      const existing = await base44.asServiceRole.entities.WorkspaceMember.filter({
        workspace_id: workspaceId, user_id: targetUserId, status: 'active',
      });
      if (existing && existing.length > 0) {
        return Response.json({ ok: true, alreadyMember: true });
      }
      await base44.asServiceRole.entities.WorkspaceMember.create({
        workspace_id: workspaceId,
        user_id: targetUserId,
        role: role || 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
        invited_by: user.id,
      });
      await syncUserWorkspaceIds(base44, targetUserId);
      return Response.json({ ok: true });
    }

    if (operation === 'removeMember') {
      const { workspaceId, targetUserId } = body;
      if (!workspaceId || !targetUserId) return Response.json({ error: 'workspaceId e targetUserId obrigatorios' }, { status: 400 });
      await requireWorkspaceAuthority(base44, user, workspaceId);
      const members = await base44.asServiceRole.entities.WorkspaceMember.filter({
        workspace_id: workspaceId, user_id: targetUserId, status: 'active',
      });
      for (const m of members || []) {
        await base44.asServiceRole.entities.WorkspaceMember.update(m.id, { status: 'removed' });
      }
      // Fail-closed: sincroniza DEPOIS de marcar removido. Se sync falhar, o
      // reconciler fecha a janela. Status=removed e a fonte da verdade.
      await syncUserWorkspaceIds(base44, targetUserId);
      return Response.json({ ok: true });
    }

    if (operation === 'leave') {
      const { workspaceId } = body;
      if (!workspaceId) return Response.json({ error: 'workspaceId obrigatorio' }, { status: 400 });
      const members = await base44.asServiceRole.entities.WorkspaceMember.filter({
        workspace_id: workspaceId, user_id: user.id, status: 'active',
      });
      for (const m of members || []) {
        await base44.asServiceRole.entities.WorkspaceMember.update(m.id, { status: 'removed' });
      }
      await syncUserWorkspaceIds(base44, user.id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Operacao invalida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});

async function requireWorkspaceAuthority(base44, user, workspaceId) {
  if (user.role === 'admin') return;
  try {
    const { role } = await assertWorkspaceMember(base44, user.id, workspaceId);
    if (role === 'owner' || role === 'admin') return;
  } catch (e) { /* nao e membro */ }
  throw new Error('Sem autoridade sobre este workspace');
}