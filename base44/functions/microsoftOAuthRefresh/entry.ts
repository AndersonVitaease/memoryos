/**
 * microsoftOAuthRefresh — renova o access_token usando o refresh_token
 * armazenado no backend. O refresh_token nunca e exposto ao frontend.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspaceId ?? 'default';

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
    if (!clientId) {
      return Response.json({ error: 'Microsoft OAuth not configured' }, { status: 500 });
    }

    const records = await base44.asServiceRole.entities.MicrosoftOAuthToken.filter({
      user_id: user.id,
      workspace_id: workspaceId,
    });

    if (!records.length || !records[0].refresh_token) {
      return Response.json({ error: 'No refresh token found. Re-authenticate required.' }, { status: 401 });
    }

    const { refresh_token } = records[0];

    const payload: Record<string, string> = {
      refresh_token,
      client_id: clientId,
      grant_type: 'refresh_token',
    };
    if (clientSecret) payload.client_secret = clientSecret;

    const tenant = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      return Response.json({ error: tokenData.error_description ?? tokenData.error ?? 'Refresh failed' }, { status: 400 });
    }

    const { access_token, expires_in, refresh_token: newRefreshToken } = tokenData;
    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;

    // Microsoft as vezes rotaciona o refresh_token — atualiza se vier um novo
    if (newRefreshToken && newRefreshToken !== refresh_token) {
      await base44.asServiceRole.entities.MicrosoftOAuthToken.update(records[0].id, {
        refresh_token: newRefreshToken,
        updated_at: new Date().toISOString(),
      });
    }

    return Response.json({ accessToken: access_token, expiresAt, expiresIn: expires_in ?? 3600 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});