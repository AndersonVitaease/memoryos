/**
 * googleOAuthRevoke — Implementation 007
 * Revoga o token Google e remove o refresh_token do backend.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspaceId ?? 'default';

    const records = await base44.asServiceRole.entities.GoogleOAuthToken.filter({
      user_id:      user.id,
      workspace_id: workspaceId,
    });

    for (const record of records) {
      // Revoke with Google
      if (record.refresh_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(record.refresh_token)}`, {
          method: 'POST',
        }).catch(() => { /* best-effort revocation */ });
      }
      await base44.asServiceRole.entities.GoogleOAuthToken.delete(record.id);
    }

    return Response.json({ revoked: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});