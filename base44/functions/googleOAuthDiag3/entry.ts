/**
 * googleOAuthDiag3 — Tests the Drive API with the current valid access token
 * from googleOAuthRefresh. Captures the exact HTTP response from Google Drive.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const report = [];

    // STEP A: Get a fresh access token via refresh
    let accessToken = null;
    let refreshReport = {};
    try {
      const t0 = Date.now();
      const refreshRes = await base44.functions.invoke('googleOAuthRefresh', { workspaceId: 'default' });
      const d = refreshRes?.data ?? {};
      accessToken = d.accessToken ?? null;
      refreshReport = {
        status:         'OK',
        durationMs:     Date.now() - t0,
        hasAccessToken: !!(accessToken),
        errorField:     d.error ?? null,
        expiresAt:      d.expiresAt ?? null,
        expiresIn:      d.expiresIn ?? null,
        tokenPrefix:    accessToken ? accessToken.slice(0, 10) + '...' : null,
      };
    } catch (e) {
      refreshReport = { status: 'EXCEPTION', error: e.message };
    }
    report.push({ step: 'A', name: 'GET_FRESH_TOKEN_VIA_REFRESH', ...refreshReport });

    if (!accessToken) {
      return Response.json({ summary: 'FAIL_NO_ACCESS_TOKEN', report });
    }

    // STEP B: Call Drive API — files.list (simplest possible call)
    let driveListReport = {};
    try {
      const t0 = Date.now();
      const driveRes = await fetch(
        'https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id,name,mimeType,modifiedTime)&q=trashed%3Dfalse',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const durationMs = Date.now() - t0;
      const body       = await driveRes.json();

      driveListReport = {
        status:         driveRes.ok ? 'OK' : 'FAIL',
        httpStatusCode: driveRes.status,
        httpStatusText: driveRes.statusText,
        durationMs,
        hasFiles:       Array.isArray(body.files),
        fileCount:      Array.isArray(body.files) ? body.files.length : null,
        firstFileName:  Array.isArray(body.files) && body.files.length > 0 ? body.files[0].name : null,
        errorField:     body.error ?? null,
        errorMessage:   body.error?.message ?? null,
        errorCode:      body.error?.code     ?? null,
        errorStatus:    body.error?.status   ?? null,
        fullErrorBody:  driveRes.ok ? null : body,
      };
    } catch (e) {
      driveListReport = { status: 'EXCEPTION', error: e.message, stack: e.stack };
    }
    report.push({ step: 'B', name: 'DRIVE_API_FILES_LIST', ...driveListReport });

    // STEP C: Validate scopes via tokeninfo endpoint
    let scopeReport = {};
    try {
      const t0 = Date.now();
      const infoRes  = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
      const infoBody = await infoRes.json();
      scopeReport = {
        status:          infoRes.ok ? 'OK' : 'FAIL',
        httpStatusCode:  infoRes.status,
        durationMs:      Date.now() - t0,
        scope:           infoBody.scope           ?? null,
        email:           infoBody.email            ?? null,
        expiresIn:       infoBody.expires_in       ?? null,
        hasDriveScope:   infoBody.scope ? infoBody.scope.includes('drive') : false,
        hasGmailScope:   infoBody.scope ? infoBody.scope.includes('gmail') : false,
        hasCalendarScope:infoBody.scope ? infoBody.scope.includes('calendar') : false,
        errorField:      infoBody.error            ?? null,
        errorDescription:infoBody.error_description ?? null,
      };
    } catch (e) {
      scopeReport = { status: 'EXCEPTION', error: e.message };
    }
    report.push({ step: 'C', name: 'TOKEN_SCOPE_VALIDATION', ...scopeReport });

    // STEP D: Check the redirect_uri registered in Google Console
    // We test the REAL redirect_uri that the app uses in production
    const realRedirectUri = 'https://app.base44.com/oauth/google/callback'; // common Base44 domain
    let redirectUriReport = {
      step: 'D',
      name: 'REDIRECT_URI_ANALYSIS',
      note: 'This shows what redirect_uri the frontend will compute at runtime — must be registered in Google Console',
      commonBase44RedirectUri: realRedirectUri,
      googleConsoleAction: 'Verify this URI is listed under "Authorized redirect URIs" in Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs',
    };
    report.push(redirectUriReport);

    const failures = report.filter(r => r.status && !['OK'].includes(r.status));
    return Response.json({
      summary: {
        overallStatus:  failures.length > 0 ? 'FAIL' : 'PASS',
        firstFailure:   failures[0] ?? null,
        userId:         user.id,
        userEmail:      user.email,
      },
      report,
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});