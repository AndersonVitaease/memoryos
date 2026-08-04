/**
 * githubOAuthInit — gera a URL de autorizacao GitHub OAuth 2.0.
 * GitHub nao usa PKCE no fluxo padrao de OAuth Apps — apenas state anti-CSRF.
 * Retorna: { authUrl, state, redirectUri }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const scopes = body.scopes ?? ['repo', 'read:org', 'read:user'];

    const clientId = Deno.env.get('GITHUB_CLIENT_ID');
    if (!clientId) return Response.json({ error: 'GITHUB_CLIENT_ID not configured' }, { status: 500 });

    const stateBytes = new Uint8Array(16);
    crypto.getRandomValues(stateBytes);
    const state = btoa(String.fromCharCode(...stateBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const redirectUri = body.redirectUri ?? `${new URL(req.url).origin.replace('/api/functions/githubOAuthInit', '')}/oauth/github/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      allow_signup: 'true',
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    return Response.json({ authUrl, state, redirectUri });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});