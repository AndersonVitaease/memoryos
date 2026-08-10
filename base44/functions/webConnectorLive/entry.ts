/**
 * webConnectorLive — Login ao vivo via Selenium/noVNC (RFC-015).
 *
 * Diferente do webConnectorConnect (Playwright MCP, login automatizado por DOM),
 * esta funcao proxyia para o launcher HTTP na VPS que gerencia um navegador
 * Chromium VISIVEL via noVNC. O usuario resolve CAPTCHA/2FA manualmente na janela
 * do browser e nos capturamos os cookies (HttpOnly incluido) apos o login.
 *
 * Operations:
 *   launch   { siteUrl, siteName? }   -> cria WebDriver session, navega, retorna noVNC URL + WebSession(pending_login)
 *   capture  { webSessionId }         -> captura cookies do WebDriver, grava WebSession(active)
 *   close    { webSessionId }         -> encerra WebDriver session, marca WebSession(revoked)
 *   status   { webSessionId }         -> retorna estado atual da WebSession
 *
 * Seguranca (ADR-019): o launcher roda atras de Caddy com X-Api-Key. As credenciais
 * de login do site alvo nunca passam por esta funcao — o usuario digita direto no
 * navegador live. Apenas os cookies resultantes sao persistidos na WebSession.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30min

function launcherBase() {
  const base = secrets.get('LIVE_BROWSER_LAUNCHER_URL');
  if (!base) return null;
  return base.replace(/\/+$/, '');
}

function apiKey() {
  return secrets.get('LIVE_BROWSER_API_KEY');
}

async function callLauncher(path, method, body) {
  const base = launcherBase();
  if (!base) throw new Error('LIVE_BROWSER_LAUNCHER_URL nao configurada.');
  const key = apiKey();
  if (!key) throw new Error('LIVE_BROWSER_API_KEY nao configurada.');
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const msg = data && data.error ? data.error : 'Launcher retornou ' + res.status;
    throw new Error(msg);
  }
  return data;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { operation } = body;
    if (!operation) return Response.json({ error: 'Missing required field: operation' }, { status: 400 });

    // ── operation: launch ─────────────────────────────────────────────
    if (operation === 'launch') {
      const { siteUrl: rawSiteUrl, siteName } = body;
      if (!rawSiteUrl) return Response.json({ error: 'Missing required field: siteUrl' }, { status: 400 });

      let siteUrl = String(rawSiteUrl).trim();
      if (!/^https?:\/\//i.test(siteUrl)) siteUrl = 'https://' + siteUrl;
      try {
        const parsed = new URL(siteUrl);
        if (!parsed.hostname || !parsed.hostname.includes('.') || /\s/.test(parsed.hostname)) {
          return Response.json({ error: 'URL invalida: "' + rawSiteUrl + '" nao e um endereco valido.' }, { status: 400 });
        }
      } catch (e) {
        return Response.json({ error: 'URL invalida: "' + rawSiteUrl + '".' }, { status: 400 });
      }

      let launchResult;
      try {
        launchResult = await callLauncher('/launch', 'POST', { url: siteUrl, siteName: siteName || '' });
      } catch (e) {
        return Response.json({ error: 'Launcher /launch falhou: ' + e.message }, { status: 502 });
      }

      let session;
      try {
        session = await base44.entities.WebSession.create({
          site_url: siteUrl,
          site_name: siteName || '',
          browser_context_id: launchResult.sessionId,
          status: 'pending_login',
        });
      } catch (e) {
        // best-effort: fecha a sessao do launcher se nao conseguimos persistir
        try { await callLauncher('/close', 'POST', { sessionId: launchResult.sessionId }); } catch (e2) { /* best-effort */ }
        return Response.json({ error: 'Failed to create WebSession: ' + e.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        launcherSessionId: launchResult.sessionId,
        novncUrl: launchResult.novncUrl,
        expiresAt: launchResult.expiresAt,
        status: 'pending_login',
      });
    }

    // ── operation: capture ────────────────────────────────────────────
    if (operation === 'capture') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.status !== 'pending_login') {
        return Response.json({ error: 'WebSession is not pending_login (status: ' + session.status + ')' }, { status: 409 });
      }
      const launcherSessionId = session.browser_context_id;
      if (!launcherSessionId) return Response.json({ error: 'No launcher session associated with this WebSession.' }, { status: 409 });

      let cookieResult;
      try {
        cookieResult = await callLauncher('/cookies', 'POST', { sessionId: launcherSessionId });
      } catch (e) {
        return Response.json({ error: 'Launcher /cookies falhou: ' + e.message }, { status: 502 });
      }

      const cookies = cookieResult.cookies;
      if (!Array.isArray(cookies) || cookies.length === 0) {
        return Response.json({ error: 'Nenhum cookie capturado — certifique-se de completar o login na janela live primeiro.' }, { status: 422 });
      }

      const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
      const updateData = {
        status: 'active',
        cookies: JSON.stringify(cookies),
        last_used_at: new Date().toISOString(),
        expires_at: expiresAt,
      };
      if (cookieResult.currentUrl && cookieResult.currentUrl !== session.site_url && !/\/login/i.test(cookieResult.currentUrl)) {
        updateData.site_url = cookieResult.currentUrl;
      }

      try {
        await base44.entities.WebSession.update(session.id, updateData);
      } catch (e) {
        return Response.json({ error: 'Failed to persist session: ' + e.message }, { status: 500 });
      }

      // Encerra a sessao do launcher — os cookies ja estao salvos, libera RAM na VPS.
      try { await callLauncher('/close', 'POST', { sessionId: launcherSessionId }); } catch (e) { /* best-effort */ }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: 'active',
        currentUrl: cookieResult.currentUrl || session.site_url,
        cookieCount: cookies.length,
        expiresAt,
      });
    }

    // ── operation: close ──────────────────────────────────────────────
    if (operation === 'close') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });

      if (session.browser_context_id) {
        try { await callLauncher('/close', 'POST', { sessionId: session.browser_context_id }); } catch (e) { /* best-effort */ }
      }
      try {
        await base44.entities.WebSession.update(webSessionId, { status: 'revoked' });
      } catch (e) {
        return Response.json({ error: 'Failed to revoke session: ' + e.message }, { status: 500 });
      }
      return Response.json({ ok: true, webSessionId, status: 'revoked' });
    }

    // ── operation: forceRelease ───────────────────────────────────────
    // Fix definitivo (2026-08-10): antes, se um usuario abandonasse o fluxo
    // de login live (fechou aba, caiu conexao, esqueceu de "Capturar sessao"),
    // a trava do launcher (max 1 sessao por vez) so liberava sozinha apos
    // 15min de TTL, e ninguem sem acesso SSH a VPS conseguia destravar antes
    // disso na pratica. Esta operacao e self-service: qualquer usuario
    // autenticado pode chamar para (1) mandar o launcher fechar QUALQUER
    // sessao pendurada (seguro, pois so existe 1 por vez no MVP) e (2) marcar
    // como revoked qualquer WebSession travada em pending_login. Usada pelo
    // botao "Liberar sessao travada" no frontend quando /launch retorna 409.
    if (operation === 'forceRelease') {
      let launcherResult = null;
      try {
        launcherResult = await callLauncher('/close', 'POST', { all: true });
      } catch (e) {
        // best-effort: mesmo se o launcher falhar, ainda limpamos o lado DB
        launcherResult = { error: e.message };
      }

      let revokedCount = 0;
      try {
        const stale = await base44.entities.WebSession.filter({ status: 'pending_login' });
        for (const s of (stale || [])) {
          try {
            await base44.entities.WebSession.update(s.id, { status: 'revoked' });
            revokedCount++;
          } catch (e) { /* best-effort: segue para a proxima */ }
        }
      } catch (e) { /* best-effort */ }

      return Response.json({
        ok: true,
        launcherClosed: launcherResult && typeof launcherResult.closedCount === 'number' ? launcherResult.closedCount : null,
        launcherError: launcherResult && launcherResult.error ? launcherResult.error : null,
        webSessionsRevoked: revokedCount,
        message: 'Trava liberada. Tente iniciar o navegador live novamente.',
      });
    }

    // ── operation: status ─────────────────────────────────────────────
    if (operation === 'status') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: session.status,
        siteUrl: session.site_url,
        expiresAt: session.expires_at,
        lastUsedAt: session.last_used_at,
      });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}