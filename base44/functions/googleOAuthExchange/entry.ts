/**
 * googleOAuthExchange — Implementation 007 + INSTRUMENTATION LAYER
 *
 * INSTRUMENTATION RULES:
 * - Authorization code: masked (first 6 + last 4 chars only)
 * - code_verifier: masked (first 4 + last 4 chars only)
 * - client_id: prefix only (first 12 chars)
 * - client_secret: NEVER logged
 * - access_token: prefix only (first 10 chars)
 * - refresh_token: NEVER logged (only its presence and length)
 * - Full Google response body: logged verbatim (it contains no secrets if exchange fails)
 * - If exchange succeeds, tokenData fields are summarized (no token values)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function mask(s: string | undefined | null, head = 6, tail = 4): string {
  if (!s) return '[ABSENT]';
  if (s.length <= head + tail) return `[${s.length}chars-too-short-to-mask]`;
  return `${s.slice(0, head)}...${s.slice(-tail)} [total ${s.length} chars]`;
}

Deno.serve(async (req) => {
  const START_MS = Date.now();
  const TIMESTAMP = new Date().toISOString();

  // ── AUDIT ENVELOPE ──────────────────────────────────────────────
  const audit: Record<string, unknown> = {
    timestamp:   TIMESTAMP,
    function:    'googleOAuthExchange',
    phase:       'START',
  };

  try {
    const base44 = createClientFromRequest(req);

    // ── AUTH ────────────────────────────────────────────────────────
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized', audit }, { status: 401 });
    }
    audit.userId    = user.id;
    audit.userEmail = user.email;

    // ── PARSE REQUEST BODY ──────────────────────────────────────────
    let body: Record<string, string> = {};
    try {
      body = await req.json();
    } catch (e) {
      audit.phase = 'FAIL_PARSE_BODY';
      audit.parseError = (e as Error).message;
      console.error('[EXCHANGE][AUDIT]', JSON.stringify(audit));
      return Response.json({ error: 'Invalid JSON body', audit }, { status: 400 });
    }

    const { code, codeVerifier, redirectUri, workspaceId = 'default' } = body;

    // ── LOG REQUEST RECEIVED ────────────────────────────────────────
    audit.request_received = {
      code_masked:         mask(code, 6, 4),
      codeVerifier_masked: mask(codeVerifier, 4, 4),
      redirectUri:         redirectUri ?? '[ABSENT]',
      workspaceId:         workspaceId,
      code_present:        !!code,
      codeVerifier_present:!!codeVerifier,
      redirectUri_present: !!redirectUri,
    };
    console.info('[EXCHANGE][AUDIT] REQUEST_RECEIVED:', JSON.stringify(audit.request_received));

    if (!code || !codeVerifier || !redirectUri) {
      audit.phase = 'FAIL_MISSING_FIELDS';
      console.error('[EXCHANGE][AUDIT]', JSON.stringify(audit));
      return Response.json({ error: 'Missing required fields: code, codeVerifier, redirectUri', audit }, { status: 400 });
    }

    // ── ENV VARS ────────────────────────────────────────────────────
    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    audit.env = {
      clientId_present:     !!clientId,
      clientId_prefix:      clientId ? clientId.slice(0, 12) + '...' : '[ABSENT]',
      clientId_length:      clientId?.length ?? 0,
      clientSecret_present: !!clientSecret,
    };
    console.info('[EXCHANGE][AUDIT] ENV:', JSON.stringify(audit.env));

    if (!clientId || !clientSecret) {
      audit.phase = 'FAIL_ENV_VARS';
      console.error('[EXCHANGE][AUDIT]', JSON.stringify(audit));
      return Response.json({ error: 'Google OAuth not configured', audit }, { status: 500 });
    }

    // ── REQUEST TO GOOGLE ───────────────────────────────────────────
    const googleRequestPayload = {
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      code_verifier: codeVerifier,
    };

    audit.google_request = {
      url:                    'https://oauth2.googleapis.com/token',
      method:                 'POST',
      grant_type:             'authorization_code',
      redirect_uri_sent:      redirectUri,
      client_id_prefix:       clientId.slice(0, 12) + '...',
      code_masked:            mask(code, 6, 4),
      code_verifier_masked:   mask(codeVerifier, 4, 4),
    };
    console.info('[EXCHANGE][AUDIT] GOOGLE_REQUEST:', JSON.stringify(audit.google_request));

    const T_GOOGLE_START = Date.now();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(googleRequestPayload),
    });
    const T_GOOGLE_MS = Date.now() - T_GOOGLE_START;

    // ── GOOGLE RESPONSE ─────────────────────────────────────────────
    const tokenData = await tokenRes.json();

    audit.google_response = {
      httpStatusCode:         tokenRes.status,
      httpStatusText:         tokenRes.statusText,
      durationMs:             T_GOOGLE_MS,
      ok:                     tokenRes.ok,
      error:                  tokenData.error             ?? null,
      error_description:      tokenData.error_description ?? null,
      // If it succeeded, summarize (never log token values):
      has_access_token:       !!(tokenData.access_token),
      has_refresh_token:      !!(tokenData.refresh_token),
      has_id_token:           !!(tokenData.id_token),
      token_type:             tokenData.token_type   ?? null,
      expires_in:             tokenData.expires_in   ?? null,
      scope:                  tokenData.scope        ?? null,
      access_token_prefix:    tokenData.access_token  ? tokenData.access_token.slice(0, 10) + '...' : null,
      refresh_token_length:   tokenData.refresh_token ? tokenData.refresh_token.length : null,
      // Full body only when it is an error (no sensitive tokens in error responses)
      full_body_on_error:     !tokenRes.ok ? tokenData : '[SUCCESS — body suppressed for security]',
    };
    console.info('[EXCHANGE][AUDIT] GOOGLE_RESPONSE:', JSON.stringify(audit.google_response));

    // ── FAILURE PATH ────────────────────────────────────────────────
    if (!tokenRes.ok || tokenData.error) {
      audit.phase          = 'FAIL_GOOGLE_EXCHANGE';
      audit.total_ms       = Date.now() - START_MS;
      audit.diagnosis      = (
        tokenData.error === 'redirect_uri_mismatch' ? 'REDIRECT_URI_NOT_REGISTERED_IN_GOOGLE_CONSOLE' :
        tokenData.error === 'invalid_grant'          ? 'CODE_EXPIRED_OR_ALREADY_USED_OR_VERIFIER_MISMATCH' :
        tokenData.error === 'invalid_client'         ? 'CLIENT_ID_OR_SECRET_REJECTED' :
        tokenData.error === 'invalid_request'        ? 'MALFORMED_REQUEST_OR_APP_NOT_VERIFIED_IN_GOOGLE_CONSOLE' :
        tokenData.error === 'unauthorized_client'    ? 'CLIENT_NOT_AUTHORIZED_FOR_GRANT_TYPE' :
        `UNKNOWN_GOOGLE_ERROR: ${tokenData.error}`
      );
      console.error('[EXCHANGE][AUDIT] FAIL:', JSON.stringify(audit));
      return Response.json({
        error:  tokenData.error_description ?? tokenData.error ?? 'Token exchange failed',
        audit,
      }, { status: 400 });
    }

    // ── SUCCESS PATH ────────────────────────────────────────────────
    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Fetch user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json();
    audit.profile = {
      email:       profile.email       ?? null,
      displayName: profile.name        ?? null,
      hasAvatar:   !!(profile.picture),
      profileOk:   profileRes.ok,
    };

    const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;

    // Store refresh_token securely
    let entityOp = 'NONE';
    if (refresh_token) {
      const existing = await base44.asServiceRole.entities.GoogleOAuthToken.filter({
        user_id: user.id,
        workspace_id: workspaceId,
      });
      const record = {
        user_id:      user.id,
        workspace_id: workspaceId,
        refresh_token,
        email:        profile.email ?? '',
        scopes:       scope ?? '',
        updated_at:   new Date().toISOString(),
      };
      if (existing.length > 0) {
        await base44.asServiceRole.entities.GoogleOAuthToken.update(existing[0].id, record);
        entityOp = 'UPDATED';
      } else {
        await base44.asServiceRole.entities.GoogleOAuthToken.create(record);
        entityOp = 'CREATED';
      }
    }

    audit.entity_operation = entityOp;
    audit.phase            = 'SUCCESS';
    audit.total_ms         = Date.now() - START_MS;
    console.info('[EXCHANGE][AUDIT] SUCCESS:', JSON.stringify(audit));

    return Response.json({
      accessToken:     access_token,
      expiresAt,
      expiresIn:       expires_in ?? 3600,
      email:           profile.email ?? '',
      displayName:     profile.name ?? '',
      avatarUrl:       profile.picture ?? '',
      scopes:          (scope ?? '').split(' ').filter(Boolean),
      hasRefreshToken: !!refresh_token,
      _audit:          audit,   // ← included in response so frontend can log it too
    });

  } catch (error) {
    const err = error as Error;
    audit.phase      = 'EXCEPTION';
    audit.total_ms   = Date.now() - START_MS;
    audit.exception  = {
      message: err.message,
      stack:   err.stack ?? null,
    };
    console.error('[EXCHANGE][AUDIT] EXCEPTION:', JSON.stringify(audit));
    return Response.json({ error: err.message, audit }, { status: 500 });
  }
});