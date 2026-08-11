/**
 * workspaceProvisionPersonal — Garante que o usuario tem um workspace pessoal.
 *
 * Chamado no login (AuthContext init) e por resolveActiveWorkspace quando o
 * usuario nao tem nenhum workspace. Idempotente (via provisionPersonalWorkspace).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { provisionPersonalWorkspace } from '../../shared/workspaceAuth.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await provisionPersonalWorkspace(base44, user.id);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});