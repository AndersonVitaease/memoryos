/**
 * background.js — Service worker (MV3) do MemoryOS Browser Bridge.
 *
 * Sprint 1: captura do token de auth (via content-app.js no dominio do app),
 * registro de sessao (registerSession), heartbeat periodico via chrome.alarms
 * + deteccao de aba fechada (revoke automatico).
 *
 * O service worker MV3 e efemero — nao mantem timers. Toda a logica periodica
 * usa chrome.alarms. O estado da sessao conectada vive em chrome.storage.local.
 */

const APP_DOMAINS = [
  'https://ever-mind-core.base44.app',
  'https://preview--ever-mind-core.base44.app',
];
const HEARTBEAT_ALARM = 'memos-heartbeat';
const HEARTBEAT_INTERVAL_MIN = 5; // a cada 5 min — bem abaixo do TTL de 30min do backend

// ── Token capture (vindo do content-app.js no dominio do app) ───────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'MEMOS_TOKEN_CAPTURE' && msg.token) {
    chrome.storage.local.set({
      memos_token: msg.token,
      memos_app_base_url: msg.appBaseUrl || sender.tab?.url?.replace(/\/$/, '') || '',
      memos_captured_at: Date.now(),
    }, () => sendResponse({ ok: true }));
    return true; // async
  }
  if (msg && msg.type === 'MEMOS_GET_STATUS') {
    chrome.storage.local.get(['memos_token', 'memos_app_base_url', 'memos_session'], (s) => {
      sendResponse({
        hasToken: !!s.memos_token,
        appBaseUrl: s.memos_app_base_url || null,
        session: s.memos_session || null,
      });
    });
    return true;
  }
});

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

// ── Registro de sessao (chamado pelo popup) ─────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'MEMOS_CONNECT_SITE') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) {
          sendResponse({ ok: false, error: 'Aba atual nao tem URL valida.' });
          return;
        }
        const siteUrl = new URL(tab.url).origin; // so origin para registro
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
        // Garante alarm de heartbeat
        await chrome.alarms.clear(HEARTBEAT_ALARM);
        chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
        sendResponse({ ok: true, session });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }

  if (msg && msg.type === 'MEMOS_DISCONNECT') {
    (async () => {
      try {
        const { memos_session } = await chrome.storage.local.get(['memos_session']);
        if (memos_session && memos_session.webSessionId) {
          try {
            await invokeFunction('webConnectorExtension', {
              operation: 'revoke',
              webSessionId: memos_session.webSessionId,
            });
          } catch (e) { /* best-effort: ja revoga localmente */ }
        }
        await chrome.storage.local.remove('memos_session');
        await chrome.alarms.clear(HEARTBEAT_ALARM);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }
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
    // Aba ainda existe?
    try {
      await chrome.tabs.get(memos_session.tabId);
    } catch (e) {
      // Aba fechada -> revoga automaticamente
      try {
        await invokeFunction('webConnectorExtension', {
          operation: 'revoke',
          webSessionId: memos_session.webSessionId,
        });
      } catch (e2) { /* best-effort */ }
      await chrome.storage.local.remove('memos_session');
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      return;
    }
    // Aba viva -> heartbeat
    try {
      await invokeFunction('webConnectorExtension', {
        operation: 'heartbeat',
        webSessionId: memos_session.webSessionId,
      });
    } catch (e) {
      // Sessao pode ter sido revogada/expirada server-side; limpa local
      await chrome.storage.local.remove('memos_session');
      await chrome.alarms.clear(HEARTBEAT_ALARM);
    }
  })();
});

// ── Detecao imediata de aba fechada (nao espera o proximo alarm) ────────
chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    const { memos_session } = await chrome.storage.local.get(['memos_session']);
    if (memos_session && memos_session.tabId === tabId) {
      try {
        await invokeFunction('webConnectorExtension', {
          operation: 'revoke',
          webSessionId: memos_session.webSessionId,
        });
      } catch (e) { /* best-effort */ }
      await chrome.storage.local.remove('memos_session');
      await chrome.alarms.clear(HEARTBEAT_ALARM);
    }
  })();
});