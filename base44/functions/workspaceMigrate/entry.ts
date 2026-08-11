/**
 * workspaceMigrate — Backfill de dados legados (workspace_id=null -> pessoal).
 *
 * Para cada usuario sem workspace_migrated_at:
 *  1. Provisiona workspace pessoal (idempotente).
 *  2. Para cada entidade de dados, updateMany({workspace_id:null, created_by_id:user}, {$set:{workspace_id:ws, scope:'personal'}}).
 *  3. Marca user.workspace_migrated_at.
 *
 * Estado transitorio: durante a migracao, registros null ficam acessiveis SO ao
 * dono (RLS read = created_by_id OU workspace_id∈workspace_ids OU admin; null
 * nao casa com $in). Apos o backfill, nenhum registro permanece null.
 *
 * Admin only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { provisionPersonalWorkspace } from '../../shared/workspaceAuth.ts';

const DATA_ENTITIES = [
  'ChatSession', 'Message', 'Document', 'Folder', 'Tag', 'Person',
  'TimelineEvent', 'KnowledgeEntity', 'Decision', 'Topic', 'Task', 'Keyword',
  'Watch', 'Project',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const users = await base44.asServiceRole.entities.User.list();
    const summary = [];
    for (const u of users || []) {
      if (u.workspace_migrated_at) { summary.push({ user: u.id, skipped: true }); continue; }
      const prov = await provisionPersonalWorkspace(base44, u.id);
      const wsId = prov.workspace_id;
      const entityCounts = {};
      for (const entName of DATA_ENTITIES) {
        try {
          const res = await base44.asServiceRole.entities[entName].updateMany(
            { workspace_id: null, created_by_id: u.id },
            { $set: { workspace_id: wsId, scope: 'personal' } }
          );
          entityCounts[entName] = res?.modified_count || res?.count || 0;
        } catch (e) {
          entityCounts[entName] = { error: e.message };
        }
      }
      await base44.asServiceRole.entities.User.update(u.id, { workspace_migrated_at: new Date().toISOString() });
      summary.push({ user: u.id, workspace_id: wsId, created: prov.created, entityCounts });
    }
    return Response.json({ ok: true, migrated: summary });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});