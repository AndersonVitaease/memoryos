/**
 * webConnectorExtension — Backend da Extensao Chrome (RFC-015 adendo, Sprint 1).
 *
 * Diferente do webConnectorConnect (Playwright headless) e do webConnectorLive
 * (Selenium/noVNC), esta funcao NAO orquestra nenhum browser. A extensao roda
 * dentro do Chrome real do usuario (que o Cloudflare/anti-bot ja aceitou), e o
 * backend vira so persistencia + coordenacao. A "sessao" deixa de ser cookies
 * guardados no backend e passa a ser a aba ativa do usuario.
 *
 * Sprint 1 — operations implementadas aqui:
 *   registerSession { siteUrl, siteName?, tabId? } -> cria WebSession(status=active, source=extension)
 *   heartbeat       { webSessionId }               -> atualiza last_used_at (mantem viva; sweep detecta aba fechada por falta de heartbeat)
 *   revoke          { webSessionId }               -> marca WebSession revoked (extensao fechou a aba / usuario desconectou)
 *
 * Sprints 2/3 (descoberta + execucao) virao aditivamente neste mesmo arquivo.
 *
 * Seguranca (ADR-019): nenhum cookie de auth e persistido aqui na origem
 * 'extension' — a sessao e a propria aba do usuario, nao cookies guardados.
 * O campo `source` distingue as tres origens para o roteamento do planner.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30min — mesmo TTL das outras origens

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { operation } = body;
    if (!operation) return Response.json({ error: 'Missing required field: operation' }, { status: 400 });

    // ── operation: registerSession ───────────────────────────────────
    if (operation === 'registerSession') {
      const { siteUrl: rawSiteUrl, siteName, tabId } = body;
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

      const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
      let session;
      try {
        session = await base44.entities.WebSession.create({
          site_url: siteUrl,
          site_name: siteName || '',
          browser_context_id: tabId ? String(tabId) : 'extension-tab',
          status: 'active',
          source: 'extension',
          last_used_at: new Date().toISOString(),
          expires_at: expiresAt,
        });
      } catch (e) {
        return Response.json({ error: 'Failed to create WebSession: ' + e.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: 'active',
        source: 'extension',
        siteUrl,
        expiresAt,
      });
    }

    // ── operation: heartbeat ──────────────────────────────────────────
    // Atualiza last_used_at. O workflow Web Session Sweep (existente) ja
    // marca sessoes sem uso recente como expired — so precisava de um
    // sinal de "ainda viva", que e o heartbeat periodico da extensao.
    if (operation === 'heartbeat') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') {
        return Response.json({ error: 'WebSession is not an extension session (source: ' + session.source + ')' }, { status: 409 });
      }
      if (session.status !== 'active') {
        return Response.json({ error: 'WebSession is not active (status: ' + session.status + ')' }, { status: 409 });
      }

      const newExpiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
      try {
        await base44.entities.WebSession.update(webSessionId, {
          last_used_at: new Date().toISOString(),
          expires_at: newExpiresAt,
        });
      } catch (e) {
        return Response.json({ error: 'Failed to update WebSession: ' + e.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        webSessionId,
        status: 'active',
        lastUsedAt: new Date().toISOString(),
        expiresAt: newExpiresAt,
      });
    }

    // ── operation: revoke ─────────────────────────────────────────────
    if (operation === 'revoke') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const session = await base44.entities.WebSession.get(webSessionId);
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.source !== 'extension') {
        return Response.json({ error: 'WebSession is not an extension session (source: ' + session.source + ')' }, { status: 409 });
      }
      try {
        await base44.entities.WebSession.update(webSessionId, { status: 'revoked' });
      } catch (e) {
        return Response.json({ error: 'Failed to revoke session: ' + e.message }, { status: 500 });
      }
      return Response.json({ ok: true, webSessionId, status: 'revoked' });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}