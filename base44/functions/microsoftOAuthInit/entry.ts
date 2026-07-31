/**
 * microsoftOAuthInit — Microsoft Graph OAuth 2.0 com PKCE
 * Mesmo padrao de googleOAuthInit — gera URL de autorizacao.
 * Retorna: { authUrl, state, codeVerifier }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const scopes = body.scopes ?? [
      'openid', 'profile', 'email', 'offline_access',
      'https://graph.microsoft.com/User.Read',
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/Files.Read.All',
    ];

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    if (!clientId) return Response.json({ error: 'MICROSOFT_CLIENT_ID not configured' }, { status: 500 });

    const verifierBytes = new Uint8Array(32);
    crypto.getRandomValues(verifierBytes);
    const codeVerifier = btoa(String.fromCharCode(...verifierBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const encoded = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const stateBytes = new Uint8Array(16);
    crypto.getRandomValues(stateBytes);
    const state = btoa(String.fromCharCode(...stateBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const redirectUri = body.redirectUri ?? `${new URL(req.url).origin.replace('/api/functions/microsoftOAuthInit', '')}/oauth/microsoft/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });

    // 'common' aceita tanto contas pessoais (Outlook/Hotmail) quanto corporativas
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

    return Response.json({ authUrl, state, codeVerifier, redirectUri });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
