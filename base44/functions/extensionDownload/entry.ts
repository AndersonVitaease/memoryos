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

const FILES = {
  'manifest.json': `{
  "manifest_version": 3,
  "name": "MemoryOS Browser Bridge",
  "version": "0.3.0",
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
}
`,
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
</html>
`,
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
      authStatus.textContent = 'Extensao nao autenticada. Abra o app MemoryOS nesta janela.';
      statusDot.className = 'dot dot-off';
      connectBtn.disabled = true;
      sessionsListEl.innerHTML = '<div class="muted small">Abra o app MemoryOS no Chrome para autenticar.</div>';
      return;
    }
    authStatus.textContent = 'Autenticado ao MemoryOS.';
    statusDot.className = 'dot dot-on';
    connectBtn.disabled = false;
    renderSessions(status.sessions, status.activeSessionId);
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

connectBtn.addEventListener('click', () => {
  clearError();
  connectBtn.disabled = true;
  connectBtn.textContent = 'Conectando…';
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
    // default: retorna todos os arquivos
    return Response.json({ ok: true, version: '0.3.0', files: FILES });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}