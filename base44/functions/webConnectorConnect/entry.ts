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

      // ABORDAGEM DOM (100% confiável): preenche o form direto pelo DOM e
      // espera a navegação terminar ANTES de checar o resultado. Retorna o
      // URL final + se ainda há campo de senha, para decidir auth sem o
      // falso-positivo do snapshot durante redirect (o bug que marcava
      // "authed=true" no meio do POST e voltava pra /login com falha).
      const escapedEmail = JSON.stringify(email || '');
      const escapedPassword = JSON.stringify(password || '');
      let fillResult = 'unknown';
      try {
        const code = 'async (page) => {' +
          '  const pass = await page.$("input[type=password]");' +
          '  if (!pass) return JSON.stringify({ error: "no-password-field" });' +
          '  const formHandle = await pass.evaluateHandle((el) => el.closest("form"));' +
          '  const formEl = formHandle && formHandle.asElement ? formHandle.asElement() : null;' +
          '  const emailSelector = "input[type=email], input[name=username], input[name=email], input[type=text]";' +
          '  let emailEl = formEl ? await formEl.$(emailSelector) : null;' +
          '  if (!emailEl) emailEl = await page.$(emailSelector);' +
          '  if (!emailEl) return JSON.stringify({ error: "no-email-field" });' +
          '  await emailEl.fill(' + escapedEmail + ');' +
          '  await pass.fill(' + escapedPassword + ');' +
          '  let submitBtn = formEl ? await formEl.$("button[type=submit], input[type=submit]") : null;' +
          '  if (!submitBtn) submitBtn = await page.$("button[type=submit], input[type=submit]");' +
          '  if (!submitBtn) submitBtn = formEl ? await formEl.$("button") : null;' +
          '  if (submitBtn) {' +
          '    await Promise.all([' +
          '      page.waitForNavigation({ waitUntil: "load", timeout: 10000 }).catch(() => {}),' +
          '      submitBtn.click(),' +
          '    ]);' +
          '  } else {' +
          '    await Promise.all([' +
          '      page.waitForNavigation({ waitUntil: "load", timeout: 10000 }).catch(() => {}),' +
          '      pass.press("Enter"),' +
          '    ]);' +
          '  }' +
          '  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});' +
          '  const finalUrl = page.url();' +
          '  const stillHasPass = await page.$("input[type=password]");' +
          '  const alertText = await page.evaluate(() => {' +
          '    const a = document.querySelector(".flash, .alert, [role=alert], #flash");' +
          '    return a ? a.textContent.trim().slice(0, 300) : "";' +
          '  });' +
          '  return JSON.stringify({ url: finalUrl, stillHasPassword: !!stillHasPass, alert: alertText });' +
          '}';
        const res = await callMcp('browser_run_code_unsafe', { code });
        fillResult = extractRunCodeText(res);
      } catch (e) {
        return Response.json({ error: 'DOM login fill failed: ' + e.message }, { status: 502 });
      }

      let loginOutcome = null;
      try {
        let candidate = fillResult;
        const m = candidate.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        if (m) candidate = m[1];
        candidate = candidate.trim();
        loginOutcome = JSON.parse(candidate);
        // Handle double-encoding: MCP pode devolver o JSON.stringify() do
        // retorno como uma string JSON codificada de novo -> parse resulta
        // em string. Parse de novo pra obter o objeto real.
        if (typeof loginOutcome === 'string') {
          loginOutcome = JSON.parse(loginOutcome);
        }
      } catch (e) { /* best-effort: fallback via snapshot abaixo */ }

      if (loginOutcome && (loginOutcome.error === 'no-password-field' || loginOutcome.error === 'no-email-field')) {
        const snap = await callMcp('browser_snapshot', {});
        const snapshotText = extractSnapshotText(snap);
        return Response.json({ ok: false, error: 'Login form not found on page (DOM check: ' + loginOutcome.error + '). Verifique se a URL da sessão é a página de login.', snapshotText: snapshotText.slice(0, 4000) }, { status: 422 });
      }

      // Decide authed de forma confiável: o submit já esperou a navegação
      // terminar. authed = true só se NÃO há mais campo de senha E o URL
      // final não é mais /login. Se voltou pra /login (credenciais erradas),
      // stillHasPassword=true ou url tem /login -> authed=false.
      let authed = false;
      if (loginOutcome && loginOutcome.url) {
        const urlHasLogin = /\/login/.test(loginOutcome.url);
        authed = !loginOutcome.stillHasPassword && !urlHasLogin;
      }

      const postSnap = await callMcp('browser_snapshot', {});
      const postSnapshotText = extractSnapshotText(postSnap);

      // Fallback: se o parse do DOM falhou (double-encoding que não resolveu),
      // checa o snapshot pós-login por marcadores positivos de auth (logout/
      // welcome/secure area) sem campo de senha. É o caso do the-internet
      // onde o DOM retorna corretamente mas o JSON vem codificado de forma
      // que não parseia — o snapshot é a fonte de verdade visual.
      if (!authed) {
        const hasAuthMarker = /log\s*out|sign\s*out|logout|welcome|secure area|you logged into/i.test(postSnapshotText);
        const stillOnLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(postSnapshotText);
        if (hasAuthMarker && !stillOnLogin) {
          authed = true;
        }
      }
      session._loginVerified = authed;

      const loginVerified = session._loginVerified === true;
      const stillShowsLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(postSnapshotText);
      const alertMsg = (loginOutcome && loginOutcome.alert) || '';

      // Se voltou pro login com mensagem de erro, inclui no retorno pra
      // o usuario saber que foram credenciais invalidas (nao bug do sistema).
      if (!loginVerified && alertMsg) {
        return Response.json({
          ok: false,
          webSessionId: session.id,
          status: 'pending_login',
          snapshotText: postSnapshotText.slice(0, 8000),
          loginVerified: false,
          message: 'Login falhou — o site retornou à página de login: "' + alertMsg + '". Verifique se as credenciais estão corretas.',
        });
      }

      // Marca que a operacao login foi tentada — o confirm exige este
      // marcador (last_used_at) para gravar a sessao. Sem isto, um usuario
      // que faz start na URL base (sem /login) e clica confirm direto ativa
      // uma sessao sem nenhum cookie de auth (o bug reportado).
      //
      // Também atualiza site_url para a URL autenticada real (ex: /secure em
      // vez de /login). Sem isto, a operação use reusa cookies mas navega de
      // volta pra /login — que obviamente mostra o formulário e falsamente
      // reporta a sessão como expirada. A URL final vem do header "Page URL:"
      // do snapshot pós-login (loginOutcome.url pode estar undefined se o
      // parse DOM falhou — ver bug do double-encoding).
      if (loginVerified) {
        let finalUrl = '';
        if (loginOutcome && loginOutcome.url) {
          finalUrl = loginOutcome.url;
        } else {
          const urlMatch = postSnapshotText.match(/Page URL:\s*(\S+)/);
          if (urlMatch) finalUrl = urlMatch[1];
        }

        // Captura os cookies AGORA — neste exato momento o context ativo
        // tem o cookie de auth HttpOnly (ex: rack.session do the-internet).
        // O confirm é uma chamada backend SEPARADA e o Playwright MCP pode
        // não persistir o context entre chamadas, perdendo o cookie de auth
        // e deixando só cookies de analytics (o bug que vimos: 4 cookies
        // optimizely, zero rack.session). Capturar aqui, na mesma chamada
        // que verificou auth, garante que os cookies reais de sessão ficam
        // salvos para reuso posterior.
        let capturedCookies = '[]';
        try {
          const cookieResult = await callMcp('browser_run_code_unsafe', {
            code: 'async (page) => { const cookies = await page.context().cookies(); return JSON.stringify(cookies); }',
          });
          const cookieText = extractRunCodeText(cookieResult);
          const cm = cookieText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, cookieText];
          let parsedCookies = JSON.parse((cm[1] || cookieText).trim());
          if (typeof parsedCookies === 'string') parsedCookies = JSON.parse(parsedCookies);
          capturedCookies = JSON.stringify(parsedCookies);
        } catch (e) { /* best-effort: segue sem cookies */ }

        const updateData = { last_used_at: new Date().toISOString() };
        if (capturedCookies !== '[]') updateData.cookies = capturedCookies;
        if (finalUrl && finalUrl !== session.site_url && !/\/login/.test(finalUrl)) {
          updateData.site_url = finalUrl;
        }
        try {
          await withTimeout(base44.entities.WebSession.update(session.id, updateData), SDK_TIMEOUT_MS, 'session_mark_login');
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

      // Verificação de segurança: re-navega para a URL autenticada da sessão
      // e exige marcadores POSITIVOS de auth (logout/secure area/welcome) sem
      // campo de senha antes de capturar cookies. Antes só checava ausência
      // de campo de senha — mas about:blank ou um contexto resetado também
      // não tem campo de senha, e a captura vinha só com cookies de analytics
      // (sem o cookie de auth HttpOnly, ex: rack.session do the-internet).
      // Re-navegar garante que o context ativo tem o cookie de auth real.
      try {
        await callMcp('browser_navigate', { url: session.site_url });
        try { await callMcp('browser_wait_for', { time: 2 }); } catch (e) { /* best-effort */ }
      } catch (e) { /* best-effort: segue com snapshot do estado atual */ }

      let preSnapText = '';
      try {
        const preSnap = await callMcp('browser_snapshot', {});
        preSnapText = extractSnapshotText(preSnap);
      } catch (e) { /* best-effort: segue para captura mesmo se snapshot falhar */ }
      const preHasLoginField = /(?:password|senha)[^\n]*?\[ref=/i.test(preSnapText);
      const preHasAuthMarker = /log\s*out|sign\s*out|logout|welcome|secure area|you logged into/i.test(preSnapText);
      if (preHasLoginField || !preHasAuthMarker) {
        return Response.json({
          error: preHasLoginField
            ? 'Página atual ainda mostra campos de login — o login não foi concluído. Volte e preencha as credenciais (opção Entrar) antes de confirmar.'
            : 'Não foi possível confirmar autenticação na página (sem marcadores como Logout/Secure Area). O login pode não ter persistido — refaça start+login e tente confirmar imediatamente.',
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

    // ── operation: use ───────────────────────────────────────────────
    // Reusa uma WebSession ativa: injeta os cookies salvos num novo contexto
    // Playwright e navega para a URL do site, verificando se a sessão ainda
    // é válida (não redirecionou para login). Sem isto, os cookies capturados
    // na operação confirm nunca são reutilizados — a sessão "ativa" não serve
    // pra nada na prática. Esta é a operação que fecha o critério de aceite
    // "Segunda chamada à mesma sessão reutiliza cookies salvos" do RFC-012.
    if (operation === 'use') {
      const { webSessionId } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      const session = await withTimeout(base44.entities.WebSession.get(webSessionId), SDK_TIMEOUT_MS, 'session_get');
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.status !== 'active') {
        return Response.json({ error: 'WebSession is not active (status: ' + session.status + '). Reautentique via start+login+confirm.' }, { status: 409 });
      }

      let cookies = [];
      try {
        cookies = JSON.parse(session.cookies || '[]');
      } catch (e) {
        return Response.json({ error: 'Stored cookies are corrupted: ' + e.message }, { status: 500 });
      }
      if (!Array.isArray(cookies) || cookies.length === 0) {
        return Response.json({ error: 'No cookies stored in this WebSession.' }, { status: 409 });
      }

      // Limpa qualquer browser/sessão pendurada de runs anteriores.
      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

      // Navegação inicial para a URL do site — estabelece um page/context
      // para o domínio alvo (necessário antes de addCookies, que opera no
      // context ativo). Sem cookies, provavelmente redireciona pra /login,
      // mas isso é esperado e irrelevante — só precisamos do context.
      try {
        await callMcp('browser_navigate', { url: session.site_url });
        try { await callMcp('browser_wait_for', { time: 1 }); } catch (e) { /* best-effort */ }
      } catch (e) { /* best-effort: segue para injeção mesmo se redirecionou */ }

      // Tudo numa ÚNICA chamada browser_run_code_unsafe para garantir que
      // addCookies e a navegação final operam no MESMO page.context().
      // Tentativas anteriores com addCookies numa chamada e browser_navigate
      // em outra falharam porque o MCP pode criar/rotacionar contextos entre
      // chamadas, perdendo os cookies injetados. Aqui o contexto é o mesmo
      // durante toda a execução da função.
      const escapedCookies = JSON.stringify(cookies);
      const escapedSiteUrl = JSON.stringify(session.site_url);
      let useResult = '';
      try {
        const code = 'async (page) => {' +
          '  await page.context().addCookies(' + escapedCookies + ');' +
          '  await page.goto(' + escapedSiteUrl + ', { waitUntil: "load", timeout: 15000 }).catch(() => {});' +
          '  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});' +
          '  const finalUrl = page.url();' +
          '  const stillHasPass = await page.$("input[type=password]");' +
          '  const alertText = await page.evaluate(() => {' +
          '    const a = document.querySelector(".flash, .alert, [role=alert], #flash");' +
          '    return a ? a.textContent.trim().slice(0, 300) : "";' +
          '  });' +
          '  return JSON.stringify({ url: finalUrl, stillHasPassword: !!stillHasPass, alert: alertText });' +
          '}';
        const res = await callMcp('browser_run_code_unsafe', { code });
        useResult = extractRunCodeText(res);
      } catch (e) {
        return Response.json({ error: 'Cookie injection + navigation failed: ' + e.message }, { status: 502 });
      }

      let useOutcome = null;
      try {
        let candidate = useResult;
        const m = candidate.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        if (m) candidate = m[1];
        candidate = candidate.trim();
        useOutcome = JSON.parse(candidate);
        if (typeof useOutcome === 'string') useOutcome = JSON.parse(useOutcome);
      } catch (e) { /* best-effort: fallback via snapshot abaixo */ }

      const snap = await callMcp('browser_snapshot', {});
      const snapshotText = extractSnapshotText(snap);

      // Verifica se a sessão ainda é válida: se a página mostra campos de
      // login (senha), a sessão expirou e precisa reautenticar. Marcadores
      // positivos (logout/secure area/welcome) sem campo de senha = válida.
      // Combina o resultado do DOM (useOutcome) com o snapshot pós-navegação
      // para robustez — mesmo padrão do login (double-encoding + fallback).
      let stillOnLogin = /(?:password|senha)[^\n]*?\[ref=/i.test(snapshotText);
      let hasAuthMarker = /log\s*out|sign\s*out|logout|welcome|secure area|you logged into/i.test(snapshotText);
      if (useOutcome && useOutcome.url) {
        const urlHasLogin = /\/login/.test(useOutcome.url);
        if (useOutcome.stillHasPassword || urlHasLogin) stillOnLogin = true;
        else if (!stillOnLogin) hasAuthMarker = true;
      }
      const stillValid = !stillOnLogin && hasAuthMarker;

      // Atualiza last_used_at se a sessão foi reutilizada com sucesso.
      if (stillValid) {
        try {
          await withTimeout(base44.entities.WebSession.update(session.id, {
            last_used_at: new Date().toISOString(),
          }), SDK_TIMEOUT_MS, 'session_mark_use');
        } catch (e) { /* best-effort */ }
      }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        status: 'active',
        sessionValid: stillValid,
        snapshotText: snapshotText.slice(0, 8000),
        message: stillValid
          ? 'Sessão reutilizada com sucesso — cookies injetados e página carregada sem redirecionamento para login.'
          : 'Sessão parece ter expirado — a página redirecionou para o formulário de login. Reautentique via start+login+confirm.',
      });
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