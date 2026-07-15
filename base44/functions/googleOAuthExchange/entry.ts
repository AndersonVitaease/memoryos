/**
 * googleOAuthExchange — Implementation 007
 * Troca o authorization code por access_token + refresh_token.
 * Armazena refresh_token de forma segura no backend (entity).
 * Retorna ao frontend: accessToken, expiresAt, email, displayName, scopes
 * O refresh_token NUNCA é retornado ao frontend.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { code, codeVerifier, redirectUri, workspaceId = 'default' } = body;
    if (!code || !codeVerifier || !redirectUri) {
      return Response.json({ error: 'Missing required fields: code, codeVerifier, redirectUri' }, { status: 400 });
    }

    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return Response.json({ error: 'Google OAuth not configured' }, { status: 500 });
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return Response.json({ error: tokenData.error_description ?? tokenData.error ?? 'Token exchange failed' }, { status: 400 });
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Fetch user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json();

    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;

    // Store refresh_token securely in GoogleOAuthToken entity (never returned to frontend)
    if (refresh_token) {
      const existing = await base44.asServiceRole.entities.GoogleOAuthToken.filter({
        user_id: user.id,
        workspace_id: workspaceId,
      });
      const record = {
        user_id:       user.id,
        workspace_id:  workspaceId,
        refresh_token, // stored server-side only
        email:         profile.email ?? '',
        scopes:        scope ?? '',
        updated_at:    new Date().toISOString(),
      };
      if (existing.length > 0) {
        await base44.asServiceRole.entities.GoogleOAuthToken.update(existing[0].id, record);
      } else {
        await base44.asServiceRole.entities.GoogleOAuthToken.create(record);
      }
    }

    // Return access token to frontend (short-lived, safe to return)
    return Response.json({
      accessToken:  access_token,
      expiresAt,
      expiresIn:    expires_in ?? 3600,
      email:        profile.email ?? '',
      displayName:  profile.name ?? '',
      avatarUrl:    profile.picture ?? '',
      scopes:       (scope ?? '').split(' ').filter(Boolean),
      hasRefreshToken: !!refresh_token,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});