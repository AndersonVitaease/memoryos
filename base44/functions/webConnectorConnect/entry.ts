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
import { warmupSession } from '../../shared/webSessionWarmup.ts';

const PLAYWRIGHT_SERVER_NAME = 'playwright-web-connector';
const MCP_CALL_TIMEOUT_MS = 20000;
const SDK_TIMEOUT_MS = 8000;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30min — revalidável, ver WebSession.expires_at

// Corpo do interpretador de flow (Maxun WhereWhatPair[]) executado dentro de
// browser_run_code_unsafe. Sem backticks/interpolação — injetado como string.
// Actions suportadas (Fase 1): goto, click, fill, press, waitForSelector,
// scroll, scrape, scrapeList. Não suportadas → registradas em unsupported_actions.
const FLOW_EXEC_BODY = `
  const resolve = (v) => { if (v && typeof v === 'object' && !Array.isArray(v) && '$param' in v) { const k = v['$param']; return inputs[k] != null ? String(inputs[k]) : ''; } return v; };
  const WRITE_RE = /(salvar|excluir|deletar|apagar|cancelar|enviar|criar|editar|create|edit|delete|remove|update|submeter)/i;
  const unsupported = [];
  const extracted = {};
  const filled = [];
  const guardBlock = [];
  for (const pair of flow) {
    if (!pair) continue;
    // Fase 1: executa pares em ordem (flows lineares). O gate where.url nao
    // deve pular um par cujo proprio goto o satisfaria (pagina ainda em
    // about:blank antes da navegacao). Condicionais/branching = Fase 2.
    const what = Array.isArray(pair.what) ? pair.what : [];
    for (let i = 0; i < what.length; i++) {
      const a = what[i] || {};
      const act = a.action; const args = Array.isArray(a.args) ? a.args : [];
      try {
        if (act === 'goto') { const u = resolve(args[0]); if (u) await page.goto(String(u), { waitUntil: 'load', timeout: 15000 }).catch(()=>{}); }
        else if (act === 'click') {
          const sel = String(args[0] || '');
          if (sel) {
            const el = await page.$(sel);
            if (el) {
              const txt = await el.evaluate((e) => (e.textContent || e.value || '').trim()).catch(() => '');
              if (WRITE_RE.test(txt)) { guardBlock.push({ selector: sel, text: txt.slice(0,80) }); }
              else { await el.click({ timeout: 5000 }).catch(() => {}); }
            }
          }
        }
        else if (act === 'fill') {
          const sel = String(args[0] || ''); const val = resolve(args[1]);
          if (sel) { await page.fill(sel, String(val != null ? val : '')).catch(() => {}); filled.push(sel); }
        }
        else if (act === 'press') {
          const sel = String(args[0] || ''); const key = String(args[1] || 'Enter');
          if (sel) await page.press(sel, key).catch(() => {});
        }
        else if (act === 'waitForSelector') {
          const sel = String(args[0] || ''); if (sel) await page.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
        }
        else if (act === 'scroll') {
          const y = typeof args[0] === 'number' ? args[0] : 800;
          await page.evaluate((yy) => window.scrollBy(0, yy), y).catch(() => {});
        }
        else if (act === 'scrape') {
          const cfg = args[0] && typeof args[0] === 'object' ? args[0] : {};
          const fields = cfg.fields || cfg.selectors || {};
          const obj = {};
          for (const k of Object.keys(fields)) {
            const f = fields[k] || {};
            const sel = f.selector || (typeof f === 'string' ? f : '');
            const attr = f.attribute || 'innerText';
            try {
              const el = sel ? await page.$(sel) : null;
              if (el) obj[k] = attr === 'href' ? await el.evaluate((e) => e.href).catch(() => '') : await el.evaluate((e, a) => (e.getAttribute(a) || e.innerText || '').trim(), attr).catch(() => '');
              else obj[k] = '';
            } catch (e) { obj[k] = ''; }
          }
          Object.assign(extracted, obj);
        }
        else if (act === 'scrapeList') {
          const cfg = args[0] && typeof args[0] === 'object' ? args[0] : {};
          const ls = cfg.listSelector || '';
          const fields = cfg.fields || {};
          const lim = typeof cfg.limit === 'number' ? cfg.limit : 30;
          if (ls) {
            const items = await page.evaluate((l, fs, lm) => {
              const out = [];
              const nodes = Array.from(document.querySelectorAll(l)).slice(0, lm);
              for (const n of nodes) {
                const o = {};
                for (const k of Object.keys(fs)) {
                  const f = fs[k] || {};
                  const sel = f.selector || (typeof f === 'string' ? f : '');
                  const attr = f.attribute || 'innerText';
                  const el = sel ? (n.matches(sel) ? n : n.querySelector(sel)) : null;
                  if (!el) { o[k] = ''; continue; }
                  o[k] = attr === 'href' ? el.href : (el.getAttribute(attr) || el.innerText || '').trim();
                }
                out.push(o);
              }
              return out;
            }, ls, fields, lim).catch(() => []);
            extracted[a.name || 'list'] = items;
          }
        }
        else { unsupported.push(act); }
      } catch (e) { unsupported.push(act + ':' + String((e && e.message) || e).slice(0, 120)); }
    }
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  }
  if (guardBlock.length > 0) return JSON.stringify({ error: 'write_guard', buttons: guardBlock });
  return JSON.stringify({ url: page.url(), filled: filled, extracted: extracted, unsupported_actions: unsupported });
`;

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

    // ── MAXUN PROVIDER (branch early — independe do Playwright MCP) ──────
    // Capabilities marcadas como Maxun (provider="maxun" + robotId) são
    // executadas via maxunRun (Maxun Cloud). O robot roda na nuvem do Maxun
    // com originUrl gravado — SEM WebSession, SEM cookies, SEM Playwright.
    // webConnectorConnect NÃO conhece MAXUN_API_KEY/HTTP/contrato Maxun;
    // apenas invoca o adaptador backend maxunRun e normaliza o resultado
    // para o contrato existente do Web Connector (snapshotText + links).
    // Branch early para não exigir conexão com o Playwright MCP (que nem
    // existiria para uma capability puramente Maxun).
    if (operation === 'executeCapability') {
      const _provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
      const _robotId = typeof body.robotId === 'string' ? body.robotId.trim() : '';
      // Fase 7.9: targetUrl dinamico. provider=maxun + (robotId OU targetUrl).
      //  - robotId presente (sem targetUrl): modo direto legado (executa o robot tal qual).
      //  - targetUrl presente (sem robotId): modo dinamico — duplicate(template, targetUrl)
      //    -> novo robot -> execute. Reusa discoveredFromUrl como transportador de targetUrl
      //    quando o Resolver produz uma intent Maxun generica (sem robotId especifico).
      const _explicitTargetUrl = typeof body.targetUrl === 'string' ? body.targetUrl.trim() : '';
      const _targetUrl = _explicitTargetUrl || (!_robotId ? (typeof body.discoveredFromUrl === 'string' ? body.discoveredFromUrl.trim() : '') : '');
      if (_provider === 'maxun' && (_robotId || _targetUrl)) {
        const _invokePayload: { robotId?: string; targetUrl?: string; formats: string[] } = { formats: ['markdown', 'text', 'html', 'links'] };
        if (_targetUrl) _invokePayload.targetUrl = _targetUrl;
        else _invokePayload.robotId = _robotId;
        let _mRes = null;
        try {
          _mRes = await base44.functions.invoke('maxunRun', _invokePayload);
        } catch (e) {
          // functions.invoke lança erro genérico ("Request failed with status
          // code 502") quando maxunRun retorna != 2xx. O motivo real (ex:
          // "Recording not found", maxunStatus:"not_found") está no corpo do
          // erro. Extração defensiva cobre Node (axios: e.response.data) e
          // Deno (body pode estar em e.data / e.body / message JSON). Nunca
          // mascarar a falha — sempre retorna ok:false identificável como Maxun.
          let _errBody = null;
          try {
            if (e && e.response && e.response.data) _errBody = e.response.data;
            else if (e && e.data) _errBody = e.data;
            else if (e && e.body) _errBody = e.body;
            else if (e && typeof e.message === 'string') {
              try { const _j = JSON.parse(e.message); if (_j && typeof _j === 'object') _errBody = _j; } catch (_) { /* message nao e JSON */ }
            }
          } catch (_) { /* best-effort */ }
          const _errMsg = (_errBody && _errBody.error) ? String(_errBody.error)
            : 'Falha na execução do Robot Maxun (' + _robotId + '): ' + ((e && e.message) ? String(e.message) : String(e));
          const _maxunStatus = (_errBody && _errBody.maxunStatus) ? String(_errBody.maxunStatus) : 'invoke_error';
          return Response.json({
            ok: false, provider: 'maxun', robotId: _robotId,
            error: _errMsg,
            maxunStatus: _maxunStatus,
          }, { status: 502 });
        }
        const _md = _mRes && _mRes.data ? _mRes.data : _mRes;
        if (!_md || _md.ok !== true) {
          return Response.json({
            ok: false, provider: 'maxun',
            error: (_md && _md.error) ? String(_md.error) : 'maxunRun falhou sem mensagem.',
            maxunStatus: (_md && _md.maxunStatus) ? _md.maxunStatus : 'failed',
          }, { status: 502 });
        }
        // Normaliza outputs do Maxun para o contrato do Web Connector.
        const _outputs = (_md.outputs && typeof _md.outputs === 'object' && !Array.isArray(_md.outputs)) ? _md.outputs : {};
        const _parts = [];
        if (typeof _outputs.markdown === 'string' && _outputs.markdown) _parts.push(_outputs.markdown);
        if (typeof _outputs.text === 'string' && _outputs.text) _parts.push(_outputs.text);
        if (typeof _outputs.html === 'string' && _outputs.html) _parts.push(_outputs.html);
        const _snapshotText = _parts.join('\n\n').slice(0, 12000);
        let _links = [];
        if (Array.isArray(_outputs.links)) {
          _links = _outputs.links.map((l) => {
            if (typeof l === 'string') return { text: '', href: l, cardText: '' };
            if (l && typeof l === 'object') return {
              text: String(l.text || l.title || ''),
              href: String(l.href || l.url || ''),
              cardText: String(l.cardText || ''),
            };
            return { text: '', href: '', cardText: '' };
          }).filter((l) => l.href).slice(0, 30);
        }
        return Response.json({
          ok: true,
          provider: 'maxun',
          webSessionId: typeof body.webSessionId === 'string' ? body.webSessionId : null,
          runId: _md.runId || '',
          finalUrl: '',
          filled: [],
          links: _links,
          snapshotText: _snapshotText,
          message: _targetUrl
            ? 'Capability executada via Maxun Cloud (duplicate targetUrl).'
            : 'Capability executada via Maxun Cloud (robot ' + _robotId + ').',
        });
      }
    }

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

    // Robustez definitiva (2026-08-10): 'discover' e 'use'/'executeCapability'
    // compartilham o MESMO navegador Playwright na VPS. Se um processo nao
    // fechar limpo (ex: descoberta BFS interrompida), o proximo browser_*
    // falha com "Browser is already in use for <profile>, use --isolated..." —
    // um erro de INFRAESTRUTURA que a UI/chat mostrava erroneamente como
    // "sessao expirada" (a real causa ficava escondida, levando horas de
    // debug). callMcpWithRetry detecta esse erro especifico, forca um
    // browser_close e tenta de novo automaticamente antes de desistir —
    // a maioria dos casos se autocorrige sem o usuario perceber.
    async function callMcpWithRetry(op, args) {
      try {
        return await callMcp(op, args);
      } catch (e) {
        if (/already in use/i.test(e?.message || '')) {
          try { await callMcp('browser_close', {}); } catch (e2) { /* best-effort */ }
          await new Promise((r) => setTimeout(r, 1500));
          return await callMcp(op, args); // segunda tentativa: deixa o erro propagar se falhar de novo
        }
        throw e;
      }
    }

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
          '  if (!pass) {' +
          '    const dbg = { error: "no-password-field", url: page.url(), title: await page.title().catch(() => ""), bodySnippet: await page.evaluate(() => document.body ? document.body.innerText.slice(0, 400) : "(sem body)").catch(() => "") };' +
          '    return JSON.stringify(dbg);' +
          '  }' +
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
        const dbg = ' [pagina carregada: ' + (loginOutcome.url || '?') + ' | titulo: ' + (loginOutcome.title || '?') + ' | corpo: ' + (loginOutcome.bodySnippet || '').slice(0, 200) + ']';
        return Response.json({ ok: false, error: 'Login form not found on page (DOM check: ' + loginOutcome.error + '). Verifique se a URL da sessão é a página de login.' + dbg, snapshotText: snapshotText.slice(0, 4000) }, { status: 422 });
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

      // Warm-up (fix Bling/OAuth): injeta cookies, navega, espera 3s pro
      // SPA disparar chamadas de bootstrap (que renovam o access token via
      // refresh token automaticamente), re-captura cookies renovados e
      // persiste. Sem isto, sites com access token de vida curta redirecionam
      // pra /login mesmo com refresh token valido no cookie store.
      const _warmup = await warmupSession({ callMcp, cookies, siteUrl: session.site_url, base44, sessionId: session.id });
      if (_warmup.stillOnLogin) {
        return Response.json({
          ok: true,
          webSessionId: session.id,
          status: 'active',
          sessionValid: false,
          snapshotText: '',
          message: 'Sessão expirou durante o aquecimento (redirecionou para login). Reautentique via start+login+confirm.',
        });
      }

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
          '  await new Promise((r) => setTimeout(r, 3000));' +
          '  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});' +
          '  const finalUrl = page.url();' +
          '  const stillHasPass = await page.$("input[type=password]");' +
          '  const alertText = await page.evaluate(() => {' +
          '    const a = document.querySelector(".flash, .alert, [role=alert], #flash");' +
          '    return a ? a.textContent.trim().slice(0, 300) : "";' +
          '  });' +
          '  return JSON.stringify({ url: finalUrl, stillHasPassword: !!stillHasPass, alert: alertText });' +
          '}';
        const res = await callMcpWithRetry('browser_run_code_unsafe', { code });
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
      const { webSessionId, discoveredFromUrl, inputFields, inputs, flow } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });
      const _hasFlow = Array.isArray(flow) && flow.length > 0;
      if (!_hasFlow) {
        if (!discoveredFromUrl) return Response.json({ error: 'Missing required field: discoveredFromUrl' }, { status: 400 });
        if (!Array.isArray(inputFields) || inputFields.length === 0) return Response.json({ error: 'inputFields must be a non-empty array' }, { status: 400 });
        if (!inputs || typeof inputs !== 'object') return Response.json({ error: 'inputs must be an object' }, { status: 400 });
      }

      const session = await withTimeout(base44.entities.WebSession.get(webSessionId), SDK_TIMEOUT_MS, 'session_get');
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.status !== 'active') return Response.json({ error: 'WebSession is not active (status: ' + session.status + ')' }, { status: 409 });

      let cookies = [];
      try { cookies = JSON.parse(session.cookies || '[]'); } catch (e) { /* corrupted */ }
      if (!Array.isArray(cookies) || cookies.length === 0) {
        return Response.json({ error: 'No cookies stored in this WebSession.' }, { status: 409 });
      }

      // ── authenticated page-read branch ────────────────────────────
      // READ sem inputs não é form-fill e não deve cair no caminho legado
      // que exige inputFields. Quando a capability veio de uma WebSession,
      // o Compiler a roteia para Playwright e este branch apenas reaplica os
      // cookies, navega para a página descoberta e captura o snapshot.
      // Maxun nunca entra aqui porque seu adapter não usa WebSession.
      if (!_hasFlow && (!Array.isArray(inputFields) || inputFields.length === 0)) {
        if (!discoveredFromUrl) return Response.json({ error: 'Missing required field: discoveredFromUrl' }, { status: 400 });
        let targetUrl = String(discoveredFromUrl).trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) targetUrl = 'https://' + targetUrl;

        try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

        const escapedCookies = JSON.stringify(cookies);
        const escapedUrl = JSON.stringify(targetUrl);
        let pageResult = '';
        try {
          const code = `async (page) => {
  await page.context().addCookies(${escapedCookies});
  await page.goto(${escapedUrl}, { waitUntil: "load", timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const finalUrl = page.url();
  if (finalUrl.includes('/login')) return JSON.stringify({ error: "session_expired", url: finalUrl });
  return JSON.stringify({ url: finalUrl });
}`;
          const res = await callMcpWithRetry('browser_run_code_unsafe', { code });
          pageResult = extractRunCodeText(res);
        } catch (e) {
          return Response.json({ error: 'Authenticated page-read failed: ' + e.message }, { status: 502 });
        }

        let outcome = null;
        try {
          let candidate = pageResult;
          candidate = candidate.replace(/^```json\\s*/i, '').replace(/^```\\s*/i, '').replace(/\\s*```$/i, '').trim();
          outcome = JSON.parse(candidate);
          if (typeof outcome === 'string') outcome = JSON.parse(outcome);
        } catch (e) { /* fallback below */ }

        if (outcome && outcome.error === 'session_expired') {
          return Response.json({ ok: false, error: 'session_expired', finalUrl: outcome.url || '' }, { status: 422 });
        }

        let snapshotText = '';
        try {
          const snap = await callMcp('browser_snapshot', {});
          snapshotText = extractSnapshotText(snap);
        } catch (e) { /* best-effort */ }

        const finalUrl = outcome && outcome.url ? String(outcome.url) : '';
        if (finalUrl.includes('/login')) {
          try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }
          return Response.json({ ok: false, error: 'session_expired', finalUrl, snapshotText: snapshotText.slice(0, 12000) }, { status: 422 });
        }

        try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }
        return Response.json({
          ok: true,
          webSessionId: session.id,
          finalUrl,
          filled: [],
          links: [],
          snapshotText: snapshotText.slice(0, 12000),
          message: 'Authenticated page-read executado (read-only) na WebSession.'
        });
      }

      // ── flow branch (Maxun recorder) ──────────────────────────────
      // SE capability.flow existir: executa o flow (WhereWhatPair[]) na
      // WebSession autenticada, traduzindo actions para browser_run_code_unsafe.
      // SENÃO: mantém exatamente o form-fill heurístico abaixo (intacto).
      if (_hasFlow) {
        const escapedCookies = JSON.stringify(cookies);
        const escapedInputs = JSON.stringify(inputs && typeof inputs === 'object' ? inputs : {});
        const escapedFlow = JSON.stringify(flow);
        let flowResult = '';
        try {
          const code = 'async (page) => {' +
            'const cookies = ' + escapedCookies + ';' +
            'const inputs = ' + escapedInputs + ';' +
            'const flow = ' + escapedFlow + ';' +
            'await page.context().addCookies(cookies);' +
            FLOW_EXEC_BODY +
            '}';
          const res = await callMcpWithRetry('browser_run_code_unsafe', { code });
          flowResult = extractRunCodeText(res);
        } catch (e) {
          return Response.json({ error: 'Flow execute failed: ' + e.message }, { status: 502 });
        }
        let outcome = null;
        try {
          let candidate = flowResult;
          const m = candidate.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, candidate];
          candidate = (m[1] || candidate).trim();
          outcome = JSON.parse(candidate);
          if (typeof outcome === 'string') outcome = JSON.parse(outcome);
        } catch (e) { /* fallback below */ }

        if (outcome && outcome.error === 'write_guard') {
          return Response.json({ ok: false, error: 'Guarda de escrita: o flow tenta clicar em botões de escrita (' + (outcome.buttons ? outcome.buttons.map((b) => b.text || b.selector).join(', ') : '') + '). Execução abortada por segurança.', outcome }, { status: 422 });
        }

        let snapshotText = '';
        try { const snap = await callMcp('browser_snapshot', {}); snapshotText = extractSnapshotText(snap); } catch (e) { /* best-effort */ }
        try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

        return Response.json({
          ok: true,
          webSessionId: session.id,
          finalUrl: outcome && outcome.url ? outcome.url : '',
          filled: outcome && Array.isArray(outcome.filled) ? outcome.filled : [],
          extracted: outcome && outcome.extracted ? outcome.extracted : {},
          unsupported_actions: outcome && Array.isArray(outcome.unsupported_actions) ? outcome.unsupported_actions : [],
          snapshotText: snapshotText.slice(0, 12000),
          message: 'Flow executado (read-only) na WebSession autenticada.',
        });
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
  // Warm-up: da 3s pro SPA renovar o access token antes de interagir.
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
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
    // Passo 3: match semantico por palavra-chave de busca. Se o nome do campo
    // descoberto contem termo de busca (digite/buscar/pesquisar/procurar/
    // search/find/query/palavra), casa com qualquer input cujos atributos
    // tambem tem termo de busca. Resolve o caso Mercado Livre: a descoberta
    // capturou "Digite o que voce quer encontrar" mas o placeholder real do
    // campo e "Buscar produtos, marcas e muito mais..." — os textos nao se
    // sobrepoe, mas ambos indicam um campo de busca.
    const searchRe = /(digite|buscar|pesquisar|procurar|search|find|query|keyword|palavra|as_word)/i;
    if (searchRe.test(nn)) {
      for (const e of els) {
        if (e.type === 'search') return e;
        const ph2=(e.getAttribute("placeholder")||"").toLowerCase();
        const al2=(e.getAttribute("aria-label")||"").toLowerCase();
        const nm2=(e.getAttribute("name")||"").toLowerCase();
        const id2=(e.getAttribute("id")||"").toLowerCase();
        if (searchRe.test(ph2)||searchRe.test(al2)||searchRe.test(nm2)||searchRe.test(id2)) return e;
      }
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
  // Scroll progressivo para disparar lazy-load dos cards de produto (ML/
  // ecommerce carrega os cards via IntersectionObserver conforme o usuario
  // rola). Sem isto, os anchors de produto nao existem no DOM na hora da
  // extracao — so nav/categorias sao capturados.
  await page.evaluate(() => {
    return new Promise((resolve) => {
      let count = 0;
      const step = () => {
        window.scrollBy(0, Math.max(window.innerHeight * 2, 1200));
        count++;
        if (count < 5) setTimeout(step, 500);
        else { window.scrollTo(0, 0); resolve(); }
      };
      step();
    });
  }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  const links = await page.evaluate(() => {
    // Dominio registravel (ex: lista.mercadolivre.com.br -> mercadolivre.com.br).
    // A pagina de resultados do ML fica em lista.mercadolivre.com.br mas os
    // produtos apontam pra www.mercadolivre.com.br/.../p/ID — filtro strict
    // same-origin exclui os links de produto. Comparar pelo registrable
    // domain inclui todos os subdominios do mesmo site.
    const rd = (() => {
      const parts = location.hostname.split('.');
      const twoPartTlds = ['com.br','co.uk','com.au','org.br','net.br','com.ar','com.mx','co.za'];
      const last2 = parts.slice(-2).join('.');
      if (twoPartTlds.includes(last2) && parts.length >= 3) return parts.slice(-3).join('.');
      return last2;
    })();
    const curPath = location.pathname;
    // Padroes de URL de produto/detalhe (genericos + ML/Amazon/etc). Links que
    // casam sao priorizados — sem isto, os 30 links capturados sao so nav/
    // categoria (que aparecem antes no DOM), cortando os produtos reais.
    const productRe = /\\/(p|dp|produto|item|pd|listados|detalle|product)\\/|MLB-?\\d|\\/item\\//i;
    const catRe = /\\/(c|categorias|ofertas|l|gz|assinaturas|importados|mais-vendidos|categorias)\\b/i;
    const collect = (filter) => {
      const list = [];
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = a.href;
        if (!href) continue;
        let h;
        try { h = new URL(href); } catch (e) { continue; }
        if (!h.hostname.endsWith(rd)) continue;
        if (/\\/(login|logout|signup|register|auth|conta|minha-conta|ajuda|vendas|favoritos|carrinho|ofertas)\\b/i.test(h.pathname)) continue;
        if (h.pathname === curPath || h.pathname === '/' || h.pathname === '') continue;
        if (!filter(h, a)) continue;
        const text = (a.innerText || a.textContent || '').trim();
        if (text.length < 8) continue;
        // Captura o texto do card/container ancestral (inclui preco, parcelas,
        // frete) para o LLM ter dados de identificacao alem do titulo.
        const card = a.closest('li, article, [class*=ui-search-result], [class*=item], [class*=card], [class*=product]');
        const cardText = card ? (card.innerText || '').trim().slice(0, 400) : '';
        list.push({ text: text.slice(0, 200), href, cardText });
      }
      return list;
    };
    // Passo 1: anchors de produto (href casa productRe e NAO e categoria).
    const productAnchors = collect((h) => productRe.test(h.pathname + h.search) && !catRe.test(h.pathname));
    // Passo 2 (fallback): anchors genericos do mesmo dominio, excluindo categorias.
    const genericAnchors = collect((h) => !catRe.test(h.pathname));
    const out = productAnchors.length > 0 ? productAnchors : genericAnchors;
    const seen = new Set();
    const dedup = [];
    for (const it of out) { if (seen.has(it.href)) continue; seen.add(it.href); dedup.push(it); }
    return dedup.slice(0, 30);
  }).catch(() => []);
  return JSON.stringify({ url: page.url(), filled, links });
  }`;
        const res = await callMcpWithRetry('browser_run_code_unsafe', { code });
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
        links: outcome && Array.isArray(outcome.links) ? outcome.links : [],
        snapshotText: snapshotText.slice(0, 12000),
        message: 'Capability executada (read-only). Resultado capturado via snapshot da pagina pos-submissao.',
      });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}