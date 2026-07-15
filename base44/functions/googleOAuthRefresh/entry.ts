/**
 * googleOAuthRefresh — Implementation 007
 * Renova o access_token usando o refresh_token armazenado no backend.
 * O refresh_token nunca é exposto ao frontend.
 * Retorna: { accessToken, expiresAt, expiresIn }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspaceId ?? 'default';

    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return Response.json({ error: 'Google OAuth not configured' }, { status: 500 });
    }

    // Retrieve refresh_token from secure backend storage
    const records = await base44.asServiceRole.entities.GoogleOAuthToken.filter({
      user_id:      user.id,
      workspace_id: workspaceId,
    });

    if (!records.length || !records[0].refresh_token) {
      return Response.json({ error: 'No refresh token found. Re-authenticate required.' }, { status: 401 });
    }

    const { refresh_token } = records[0];

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return Response.json({ error: tokenData.error_description ?? tokenData.error ?? 'Refresh failed' }, { status: 400 });
    }

    const { access_token, expires_in } = tokenData;
    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;

    // Update stored record with timestamp
    await base44.asServiceRole.entities.GoogleOAuthToken.update(records[0].id, {
      updated_at: new Date().toISOString(),
    });

    return Response.json({
      accessToken: access_token,
      expiresAt,
      expiresIn:   expires_in ?? 3600,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});