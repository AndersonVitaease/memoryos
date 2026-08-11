/**
 * background.js — Service worker (MV3) do MemoryOS Browser Bridge.
 *
 * Multi-site: guarda um ARRAY de sessoes (uma por aba/site conectada) em
 * chrome.storage.local. O popup escolhe qual sessao esta "ativa" para a UI,
 * mas descoberta e execucao podem rodar em QUALQUER sessao conectada,
 * inclusive em PARALELO — nao dependem mais de "trocar a sessao ativa".
 *
 * Fix (2026-08-11): antes, o estado de descoberta (fila BFS, visitados, aba)
 * vivia numa UNICA chave global (memos_discovery) — iniciar descoberta em um
 * segundo site sobrescrevia o estado do primeiro, quebrando os dois. Agora e
 * um MAPA por webSessionId (memos_discovery = { [webSessionId]: {...} }),
 * entao cada site tem sua propria fila/estado, e varias descobertas rodam
 * em paralelo de verdade sem interferir uma na outra. O mesmo vale para
 * execucao de capability, que agora aceita webSessionId explicito em vez de
 * depender implicitamente da "sessao ativa".
 *
 * Sprint 1: captura do token, registerSession multi, heartbeat, revoke.
 * Sprint 2: descoberta BFS (agora paralela, por site).
 * Sprint 3: execucao de capability (agora paralela, por site).
 */
const HEARTBEAT_ALARM = 'memos-heartbeat';
// Fix (2026-08-11): 30s — confirmado que desde o Chrome 120 esse e o minimo
// oficial pra chrome.alarms em producao (era 1min em versoes anteriores).
// Isso e um relogio de INTERVALO FIXO, nao reativo: a cada 30s ele acorda,
// pega TODAS as tarefas pendentes de uma vez (pode ser 1, pode ser 10) e
// roda todas em paralelo no mesmo ciclo — nao processa uma tarefa por vez
// esperando 30s entre cada. O atraso de ate 30s so existe pra PRIMEIRA vez
// que uma tarefa nova e percebida; depois disso todo o lote pendente sai
// junto.
const HEARTBEAT_INTERVAL_MIN = 0.5;
const DISCOVERY_STATE_KEY = 'memos_discovery'; // agora um MAPA: { [webSessionId]: discoveryState }
const SESSIONS_KEY = 'memos_sessions';
const ACTIVE_KEY = 'memos_active_session_id';
const DISCOVERY_MAX_PAGES = 10;
const ACCOUNT_AREA_KEYWORDS = /compra|pedido|venda|anuncio|publica|purchase|order|sale|listing|conta|account|historico|extrato|fatura|nota|pergunta|question|financeiro|reputa|relatorio|dashboard|estoque|produto/i;

// ── Helper: invoca uma backend function do MemoryOS ──────────────────────
async function invokeFunction(name, payload) {
  const { memos_token, memos_app_base_url } = await chrome.storage.local.get(['memos_token', 'memos_app_base_url']);
  if (!memos_token || !memos_app_base_url) {
    throw new Error('MemoryOS nao conectado. Abra o app MemoryOS no Chrome para autenticar a extensao.');
  }
  const url = `${memos_app_base_url}/functions/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memos_token}` },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const errMsg = (data && data.error) ? data.error : `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data;
}

// ── Helpers de armazenamento de sessoes ──────────────────────────────────
async function getSessions() {
  const s = await chrome.storage.local.get([SESSIONS_KEY]);
  return s[SESSIONS_KEY] || [];
}
async function setSessions(arr) {
  await chrome.storage.local.set({ [SESSIONS_KEY]: arr });
}
async function getActiveId() {
  const s = await chrome.storage.local.get([ACTIVE_KEY]);
  return s[ACTIVE_KEY] || null;
}
async function setActiveId(id) {
  await chrome.storage.local.set({ [ACTIVE_KEY]: id });
}
async function getActiveSession() {
  const [sessions, activeId] = await Promise.all([getSessions(), getActiveId()]);
  if (!activeId) return sessions[0] || null;
  return sessions.find((s) => s.webSessionId === activeId) || sessions[0] || null;
}
async function getSessionById(webSessionId) {
  const sessions = await getSessions();
  return sessions.find((s) => s.webSessionId === webSessionId) || null;
}
function originOf(url) { try { return new URL(url).origin; } catch (e) { return ''; } }

// ── Helpers de descoberta MULTI-SITE (mapa por webSessionId) ─────────────
async function getDiscoveryMap() {
  const s = await chrome.storage.local.get([DISCOVERY_STATE_KEY]);
  return s[DISCOVERY_STATE_KEY] || {};
}
async function getDiscovery(webSessionId) {
  const map = await getDiscoveryMap();
  return map[webSessionId] || null;
}
async function setDiscovery(webSessionId, state) {
  const map = await getDiscoveryMap();
  if (state === null) { delete map[webSessionId]; }
  else { map[webSessionId] = state; }
  await chrome.storage.local.set({ [DISCOVERY_STATE_KEY]: map });
}
async function findDiscoveryByTabId(tabId) {
  const map = await getDiscoveryMap();
  for (const webSessionId of Object.keys(map)) {
    if (map[webSessionId] && map[webSessionId].tabId === tabId) {
      return { webSessionId, state: map[webSessionId] };
    }
  }
  return null;
}

// ── Message router ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Token capture (vindo do content-app.js no dominio do app)
  if (msg.type === 'MEMOS_TOKEN_CAPTURE' && msg.token) {
    chrome.storage.local.set({
      memos_token: msg.token,
      memos_app_base_url: msg.appBaseUrl || (sender.tab && sender.tab.url ? sender.tab.url.replace(/\/$/, '') : ''),
      memos_captured_at: Date.now(),
    }, () => sendResponse({ ok: true }));
    return true;
  }

  // Status (popup) — agora inclui discoveryRunning POR sessao, nao so global
  if (msg.type === 'MEMOS_GET_STATUS') {
    (async () => {
      const [sessions, activeId, discMap] = await Promise.all([
        getSessions(),
        getActiveId(),
        getDiscoveryMap(),
      ]);
      const sessionsWithStatus = sessions.map((s) => ({
        ...s,
        discoveryRunning: !!(discMap[s.webSessionId] && discMap[s.webSessionId].running),
      }));
      sendResponse({
        hasToken: !!(await chrome.storage.local.get(['memos_token'])).memos_token,
        appBaseUrl: (await chrome.storage.local.get(['memos_app_base_url'])).memos_app_base_url || null,
        sessions: sessionsWithStatus,
        activeSessionId: activeId || (sessions[0] ? sessions[0].webSessionId : null),
        // Compatibilidade com UIs antigas: true se QUALQUER site esta descobrindo.
        discoveryRunning: Object.keys(discMap).some((k) => discMap[k] && discMap[k].running),
        discoveryCount: Object.keys(discMap).filter((k) => discMap[k] && discMap[k].running).length,
      });
    })();
    return true;
  }

  // Conectar o site da aba ativa (multi: adiciona ao array, nao sobrescreve)
  if (msg.type === 'MEMOS_CONNECT_SITE') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) {
          sendResponse({ ok: false, error: 'Aba atual nao tem URL valida.' });
          return;
        }
        const siteUrl = new URL(tab.url).origin;
        const sessions = await getSessions();
        // Ja conectado neste site? Apenas ativa.
        const existing = sessions.find((s) => originOf(s.siteUrl) === siteUrl);
        if (existing) {
          await setActiveId(existing.webSessionId);
          sendResponse({ ok: true, session: existing, alreadyConnected: true });
          return;
        }
        const result = await invokeFunction('webConnectorExtension', {
          operation: 'registerSession',
          siteUrl,
          siteName: new URL(siteUrl).hostname,
          tabId: String(tab.id),
        });
        const session = {
          webSessionId: result.webSessionId,
          tabId: tab.id,
          siteUrl,
          siteName: new URL(siteUrl).hostname,
          expiresAt: result.expiresAt,
          connectedAt: Date.now(),
        };
        sessions.push(session);
        await setSessions(sessions);
        await setActiveId(session.webSessionId);
        // Garante o heartbeat (unico alarme percorre todas as sessoes)
        await chrome.alarms.clear(HEARTBEAT_ALARM);
        chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
        sendResponse({ ok: true, session });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Trocar sessao ativa (so afeta qual sessao a UI do popup mostra por
  // padrao — descoberta/execucao ja podem mirar qualquer webSessionId
  // explicitamente, independente de qual esta "ativa").
  if (msg.type === 'MEMOS_SET_ACTIVE') {
    (async () => {
      await setActiveId(msg.webSessionId);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Desconectar uma sessao especifica (ou a ativa se nao informada)
  if (msg.type === 'MEMOS_DISCONNECT') {
    (async () => {
      try {
        const sessions = await getSessions();
        let target = msg.webSessionId ? sessions.find((s) => s.webSessionId === msg.webSessionId) : await getActiveSession();
        if (target) {
          try {
            await invokeFunction('webConnectorExtension', { operation: 'revoke', webSessionId: target.webSessionId });
          } catch (e) { /* best-effort */ }
        }
        const remaining = target ? sessions.filter((s) => s.webSessionId !== target.webSessionId) : sessions;
        await setSessions(remaining);
        // Se a ativa foi removida, escolhe outra
        const activeId = await getActiveId();
        if (target && activeId === target.webSessionId) {
          await setActiveId(remaining[0] ? remaining[0].webSessionId : null);
        }
        // Limpa descoberta dessa sessao especifica (nao mexe nas outras)
        if (target) await setDiscovery(target.webSessionId, null);
        if (remaining.length === 0) await chrome.alarms.clear(HEARTBEAT_ALARM);
        sendResponse({ ok: true, remaining });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Iniciar descoberta — aceita webSessionId explicito (multi-site em
  // paralelo); se omitido, usa a sessao ativa (compatibilidade). Duas
  // descobertas em SITES DIFERENTES podem rodar ao mesmo tempo; a mesma
  // sessao nao pode ter duas descobertas simultaneas (nao faria sentido).
  if (msg.type === 'MEMOS_START_DISCOVERY') {
    (async () => {
      try {
        const session = msg.webSessionId ? await getSessionById(msg.webSessionId) : await getActiveSession();
        if (!session) {
          sendResponse({ ok: false, error: 'Nenhum site conectado. Conecte um site primeiro.' });
          return;
        }
        const already = await getDiscovery(session.webSessionId);
        if (already && already.running) {
          sendResponse({ ok: false, error: 'Ja existe uma descoberta em andamento para este site.' });
          return;
        }
        const d = {
          webSessionId: session.webSessionId,
          tabId: session.tabId,
          siteUrl: session.siteUrl,
          queue: [session.siteUrl],
          visited: [],
          pagesDone: 0,
          candidatesSoFar: 0,
          running: true,
          expectingSnapshot: false,
        };
        await setDiscovery(session.webSessionId, d);
        await discoveryStep(session.webSessionId);
        sendResponse({ ok: true, webSessionId: session.webSessionId });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Parar descoberta — de um site especifico (ou o ativo, por compatibilidade)
  if (msg.type === 'MEMOS_STOP_DISCOVERY') {
    (async () => {
      const session = msg.webSessionId ? await getSessionById(msg.webSessionId) : await getActiveSession();
      if (session) await setDiscovery(session.webSessionId, null);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Listar capabilities validadas de um site (ativo por padrao, ou explicito)
  if (msg.type === 'MEMOS_LIST_CAPABILITIES') {
    (async () => {
      try {
        const session = msg.webSessionId ? await getSessionById(msg.webSessionId) : await getActiveSession();
        if (!session) {
          sendResponse({ ok: false, error: 'Nenhum site conectado.' });
          return;
        }
        const result = await invokeFunction('webConnectorExtension', {
          operation: 'listCapabilities',
          webSessionId: session.webSessionId,
        });
        sendResponse({ ok: true, capabilities: result.capabilities || [] });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Executar capability — aceita webSessionId explicito (multi-site em
  // paralelo, ex: a camada de inteligencia do chat disparando buscas em
  // varios sites conectados pra responder uma unica pergunta). Sem
  // webSessionId, usa a sessao ativa (compatibilidade com o popup atual).
  if (msg.type === 'MEMOS_EXECUTE_CAPABILITY') {
    (async () => {
      try {
        const session = msg.webSessionId ? await getSessionById(msg.webSessionId) : await getActiveSession();
        if (!session) {
          sendResponse({ ok: false, error: 'Site nao conectado.' });
          return;
        }
        const spec = { discoveredFromUrl: msg.discoveredFromUrl, inputFields: msg.inputFields, inputs: msg.inputs };
        await navigateAndWait(session.tabId, spec.discoveredFromUrl);
        const injectRes = await chrome.scripting.executeScript({
          target: { tabId: session.tabId },
          func: pageExecute,
          args: [spec],
        });
        const result = (injectRes && injectRes[0] && injectRes[0].result) ? injectRes[0].result : { error: 'no_result' };
        try {
          await invokeFunction('webConnectorExtension', {
            operation: 'recordExecution',
            webSessionId: session.webSessionId,
            discoveredFromUrl: spec.discoveredFromUrl,
            inputFields: spec.inputFields,
            inputs: spec.inputs,
            result,
          });
        } catch (e) { /* best-effort */ }
        sendResponse({ ok: true, result, webSessionId: session.webSessionId });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Snapshot recebido do content-site.js — identifica a QUAL descoberta
  // pertence pelo tabId do sender (nao existe mais "a" descoberta unica).
  if (msg.type === 'MEMOS_SNAPSHOT_RESULT') {
    (async () => {
      const tabId = sender.tab ? sender.tab.id : null;
      const found = tabId != null ? await findDiscoveryByTabId(tabId) : null;
      if (!found || !found.state || !found.state.running) { sendResponse({ ok: true, ignored: true }); return true; }
      const webSessionId = found.webSessionId;
      const d = found.state;
      if (msg.error) { await discoveryStep(webSessionId); sendResponse({ ok: true }); return true; }
      try {
        const result = await invokeFunction('webConnectorExtension', {
          operation: 'submitSnapshot',
          webSessionId: d.webSessionId,
          currentUrl: msg.currentUrl,
          snapshotText: msg.snapshotText,
          links: msg.links,
        });
        const saved = (result && result.candidatesSaved) ? result.candidatesSaved : 0;
        d.candidatesSoFar = (d.candidatesSoFar || 0) + saved;
      } catch (e) { /* segue pra proxima */ }
      d.pagesDone = (d.pagesDone || 0) + 1;
      const newLinks = [];
      for (const l of (msg.links || [])) {
        if (!l || !l.href) continue;
        if (d.visited.indexOf(l.href) !== -1 || d.queue.indexOf(l.href) !== -1) continue;
        if (/\/login|\/logout|\/signup|\/register/i.test(l.href)) continue;
        if (!sameDomain(l.href, d.siteUrl)) continue;
        newLinks.push(l);
      }
      newLinks.sort((a, b) => {
        const ak = ACCOUNT_AREA_KEYWORDS.test(a.text) ? 0 : 1;
        const bk = ACCOUNT_AREA_KEYWORDS.test(b.text) ? 0 : 1;
        return ak - bk;
      });
      for (const l of newLinks.slice(0, 30)) d.queue.push(l.href);
      await setDiscovery(webSessionId, d);
      chrome.runtime.sendMessage({ type: 'MEMOS_DISCOVERY_PROGRESS', webSessionId, siteUrl: d.siteUrl, pagesDone: d.pagesDone, candidatesSoFar: d.candidatesSoFar }, () => { void chrome.runtime.lastError; });
      await discoveryStep(webSessionId);
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// ── Execucao de capability (Sprint 3) ────────────────────────────────────
function navigateAndWait(tabId, url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url }).then(() => setTimeout(finish, 10000)).catch(() => finish());
    setTimeout(finish, 12000);
  });
}

function pageExecute(spec) {
  return (async () => {
    const fields = (spec.inputFields || []).map(function (n) {
      return { name: String(n), value: spec.inputs && spec.inputs[n] != null ? String(spec.inputs[n]) : '' };
    });
    var matchField = function (frm, n) {
      var nn = String(n || '').toLowerCase();
      var els = Array.from(frm.querySelectorAll('input, select, textarea'));
      for (var i = 0; i < els.length; i++) {
        var e = els[i];
        if ((e.getAttribute('name') || '').toLowerCase() === nn || (e.getAttribute('id') || '').toLowerCase() === nn) return e;
      }
      for (var j = 0; j < els.length; j++) {
        var e2 = els[j];
        var ph = (e2.getAttribute('placeholder') || '').toLowerCase();
        var al = (e2.getAttribute('aria-label') || '').toLowerCase();
        var lt = '';
        if (e2.id) { var lbl = frm.querySelector('label[for="' + e2.id + '"]'); if (lbl) lt = lbl.textContent.toLowerCase(); }
        if (!lt) { var w = e2.closest('label'); if (w) lt = w.textContent.toLowerCase(); }
        if ((ph && ph.indexOf(nn) !== -1) || (al && al.indexOf(nn) !== -1) || (lt && lt.indexOf(nn) !== -1)) return e2;
      }
      var searchRe = /(digite|buscar|pesquisar|procurar|search|find|query|keyword|palavra|as_word)/i;
      if (searchRe.test(nn)) {
        for (var k = 0; k < els.length; k++) {
          var e3 = els[k];
          if (e3.type === 'search') return e3;
          var ph2 = (e3.getAttribute('placeholder') || '').toLowerCase();
          var al2 = (e3.getAttribute('aria-label') || '').toLowerCase();
          var nm2 = (e3.getAttribute('name') || '').toLowerCase();
          var id2 = (e3.getAttribute('id') || '').toLowerCase();
          if (searchRe.test(ph2) || searchRe.test(al2) || searchRe.test(nm2) || searchRe.test(id2)) return e3;
        }
      }
      return null;
    };
    var forms = Array.from(document.querySelectorAll('form'));
    var best = null, bestScore = 0;
    for (var f = 0; f < forms.length; f++) {
      var score = 0;
      for (var g = 0; g < fields.length; g++) { if (matchField(forms[f], fields[g].name)) score++; }
      if (score > bestScore) { bestScore = score; best = forms[f]; }
    }
    if (!best || bestScore === 0) return { error: 'form_not_found', url: location.href };
    var btns = Array.from(best.querySelectorAll('button, input[type=submit], input[type=button]'));
    var guardRe = /(salvar|excluir|deletar|apagar|cancelar|enviar|criar|editar|create|edit|delete|remove|update|submeter)/i;
    var offending = btns.map(function (b) { return (b.textContent || b.value || '').trim(); }).filter(function (t) { return guardRe.test(t); });
    if (offending.length > 0) return { error: 'write_guard', buttons: offending };
    var filled = [];
    for (var h = 0; h < fields.length; h++) {
      var el = matchField(best, fields[h].name);
      if (el) {
        try {
          if (el.tagName.toLowerCase() === 'select') { el.value = fields[h].value; }
          else { el.focus(); el.value = fields[h].value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
          filled.push(fields[h].name);
        } catch (e) {}
      }
    }
    if (filled.length === 0) return { error: 'no_field_filled', url: location.href };
    var sBtn = null;
    for (var b = 0; b < btns.length; b++) {
      var t = (btns[b].textContent || btns[b].value || '').trim();
      if (/(buscar|pesquisar|consultar|filtrar|search|find|consult|listar|go)/i.test(t)) { sBtn = btns[b]; break; }
    }
    if (!sBtn) sBtn = btns[0] || null;
    await new Promise(function (resolve) {
      var done2 = false;
      var fin = function () { if (!done2) { done2 = true; resolve(); } };
      if (window.navigation) { try { window.navigation.addEventListener('navigatesuccess', fin, { once: true }); } catch (e) {} }
      setTimeout(fin, 8000);
      try { if (sBtn) sBtn.click(); else if (best.requestSubmit) best.requestSubmit(); else best.submit(); }
      catch (e) { try { best.submit(); } catch (e2) { fin(); } }
    });
    await new Promise(function (r) { setTimeout(r, 2000); });
    await new Promise(function (resolve) {
      var c = 0;
      var s = function () { window.scrollBy(0, Math.max(window.innerHeight * 2, 1200)); c++; if (c < 5) setTimeout(s, 400); else { window.scrollTo(0, 0); resolve(); } };
      s();
    });
    await new Promise(function (r) { setTimeout(r, 1000); });
    var rd = (function () {
      var parts = location.hostname.split('.');
      var tld = ['com.br', 'co.uk', 'com.au', 'org.br', 'net.br'];
      var last2 = parts.slice(-2).join('.');
      if (tld.indexOf(last2) !== -1 && parts.length >= 3) return parts.slice(-3).join('.');
      return last2;
    })();
    var productRe = /\/(p|dp|produto|item|pd|listados|detalle|product)\/|MLB-?\d|\/item\//i;
    var catRe = /\/(c|categorias|ofertas|l|gz|assinaturas|importados|mais-vendidos|categorias)\b/i;
    var curPath = location.pathname;
    var collect = function (filter) {
      var list = [];
      var anchors = Array.from(document.querySelectorAll('a[href]'));
      for (var a = 0; a < anchors.length; a++) {
        var aEl = anchors[a];
        var href = aEl.href;
        if (!href) continue;
        var h; try { h = new URL(href); } catch (e) { continue; }
        if (!h.hostname.endsWith(rd)) continue;
        if (/\/(login|logout|signup|register|auth|conta|minha-conta|ajuda|vendas|favoritos|carrinho|ofertas)\b/i.test(h.pathname)) continue;
        if (h.pathname === curPath || h.pathname === '/' || h.pathname === '') continue;
        if (!filter(h, aEl)) continue;
        var text = (aEl.innerText || aEl.textContent || '').trim();
        if (text.length < 8) continue;
        var card = aEl.closest('li, article, [class*=ui-search-result], [class*=item], [class*=card], [class*=product]');
        var cardText = card ? (card.innerText || '').trim().slice(0, 400) : '';
        list.push({ text: text.slice(0, 200), href: href, cardText: cardText });
      }
      return list;
    };
    var productAnchors = collect(function (h) { return productRe.test(h.pathname + h.search) && !catRe.test(h.pathname); });
    var genericAnchors = collect(function (h) { return !catRe.test(h.pathname); });
    var out = productAnchors.length > 0 ? productAnchors : genericAnchors;
    var seen = {}, dedup = [];
    for (var i = 0; i < out.length; i++) { if (seen[out[i].href]) continue; seen[out[i].href] = true; dedup.push(out[i]); }
    return { url: location.href, filled: filled, links: dedup.slice(0, 30) };
  })();
}

// ── Driver de descoberta (BFS orientado a eventos, MULTI-SITE) ───────────
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function sameDomain(a, b) {
  const ha = hostOf(a), hb = hostOf(b);
  if (!ha || !hb) return false;
  return ha === hb || ha.endsWith('.' + hb) || hb.endsWith('.' + ha);
}

async function discoveryStep(webSessionId) {
  const d = await getDiscovery(webSessionId);
  if (!d || !d.running) return;
  if (d.pagesDone >= DISCOVERY_MAX_PAGES || d.queue.length === 0) {
    await setDiscovery(webSessionId, null);
    chrome.runtime.sendMessage({ type: 'MEMOS_DISCOVERY_DONE', webSessionId, siteUrl: d.siteUrl, candidatesSoFar: d.candidatesSoFar || 0, pagesDone: d.pagesDone || 0 }, () => { void chrome.runtime.lastError; });
    return;
  }
  const nextUrl = d.queue.shift();
  if (d.visited.indexOf(nextUrl) !== -1) { await discoveryStep(webSessionId); return; }
  d.visited.push(nextUrl);
  d.expectingSnapshot = true;
  await setDiscovery(webSessionId, d);
  try { await chrome.tabs.update(d.tabId, { url: nextUrl }); }
  catch (e) { await setDiscovery(webSessionId, null); }
}

// Roteia updates de aba para a descoberta correta (por tabId), permitindo
// que varias abas naveguem simultaneamente sem se confundirem.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  (async () => {
    if (info.status !== 'complete') return;
    const found = await findDiscoveryByTabId(tabId);
    if (!found || !found.state || !found.state.running || !found.state.expectingSnapshot) return;
    const { webSessionId, state: d } = found;
    d.expectingSnapshot = false;
    await setDiscovery(webSessionId, d);
    try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content-site.js'] }); }
    catch (e) { /* best-effort */ }
  })();
});

// ── Heartbeat periodico: percorre TODAS as sessoes ───────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return;
  (async () => {
    const sessions = await getSessions();
    if (sessions.length === 0) { await chrome.alarms.clear(HEARTBEAT_ALARM); return; }
    const surviving = [];
    for (const s of sessions) {
      let alive = true;
      try { await chrome.tabs.get(s.tabId); }
      catch (e) {
        alive = false;
        try { await invokeFunction('webConnectorExtension', { operation: 'revoke', webSessionId: s.webSessionId }); }
        catch (e2) { /* best-effort */ }
      }
      if (alive) {
        try { await invokeFunction('webConnectorExtension', { operation: 'heartbeat', webSessionId: s.webSessionId }); }
        catch (e) { /* heartbeat falhou mas aba existe: mantem */ }
        surviving.push(s);
      } else {
        await setDiscovery(s.webSessionId, null);
      }
    }
    if (surviving.length !== sessions.length) {
      await setSessions(surviving);
      const activeId = await getActiveId();
      if (activeId && !surviving.find((x) => x.webSessionId === activeId)) {
        await setActiveId(surviving[0] ? surviving[0].webSessionId : null);
      }
      if (surviving.length === 0) await chrome.alarms.clear(HEARTBEAT_ALARM);
    }

    // Fix (2026-08-11): a cada heartbeat, tambem verifica se o chat pediu
    // alguma execucao em algum dos sites conectados ("camada de
    // inteligencia" multi-site). Busca TODAS as tarefas pendentes de uma vez
    // e executa TODAS EM PARALELO (Promise.all) — se o chat pediu dados de
    // 3 sites diferentes numa mesma pergunta, os 3 rodam juntos neste unico
    // ciclo, nao um atras do outro.
    if (surviving.length > 0) {
      try { await pollAndRunPendingTasks(surviving); }
      catch (e) { /* best-effort: tenta de novo no proximo ciclo */ }
    }
  })();
});

// Busca tarefas pendentes (de qualquer site conectado) e executa todas em
// paralelo. Cada tarefa roda na aba do seu proprio site (independente),
// entao rodar N tarefas ao mesmo tempo nao trava umas nas outras.
async function pollAndRunPendingTasks(sessions) {
  const webSessionIds = sessions.map((s) => s.webSessionId);
  const pollRes = await invokeFunction('webConnectorExtension', { operation: 'pollTasks', webSessionIds });
  const tasks = (pollRes && Array.isArray(pollRes.tasks)) ? pollRes.tasks : [];
  if (tasks.length === 0) return;

  await Promise.all(tasks.map(async (task) => {
    const session = sessions.find((s) => s.webSessionId === task.web_session_id);
    if (!session) {
      try { await invokeFunction('webConnectorExtension', { operation: 'completeTask', requestId: task.id, error: 'site_not_connected_in_this_browser' }); } catch (e) {}
      return;
    }
    try {
      let inputFields = [];
      let inputs = {};
      try { inputFields = JSON.parse(task.input_fields || '[]'); } catch (e) {}
      try { inputs = JSON.parse(task.inputs || '{}'); } catch (e) {}
      const spec = { discoveredFromUrl: task.discovered_from_url, inputFields, inputs };
      await navigateAndWait(session.tabId, spec.discoveredFromUrl);
      const injectRes = await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: pageExecute, args: [spec] });
      const result = (injectRes && injectRes[0] && injectRes[0].result) ? injectRes[0].result : { error: 'no_result' };
      if (result && result.error) {
        await invokeFunction('webConnectorExtension', { operation: 'completeTask', requestId: task.id, error: String(result.error) });
      } else {
        await invokeFunction('webConnectorExtension', { operation: 'completeTask', requestId: task.id, result });
      }
    } catch (e) {
      try { await invokeFunction('webConnectorExtension', { operation: 'completeTask', requestId: task.id, error: e.message || String(e) }); } catch (e2) {}
    }
  }));
}

chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    const sessions = await getSessions();
    const target = sessions.find((s) => s.tabId === tabId);
    if (target) {
      try { await invokeFunction('webConnectorExtension', { operation: 'revoke', webSessionId: target.webSessionId }); }
      catch (e) { /* best-effort */ }
      const remaining = sessions.filter((s) => s.webSessionId !== target.webSessionId);
      await setSessions(remaining);
      const activeId = await getActiveId();
      if (activeId === target.webSessionId) {
        await setActiveId(remaining[0] ? remaining[0].webSessionId : null);
      }
      await setDiscovery(target.webSessionId, null);
      if (remaining.length === 0) await chrome.alarms.clear(HEARTBEAT_ALARM);
    }
  })();
});
