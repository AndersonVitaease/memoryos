/**
 * googleOAuthInit — Implementation 007
 * Gera a URL de autorização Google OAuth 2.0 com PKCE.
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
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive',
    ];

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    if (!clientId) return Response.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 });

    // PKCE — code_verifier
    const verifierBytes = new Uint8Array(32);
    crypto.getRandomValues(verifierBytes);
    const codeVerifier = btoa(String.fromCharCode(...verifierBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // code_challenge = BASE64URL(SHA256(code_verifier))
    const encoded = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Anti-CSRF state
    const stateBytes = new Uint8Array(16);
    crypto.getRandomValues(stateBytes);
    const state = btoa(String.fromCharCode(...stateBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const redirectUri = body.redirectUri ?? `${new URL(req.url).origin.replace('/api/functions/googleOAuthInit', '')}/oauth/google/callback`;

    const params = new URLSearchParams({
      client_id:             clientId,
      redirect_uri:          redirectUri,
      response_type:         'code',
      scope:                 scopes.join(' '),
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
      access_type:           'offline',
      prompt:                'consent',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return Response.json({ authUrl, state, codeVerifier, redirectUri });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});