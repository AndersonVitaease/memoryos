/**
 * githubOAuthExchange — troca o code OAuth do GitHub por access_token.
 * Token do GitHub (OAuth App) nao expira por padrao — armazenamos o
 * proprio access_token na entidade GitHubOAuthToken (nao ha refresh_token).
 * Busca o perfil /user pra pegar o login da conta.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { code, redirectUri, workspaceId = 'default' } = body;
    if (!code || !redirectUri) {
      return Response.json({ error: 'Missing code or redirectUri' }, { status: 400 });
    }

    const clientId = Deno.env.get('GITHUB_CLIENT_ID');
    const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return Response.json({ error: 'GitHub OAuth not configured (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)' }, { status: 500 });
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      return Response.json({
        error: tokenData.error_description ?? tokenData.error ?? 'Token exchange failed',
      }, { status: 400 });
    }

    const { access_token, scope } = tokenData;

    const profileRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/vnd.github+json' },
    });
    const profile = await profileRes.json();
    const accountLogin = profile.login ?? '';

    const existing = await base44.asServiceRole.entities.GitHubOAuthToken.filter({
      user_id: user.id,
      workspace_id: workspaceId,
    });
    const record = {
      user_id: user.id,
      workspace_id: workspaceId,
      access_token,
      account_login: accountLogin,
      scopes: scope ?? '',
      updated_at: new Date().toISOString(),
    };
    if (existing.length > 0) {
      await base44.asServiceRole.entities.GitHubOAuthToken.update(existing[0].id, record);
    } else {
      await base44.asServiceRole.entities.GitHubOAuthToken.create(record);
    }

    return Response.json({
      accessToken: access_token,
      accountLogin,
      scopes: (scope ?? '').split(' ').filter(Boolean),
      avatarUrl: profile.avatar_url ?? '',
      email: profile.email ?? '',
      name: profile.name ?? '',
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});