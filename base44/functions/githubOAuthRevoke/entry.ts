/**
 * githubOAuthRevoke — revoga o token no GitHub (best-effort) e remove o
 * registro da entidade GitHubOAuthToken. Usa Basic auth com client_id:secret
 * no endpoint de revogacao de OAuth App.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspaceId ?? 'default';

    const existing = await base44.asServiceRole.entities.GitHubOAuthToken.filter({
      user_id: user.id,
      workspace_id: workspaceId,
    });
    if (existing.length > 0) {
      const rec = existing[0];
      const clientId = Deno.env.get('GITHUB_CLIENT_ID');
      const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET');
      if (clientId && clientSecret) {
        await fetch(`https://api.github.com/applications/${clientId}/token`, {
          method: 'DELETE',
          headers: {
            Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: rec.access_token }),
        }).catch(() => {});
      }
      await base44.asServiceRole.entities.GitHubOAuthToken.delete(rec.id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});