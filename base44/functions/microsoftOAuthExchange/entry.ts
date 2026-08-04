/**
 * microsoftOAuthExchange — troca o codigo de autorizacao por tokens.
 * Mesmo padrao de seguranca de googleOAuthExchange (refresh_token nunca
 * exposto ao frontend, access_token so em memoria no cliente).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function mask(s: string | undefined | null, head = 6, tail = 4): string {
  if (!s) return '[ABSENT]';
  if (s.length <= head + tail) return `[${s.length}chars-too-short-to-mask]`;
  return `${s.slice(0, head)}...${s.slice(-tail)} [total ${s.length} chars]`;
}

Deno.serve(async (req) => {
  const START_MS = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: Record<string, string> = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { code, codeVerifier, redirectUri, workspaceId = 'default' } = body;
    if (!code || !codeVerifier || !redirectUri) {
      return Response.json({ error: 'Missing required fields: code, codeVerifier, redirectUri' }, { status: 400 });
    }

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
    if (!clientId) {
      return Response.json({ error: 'Microsoft OAuth not configured (MICROSOFT_CLIENT_ID ausente)' }, { status: 500 });
    }

    const payload: Record<string, string> = {
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    };
    // client_secret e opcional se o app foi registrado como "public client"
    if (clientSecret) payload.client_secret = clientSecret;

    console.info('[microsoftOAuthExchange] code:', mask(code), '| verifier:', mask(codeVerifier));

    const tenant = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error('[microsoftOAuthExchange] FALHOU:', tokenData.error, tokenData.error_description);
      return Response.json({
        error: tokenData.error_description ?? tokenData.error ?? 'Token exchange failed',
      }, { status: 400 });
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;
    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;

    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json();

    let entityOp = 'NONE';
    if (refresh_token) {
      const existing = await base44.asServiceRole.entities.MicrosoftOAuthToken.filter({
        user_id: user.id,
        workspace_id: workspaceId,
      });
      const record = {
        user_id: user.id,
        workspace_id: workspaceId,
        refresh_token,
        email: profile.mail ?? profile.userPrincipalName ?? '',
        scopes: scope ?? '',
        updated_at: new Date().toISOString(),
      };
      if (existing.length > 0) {
        await base44.asServiceRole.entities.MicrosoftOAuthToken.update(existing[0].id, record);
        entityOp = 'UPDATED';
      } else {
        await base44.asServiceRole.entities.MicrosoftOAuthToken.create(record);
        entityOp = 'CREATED';
      }
    }

    console.info('[microsoftOAuthExchange] SUCESSO —', entityOp, '— totalMs:', Date.now() - START_MS);

    return Response.json({
      accessToken: access_token,
      expiresAt,
      expiresIn: expires_in ?? 3600,
      email: profile.mail ?? profile.userPrincipalName ?? '',
      displayName: profile.displayName ?? '',
      scopes: (scope ?? '').split(' ').filter(Boolean),
      hasRefreshToken: !!refresh_token,
    });
  } catch (error) {
    console.error('[microsoftOAuthExchange] EXCECAO:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});