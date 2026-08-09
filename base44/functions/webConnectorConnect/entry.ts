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
      const { siteUrl: rawSiteUrl, siteName } = body;
      if (!rawSiteUrl) return Response.json({ error: 'Missing required field: siteUrl' }, { status: 400 });

      // Normaliza: prependa https:// se o usuario colou sem protocolo
      // (ex: "the-internet.herokuapp.com" -> "https://the-internet.herokuapp.com").
      let siteUrl = rawSiteUrl.trim();
      if (!/^https?:\/\//i.test(siteUrl)) siteUrl = 'https://' + siteUrl;

      // Validação: rejeita URLs com espaços, sem domínio válido, ou que parecem
      // texto acidentalmente colado no campo (ex: mensagens de erro). Sem isto,
      // o Playwright tenta navegar pra "https://Login fields not detected..." e
      // falha com ERR_NAME_NOT_RESOLVED, criando loop de tentativas inúteis.
      try {
        const parsed = new URL(siteUrl);
        // Domínio precisa ter pelo menos um ponto e não conter espaços.
        if (!parsed.hostname || !parsed.hostname.includes('.') || /\s/.test(parsed.hostname)) {
          return Response.json({ error: 'URL inválida: "' + rawSiteUrl + '" não é um endereço válido. Use o formato site.com ou https://site.com.' }, { status: 400 });
        }
      } catch (e) {
        return Response.json({ error: 'URL inválida: "' + rawSiteUrl + '". Use o formato site.com ou https://site.com.' }, { status: 400 });
      }

      // Limpa qualquer sessão de browser pendurada (mesmo guardião do bugHunterRun).
      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort: sem sessao ativa e esperado */ }

      try {
        await callMcp('browser_navigate', { url: siteUrl });
        try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
      } catch (e) {
        return Response.json({ error: 'Navigate failed: ' + e.message }, { status: 502 });
      }

      let snap = await callMcp('browser_snapshot', {});
      let snapshotText = extractSnapshotText(snap);
      let detectedFields = extractLoginRefs(snapshotText);

      // Se não achou campos de login e a URL não termina em /login, tenta
      // automaticamente URL + '/login' (evita o usuário ter que lembrar de
      // colar a URL certa — base + /login é o padrão de 90% dos sites).
      let finalSiteUrl = siteUrl;
      if (!detectedFields.email && !detectedFields.password && !/\/login\/?$/.test(siteUrl)) {
        const tryLoginUrl = siteUrl.replace(/\/$/, '') + '/login';
        try {
          await callMcp('browser_navigate', { url: tryLoginUrl });
          try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
          snap = await callMcp('browser_snapshot', {});
          snapshotText = extractSnapshotText(snap);
          detectedFields = extractLoginRefs(snapshotText);
          if (detectedFields.email || detectedFields.password) finalSiteUrl = tryLoginUrl;
        } catch (e) { /* best-effort: mantém URL original */ }
      }

      let session;
      try {
        session = await withTimeout(base44.entities.WebSession.create({
          site_url: finalSiteUrl,
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

      // Garante que o browser está na URL de login da sessão. O Playwright MCP
      // pode ter reiniciado o browser entre a operação start e login (são
      // invocações separadas), deixando o snapshot em about:blank. Sem isto,
      // refs.email/password ficam vazios e o login falha.
      try {
        await callMcp('browser_navigate', { url: session.site_url });
        try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
      } catch (e) { /* best-effort: segue com snapshot do estado atual */ }

      // ABORDAGEM DOM (100% confiável): em vez de depender da regex sobre o
      // snapshot de acessibilidade (que falha em sites como the-internet onde
      // o label "Username" não casa com o padrão esperado, criando loop de
      // "Login fields not detected"), preenchemos o formulário direto pelo
      // DOM via browser_run_code_unsafe. Acha input[type=password] + o input
      // de texto/email mais próximo, preenche, e submete o form. Mesmo padrão
      // do typeViaEvaluate do bugHunterRun.
      const escapedEmail = JSON.stringify(email || '');
      const escapedPassword = JSON.stringify(password || '');
      let fillResult = 'unknown';
      try {
        const code = 'async (page) => {' +
          '  const pass = await page.$("input[type=password]");' +
          '  if (!pass) return "no-password-field";' +
          '  const form = await pass.evaluate((el) => el.closest("form"));' +
          '  const emailSelector = "input[type=email], input[name=username], input[name=email], input[type=text]";' +
          '  let emailEl = form ? await form.$(emailSelector) : null;' +
          '  if (!emailEl) emailEl = await page.$(emailSelector);' +
          '  if (!emailEl) return "no-email-field";' +
          '  await emailEl.fill(' + escapedEmail + ');' +
          '  await pass.fill(' + escapedPassword + ');' +
          '  let submitBtn = form ? await form.$("button[type=submit], input[type=submit], button") : null;' +
          '  if (!submitBtn) submitBtn = await page.$("button[type=submit], input[type=submit]");' +
          '  if (submitBtn) { await submitBtn.click(); return "submitted-click"; }' +
          '  await pass.press("Enter");' +
          '  return "submitted-enter";' +
          '}';
        const res = await callMcp('browser_run_code_unsafe', { code });
        fillResult = extractRunCodeText(res);
      } catch (e) {
        return Response.json({ error: 'DOM login fill failed: ' + e.message }, { status: 502 });
      }

      if (/no-password-field|no-email-field/.test(fillResult)) {
        const snap = await callMcp('browser_snapshot', {});
        const snapshotText = extractSnapshotText(snap);
        return Response.json({ ok: false, error: 'Login form not found on page (DOM check: ' + fillResult + '). Verifique se a URL da sessão é a página de login.', snapshotText: snapshotText.slice(0, 4000) }, { status: 422 });
      }

      // Espera a navegação concluir de fato (poll do URL/snapshot), nao so
      // um timer fixo. Sem isto, o snapshot pós-login pode ser tirado no
      // meio do redirect e o cookie de sessao (rack.session) ainda nao foi
      // emitido quando o confirm captura — resulta em WebSession active
      // mas sem cookie de auth (o bug que vimos no teste do herokuapp).
      let authed = false;
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
          const s = await callMcp('browser_snapshot', {});
          const t = extractSnapshotText(s);
          const stillOnLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(t);
          const hasAuthMarker = /log\s*out|sign\s*out|logout|welcome|secure area|you logged into/i.test(t);
          if (!stillOnLogin && hasAuthMarker) { authed = true; break; }
          if (!stillOnLogin) { authed = true; break; }
        }
      } catch (e) { /* best-effort: o snapshot pode falhar durante redirect */ }
      session._loginVerified = authed;

      const postSnap = await callMcp('browser_snapshot', {});
      const postSnapshotText = extractSnapshotText(postSnap);
      const loginVerified = session._loginVerified === true;
      const stillShowsLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(postSnapshotText);

      // Marca que a operacao login foi tentada — o confirm exige este
      // marcador (last_used_at) para gravar a sessao. Sem isto, um usuario
      // que faz start na URL base (sem /login) e clica confirm direto ativa
      // uma sessao sem nenhum cookie de auth (o bug reportado).
      if (loginVerified) {
        try {
          await withTimeout(base44.entities.WebSession.update(session.id, {
            last_used_at: new Date().toISOString(),
          }), SDK_TIMEOUT_MS, 'session_mark_login');
        } catch (e) { /* best-effort: nao bloqueia o retorno do login */ }
      }

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

      // Guarda: o confirm só é permitido se a operação 'login' foi chamada
      // antes (marca last_used_at). Sem isto, um start na URL base + confirm
      // direto ativa uma sessão sem cookie de auth — exatamente o bug que
      // vimos no teste do herokuapp.
      if (!session.last_used_at) {
        return Response.json({
          error: 'Login ainda não foi executado. Use a opção "Entrar" para preencher credenciais antes de confirmar a sessão.',
        }, { status: 409 });
      }

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