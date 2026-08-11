/**
 * background.js — Service worker (MV3) do MemoryOS Browser Bridge.
 *
 * Sprint 1: captura do token de auth (via content-app.js no dominio do app),
 * registro de sessao (registerSession), heartbeat periodico via chrome.alarms
 * + deteccao de aba fechada (revoke automatico).
 *
 * Sprint 2: descoberta de capabilities. O service worker dirige a BFS —
 * navega a aba autenticada, injeta content-site.js (via chrome.scripting) a
 * cada pagina carregada, recebe o snapshot+links, chama o backend
 * submitSnapshot (que roda o LLM e salva CapabilityCandidate), enfileira os
 * links novos do mesmo dominio e repete. O estado da descoberta vive em
 * chrome.storage.local (sobrevive a reinicios do service worker MV3, que e
 * efemero).
 *
 * O service worker MV3 nao mantem timers; toda logica periodica usa
 * chrome.alarms. O driver de descoberta e orientado a eventos:
 * tabs.onUpdated (complete) -> injeta extrator -> mensagem -> proxima pagina.
 */

const HEARTBEAT_ALARM = 'memos-heartbeat';
const HEARTBEAT_INTERVAL_MIN = 5;
const DISCOVERY_STATE_KEY = 'memos_discovery';
const DISCOVERY_MAX_PAGES = 10;
// Palavras-chave de areas de conta relevantes — usadas para priorizar quais
// links enfileirar primeiro (mesma heuristica do webConnectorDiscover BFS).
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memos_token}`,
    },
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

// ── Message router (um unico listener, todos os tipos) ──────────────────
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

  // Status (popup)
  if (msg.type === 'MEMOS_GET_STATUS') {
    chrome.storage.local.get(['memos_token', 'memos_app_base_url', 'memos_session', DISCOVERY_STATE_KEY], (s) => {
      sendResponse({
        hasToken: !!s.memos_token,
        appBaseUrl: s.memos_app_base_url || null,
        session: s.memos_session || null,
        discoveryRunning: !!(s[DISCOVERY_STATE_KEY] && s[DISCOVERY_STATE_KEY].running),
      });
    });
    return true;
  }

  // Conectar o site da aba ativa
  if (msg.type === 'MEMOS_CONNECT_SITE') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) {
          sendResponse({ ok: false, error: 'Aba atual nao tem URL valida.' });
          return;
        }
        const siteUrl = new URL(tab.url).origin;
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
          expiresAt: result.expiresAt,
          connectedAt: Date.now(),
        };
        await chrome.storage.local.set({ memos_session: session });
        await chrome.alarms.clear(HEARTBEAT_ALARM);
        chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
        sendResponse({ ok: true, session });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Desconectar
  if (msg.type === 'MEMOS_DISCONNECT') {
    (async () => {
      try {
        const { memos_session } = await chrome.storage.local.get(['memos_session']);
        if (memos_session && memos_session.webSessionId) {
          try {
            await invokeFunction('webConnectorExtension', {
              operation: 'revoke',
              webSessionId: memos_session.webSessionId,
            });
          } catch (e) { /* best-effort */ }
        }
        await chrome.storage.local.remove(['memos_session', DISCOVERY_STATE_KEY]);
        await chrome.alarms.clear(HEARTBEAT_ALARM);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Iniciar descoberta (Sprint 2)
  if (msg.type === 'MEMOS_START_DISCOVERY') {
    (async () => {
      try {
        const { memos_session } = await chrome.storage.local.get(['memos_session']);
        if (!memos_session || !memos_session.webSessionId) {
          sendResponse({ ok: false, error: 'Nenhum site conectado. Conecte um site primeiro.' });
          return;
        }
        const d = {
          webSessionId: memos_session.webSessionId,
          tabId: memos_session.tabId,
          siteUrl: memos_session.siteUrl,
          queue: [memos_session.siteUrl],
          visited: [],
          pagesDone: 0,
          candidatesSoFar: 0,
          running: true,
          expectingSnapshot: false,
        };
        await chrome.storage.local.set({ [DISCOVERY_STATE_KEY]: d });
        await discoveryStep();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Parar descoberta
  if (msg.type === 'MEMOS_STOP_DISCOVERY') {
    (async () => {
      await chrome.storage.local.remove(DISCOVERY_STATE_KEY);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Listar capabilities validadas do site (Sprint 3)
  if (msg.type === 'MEMOS_LIST_CAPABILITIES') {
    (async () => {
      try {
        const { memos_session } = await chrome.storage.local.get(['memos_session']);
        if (!memos_session || !memos_session.webSessionId) {
          sendResponse({ ok: false, error: 'Nenhum site conectado.' });
          return;
        }
        const result = await invokeFunction('webConnectorExtension', {
          operation: 'listCapabilities',
          webSessionId: memos_session.webSessionId,
        });
        sendResponse({ ok: true, capabilities: result.capabilities || [] });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Executar capability (Sprint 3): navega a aba ate a URL de descoberta,
  // injeta pageExecute (fill + write-guard + submit + captura links), e
  // registra o resultado no backend. O write-guard e enforced no DOM —
  // formulario com botao de escrita (Salvar/Excluir/...) aborta.
  if (msg.type === 'MEMOS_EXECUTE_CAPABILITY') {
    (async () => {
      try {
        const { memos_session } = await chrome.storage.local.get(['memos_session']);
        if (!memos_session || !memos_session.webSessionId) {
          sendResponse({ ok: false, error: 'Nenhum site conectado.' });
          return;
        }
        const spec = {
          discoveredFromUrl: msg.discoveredFromUrl,
          inputFields: msg.inputFields,
          inputs: msg.inputs,
        };
        await navigateAndWait(memos_session.tabId, spec.discoveredFromUrl);
        const injectRes = await chrome.scripting.executeScript({
          target: { tabId: memos_session.tabId },
          func: pageExecute,
          args: [spec],
        });
        const result = (injectRes && injectRes[0] && injectRes[0].result) ? injectRes[0].result : { error: 'no_result' };
        try {
          await invokeFunction('webConnectorExtension', {
            operation: 'recordExecution',
            webSessionId: memos_session.webSessionId,
            discoveredFromUrl: spec.discoveredFromUrl,
            inputFields: spec.inputFields,
            inputs: spec.inputs,
            result,
          });
        } catch (e) { /* best-effort: auditoria */ }
        sendResponse({ ok: true, result });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  // Snapshot recebido do content-site.js (uma por pagina)
  if (msg.type === 'MEMOS_SNAPSHOT_RESULT') {
    (async () => {
      const d = await getDiscovery();
      if (!d || !d.running) { sendResponse({ ok: true, ignored: true }); return true; }
      if (msg.error) {
        await discoveryStep();
        sendResponse({ ok: true });
        return true;
      }
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
      } catch (e) {
        // erro no backend: segue para a proxima pagina
      }
      d.pagesDone = (d.pagesDone || 0) + 1;
      // Enfileira links novos (mesmo dominio, nao visitados, nao login).
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
      await chrome.storage.local.set({ [DISCOVERY_STATE_KEY]: d });
      chrome.runtime.sendMessage({ type: 'MEMOS_DISCOVERY_PROGRESS', pagesDone: d.pagesDone, candidatesSoFar: d.candidatesSoFar }, () => { void chrome.runtime.lastError; });
      await discoveryStep();
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// ── Execucao de capability (Sprint 3) ────────────────────────────────────
// Navega a aba ate a URL alvo e espera carregar (com timeout). O service
// worker MV3 nao tem timers; usa o evento tabs.onUpdated + fallback de
// setTimeout para garantir resolucao mesmo se o evento nao disparar.
function navigateAndWait(tabId, url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url }).then(() => setTimeout(finish, 10000)).catch(() => finish());
    setTimeout(finish, 12000);
  });
}

// pageExecute roda no DOM da aba autenticada (isolated world). Espelha a
// logica de field-matching + write-guard + captura de links do
// webConnectorConnect.executeCapability (headless), mas operando direto em
// document. Recebe { discoveredFromUrl, inputFields, inputs } via args.
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
        if (e2.id) {
          var lbl = frm.querySelector('label[for="' + e2.id + '"]');
          if (lbl) lt = lbl.textContent.toLowerCase();
        }
        if (!lt) {
          var w = e2.closest('label');
          if (w) lt = w.textContent.toLowerCase();
        }
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
      for (var g = 0; g < fields.length; g++) {
        if (matchField(forms[f], fields[g].name)) score++;
      }
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
          if (el.tagName.toLowerCase() === 'select') {
            el.value = fields[h].value;
          } else {
            el.focus();
            el.value = fields[h].value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
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
      try {
        if (sBtn) sBtn.click();
        else if (best.requestSubmit) best.requestSubmit();
        else best.submit();
      } catch (e) { try { best.submit(); } catch (e2) { fin(); } }
    });
    await new Promise(function (r) { setTimeout(r, 2000); });
    await new Promise(function (resolve) {
      var c = 0;
      var s = function () {
        window.scrollBy(0, Math.max(window.innerHeight * 2, 1200));
        c++;
        if (c < 5) setTimeout(s, 400);
        else { window.scrollTo(0, 0); resolve(); }
      };
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
        var h;
        try { h = new URL(href); } catch (e) { continue; }
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
    for (var i = 0; i < out.length; i++) {
      if (seen[out[i].href]) continue;
      seen[out[i].href] = true;
      dedup.push(out[i]);
    }
    return { url: location.href, filled: filled, links: dedup.slice(0, 30) };
  })();
}

// ── Driver de descoberta (BFS orientado a eventos) ───────────────────────
async function getDiscovery() {
  const s = await chrome.storage.local.get([DISCOVERY_STATE_KEY]);
  return s[DISCOVERY_STATE_KEY] || null;
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function sameDomain(a, b) {
  const ha = hostOf(a), hb = hostOf(b);
  if (!ha || !hb) return false;
  return ha === hb || ha.endsWith('.' + hb) || hb.endsWith('.' + ha);
}

async function discoveryStep() {
  const d = await getDiscovery();
  if (!d || !d.running) return;
  if (d.pagesDone >= DISCOVERY_MAX_PAGES || d.queue.length === 0) {
    await chrome.storage.local.remove(DISCOVERY_STATE_KEY);
    chrome.runtime.sendMessage({ type: 'MEMOS_DISCOVERY_DONE', candidatesSoFar: d.candidatesSoFar || 0, pagesDone: d.pagesDone || 0 }, () => { void chrome.runtime.lastError; });
    return;
  }
  const nextUrl = d.queue.shift();
  if (d.visited.indexOf(nextUrl) !== -1) { await discoveryStep(); return; }
  d.visited.push(nextUrl);
  d.expectingSnapshot = true;
  await chrome.storage.local.set({ [DISCOVERY_STATE_KEY]: d });
  try {
    await chrome.tabs.update(d.tabId, { url: nextUrl });
  } catch (e) {
    // aba fechou -> limpa descoberta
    await chrome.storage.local.remove(DISCOVERY_STATE_KEY);
  }
}

// Quando a aba de descoberta termina de carregar, injeta o extrator.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  (async () => {
    const d = await getDiscovery();
    if (!d || d.tabId !== tabId || !d.running || !d.expectingSnapshot) return;
    if (info.status !== 'complete') return;
    d.expectingSnapshot = false;
    await chrome.storage.local.set({ [DISCOVERY_STATE_KEY]: d });
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-site.js'] });
    } catch (e) { /* best-effort: tab pode ter navegado pra fora do alcance */ }
  })();
});

// ── Heartbeat periodico + deteccao de aba fechada ───────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return;
  (async () => {
    const { memos_session } = await chrome.storage.local.get(['memos_session']);
    if (!memos_session || !memos_session.webSessionId) {
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      return;
    }
    try {
      await chrome.tabs.get(memos_session.tabId);
    } catch (e) {
      try {
        await invokeFunction('webConnectorExtension', { operation: 'revoke', webSessionId: memos_session.webSessionId });
      } catch (e2) { /* best-effort */ }
      await chrome.storage.local.remove(['memos_session', DISCOVERY_STATE_KEY]);
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      return;
    }
    try {
      await invokeFunction('webConnectorExtension', { operation: 'heartbeat', webSessionId: memos_session.webSessionId });
    } catch (e) {
      await chrome.storage.local.remove('memos_session');
      await chrome.alarms.clear(HEARTBEAT_ALARM);
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    const { memos_session } = await chrome.storage.local.get(['memos_session']);
    if (memos_session && memos_session.tabId === tabId) {
      try {
        await invokeFunction('webConnectorExtension', { operation: 'revoke', webSessionId: memos_session.webSessionId });
      } catch (e) { /* best-effort */ }
      await chrome.storage.local.remove(['memos_session', DISCOVERY_STATE_KEY]);
      await chrome.alarms.clear(HEARTBEAT_ALARM);
    }
    // Limpa descoberta se a aba fechada era a de descoberta
    const d = await getDiscovery();
    if (d && d.tabId === tabId) {
      await chrome.storage.local.remove(DISCOVERY_STATE_KEY);
    }
  })();
});