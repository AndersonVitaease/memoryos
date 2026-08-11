/**
 * workspaceSyncReconcile — Reconciler fail-closed periodico.
 *
 * Recomputa User.workspace_ids para TODOS os usuarios a partir das memberships
 * ativas (status=active). Corrige drift de falhas parciais nas mutacoes de
 * membership (ex: sync falhou apos add/remove). Seguro: a direcao perigosa
 * (id fantasma apos remocao) e cortada porque status=removed nao e re-adicionado.
 *
 * Chamado pelo workflow "Workspace Sync Reconciler" (agendado) e pode ser
 * invocado manualmente.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { syncUserWorkspaceIds } from '../../shared/workspaceAuth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const users = await base44.asServiceRole.entities.User.list();
    let reconciled = 0;
    let drift = 0;
    for (const u of users || []) {
      const before = Array.isArray(u.workspace_ids) ? u.workspace_ids : [];
      const after = await syncUserWorkspaceIds(base44, u.id);
      reconciled++;
      const beforeSet = new Set(before);
      const afterSet = new Set(after);
      const same = beforeSet.size === afterSet.size && [...afterSet].every((x) => beforeSet.has(x));
      if (!same) drift++;
    }
    return Response.json({ ok: true, reconciled, drift });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});