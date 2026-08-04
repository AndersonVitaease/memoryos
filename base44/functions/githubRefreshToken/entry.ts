/**
 * githubRefreshToken — hidratacao do access token no frontend.
 * Tokens do GitHub (OAuth App) nao expiram por padrao, entao "refresh" aqui
 * significa apenas re-entregar o token ja armazenado no backend pra memoria
 * do frontend apos um reload. Nao ha chamada ao GitHub.
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
    if (existing.length === 0) {
      return Response.json({ error: 'No GitHub token for this workspace' }, { status: 404 });
    }

    const rec = existing[0];
    return Response.json({
      accessToken: rec.access_token,
      accountLogin: rec.account_login ?? '',
      scopes: (rec.scopes ?? '').split(' ').filter(Boolean),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});