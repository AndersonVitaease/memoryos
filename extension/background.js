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