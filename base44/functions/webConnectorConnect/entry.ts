/**
 * webConnectorConnect — Bootstrap de sessão do Web Connector (RFC-012).
 *
 * Arquivo isolado — não reaproveita nem edita bugHunterRun/entry.ts. Usa a
 * instância MCP dedicada 'playwright-web-connector' (porta 8932 na VPS),
 * separada do 'playwright-bug-hunter'.
 *
 * Operations:
 *   start   { siteUrl, siteName? }             -> navega, detecta campos de login, cria WebSession(pending_login)
 *   login   { webSessionId, email, password }  -> digita credenciais (não armazenadas), submete, retorna snapshot pós-login
 *   confirm { webSessionId }                   -> captura cookies (context.cookies() via Playwright), grava WebSession(active)
 *   revoke  { webSessionId }                   -> marca WebSession revoked
 *
 * SEGURANÇA (ADR-019, Adendo 2026-08-09): email/password só existem na
 * memória deste processo durante a operação 'login' — nunca são persistidos
 * em nenhuma entidade, nunca aparecem em console.log ou em campos salvos.
 * Apenas os cookies resultantes (operation 'confirm') viram WebSession.
 *
 * LIMITAÇÃO CONHECIDA (MVP): o servidor Playwright MCP mantém 1 browser
 * compartilhado por processo (mesmo padrão do playwright-bug-hunter) — só
 * um bootstrap de login por vez em todo o sistema. RFC-014 Fase 2 resolve
 * escalando com mais instâncias MCPServerConfig.
 *
 * NOTA: operation 'confirm' usa a tool 'browser_run_code_unsafe' (a única
 * exposta pelo @playwright/mcp atual para acessar context.cookies(), já que
 * document.cookie via browser_evaluate não vê cookies HttpOnly — perderia
 * justamente o cookie de sessão de auth na maioria dos sites). O snippet
 * executado é fixo, escrito por nós, e não recebe nenhum input do usuário.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { connect as mcpConnect, resolveHeaders as mcpResolveHeaders, tryRecoverResultFromError } from '../../shared/mcpClient.ts';

const PLAYWRIGHT_SERVER_NAME = 'playwright-web-connector';
const MCP_CALL_TIMEOUT_MS = 20000;
const SDK_TIMEOUT_MS = 8000;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30min — revalidável, ver WebSession.expires_at

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('MCP timeout (' + ms + 'ms): ' + label)), ms)),
  ]);
}

function extractSnapshotText(snap) {
  if (!snap) return '(no snapshot)';
  if (Array.isArray(snap.content)) return snap.content.map((c) => c.text || '').join('\n');
  if (typeof snap === 'string') return snap;
  return JSON.stringify(snap);
}

// Mesmo padrao do extractEvaluateText usado em bugHunterRun para
// browser_evaluate/browser_run_code_unsafe: o callMcp ja desembrulha o
// resultado (structuredContent ?? content ?? result), entao aqui `res` pode
// vir como array de content items, string, ou objeto cru. O tool as vezes
// envolve o valor de retorno num bloco "### Result\n<valor>\n### ...".
function extractRunCodeText(res) {
  let text;
  if (Array.isArray(res)) text = res.map((c) => c?.text || '').join('\n');
  else if (res && Array.isArray(res.content)) text = res.content.map((c) => c.text || '').join('\n');
  else if (typeof res === 'string') text = res;
  else text = JSON.stringify(res);
  const m = text.match(/### Result\n([\s\S]*?)(?:\n### |$)/);
  return m ? m[1].trim() : text.trim();
}

// Mesma heurística de extração de refs usada em bugHunterRun (regex sobre o
// snapshot de acessibilidade), reimplementada aqui de forma isolada — não
// importa de bugHunterRun para manter as duas funções desacopladas.
function extractLoginRefs(snapshotText) {
  const refs = {};
  if (!snapshotText || typeof snapshotText !== 'string') return refs;
  const emailMatch = snapshotText.match(/(?:textbox|input)[^\n]*?(?:email|e-mail|usu[aá]rio|username)[^\n]*?\[ref=(\w+)\]/i);
  if (emailMatch) refs.email = emailMatch[1];
  const passwordMatch = snapshotText.match(/(?:textbox|input)[^\n]*?(?:password|senha)[^\n]*?\[ref=(\w+)\]/i);
  if (passwordMatch) refs.password = passwordMatch[1];
  const submitMatch = snapshotText.match(/(?:button)[^\n]*?(?:Entrar|Login|Sign in|Acessar|Continuar|Log in)[^\n]*?\[ref=(\w+)\]/i);
  if (submitMatch) refs.submit = submitMatch[1];
  return refs;
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

    const servers = await base44.asServiceRole.entities.MCPServerConfig.filter({ name: PLAYWRIGHT_SERVER_NAME });
    if (servers.length === 0) return Response.json({ error: "MCPServerConfig '" + PLAYWRIGHT_SERVER_NAME + "' not found" }, { status: 404 });
    const server = servers[0];
    const { headers, error: headerError } = mcpResolveHeaders(server);
    if (headerError) return Response.json({ error: headerError }, { status: 500 });

    let mcpSession = null;
    try {
      mcpSession = await withTimeout(mcpConnect(server.server_url, headers), MCP_CALL_TIMEOUT_MS, 'mcpConnect');
    } catch (e) {
      return Response.json({ error: 'MCP connect failed: ' + e.message }, { status: 502 });
    }

    const callMcp = async (toolName, args = {}) => {
      let result;
      try {
        result = await withTimeout(mcpSession.client.callTool({ name: toolName, arguments: args }), MCP_CALL_TIMEOUT_MS, toolName);
      } catch (innerErr) {
        const recovered = tryRecoverResultFromError(innerErr);
        if (!recovered) throw innerErr;
        result = recovered;
      }
      if (result.isError) {
        const errMsg = result.content?.[0]?.text || 'Tool error';
        throw new Error(String(errMsg));
      }
      return result.structuredContent ?? result.content ?? result;
    };

    // ── operation: start ──────────────────────────────────────────────
    if (operation === 'start') {
      const { siteUrl, siteName } = body;
      if (!siteUrl) return Response.json({ error: 'Missing required field: siteUrl' }, { status: 400 });

      // Limpa qualquer sessão de browser pendurada (mesmo guardião do bugHunterRun).
      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort: sem sessao ativa e esperado */ }

      try {
        await callMcp('browser_navigate', { url: siteUrl });
        try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
      } catch (e) {
        return Response.json({ error: 'Navigate failed: ' + e.message }, { status: 502 });
      }

      const snap = await callMcp('browser_snapshot', {});
      const snapshotText = extractSnapshotText(snap);
      const detectedFields = extractLoginRefs(snapshotText);

      let session;
      try {
        session = await withTimeout(base44.entities.WebSession.create({
          site_url: siteUrl,
          site_name: siteName || '',
          browser_context_id: 'shared', // ver LIMITAÇÃO CONHECIDA no topo do arquivo
          status: 'pending_login',
        }), SDK_TIMEOUT_MS, 'session_create');
      } catch (e) {
        return Response.json({ error: 'Failed to create WebSession: ' + e.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: 'pending_login',
        snapshotText: snapshotText.slice(0, 8000),
        detectedFields,
      });
    }

    // ── operation: login ──────────────────────────────────────────────
    if (operation === 'login') {
      const { webSessionId, email, password } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      const session = await withTimeout(base44.entities.WebSession.get(webSessionId), SDK_TIMEOUT_MS, 'session_get');
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.status !== 'pending_login') {
        return Response.json({ error: 'WebSession is not pending_login (status: ' + session.status + ')' }, { status: 409 });
      }

      const snap = await callMcp('browser_snapshot', {});
      const snapshotText = extractSnapshotText(snap);
      const refs = extractLoginRefs(snapshotText);

      if (!refs.email || !refs.password) {
        return Response.json({ ok: false, error: 'Login fields not detected on current page', snapshotText: snapshotText.slice(0, 4000) }, { status: 422 });
      }

      try {
        // Credenciais transitam aqui só de passagem — nunca persistidas, nunca
        // logadas (ver ADR-019, Adendo 2026-08-09).
        await callMcp('browser_type', { target: refs.email, text: email || '' });
        if (refs.submit) {
          await callMcp('browser_type', { target: refs.password, text: password || '' });
          await callMcp('browser_click', { target: refs.submit, element: 'submit button' });
        } else {
          await callMcp('browser_type', { target: refs.password, text: password || '', submit: true });
        }
        // Espera a navegação concluir de fato (poll do URL/snapshot), nao so
        // um timer fixo. Sem isto, o snapshot pós-login pode ser tirado no
        // meio do redirect e o cookie de sessao (rack.session) ainda nao foi
        // emitido quando o confirm captura — resulta em WebSession active
        // mas sem cookie de auth (o bug que vimos no teste do herokuapp).
        let authed = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
          const s = await callMcp('browser_snapshot', {});
          const t = extractSnapshotText(s);
          // Heuristica de autenticacao: sumiu o campo de password E apareceu
          // indicio de area logada (logout/sign out/welcome/secure/flash).
          const stillOnLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(t);
          const hasAuthMarker = /log\s*out|sign\s*out|logout|welcome|secure area|you logged into/i.test(t);
          if (!stillOnLogin && hasAuthMarker) { authed = true; break; }
          if (!stillOnLogin) { authed = true; break; } // navegou pra fora do login
        }
        session._loginVerified = authed; // flag informal para a resposta
      } catch (e) {
        return Response.json({ error: 'Login submission failed: ' + e.message }, { status: 502 });
      }

      const postSnap = await callMcp('browser_snapshot', {});
      const postSnapshotText = extractSnapshotText(postSnap);
      const loginVerified = session._loginVerified === true;
      const stillShowsLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(postSnapshotText);

      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: 'pending_login',
        snapshotText: postSnapshotText.slice(0, 8000),
        loginVerified,
        message: loginVerified
          ? (stillShowsLogin
            ? 'Atenção: a página ainda mostra campos de login — o submit pode não ter funcionado. Revise antes de confirmar.'
            : 'Login parece ter funcionado (página saiu do formulário de login). Confirme para capturar a sessão.')
          : 'Não foi possível confirmar que o login ocorreu (página ainda no formulário). Revise o snapshot antes de confirmar.',
      });
    }

    // ── operation: confirm ────────────────────────────────────────────
    if (operation === 'confirm') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      const session = await withTimeout(base44.entities.WebSession.get(webSessionId), SDK_TIMEOUT_MS, 'session_get');
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });

      // Verificação de segurança: captura um snapshot antes dos cookies e
      // recusa o confirm se a página ainda está no formulário de login.
      // Evita gravar uma WebSession "active" sem cookie de auth (o bug do
      // teste do herokuapp, onde só vieram cookies de analytics).
      let preSnapText = '';
      try {
        const preSnap = await callMcp('browser_snapshot', {});
        preSnapText = extractSnapshotText(preSnap);
      } catch (e) { /* best-effort: segue para captura mesmo se snapshot falhar */ }
      if (/(?:password|senha)[^\n]*?\[ref=/i.test(preSnapText)) {
        return Response.json({
          error: 'Página atual ainda mostra campos de login — o login não foi concluído. Volte e preencha as credenciais (opção Entrar) antes de confirmar.',
          snapshotText: preSnapText.slice(0, 4000),
        }, { status: 409 });
      }

      let cookies = [];
      try {
        // browser_run_code_unsafe invoca `code` como __fn__(page) internamente
        // (revelado pelo erro "__fn__ is not a function" quando code virava um
        // valor em vez de funcao). code precisa AVALIAR para uma funcao que
        // recebe `page` como argumento.
        const result = await callMcp('browser_run_code_unsafe', {
          code: 'async (page) => { const cookies = await page.context().cookies(); return JSON.stringify(cookies); }',
        });
        const text = extractRunCodeText(result);
        // O valor de retorno e a string JSON.stringify(cookies) que a funcao
        // devolveu, possivelmente com aspas de codeblock markdown ao redor.
        const m = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, text];
        const candidate = (m[1] || text).trim();
        const parsed = JSON.parse(candidate);
        // Se o valor ja veio como string JSON dupla (JSON.stringify aninhado),
        // faz um segundo parse.
        cookies = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
      } catch (e) {
        return Response.json({ error: 'Cookie capture failed: ' + e.message }, { status: 502 });
      }

      const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();

      try {
        await withTimeout(base44.entities.WebSession.update(session.id, {
          status: 'active',
          cookies: JSON.stringify(cookies),
          last_used_at: new Date().toISOString(),
          expires_at: expiresAt,
        }), SDK_TIMEOUT_MS, 'session_update');
      } catch (e) {
        return Response.json({ error: 'Failed to persist session: ' + e.message }, { status: 500 });
      }

      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort: libera RAM na VPS */ }

      return Response.json({ ok: true, webSessionId: session.id, status: 'active', expiresAt });
    }

    // ── operation: revoke ─────────────────────────────────────────────
    if (operation === 'revoke') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      try {
        await withTimeout(base44.entities.WebSession.update(webSessionId, { status: 'revoked' }), SDK_TIMEOUT_MS, 'session_revoke');
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