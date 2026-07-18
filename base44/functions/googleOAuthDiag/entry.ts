/**
 * googleOAuthDiag — Diagnostic Instrumentation v2
 * Calls googleOAuthInit (real), then directly calls Google token endpoint
 * with fake code to capture the EXACT error body Google returns.
 * Also audits the GoogleOAuthToken entity and refresh path.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const ts = () => new Date().toISOString();
    const report = [];

    // ── STEP 0: ENV AUDIT ──────────────────────────────────────────────────────
    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    report.push({
      step: 0, name: 'ENV_AUDIT', timestamp: ts(),
      GOOGLE_CLIENT_ID:                     clientId     ? 'PRESENT' : 'MISSING',
      GOOGLE_CLIENT_SECRET:                 clientSecret ? 'PRESENT' : 'MISSING',
      clientIdLength:                       clientId     ? clientId.length     : null,
      clientSecretLength:                   clientSecret ? clientSecret.length : null,
      clientIdPrefix:                       clientId     ? clientId.slice(0, 8) + '...' : null,
      clientIdEndsWithGoogleapisDotCom:     clientId     ? clientId.includes('.apps.googleusercontent.com') : false,
      status: (clientId && clientSecret) ? 'OK' : 'FAIL',
    });

    if (!clientId || !clientSecret) {
      return Response.json({ summary: { overallStatus: 'FAIL', firstFailure: { step: 0, name: 'ENV_AUDIT', error: 'Missing env vars' } }, report });
    }

    // ── STEP 1: googleOAuthInit (real invocation via SDK) ─────────────────────
    const DIAG_REDIRECT_URI = 'https://diagnostic-dry-run/oauth/google/callback';

    let step1 = { step: 1, name: 'googleOAuthInit', timestamp: ts(), status: 'PENDING' };
    let authUrlFromInit = null;
    let stateFromInit   = null;
    let codeVerifier    = null;

    try {
      const t0 = Date.now();
      const initRes = await base44.functions.invoke('googleOAuthInit', {
        scopes: [
          'openid',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/drive',
        ],
        redirectUri: DIAG_REDIRECT_URI,
      });
      const durationMs = Date.now() - t0;
      const d = initRes?.data ?? {};

      authUrlFromInit = d.authUrl ?? null;
      stateFromInit   = d.state   ?? null;
      codeVerifier    = d.codeVerifier ?? null;

      let parsedUrl = null;
      let urlParseError = null;
      if (authUrlFromInit) {
        try {
          const u = new URL(authUrlFromInit);
          parsedUrl = {
            host:            u.hostname,
            pathname:        u.pathname,
            redirect_uri:    u.searchParams.get('redirect_uri'),
            client_id_prefix: (u.searchParams.get('client_id') ?? '').slice(0, 12) + '...',
            scope:           u.searchParams.get('scope'),
            response_type:   u.searchParams.get('response_type'),
            access_type:     u.searchParams.get('access_type'),
            prompt:          u.searchParams.get('prompt'),
            has_code_challenge: !!(u.searchParams.get('code_challenge')),
            code_challenge_method: u.searchParams.get('code_challenge_method'),
          };
        } catch (e) { urlParseError = e.message; }
      }

      step1 = {
        ...step1,
        durationMs,
        sdkResponseStatus:   initRes?.status ?? 'UNKNOWN',
        rawDataKeys:         Object.keys(d),
        hasAuthUrl:          !!(d.authUrl),
        hasState:            !!(d.state),
        hasCodeVerifier:     !!(d.codeVerifier),
        hasRedirectUri:      !!(d.redirectUri),
        returnedRedirectUri: d.redirectUri ?? null,
        errorField:          d.error ?? null,
        parsedAuthUrl:       parsedUrl,
        urlParseError,
        status: d.error ? 'FAIL_FUNCTION_RETURNED_ERROR' : (d.authUrl ? 'OK' : 'FAIL_NO_AUTH_URL'),
      };
    } catch (err) {
      step1 = { ...step1, status: 'EXCEPTION', errorMessage: err.message, stack: err.stack };
    }
    report.push(step1);

    // ── STEP 2: Direct POST to Google token endpoint with fake code ───────────
    // This bypasses the SDK to get the raw HTTP response from Google.
    // Expected errors: "invalid_grant", "redirect_uri_mismatch", "invalid_client"
    let step2 = { step: 2, name: 'GOOGLE_TOKEN_ENDPOINT_DIRECT', timestamp: ts(), status: 'PENDING' };

    try {
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
          code_verifier: codeVerifier ?? 'DIAG_FAKE_VERIFIER',
        }),
      });
      const durationMs = Date.now() - t0;
      const body       = await tokenRes.json();

      step2 = {
        ...step2,
        durationMs,
        httpStatusCode:          tokenRes.status,
        httpStatusText:          tokenRes.statusText,
        responseBody:            body,
        googleErrorCode:         body.error              ?? null,
        googleErrorDescription:  body.error_description  ?? null,
        // Interpret the error
        diagnosis: (
          body.error === 'redirect_uri_mismatch'  ? 'REDIRECT_URI_NOT_REGISTERED_IN_GOOGLE_CONSOLE' :
          body.error === 'invalid_client'         ? 'CLIENT_ID_OR_SECRET_REJECTED_BY_GOOGLE' :
          body.error === 'invalid_grant'          ? 'CODE_INVALID_AS_EXPECTED_FOR_DIAG_FAKE_CODE' :
          body.error === 'unauthorized_client'    ? 'OAUTH_CLIENT_NOT_AUTHORIZED_FOR_THIS_GRANT_TYPE' :
          body.error                              ? `UNEXPECTED_ERROR: ${body.error}` :
          'NO_ERROR_UNEXPECTED_SUCCESS'
        ),
        status: tokenRes.ok ? 'UNEXPECTED_SUCCESS' : 'EXPECTED_FAIL',
      };
    } catch (err) {
      step2 = { ...step2, status: 'EXCEPTION', errorMessage: err.message, stack: err.stack };
    }
    report.push(step2);

    // ── STEP 3: googleOAuthRefresh — test entity lookup path ─────────────────
    let step3 = { step: 3, name: 'googleOAuthRefresh', timestamp: ts(), status: 'PENDING' };
    try {
      const t0 = Date.now();
      const refreshRes = await base44.functions.invoke('googleOAuthRefresh', { workspaceId: 'default' });
      const durationMs = Date.now() - t0;
      const d = refreshRes?.data ?? {};
      step3 = {
        ...step3,
        durationMs,
        sdkResponseStatus: refreshRes?.status ?? 'UNKNOWN',
        rawDataKeys:       Object.keys(d),
        errorField:        d.error ?? null,
        hasAccessToken:    !!(d.accessToken),
        status: d.error ? 'FAIL_WITH_ERROR' : (d.accessToken ? 'OK_HAS_TOKEN' : 'FAIL_UNKNOWN'),
      };
    } catch (err) {
      step3 = { ...step3, status: 'EXCEPTION', errorMessage: err.message, stack: err.stack };
    }
    report.push(step3);

    // ── STEP 4: GoogleOAuthToken entity audit ─────────────────────────────────
    let step4 = { step: 4, name: 'ENTITY_AUDIT_GoogleOAuthToken', timestamp: ts(), status: 'PENDING' };
    try {
      const records = await base44.asServiceRole.entities.GoogleOAuthToken.filter({
        user_id: user.id, workspace_id: 'default',
      });
      step4 = {
        ...step4,
        recordCount:          records.length,
        hasRefreshToken:      records.length > 0 ? !!(records[0].refresh_token) : false,
        refreshTokenLength:   records.length > 0 && records[0].refresh_token ? records[0].refresh_token.length : null,
        storedEmail:          records.length > 0 ? records[0].email     : null,
        storedScopes:         records.length > 0 ? records[0].scopes    : null,
        updatedAt:            records.length > 0 ? records[0].updated_at : null,
        status: records.length > 0 ? (records[0].refresh_token ? 'OK' : 'FAIL_NO_REFRESH_TOKEN_VALUE') : 'FAIL_NO_RECORD_FOUND',
      };
    } catch (err) {
      step4 = { ...step4, status: 'EXCEPTION', errorMessage: err.message, stack: err.stack };
    }
    report.push(step4);

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    const failures = report.filter(s => s.status && !['OK', 'EXPECTED_FAIL', 'PENDING'].includes(s.status));
    const first    = failures[0] ?? null;

    return Response.json({
      summary: {
        overallStatus:  first ? 'FAIL' : 'PASS',
        firstFailure:   first ? { step: first.step, name: first.name, status: first.status, error: first.errorField ?? first.errorMessage ?? null } : null,
        userId:         user.id,
        userEmail:      user.email,
        timestamp:      ts(),
      },
      report,
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});