const connectBtn = document.getElementById('connect-btn');
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
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }

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
        '<div class="session-row-host">' + (isActive ? '● ' : '') + hostOf(s.siteUrl) + '</div>' +
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
    if (status.discoveryRunning) {
      discoverBtn.disabled = true;
      discoverBtn.textContent = 'Descobrindo…';
      discoveryStatus.textContent = 'Descoberta em andamento no site ativo.';
      discoveryStatus.classList.remove('hidden');
    } else {
      discoverBtn.disabled = false;
      discoverBtn.textContent = 'Descobrir no site ativo';
    }
  });
}

refreshStatus();

connectBtn.addEventListener('click', () => {
  clearError();
  connectBtn.disabled = true;
  connectBtn.textContent = 'Conectando…';
  chrome.runtime.sendMessage({ type: 'MEMOS_CONNECT_SITE' }, (res) => {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Conectar este site';
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
    discoveryStatus.textContent = 'Descobrindo: ' + msg.pagesDone + ' pagina(s), ' + msg.candidatesSoFar + ' candidato(s).';
    discoveryStatus.classList.remove('hidden');
  }
  if (msg && msg.type === 'MEMOS_DISCOVERY_DONE') {
    discoveryStatus.textContent = 'Descoberta concluida: ' + msg.candidatesSoFar + ' candidato(s). Valide no /connections do MemoryOS.';
    discoveryStatus.classList.remove('hidden');
    discoverBtn.disabled = false;
    discoverBtn.textContent = 'Descobrir no site ativo';
  }
});