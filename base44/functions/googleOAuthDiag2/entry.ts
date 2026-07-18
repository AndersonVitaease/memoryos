/**
 * googleOAuthDiag2 — Returns ONLY steps 2, 3, 4 (smaller payload, no truncation)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return Response.json({ error: 'MISSING_ENV_VARS', GOOGLE_CLIENT_ID: clientId ? 'PRESENT' : 'MISSING', GOOGLE_CLIENT_SECRET: clientSecret ? 'PRESENT' : 'MISSING' });
    }

    const DIAG_REDIRECT_URI = 'https://diagnostic-dry-run/oauth/google/callback';

    // STEP 2: Direct POST to Google — raw HTTP, no SDK wrapper
    const t0 = Date.now();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code:          'DIAG_FAKE_CODE',
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  DIAG_REDIRECT_URI,
        grant_type:    'authorization_code',
        code_verifier: 'DIAG_FAKE_VERIFIER',
      }),
    });
    const tokenBody   = await tokenRes.json();
    const step2DurationMs = Date.now() - t0;

    // STEP 3: Refresh via SDK
    let step3 = {};
    try {
      const t1 = Date.now();
      const refreshRes = await base44.functions.invoke('googleOAuthRefresh', { workspaceId: 'default' });
      step3 = {
        sdkResponseStatus: refreshRes?.status,
        data:              refreshRes?.data,
        durationMs:        Date.now() - t1,
        errorField:        refreshRes?.data?.error ?? null,
        hasAccessToken:    !!(refreshRes?.data?.accessToken),
      };
    } catch (e) {
      step3 = { exception: e.message, stack: e.stack };
    }

    // STEP 4: Entity audit
    let step4 = {};
    try {
      const records = await base44.asServiceRole.entities.GoogleOAuthToken.filter({
        user_id: user.id, workspace_id: 'default',
      });
      step4 = {
        recordCount:        records.length,
        hasRefreshToken:    records.length > 0 ? !!(records[0].refresh_token) : false,
        refreshTokenLength: records.length > 0 && records[0].refresh_token ? records[0].refresh_token.length : null,
        storedEmail:        records.length > 0 ? records[0].email     : null,
        storedScopes:       records.length > 0 ? records[0].scopes    : null,
        updatedAt:          records.length > 0 ? records[0].updated_at : null,
        status: records.length > 0 ? (records[0].refresh_token ? 'OK_HAS_REFRESH_TOKEN' : 'FAIL_NO_REFRESH_TOKEN_VALUE') : 'FAIL_NO_RECORD_FOUND',
      };
    } catch (e) {
      step4 = { exception: e.message };
    }

    return Response.json({
      step2_GOOGLE_TOKEN_ENDPOINT: {
        httpStatusCode:         tokenRes.status,
        httpStatusText:         tokenRes.statusText,
        googleErrorCode:        tokenBody.error             ?? null,
        googleErrorDescription: tokenBody.error_description ?? null,
        fullResponseBody:       tokenBody,
        durationMs:             step2DurationMs,
        diagnosis: (
          tokenBody.error === 'redirect_uri_mismatch' ? 'REDIRECT_URI_NOT_REGISTERED_IN_GOOGLE_CONSOLE' :
          tokenBody.error === 'invalid_client'        ? 'CLIENT_ID_OR_SECRET_REJECTED_BY_GOOGLE' :
          tokenBody.error === 'invalid_grant'         ? 'CODE_INVALID_AS_EXPECTED_FAKE_CODE_DIAG_OK' :
          tokenBody.error === 'unauthorized_client'   ? 'CLIENT_NOT_AUTHORIZED_FOR_GRANT_TYPE' :
          tokenBody.error                             ? `UNEXPECTED_GOOGLE_ERROR: ${tokenBody.error}` :
          'NO_ERROR_UNEXPECTED'
        ),
      },
      step3_REFRESH: step3,
      step4_ENTITY:  step4,
      userId:        user.id,
      userEmail:     user.email,
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});