/**
 * extensionDownload — serve os arquivos da extensao Chrome (MemoryOS Browser
 * Bridge) para download via PowerShell. Endpoint PUBLICO (sem auth) — e so
 * codigo de cliente, nenhum segredo. O usuario roda Invoke-RestMethod no
 * PowerShell, baixa os arquivos e sobrescreve a pasta local da extensao.
 *
 * Arquivos incluidos aqui sao os que NAO precisam de escape especial
 * (sem backticks/backslashes dentro do conteudo). background.js e
 * content-site.js tem regexes com backslashes e serao entregues separadamente.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import JSZip from 'npm:jszip@3.10.1';

const FILES = {
  'manifest.json': `{
  "manifest_version": 3,
  "name": "MemoryOS Browser Bridge",
  "version": "0.3.1",
  "description": "Conecta sites autenticados ao MemoryOS, rodando dentro do seu Chrome real (passa por Cloudflare/anti-bot nativamente).",
  "permissions": [
    "storage",
    "alarms",
    "tabs",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://ever-mind-core.base44.app/*",
    "https://preview--ever-mind-core.base44.app/*",
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://ever-mind-core.base44.app/*",
        "https://preview--ever-mind-core.base44.app/*"
      ],
      "js": ["content-app.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "MemoryOS Browser Bridge"
  }
}`,
  'popup.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="header">
    <strong>MemoryOS Bridge</strong>
    <span id="status-dot" class="dot dot-off"></span>
  </div>
  <div id="auth-status" class="muted">Verificando…</div>
  <button id="auth-btn" class="btn btn-secondary hidden">Autenticar com a aba atual do MemoryOS</button>

  <div class="section-title">Sites conectados</div>
  <div id="sessions-list" class="sessions-list"></div>

  <div class="connect-hint">Abra a aba do site que deseja conectar e clique abaixo:</div>
  <button id="connect-btn" class="btn btn-primary" disabled>Conectar a aba atual</button>
  <button id="discover-btn" class="btn btn-secondary hidden">Descobrir no site ativo</button>
  <div id="discovery-status" class="discovery-status hidden"></div>

  <div id="exec-panel" class="exec-panel hidden">
    <div class="section-title">Executar capability (<span id="active-site-label"></span>)</div>
    <select id="cap-select" class="select"></select>
    <input id="cap-input" class="input" placeholder="Termo de busca" />
    <button id="exec-btn" class="btn btn-primary" disabled>Executar</button>
    <div id="exec-status" class="discovery-status hidden"></div>
  </div>

  <div id="error-msg" class="error hidden"></div>
  <div class="footer muted">Conecte varios sites: cada aba vira uma sessao. Abra o app MemoryOS no Chrome para autenticar.</div>
  <script src="popup.js"></script>
</body>
</html>`,
  'popup.css': `body {
  width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  margin: 0;
  padding: 12px;
  color: #111;
}
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-on { background: #22c55e; }
.dot-off { background: #d1d5db; }
.muted { color: #6b7280; font-size: 12px; }
.label { color: #6b7280; }
.session-info { margin: 8px 0; padding: 8px; background: #f9fafb; border-radius: 6px; font-size: 12px; }
.session-info div { margin: 2px 0; }
.btn { width: 100%; padding: 8px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; margin-top: 6px; }
.btn-primary { background: #7c3aed; color: white; }
.btn-primary:disabled { background: #d1d5db; cursor: not-allowed; }
.btn-danger { background: #ef4444; color: white; }
.btn-secondary { background: #f3f4f6; color: #374151; }
.btn-secondary:disabled { color: #9ca3af; }
.discovery-status { font-size: 12px; margin-top: 6px; padding: 6px; background: #eff6ff; border-radius: 6px; color: #1e40af; }
.badge-discovering { font-size: 10px; font-weight: 600; color: #7c3aed; background: #ede9fe; padding: 1px 6px; border-radius: 999px; margin-left: 4px; }
.exec-panel { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
.section-title { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.select, .input { width: 100%; padding: 6px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; margin-top: 4px; box-sizing: border-box; }
#cap-select { background: white; }
.error { color: #ef4444; font-size: 12px; margin-top: 6px; }
.footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
.hidden { display: none; }
.connect-hint { font-size: 11px; color: #6b7280; margin-top: 8px; margin-bottom: 4px; }
.sessions-list { margin-bottom: 4px; }
.session-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 4px; }
.session-row-active { border-color: #7c3aed; background: #f5f3ff; }
.session-row-main { flex: 1; min-width: 0; }
.session-row-host { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.session-row-meta { font-size: 11px; color: #6b7280; }
.session-row-actions { display: flex; gap: 4px; margin-left: 6px; }
.btn-mini { padding: 3px 8px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 11px; cursor: pointer; background: white; }
.btn-activate { background: #7c3aed; color: white; border-color: #7c3aed; }
.btn-danger-mini { background: white; color: #ef4444; border-color: #fecaca; }
.btn-danger-mini:hover { background: #fef2f2; }
.small { font-size: 11px; }`,
  'content-app.js': `/**
 * content-app.js — Roda SOMENTE no dominio do app MemoryOS (ver manifest.json
 * content_scripts.matches). Le o token de auth do localStorage do app e envia
 * pro service worker, que guarda em chrome.storage.local para usar nas
 * chamadas as backend functions a partir de qualquer aba.
 *
 * O token vive em localStorage['base44_access_token'] (ver app-params.js).
 */
(function () {
  try {
    const token = localStorage.getItem('base44_access_token');
    if (!token) return; // usuario nao esta logado; nada a capturar
    const appBaseUrl = location.origin;
    chrome.runtime.sendMessage({ type: 'MEMOS_TOKEN_CAPTURE', token, appBaseUrl }, () => {
      // callback vazio — envio fire-and-forget; erros de "receiver missing" sao ignorados
      void chrome.runtime.lastError;
    });
  } catch (e) {
    // best-effort: nao quebra a pagina do app
  }
})();`,
  'popup.js': `const connectBtn = document.getElementById('connect-btn');
const authBtn = document.getElementById('auth-btn');
const discoverBtn = document.getElementById('discover-btn');
const discoveryStatus = document.getElementById('discovery-status');
const execPanel = document.getElementById('exec-panel');
const capSelect = document.getElementById('cap-select');
const capInput = document.getElementById('cap-input');
const execBtn = document.getElementById('exec-btn');
const execStatus = document.getElementById('exec-status');
const sessionsListEl = document.getElementById('sessions-list');
const activeSiteLabel = document.getElementById('active-site-label');
let loadedCapabilities = [];
let currentSessions = [];
let activeSessionId = null;
const authStatus = document.getElementById('auth-status');
const statusDot = document.getElementById('status-dot');
const errorMsg = document.getElementById('error-msg');

function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove('hidden'); }
function clearError() { errorMsg.classList.add('hidden'); errorMsg.textContent = ''; }

function fmtExpires(iso) {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso; }
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\\./, ''); } catch (e) { return u; } }

function renderSessions(sessions, activeId) {
  currentSessions = sessions || [];
  activeSessionId = activeId || (currentSessions[0] ? currentSessions[0].webSessionId : null);
  sessionsListEl.innerHTML = '';
  if (currentSessions.length === 0) {
    sessionsListEl.innerHTML = '<div class="muted small">Nenhum site conectado ainda.</div>';
    discoverBtn.classList.add('hidden');
    execPanel.classList.add('hidden');
    return;
  }
  currentSessions.forEach((s) => {
    const isActive = s.webSessionId === activeSessionId;
    const row = document.createElement('div');
    row.className = 'session-row' + (isActive ? ' session-row-active' : '');
    row.innerHTML =
      '<div class="session-row-main">' +
        '<div class="session-row-host">' + (isActive ? '● ' : '') + hostOf(s.siteUrl) + (s.discoveryRunning ? ' <span class="badge-discovering">descobrindo…</span>' : '') + '</div>' +
        '<div class="session-row-meta">expira ' + fmtExpires(s.expiresAt) + '</div>' +
      '</div>' +
      '<div class="session-row-actions">' +
        (isActive ? '' : '<button class="btn-mini btn-activate" data-id="' + s.webSessionId + '">Ativar</button>') +
        '<button class="btn-mini btn-danger-mini" data-id="' + s.webSessionId + '">Desconectar</button>' +
      '</div>';
    sessionsListEl.appendChild(row);
  });
  // Mostra painel de execucao/acao se houver sessao ativa
  const active = currentSessions.find((s) => s.webSessionId === activeSessionId);
  if (active) {
    activeSiteLabel.textContent = hostOf(active.siteUrl);
    discoverBtn.classList.remove('hidden');
    execPanel.classList.remove('hidden');
    loadCapabilities();
  } else {
    discoverBtn.classList.add('hidden');
    execPanel.classList.add('hidden');
  }
}

// Delegacao de cliques na lista de sessoes
sessionsListEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  if (!id) return;
  clearError();
  if (btn.classList.contains('btn-activate')) {
    chrome.runtime.sendMessage({ type: 'MEMOS_SET_ACTIVE', webSessionId: id }, (res) => {
      if (res && res.ok) refreshStatus();
    });
  } else if (btn.classList.contains('btn-danger-mini')) {
    chrome.runtime.sendMessage({ type: 'MEMOS_DISCONNECT', webSessionId: id }, (res) => {
      if (res && res.ok) refreshStatus();
      else showError(res && res.error ? res.error : 'Falha ao desconectar.');
    });
  }
});

function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'MEMOS_GET_STATUS' }, (status) => {
    if (chrome.runtime.lastError || !status) { authStatus.textContent = 'Erro ao verificar estado.'; return; }
    if (!status.hasToken) {
      authStatus.textContent = 'Extensao nao autenticada. Abra o app MemoryOS numa aba e clique abaixo:';
      statusDot.className = 'dot dot-off';
      connectBtn.disabled = true;
      authBtn.classList.remove('hidden');
      sessionsListEl.innerHTML = '<div class="muted small">Abra o app MemoryOS no Chrome, faca login, depois clique em "Autenticar".</div>';
      return;
    }
    authStatus.textContent = 'Autenticado ao MemoryOS.';
    statusDot.className = 'dot dot-on';
    connectBtn.disabled = false;
    authBtn.classList.add('hidden');
    // Diagnostico: se o bridge nao registrou, mostra o erro real pro usuario.
    if (!status.bridgeId) {
      authStatus.textContent = 'Autenticado, mas bridge nao registrado.';
      if (status.bridgeError) showError('Erro do bridge: ' + status.bridgeError);
      else showError('Bridge nao registrado. Clique em "Autenticar" numa aba do MemoryOS e tente de novo.');
    } else if (status.bridgeError) {
      showError('Aviso do bridge: ' + status.bridgeError);
    }
    renderSessions(status.sessions, status.activeSessionId);
    // Fix (2026-08-11): antes o botao "Descobrir" ficava travado se QUALQUER
    // site estivesse descobrindo (checagem global). Agora checa so o estado
    // do site ATIVO — varias descobertas rodam em paralelo em sites
    // diferentes sem travar o botao dos outros.
    const activeSession = (status.sessions || []).find((s) => s.webSessionId === status.activeSessionId);
    if (activeSession && activeSession.discoveryRunning) {
      discoverBtn.disabled = true;
      discoverBtn.textContent = 'Descobrindo…';
      discoveryStatus.textContent = 'Descoberta em andamento neste site' + (status.discoveryCount > 1 ? ' (' + status.discoveryCount + ' sites descobrindo ao mesmo tempo)' : '') + '.';
      discoveryStatus.classList.remove('hidden');
    } else {
      discoverBtn.disabled = false;
      discoverBtn.textContent = 'Descobrir no site ativo';
      if (status.discoveryCount > 0) {
        discoveryStatus.textContent = status.discoveryCount + ' outro(s) site(s) descobrindo em paralelo.';
        discoveryStatus.classList.remove('hidden');
      } else {
        discoveryStatus.classList.add('hidden');
      }
    }
  });
}

refreshStatus();

// Autenticacao manual via chrome.scripting — puxa o token do localStorage
// da aba ativa. Funciona em QUALQUER dominio do MemoryOS (preview de branch,
// producao, etc.), contornando a restricao de matches do content_scripts.
authBtn.addEventListener('click', () => {
  clearError();
  authBtn.disabled = true;
  authBtn.textContent = 'Autenticando…';
  // Puxa o token do localStorage da aba ativa via chrome.scripting.
  // Contorna a restricao de dominio do content_scripts — funciona em
  // qualquer preview de branch do MemoryOS, nao so nos 2 fixos do manifest.
  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !/^https?:\\/\\//.test(tab.url)) {
        throw new Error('Aba atual nao tem URL valida.');
      }
      let tabHost = '';
      try { tabHost = new URL(tab.url).hostname; } catch (e) {}
      if (!tabHost.endsWith('base44.app')) {
        throw new Error('A aba ativa nao e o app MemoryOS. Abra uma aba do MemoryOS logada e tente de novo.');
      }
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const token = localStorage.getItem('base44_access_token');
          return { token, origin: location.origin };
        },
      });
      const token = result && result.result && result.result.token;
      if (!token) {
        throw new Error('Voce nao esta logado no MemoryOS nesta aba. Faca login no app e tente de novo.');
      }
      // Reusa o handler MEMOS_TOKEN_CAPTURE do background (grava token +
      // registra bridge + inicia heartbeat), sem precisar mudar o background.
      chrome.runtime.sendMessage({ type: 'MEMOS_TOKEN_CAPTURE', token, appBaseUrl: result.result.origin }, (res) => {
        authBtn.disabled = false;
        authBtn.textContent = 'Autenticar com a aba atual do MemoryOS';
        if (res && res.ok) {
          refreshStatus();
        } else {
          showError(res && res.error ? res.error : 'Falha ao autenticar.');
        }
      });
    } catch (e) {
      authBtn.disabled = false;
      authBtn.textContent = 'Autenticar com a aba atual do MemoryOS';
      showError((e && e.message) ? e.message : 'Falha ao autenticar.');
    }
  })();
});

connectBtn.addEventListener('click', () => {
  clearError();
  connectBtn.disabled = true;
  connectBtn.textContent = 'Conectando…';
  // Fix (2026-08-11): rede de segurança — se o background nunca responder
  // (service worker morto, fetch pendurado), reseta o botao em 35s em vez
  // de deixar travado em "Conectando…" pra sempre.
  let done = false;
  const safety = setTimeout(() => {
    if (done) return;
    done = true;
    connectBtn.disabled = false;
    connectBtn.textContent = 'Conectar a aba atual';
    showError('Tempo esgotado ao conectar (35s). Verifique sua internet e tente novamente.');
  }, 35000);
  chrome.runtime.sendMessage({ type: 'MEMOS_CONNECT_SITE' }, (res) => {
    if (done) return;
    done = true;
    clearTimeout(safety);
    connectBtn.disabled = false;
    connectBtn.textContent = 'Conectar a aba atual';
    if (res && res.ok) {
      if (res.alreadyConnected) showError('Este site ja estava conectado — ativado.');
      refreshStatus();
    } else {
      showError(res && res.error ? res.error : 'Falha ao conectar.');
    }
  });
});

function loadCapabilities() {
  capSelect.innerHTML = '<option>Carregando…</option>';
  execBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'MEMOS_LIST_CAPABILITIES' }, (res) => {
    if (!res || !res.ok) {
      capSelect.innerHTML = '<option value="">Nenhuma (valide no MemoryOS)</option>';
      execBtn.disabled = true;
      if (res && res.error) showError(res.error);
      return;
    }
    loadedCapabilities = res.capabilities || [];
    if (loadedCapabilities.length === 0) {
      capSelect.innerHTML = '<option value="">Nenhuma validada — descubra e valide no MemoryOS</option>';
      execBtn.disabled = true;
      return;
    }
    capSelect.innerHTML = loadedCapabilities.map(function (c) {
      return '<option value="' + c.id + '">' + (c.description || c.id) + '</option>';
    }).join('');
    execBtn.disabled = false;
  });
}

execBtn.addEventListener('click', () => {
  clearError();
  const idx = capSelect.selectedIndex;
  const cap = loadedCapabilities[idx];
  if (!cap) { showError('Nenhuma capability selecionada.'); return; }
  const value = capInput.value.trim();
  if (!value) { showError('Digite um termo de busca.'); return; }
  let inputFields = [];
  try { if (cap.inputSchema && cap.inputSchema.properties) inputFields = Object.keys(cap.inputSchema.properties); } catch (e) {}
  if (inputFields.length === 0) inputFields = [cap.id];
  const inputs = {};
  inputs[inputFields[0]] = value;
  execBtn.disabled = true;
  execBtn.textContent = 'Executando…';
  execStatus.textContent = 'Navegando e preenchendo o formulario na aba do site…';
  execStatus.classList.remove('hidden');
  chrome.runtime.sendMessage({
    type: 'MEMOS_EXECUTE_CAPABILITY',
    discoveredFromUrl: cap.discoveredFrom,
    inputFields: inputFields,
    inputs: inputs,
  }, (res) => {
    execBtn.disabled = false;
    execBtn.textContent = 'Executar';
    if (!res || !res.ok) {
      execStatus.textContent = '';
      execStatus.classList.add('hidden');
      showError(res && res.error ? res.error : 'Falha ao executar.');
      return;
    }
    const r = res.result || {};
    if (r.error) {
      const msgs = {
        form_not_found: 'Formulario nao encontrado na pagina.',
        write_guard: 'Guarda de escrita: o formulario tem botoes de escrita (' + (r.buttons || []).join(', ') + '). Abortado.',
        no_field_filled: 'Nao foi possivel preencher nenhum campo.',
        no_result: 'Sem resultado da execucao.',
      };
      execStatus.textContent = 'Erro: ' + (msgs[r.error] || r.error);
      execStatus.classList.remove('hidden');
      return;
    }
    const links = r.links || [];
    execStatus.textContent = 'Executado: ' + links.length + ' resultado(s). Veja a aba do site.';
    execStatus.classList.remove('hidden');
  });
});

discoverBtn.addEventListener('click', () => {
  clearError();
  discoverBtn.disabled = true;
  discoverBtn.textContent = 'Iniciando…';
  chrome.runtime.sendMessage({ type: 'MEMOS_START_DISCOVERY' }, (res) => {
    if (res && res.ok) {
      discoveryStatus.textContent = 'Descoberta iniciada — a aba do site ativo vai navegar automaticamente. Nao feche o site.';
      discoveryStatus.classList.remove('hidden');
      discoverBtn.textContent = 'Descobrindo…';
    } else {
      discoverBtn.disabled = false;
      discoverBtn.textContent = 'Descobrir no site ativo';
      showError(res && res.error ? res.error : 'Falha ao iniciar descoberta.');
    }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  // Fix (2026-08-11): com descobertas paralelas, mensagens de progresso
  // chegam de VARIOS sites ao mesmo tempo — so atualiza a UI se for do site
  // atualmente ativo/exibido no popup, senao a barra de status vira uma
  // mistura confusa de progresso de sites diferentes.
  if (msg && msg.type === 'MEMOS_DISCOVERY_PROGRESS') {
    if (msg.webSessionId && msg.webSessionId !== activeSessionId) return;
    discoveryStatus.textContent = 'Descobrindo: ' + msg.pagesDone + ' pagina(s), ' + msg.candidatesSoFar + ' candidato(s).';
    discoveryStatus.classList.remove('hidden');
  }
  if (msg && msg.type === 'MEMOS_DISCOVERY_DONE') {
    if (msg.webSessionId && msg.webSessionId !== activeSessionId) { refreshStatus(); return; }
    discoveryStatus.textContent = 'Descoberta concluida: ' + msg.candidatesSoFar + ' candidato(s). Valide no /connections do MemoryOS.';
    discoveryStatus.classList.remove('hidden');
    discoverBtn.disabled = false;
    discoverBtn.textContent = 'Descobrir no site ativo';
  }
});`,
  'background.js': `/**
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
const BRIDGE_KEY = 'memos_bridge_id'; // Fase 5: identidade persistente da extensao
const DISCOVERY_MAX_PAGES = 10;
const ACCOUNT_AREA_KEYWORDS = /compra|pedido|venda|anuncio|publica|purchase|order|sale|listing|conta|account|historico|extrato|fatura|nota|pergunta|question|financeiro|reputa|relatorio|dashboard|estoque|produto/i;

// ── Fase 5: Bridge registry — identidade persistente da extensao ──────
// A extensao chama registerBridge no startup (se tem token). O backend
// emite um bridge_id estavel vinculado a user+workspace ativo, armazenado
// em chrome.storage.local e reapresentado em TODAS as operacoes. Reinstalacao
// (storage apagado) gera bridge novo — nunca herda identidade anterior.
async function ensureBridgeRegistered() {
  const { memos_token, memos_bridge_id, memos_app_base_url } = await chrome.storage.local.get(['memos_token', 'memos_bridge_id', 'memos_app_base_url']);
  if (!memos_token || !memos_app_base_url) return null;
  try {
    const url = \`\${memos_app_base_url}/functions/webConnectorExtension\`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${memos_token}\` },
      body: JSON.stringify({ operation: 'registerBridge', bridgeId: memos_bridge_id || '', extensionVersion: chrome.runtime.getManifest().version || '' }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (res.ok && data.bridgeId) {
      await chrome.storage.local.set({ memos_bridge_id: data.bridgeId, memos_bridge_error: '' });
      return data.bridgeId;
    }
    // Guarda o erro real pro popup exibir (antes era silenciado).
    const errMsg = (data && data.error) ? data.error : ('HTTP ' + res.status);
    await chrome.storage.local.set({ memos_bridge_error: errMsg });
  } catch (e) {
    await chrome.storage.local.set({ memos_bridge_error: (e && e.message) ? e.message : String(e) });
  }
  return memos_bridge_id || null;
}

async function getBridgeId() {
  const { memos_bridge_id } = await chrome.storage.local.get([BRIDGE_KEY]);
  return memos_bridge_id || null;
}

async function heartbeatBridge(bridgeId) {
  if (!bridgeId) return;
  const { memos_token, memos_app_base_url } = await chrome.storage.local.get(['memos_token', 'memos_app_base_url']);
  if (!memos_token) return;
  try {
    await fetch(\`\${memos_app_base_url}/functions/webConnectorExtension\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${memos_token}\` },
      body: JSON.stringify({ operation: 'heartbeatBridge', bridgeId }),
    });
  } catch (e) { /* best-effort */ }
}

// ── Helper: invoca uma backend function do MemoryOS ──────────────────────
async function invokeFunction(name, payload) {
  const { memos_token, memos_app_base_url } = await chrome.storage.local.get(['memos_token', 'memos_app_base_url']);
  if (!memos_token || !memos_app_base_url) {
    throw new Error('MemoryOS nao conectado. Abra o app MemoryOS no Chrome para autenticar a extensao.');
  }
  const url = \`\${memos_app_base_url}/functions/\${name}\`;
  // Fix (2026-08-11): sem timeout o fetch podia ficar pendurado pra sempre
  // se o backend demorava/nao respondia — o callback do popup nunca disparava
  // e o botao "Conectar" travava em "Conectando…". 30s e um balanco entre
  // dar tempo pra rede lenta e nao prender a UI indefinidamente.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${memos_token}\` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    throw new Error(e && e.name === 'AbortError' ? 'Tempo esgotado ao falar com o MemoryOS (30s). Verifique sua internet.' : (e.message || String(e)));
  }
  clearTimeout(timeoutId);
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const errMsg = (data && data.error) ? data.error : \`HTTP \${res.status}\`;
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

// Reconciliacao (2026-08-11): busca sessoes ativas no backend e MESCLA com o
// cache local. So adiciona sessoes que faltam localmente E cuja aba (tabId
// salvo no servidor) ainda existe de verdade neste navegador — tabIds nao
// sao estaveis entre reinicios do Chrome, entao uma sessao cujo tabId nao
// resolve mais pra uma aba real e ignorada (fica orfa ate expirar sozinha
// pelo TTL, sem quebrar nada).
async function reconcileSessionsWithBackend() {
  const { memos_token } = await chrome.storage.local.get(['memos_token']);
  if (!memos_token) return; // nao autenticado ainda, nada a reconciliar

  let remoteSessions = [];
  try {
    const res = await invokeFunction('webConnectorExtension', { operation: 'listActiveSessions' });
    remoteSessions = (res && Array.isArray(res.sessions)) ? res.sessions : [];
  } catch (e) { return; } // best-effort: sem rede/erro, mantem cache local como esta

  const localSessions = await getSessions();
  const localIds = new Set(localSessions.map((s) => s.webSessionId));
  const toAdd = [];
  for (const r of remoteSessions) {
    if (localIds.has(r.webSessionId)) continue;
    if (!r.tabId) continue; // sem tabId salvo, nao da pra saber qual aba usar
    try {
      const tab = await chrome.tabs.get(r.tabId);
      if (!tab || !tab.url) continue;
      // Confirma que a aba ainda e do mesmo site (tabId pode ter sido reciclado pelo Chrome)
      if (originOf(tab.url) !== originOf(r.siteUrl)) continue;
      toAdd.push({
        webSessionId: r.webSessionId,
        tabId: r.tabId,
        siteUrl: r.siteUrl,
        siteName: r.siteName || new URL(r.siteUrl).hostname,
        expiresAt: r.expiresAt,
        connectedAt: Date.now(),
      });
    } catch (e) { /* aba nao existe mais neste navegador: ignora, deixa expirar */ }
  }
  if (toAdd.length > 0) {
    await setSessions([...localSessions, ...toAdd]);
    await chrome.alarms.clear(HEARTBEAT_ALARM);
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
  }
}

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
      memos_app_base_url: msg.appBaseUrl || (sender.tab && sender.tab.url ? sender.tab.url.replace(/\\/$/, '') : ''),
      memos_captured_at: Date.now(),
    }, () => {
      // Fase 5: registra o bridge logo apos capturar o token (identidade persistente)
      ensureBridgeRegistered().then(() => {
        // Garante o heartbeat rodando apos o primeiro login
        chrome.alarms.clear(HEARTBEAT_ALARM);
        chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
      }).catch(() => {});
      sendResponse({ ok: true });
    });
    return true;
  }

  // Status (popup) — agora inclui discoveryRunning POR sessao, nao so global
  if (msg.type === 'MEMOS_GET_STATUS') {
    (async () => {
      // Fix (2026-08-11): reconcilia com o backend ANTES de responder ao
      // popup. Se o cache local perdeu sessoes (ex: extensao foi
      // desinstalada/reinstalada), busca o que ainda esta ativo no servidor
      // e reidrata o cache local — sem isso, sites genuinamente conectados
      // (Bling, Mercado Livre) somem da lista sem motivo aparente.
      try { await reconcileSessionsWithBackend(); } catch (e) { /* best-effort: segue com o cache local que tiver */ }

      const [sessions, activeId, discMap] = await Promise.all([
        getSessions(),
        getActiveId(),
        getDiscoveryMap(),
      ]);
      const sessionsWithStatus = sessions.map((s) => ({
        ...s,
        discoveryRunning: !!(discMap[s.webSessionId] && discMap[s.webSessionId].running),
      }));
      const _tokInfo = await chrome.storage.local.get(['memos_token', 'memos_bridge_id', 'memos_bridge_error', 'memos_app_base_url']);
      sendResponse({
        hasToken: !!_tokInfo.memos_token,
        appBaseUrl: _tokInfo.memos_app_base_url || null,
        bridgeId: _tokInfo.memos_bridge_id || null,
        bridgeError: _tokInfo.memos_bridge_error || '',
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
        if (!tab || !tab.url || !/^https?:\\/\\//.test(tab.url)) {
          sendResponse({ ok: false, error: 'Aba atual nao tem URL valida.' });
          return;
        }
        // Fix (2026-08-11): o proprio dominio do app MemoryOS (onde o
        // content-app.js captura o token) nao pode virar um "site conectado"
        // — e onde o usuario logou na extensao, nao um sistema externo. Sem
        // essa checagem, clicar "Conectar" com a aba do app MemoryOS aberta
        // criava uma WebSession fantasma poluindo a lista em /connections.
        const APP_DOMAINS = ['ever-mind-core.base44.app'];
        const tabHost = (() => { try { return new URL(tab.url).hostname; } catch (e) { return ''; } })();
        if (APP_DOMAINS.some((d) => tabHost === d || tabHost.endsWith('.' + d))) {
          sendResponse({ ok: false, error: 'Esta e a aba do proprio MemoryOS — abra a aba do site que voce quer conectar (ex: Bling, Mercado Livre) e tente de novo.' });
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
        let result;
        try {
          result = await invokeFunction('webConnectorExtension', {
            operation: 'registerSession',
            siteUrl,
            siteName: new URL(siteUrl).hostname,
            tabId: String(tab.id),
            bridgeId: await getBridgeId() || '',
            browserSessionId: String(tab.id),
          });
        } catch (e) {
          // Se o bridge estava invalido/offline, forca re-registro e tenta uma vez mais.
          const em = (e && e.message) ? e.message : String(e);
          if (/Bridge invalido|offline/i.test(em)) {
            await chrome.storage.local.remove(['memos_bridge_id']);
            const newBridge = await ensureBridgeRegistered();
            if (!newBridge) {
              const be = (await chrome.storage.local.get(['memos_bridge_error'])).memos_bridge_error || em;
              throw new Error('Falha ao registrar bridge: ' + be);
            }
            result = await invokeFunction('webConnectorExtension', {
              operation: 'registerSession',
              siteUrl,
              siteName: new URL(siteUrl).hostname,
              tabId: String(tab.id),
              bridgeId: newBridge,
              browserSessionId: String(tab.id),
            });
          } else {
            throw e;
          }
        }
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
        // Fase 1: preenche o formulario e submete (dispara a navegacao).
        const fillRes = await chrome.scripting.executeScript({
          target: { tabId: session.tabId },
          func: pageFillSubmit,
          args: [spec],
        });
        const fillResult = (fillRes && fillRes[0] && fillRes[0].result) ? fillRes[0].result : null;
        if (fillResult && fillResult.error) {
          try { await invokeFunction('webConnectorExtension', { operation: 'recordExecution', webSessionId: session.webSessionId, discoveredFromUrl: spec.discoveredFromUrl, inputFields: spec.inputFields, inputs: spec.inputs, result: fillResult }); } catch (e) {}
          sendResponse({ ok: true, result: fillResult, webSessionId: session.webSessionId });
          return;
        }
        // Fase 2: espera a pagina de resultados carregar e raspa os links.
        await waitForTabComplete(session.tabId, 15000);
        const scrapeRes = await chrome.scripting.executeScript({
          target: { tabId: session.tabId },
          func: pageScrapeResults,
        });
        const result = (scrapeRes && scrapeRes[0] && scrapeRes[0].result) ? scrapeRes[0].result : { error: 'no_result' };
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
      // DIAG (temp): telemetria minima sob memos_last_discovery_diag para
      // classificar P2 (snapshot nao chegou) vs P3 (submitSnapshot falhou)
      // vs P4 (LLM/persistencia retornou 0). Nao loga snapshot/token/cookies.
      const diagBase = {
        webSessionId: null,
        tabId: tabId,
        currentUrl: msg.currentUrl || null,
        stage: 'snapshot_received',
        submitStartedAt: null,
        submitFinishedAt: null,
        submitOk: null,
        httpStatus: null,
        candidatesSaved: 0,
        error: null,
      };
      try { await chrome.storage.local.set({ memos_last_discovery_diag: diagBase }); } catch (e) {}
      const found = tabId != null ? await findDiscoveryByTabId(tabId) : null;
      if (!found || !found.state || !found.state.running) { sendResponse({ ok: true, ignored: true }); return true; }
      const webSessionId = found.webSessionId;
      diagBase.webSessionId = webSessionId;
      const d = found.state;
      if (msg.error) {
        diagBase.stage = 'snapshot_error_from_content';
        diagBase.error = String(msg.error).slice(0, 300);
        try { await chrome.storage.local.set({ memos_last_discovery_diag: diagBase }); } catch (e) {}
        await discoveryStep(webSessionId); sendResponse({ ok: true }); return true;
      }
      try {
        diagBase.stage = 'submitting_snapshot';
        diagBase.submitStartedAt = Date.now();
        try { await chrome.storage.local.set({ memos_last_discovery_diag: diagBase }); } catch (e) {}
        const result = await invokeFunction('webConnectorExtension', {
          operation: 'submitSnapshot',
          webSessionId: d.webSessionId,
          currentUrl: msg.currentUrl,
          snapshotText: msg.snapshotText,
          links: msg.links,
        });
        const saved = (result && result.candidatesSaved) ? result.candidatesSaved : 0;
        d.candidatesSoFar = (d.candidatesSoFar || 0) + saved;
        diagBase.stage = 'submit_success';
        diagBase.submitFinishedAt = Date.now();
        diagBase.submitOk = true;
        diagBase.candidatesSaved = saved;
        diagBase.error = null;
        try { await chrome.storage.local.set({ memos_last_discovery_diag: diagBase }); } catch (e) {}
      } catch (e) {
        diagBase.stage = 'submit_error';
        diagBase.submitFinishedAt = Date.now();
        diagBase.submitOk = false;
        diagBase.candidatesSaved = 0;
        diagBase.error = String((e && e.message) ? e.message : e).slice(0, 300);
        try { await chrome.storage.local.set({ memos_last_discovery_diag: diagBase }); } catch (e2) {}
        /* segue pra proxima — comportamento original preservado */
      }
      d.pagesDone = (d.pagesDone || 0) + 1;
      const newLinks = [];
      for (const l of (msg.links || [])) {
        if (!l || !l.href) continue;
        if (d.visited.indexOf(l.href) !== -1 || d.queue.indexOf(l.href) !== -1) continue;
        if (/\\/login|\\/logout|\\/signup|\\/register/i.test(l.href)) continue;
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

// Fix (2026-08-11): a execucao era feita em UMA funcao so (pageExecute)
// que preenchia o formulario, clicava em "Buscar" e DEPOIS tentava rolar
// a pagina e coletar os links. Mas clicar em "Buscar" em sites como o
// Mercado Livre DISPARA uma navegacao real (GET /search?...), que destroi
// o contexto de execucao antes do scrape rodar — o executeScript perdia o
// resultado e o backend registrava "no_result". Agora e em DUAS fases:
// pageFillSubmit preenche+submete e retorna imediatamente (antes da
// navegacao destruir o contexto); o background espera a aba carregar a
// pagina de resultados e so entao injeta pageScrapeResults para coletar.
function pageFillSubmit(spec) {
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
    // Dispara o submit e retorna IMEDIATAMENTE — a navegacao para a pagina
    // de resultados vai destruir este contexto; o scrape roda na fase 2.
    try { if (sBtn) sBtn.click(); else if (best.requestSubmit) best.requestSubmit(); else best.submit(); }
    catch (e) { try { best.submit(); } catch (e2) {} }
    return { filled: filled, submittedFrom: location.href };
  })();
}

// Espera a aba carregar (status=complete) apos o submit. Resolve tambem
// por timeout — se o formulario for AJAX (sem navegacao), o scrape roda na
// mesma pagina e mesmo assim pega os resultados.
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, timeoutMs || 10000);
  });
}

// Fase 2: rola a pagina de resultados (carrega lazy-load) e coleta os
// links de produtos. Deteccao em CAMADAS: primeiro por card com preco
// (mais robusto pra e-commerce — funciona mesmo se o href for redirect),
// depois por URL de produto, depois genericos. Espera mais (ML e pesado).
function pageScrapeResults() {
  return (async () => {
    await new Promise(function (r) { setTimeout(r, 3000); });
    await new Promise(function (resolve) {
      var c = 0;
      var s = function () { window.scrollBy(0, Math.max(window.innerHeight * 2, 1200)); c++; if (c < 6) setTimeout(s, 500); else { window.scrollTo(0, 0); resolve(); } };
      s();
    });
    await new Promise(function (r) { setTimeout(r, 2000); });
    var rd = (function () {
      var parts = location.hostname.split('.');
      var tld = ['com.br', 'co.uk', 'com.au', 'org.br', 'net.br'];
      var last2 = parts.slice(-2).join('.');
      if (tld.indexOf(last2) !== -1 && parts.length >= 3) return parts.slice(-3).join('.');
      return last2;
    })();
    var productRe = /\\/(p|dp|produto|item|pd|listados|detalle|product)\\/|MLB-?\\d|\\/item\\//i;
    var catRe = /\\/(c|categorias|ofertas|l|gz|assinaturas|importados|mais-vendidos|categorias)\\b/i;
    var skipRe = /\\/(login|logout|signup|register|auth|conta|minha-conta|ajuda|vendas|favoritos|carrinho|ofertas)\\b/i;
    var priceRe = /R\\$\\s?\\d|^\\d+[,\\.]\\d{2}$/i;
    var curPath = location.pathname;
    var cardSel = 'li, article, [class*=ui-search-result], [class*=ui-search-layout__item], [class*=item], [class*=card], [class*=product]';
    var collect = function (opts) {
      var list = [];
      var anchors = Array.from(document.querySelectorAll('a[href]'));
      for (var a = 0; a < anchors.length; a++) {
        var aEl = anchors[a];
        var href = aEl.href;
        if (!href) continue;
        var h; try { h = new URL(href); } catch (e) { continue; }
        if (!h.hostname.endsWith(rd)) continue;
        if (skipRe.test(h.pathname)) continue;
        if (h.pathname === curPath || h.pathname === '/' || h.pathname === '') continue;
        if (opts.excludeCat && catRe.test(h.pathname)) continue;
        if (opts.requireProduct && !productRe.test(h.pathname + h.search)) continue;
        var text = (aEl.innerText || aEl.textContent || '').trim();
        if (text.length < (opts.minText || 8)) continue;
        var card = aEl.closest(cardSel);
        var cardText = card ? (card.innerText || '').trim().slice(0, 500) : '';
        if (opts.requirePrice && !priceRe.test(cardText)) continue;
        list.push({ text: text.slice(0, 200), href: href, cardText: cardText });
      }
      return list;
    };
    var priceAnchors = collect({ requirePrice: true, minText: 8 });
    var productAnchors = collect({ requireProduct: true, excludeCat: true, minText: 8 });
    var genericAnchors = collect({ excludeCat: true, minText: 15 });
    var anyAnchors = collect({ minText: 15 });
    var out = priceAnchors.length > 0 ? priceAnchors : productAnchors.length > 0 ? productAnchors : genericAnchors.length > 0 ? genericAnchors : anyAnchors;
    var seen = {}, dedup = [];
    for (var i = 0; i < out.length; i++) { if (seen[out[i].href]) continue; seen[out[i].href] = true; dedup.push(out[i]); }
    return { url: location.href, links: dedup.slice(0, 30), debug: { totalAnchors: document.querySelectorAll('a[href]').length, priceHits: priceAnchors.length, productHits: productAnchors.length, genericHits: genericAnchors.length, anyHits: anyAnchors.length, finalCount: dedup.length } };
  })();
}

// ── Driver de descoberta (BFS orientado a eventos, MULTI-SITE) ───────────
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\\./, ''); } catch (e) { return ''; } }
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
    // Fase 5: garante bridge registrado + heartbeat a cada ciclo
    let bridgeId = await getBridgeId();
    if (!bridgeId) bridgeId = await ensureBridgeRegistered();
    if (bridgeId) heartbeatBridge(bridgeId); // fire-and-forget

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

// Busca tarefas pendentes (de qualquer site conectado) e executa. Fase 5:
// envia bridgeId (validado server-side) e SERIALIZA por aba — tarefas na
// MESMA aba rodam em sequencia (nao se corrompem), tarefas em abas diferentes
// rodam em paralelo.
async function pollAndRunPendingTasks(sessions) {
  const webSessionIds = sessions.map((s) => s.webSessionId);
  const bridgeId = await getBridgeId();
  if (!bridgeId) return; // sem bridge registrado, pollTasks rejeitaria
  const pollRes = await invokeFunction('webConnectorExtension', { operation: 'pollTasks', bridgeId, webSessionIds });
  const tasks = (pollRes && Array.isArray(pollRes.tasks)) ? pollRes.tasks : [];
  if (tasks.length === 0) return;

  // Agrupa tarefas por tabId (aba/browser_session). Tarefas da mesma aba
  // rodam em SEQUENCIA (await cada uma antes da proxima — evita duas
  // chrome.tabs.update no mesmo tabId concorrentes). Tarefas de abas
  // diferentes rodam em PARALELO (Promise.all dos grupos).
  const groupsByTab = {};
  for (const task of tasks) {
    const session = sessions.find((s) => s.webSessionId === task.web_session_id);
    const tabKey = session ? String(session.tabId) : '__no_session__';
    if (!groupsByTab[tabKey]) groupsByTab[tabKey] = { session, tasks: [] };
    groupsByTab[tabKey].tasks.push(task);
  }

  await Promise.all(Object.values(groupsByTab).map(async (group) => {
    // Sem sessao valida para estas tarefas? Marca erro e segue.
    if (!group.session) {
      for (const task of group.tasks) {
        try { await invokeFunction('webConnectorExtension', { operation: 'completeTask', bridgeId, requestId: task.id, error: 'site_not_connected_in_this_browser' }); } catch (e) {}
      }
      return;
    }
    // SEQUENCIA dentro da mesma aba — cada tarefa so comeca quando a anterior termina.
    for (const task of group.tasks) {
      try {
        let inputFields = [];
        let inputs = {};
        try { inputFields = JSON.parse(task.input_fields || '[]'); } catch (e) {}
        try { inputs = JSON.parse(task.inputs || '{}'); } catch (e) {}
        const spec = { discoveredFromUrl: task.discovered_from_url, inputFields, inputs };
        await navigateAndWait(group.session.tabId, spec.discoveredFromUrl);
        const fillRes = await chrome.scripting.executeScript({ target: { tabId: group.session.tabId }, func: pageFillSubmit, args: [spec] });
        const fillResult = (fillRes && fillRes[0] && fillRes[0].result) ? fillRes[0].result : null;
        if (fillResult && fillResult.error) {
          await invokeFunction('webConnectorExtension', { operation: 'completeTask', bridgeId, requestId: task.id, error: String(fillResult.error) });
          continue;
        }
        await waitForTabComplete(group.session.tabId, 15000);
        const scrapeRes = await chrome.scripting.executeScript({ target: { tabId: group.session.tabId }, func: pageScrapeResults });
        const result = (scrapeRes && scrapeRes[0] && scrapeRes[0].result) ? scrapeRes[0].result : { error: 'no_result' };
        if (result && result.error) {
          await invokeFunction('webConnectorExtension', { operation: 'completeTask', bridgeId, requestId: task.id, error: String(result.error) });
        } else {
          await invokeFunction('webConnectorExtension', { operation: 'completeTask', bridgeId, requestId: task.id, result });
        }
      } catch (e) {
        try { await invokeFunction('webConnectorExtension', { operation: 'completeTask', bridgeId, requestId: task.id, error: e.message || String(e) }); } catch (e2) {}
      }
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

// ── Startup: recria o heartbeat alarm se ja existem sessoes ─────────────
// Fix (2026-08-11): o Chrome LIMPA todos os chrome.alarms quando a extensao
// e recarregada. Sem este bloco, o service worker carrega, registra os
// listeners, dorme apos 30s de inatividade (MV3) e NUNCA acorda — nenhum
// heartbeat, nenhuma tarefa pendente e pega, mesmo com sessoes validas no
// chrome.storage.local. Este IIFE roda no startup do service worker e
// recria o alarm se houver sessoes, restaurando o ciclo de heartbeat.
// Fase 5: tambem registra o bridge no startup (identidade persistente).
(async () => {
  try {
    // Fase 5: garante bridge registrado antes de qualquer operacao
    await ensureBridgeRegistered();
    const sessions = await getSessions();
    if (sessions.length > 0) {
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_INTERVAL_MIN });
    }
  } catch (e) { /* best-effort: se falhar, o popup reconcilia depois */ }
})();`,
  'content-site.js': `/**
 * content-site.js — injetado sob demanda (chrome.scripting.executeScript) na
 * aba autenticada pelo service worker durante a descoberta (Sprint 2).
 *
 * Extrai um snapshot resumido do DOM (para o LLM) + todos os links do mesmo
 * dominio (para a BFS) e envia ao background. Nao mantem estado nem loop — o
 * driver da BFS e o background, que navega a aba e re-injeta este script a
 * cada pagina carregada.
 *
 * O snapshot imita o formato do accessibility snapshot do Playwright MCP que o
 * webConnectorDiscover ja consome: uma linha por elemento interativo com
 * tag/name/id/placeholder/aria-label/label/text/href. Isso permite reaproveitar
 * o MESMO prompt de descoberta (compartilhado em base44/shared/webDiscovery.ts).
 */
(function () {
  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\\./, ''); } catch (e) { return ''; }
  }

  function snapshot() {
    const lines = [];
    const interactive = document.querySelectorAll(
      'input, select, textarea, button, a[href], [role=button], [role=link], [role=textbox], [role=searchbox]'
    );
    let n = 0;
    for (const el of interactive) {
      if (n > 500) break;
      const tag = (el.tagName || '').toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      let label = '';
      if (id) {
        try {
          const lbl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
          if (lbl) label = (lbl.textContent || '').trim();
        } catch (e) { /* CSS.escape fallback */ }
      }
      if (!label) {
        const w = el.closest('label');
        if (w) label = (w.textContent || '').trim();
      }
      const text = (el.innerText || el.textContent || '').trim().slice(0, 100);
      let desc = tag;
      if (type) desc += ' type=' + type;
      if (name) desc += ' name=' + name;
      if (id) desc += ' id=' + id;
      if (placeholder) desc += ' placeholder="' + placeholder + '"';
      if (ariaLabel) desc += ' aria-label="' + ariaLabel + '"';
      if (label) desc += ' label="' + label + '"';
      const isLinky = (tag === 'a' || tag === 'button' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link');
      if (text && isLinky) desc += ' text="' + text + '"';
      if (tag === 'a' && el.href) desc += ' href=' + el.href;
      lines.push(desc + ' [ref=r' + n + ']');
      n++;
    }
    return lines.join('\\n');
  }

  function links() {
    const baseHost = hostOf(location.href);
    const out = [];
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      let h;
      try { h = new URL(a.href); } catch (e) { continue; }
      const hh = h.hostname.replace(/^www\\./, '');
      if (!hh.endsWith(baseHost)) continue;
      if (/\\/login|\\/logout|\\/signup|\\/register/i.test(h.pathname)) continue;
      const text = (a.innerText || a.textContent || '').trim();
      if (text.length < 3) continue;
      out.push({ text: text.slice(0, 120), href: a.href });
    }
    const seen = new Set();
    const dedup = [];
    for (const it of out) {
      if (seen.has(it.href)) continue;
      seen.add(it.href);
      dedup.push(it);
    }
    return dedup.slice(0, 200);
  }

  try {
    const snap = snapshot();
    const allLinks = links();
    chrome.runtime.sendMessage(
      { type: 'MEMOS_SNAPSHOT_RESULT', currentUrl: location.href, snapshotText: snap, links: allLinks },
      () => { void chrome.runtime.lastError; }
    );
  } catch (e) {
    chrome.runtime.sendMessage(
      { type: 'MEMOS_SNAPSHOT_RESULT', currentUrl: location.href, error: (e && e.message) || String(e) },
      () => { void chrome.runtime.lastError; }
    );
  }
})();`,
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { /* sem body ok */ }
    const { operation } = body;
    if (operation && operation === 'listFiles') {
      return Response.json({ ok: true, files: Object.keys(FILES) });
    }
    // downloadZip: retorna um ZIP unico em base64. Bulletproof pro PS 5.1 —
    // a resposta e { zip: "<base64>" } (depth 1, uma propriedade), entao o
    // ConvertFrom-Json nunca trunca nem perde propriedades. O usuario decodifica
    // com [System.Convert]::FromBase64String e extrai com Expand-Archive.
    if (operation && operation === 'downloadZip') {
      const zip = new JSZip();
      for (const name of Object.keys(FILES)) {
        zip.file(name, FILES[name]);
      }
      const b64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
      return Response.json({ ok: true, zip: b64, version: '0.3.1' });
    }
    // default: retorna todos os arquivos como ARRAY de {name, content} —
    // formato que o PowerShell 5.1 itera de forma confiavel (objetos com
    // chave nome-de-arquivo com pontos quebravam a enumeracao .PSObject.Properties).
    const filesArr = Object.keys(FILES).map((name) => ({ name, content: FILES[name] }));
    return Response.json({ ok: true, version: '0.3.2', files: filesArr });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}