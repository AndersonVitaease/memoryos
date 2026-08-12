const connectBtn = document.getElementById('connect-btn');
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
      if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) {
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
});