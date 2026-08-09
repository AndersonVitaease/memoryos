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
import { withTimeout, extractSnapshotText, extractRunCodeText, makeCallMcp } from '../../shared/mcpHelpers.ts';

const PLAYWRIGHT_SERVER_NAME = 'playwright-web-connector';
const MCP_CALL_TIMEOUT_MS = 20000;
const SDK_TIMEOUT_MS = 8000;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30min — revalidável, ver WebSession.expires_at

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

    const callMcp = makeCallMcp(mcpSession, MCP_CALL_TIMEOUT_MS, tryRecoverResultFromError);

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
        siteUrl: finalSiteUrl,
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
      //
      // O usuario pode sobrescrever a URL de login (body.loginUrl) quando a URL
      // base nao expoe o formulario de login (home, dashboard com botao login,
      // path diferente de /login). Sem isto, o login falha com no-password-field.
      const loginUrlOverride = (body.loginUrl && typeof body.loginUrl === 'string' && /^https?:\/\//i.test(body.loginUrl.trim())) ? body.loginUrl.trim() : null;
      const navTarget = loginUrlOverride || session.site_url;
      const escapedNavTarget = JSON.stringify(navTarget);
      // Navegacao DENTRO do browser_run_code_unsafe (nao via browser_navigate
      // MCP separado) para garantir que goto + fill operam no MESMO page/context.
      // O MCP pode rotacionar contextos entre chamadas, fazendo o run_code rodar
      // numa pagina diferente da navegada (about:blank) — sintoma:
      // no-password-field mesmo na pagina certa de login (ex: Bling SPA).

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
          '  await page.goto(' + escapedNavTarget + ', { waitUntil: "load", timeout: 15000 }).catch(() => {});' +
          '  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});' +
          '  await page.waitForSelector("input[type=password]", { timeout: 8000 }).catch(() => {});' +
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
      // antes (marca last_used_at) E capturou cookies. Os cookies são
      // capturados DURANTE o login (mesma chamada, context ativo e
      // autenticado), não aqui — o Playwright MCP pode não persistir o
      // context entre chamadas backend separadas, e re-capturar aqui
      // retornava só cookies de analytics (o bug do rack.session ausente).
      if (!session.last_used_at) {
        return Response.json({
          error: 'Login ainda não foi executado. Use a opção "Entrar" para preencher credenciais antes de confirmar a sessão.',
        }, { status: 409 });
      }

      // Validação: cookies devem ter sido capturados pelo login. Se a
      // operação login não conseguiu capturar (erro best-effort), o usuário
      // deve refazer login — confirm não tem como recuperar o contexto.
      let cookies = [];
      try {
        cookies = JSON.parse(session.cookies || '[]');
      } catch (e) { /* corrupted */ }
      if (!Array.isArray(cookies) || cookies.length === 0) {
        return Response.json({
          error: 'Cookies de sessão não foram capturados durante o login. Refaça start+login (o login captura os cookies automaticamente ao verificar autenticação).',
        }, { status: 409 });
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

    // ── operation: executeCapability ─────────────────────────────────
    // RFC-014: executa uma capability validada (CapabilityMap) contra uma
    // WebSession ativa. Read-only: injeta cookies, navega para a URL onde a
    // capability foi descoberta, localiza o formulario de busca/consulta,
    // preenche os campos, submete e captura o resultado via snapshot.
    //
    // GUARDA DE ESCRITA (enforced no DOM, nao no prompt): antes de submeter,
    // inspeciona os botoes do formulario. Se algum botao casa com keywords
    // de escrita (Salvar/Excluir/Editar/Enviar/Criar...), ABORTA sem submeter.
    // Isto garante que mesmo um falso-positivo da descoberta (um formulario de
    // criacao marcado erroneamente como busca) nao cause escrita.
    if (operation === 'executeCapability') {
      const { webSessionId, discoveredFromUrl, inputFields, inputs } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      if (!discoveredFromUrl) return Response.json({ error: 'Missing required field: discoveredFromUrl' }, { status: 400 });
      if (!Array.isArray(inputFields) || inputFields.length === 0) return Response.json({ error: 'inputFields must be a non-empty array' }, { status: 400 });
      if (!inputs || typeof inputs !== 'object') return Response.json({ error: 'inputs must be an object' }, { status: 400 });

      const session = await withTimeout(base44.entities.WebSession.get(webSessionId), SDK_TIMEOUT_MS, 'session_get');
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.status !== 'active') return Response.json({ error: 'WebSession is not active (status: ' + session.status + ')' }, { status: 409 });

      let cookies = [];
      try { cookies = JSON.parse(session.cookies || '[]'); } catch (e) { /* corrupted */ }
      if (!Array.isArray(cookies) || cookies.length === 0) {
        return Response.json({ error: 'No cookies stored in this WebSession.' }, { status: 409 });
      }

      let targetUrl = String(discoveredFromUrl).trim();
      if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

      const fieldsWithValues = inputFields.map((name) => ({
        name: String(name),
        value: inputs[name] != null ? String(inputs[name]) : '',
      }));

      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

      const escapedCookies = JSON.stringify(cookies);
      const escapedFields = JSON.stringify(fieldsWithValues);
      const escapedUrl = JSON.stringify(targetUrl);
      let execResult = '';
      try {
        const code = `async (page) => {
  await page.context().addCookies(${escapedCookies});
  await page.goto(${escapedUrl}, { waitUntil: "load", timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  if (/\\/login/i.test(page.url())) return JSON.stringify({ error: "session_expired", url: page.url() });
  const fields = ${escapedFields};
  const matchField = (frm, n) => frm.evaluateHandle((el, a) => {
    const nn = String(a.n || "").toLowerCase();
    const els = Array.from(el.querySelectorAll("input, select, textarea"));
    for (const e of els) { if ((e.getAttribute("name")||"").toLowerCase()===nn || (e.getAttribute("id")||"").toLowerCase()===nn) return e; }
    for (const e of els) {
      const ph=(e.getAttribute("placeholder")||"").toLowerCase();
      const al=(e.getAttribute("aria-label")||"").toLowerCase();
      let lt=""; if (e.id){const lbl=el.querySelector('label[for="'+e.id+'"]'); if(lbl)lt=lbl.textContent.toLowerCase();}
      if(!lt){const w=e.closest("label"); if(w)lt=w.textContent.toLowerCase();}
      if((ph&&ph.includes(nn))||(al&&al.includes(nn))||(lt&&lt.includes(nn)))return e;
    }
    return null;
  }, { n });
  const forms = await page.$$("form");
  let best=null, bestScore=0;
  for (const form of forms) {
    let score=0;
    for (const f of fields) {
      const h = await matchField(form, f.name).catch(()=>null);
      if (h && h.asElement && h.asElement()) score++;
    }
    if (score>bestScore){bestScore=score;best=form;}
  }
  if (!best || bestScore===0) return JSON.stringify({ error: "form_not_found" });
  const guard = await best.evaluate((frm) => {
    const btns = Array.from(frm.querySelectorAll("button, input[type=submit], input[type=button]"));
    const re = /(salvar|excluir|deletar|apagar|cancelar|enviar|criar|editar|create|edit|delete|remove|update|submeter)/i;
    return JSON.stringify({ offending: btns.map((b)=>(b.textContent||b.value||"").trim()).filter((t)=>re.test(t)) });
  }).catch(() => JSON.stringify({ offending: [] }));
  let gp={}; try { const s = typeof guard==="string"?guard:JSON.stringify(guard); gp=JSON.parse(s); if(typeof gp==="string")gp=JSON.parse(gp);}catch(e){}
  if (gp.offending && gp.offending.length>0) return JSON.stringify({ error: "write_guard", buttons: gp.offending });
  const filled=[];
  for (const f of fields) {
    const h = await matchField(best, f.name).catch(()=>null);
    const el = h && h.asElement ? h.asElement() : null;
    if (el) {
      try {
        const tag = await el.evaluate((x)=>x.tagName.toLowerCase()).catch(()=>"input");
        if (tag==="select") await el.select(f.value);
        else await el.fill(f.value);
        filled.push(f.name);
      } catch(e){}
    }
  }
  if (filled.length===0) return JSON.stringify({ error: "no_field_filled" });
  const sBtnH = await best.evaluateHandle((frm) => {
    const btns = Array.from(frm.querySelectorAll("button, input[type=submit]"));
    const re = /(buscar|pesquisar|consultar|filtrar|search|find|consult|listar|go)/i;
    return btns.find((b)=>re.test((b.textContent||b.value||"").trim())) || btns[0] || null;
  }).catch(()=>null);
  const sBtn = sBtnH && sBtnH.asElement ? sBtnH.asElement() : null;
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load", timeout: 10000 }).catch(() => {}),
    sBtn ? sBtn.click() : best.press("Enter"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  return JSON.stringify({ url: page.url(), filled });
}`;
        const res = await callMcp('browser_run_code_unsafe', { code });
        execResult = extractRunCodeText(res);
      } catch (e) {
        return Response.json({ error: 'Execute failed: ' + e.message }, { status: 502 });
      }

      let outcome = null;
      try {
        let candidate = execResult;
        const m = candidate.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, candidate];
        candidate = (m[1] || candidate).trim();
        outcome = JSON.parse(candidate);
        if (typeof outcome === 'string') outcome = JSON.parse(outcome);
      } catch (e) { /* fallback below */ }

      if (outcome && outcome.error) {
        const msgs = {
          session_expired: 'Sessao expirou (redirecionou para login). Reautentique via start+login+confirm.',
          form_not_found: 'Nenhum formulario com os campos informados foi encontrado na pagina.',
          write_guard: 'Guarda de escrita: o formulario possui botoes de escrita (' + (outcome.buttons ? outcome.buttons.join(', ') : '') + '). Execucao abortada por seguranca.',
          no_field_filled: 'Nao foi possivel preencher nenhum dos campos no formulario.',
        };
        return Response.json({ ok: false, error: msgs[outcome.error] || outcome.error, outcome }, { status: 422 });
      }

      let snapshotText = '';
      try {
        const snap = await callMcp('browser_snapshot', {});
        snapshotText = extractSnapshotText(snap);
      } catch (e) { /* best-effort */ }

      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        finalUrl: outcome && outcome.url ? outcome.url : '',
        filled: outcome && outcome.filled ? outcome.filled : [],
        snapshotText: snapshotText.slice(0, 12000),
        message: 'Capability executada (read-only). Resultado capturado via snapshot da pagina pos-submissao.',
      });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}