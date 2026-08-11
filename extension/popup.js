const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const discoverBtn = document.getElementById('discover-btn');
const discoveryStatus = document.getElementById('discovery-status');
const execPanel = document.getElementById('exec-panel');
const capSelect = document.getElementById('cap-select');
const capInput = document.getElementById('cap-input');
const execBtn = document.getElementById('exec-btn');
const execStatus = document.getElementById('exec-status');
let loadedCapabilities = [];
const authStatus = document.getElementById('auth-status');
const sessionInfo = document.getElementById('session-info');
const sessionSite = document.getElementById('session-site');
const sessionExpires = document.getElementById('session-expires');
const statusDot = document.getElementById('status-dot');
const errorMsg = document.getElementById('error-msg');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}
function clearError() { errorMsg.classList.add('hidden'); errorMsg.textContent = ''; }

function fmtExpires(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
}

chrome.runtime.sendMessage({ type: 'MEMOS_GET_STATUS' }, (status) => {
  if (chrome.runtime.lastError || !status) {
    authStatus.textContent = 'Erro ao verificar estado.';
    return;
  }
  if (!status.hasToken) {
    authStatus.textContent = 'Extensao nao autenticada. Abra o app MemoryOS nesta janela.';
    statusDot.className = 'dot dot-off';
    connectBtn.disabled = true;
    return;
  }
  authStatus.textContent = 'Autenticado ao MemoryOS.';
  statusDot.className = 'dot dot-on';
  if (status.session) {
    sessionSite.textContent = status.session.siteUrl;
    sessionExpires.textContent = fmtExpires(status.session.expiresAt);
    sessionInfo.classList.remove('hidden');
    connectBtn.classList.add('hidden');
    disconnectBtn.classList.remove('hidden');
    discoverBtn.classList.remove('hidden');
    execPanel.classList.remove('hidden');
    loadCapabilities();
    if (status.discoveryRunning) {
      discoverBtn.disabled = true;
      discoverBtn.textContent = 'Descobrindo…';
      discoveryStatus.textContent = 'Descoberta em andamento neste site.';
      discoveryStatus.classList.remove('hidden');
    }
  } else {
    connectBtn.disabled = false;
  }
});

connectBtn.addEventListener('click', () => {
  clearError();
  connectBtn.disabled = true;
  connectBtn.textContent = 'Conectando…';
  chrome.runtime.sendMessage({ type: 'MEMOS_CONNECT_SITE' }, (res) => {
    if (res && res.ok) {
      sessionSite.textContent = res.session.siteUrl;
      sessionExpires.textContent = fmtExpires(res.session.expiresAt);
      sessionInfo.classList.remove('hidden');
      connectBtn.classList.add('hidden');
      disconnectBtn.classList.remove('hidden');
      execPanel.classList.remove('hidden');
      loadCapabilities();
    } else {
      connectBtn.disabled = false;
      connectBtn.textContent = 'Conectar este site';
      showError(res && res.error ? res.error : 'Falha ao conectar.');
    }
  });
});

disconnectBtn.addEventListener('click', () => {
  clearError();
  chrome.runtime.sendMessage({ type: 'MEMOS_DISCONNECT' }, (res) => {
    if (res && res.ok) {
      sessionInfo.classList.add('hidden');
      disconnectBtn.classList.add('hidden');
      discoverBtn.classList.add('hidden');
      discoveryStatus.classList.add('hidden');
      connectBtn.classList.remove('hidden');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Conectar este site';
      execPanel.classList.add('hidden');
      loadedCapabilities = [];
      capSelect.innerHTML = '';
    } else {
      showError(res && res.error ? res.error : 'Falha ao desconectar.');
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
  try {
    if (cap.inputSchema && cap.inputSchema.properties) inputFields = Object.keys(cap.inputSchema.properties);
  } catch (e) {}
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
      discoveryStatus.textContent = 'Descoberta iniciada — a aba do site vai navegar automaticamente. Nao feche o site.';
      discoveryStatus.classList.remove('hidden');
      discoverBtn.textContent = 'Descobrindo…';
    } else {
      discoverBtn.disabled = false;
      discoverBtn.textContent = 'Descobrir via extensao';
      showError(res && res.error ? res.error : 'Falha ao iniciar descoberta.');
    }
  });
});

// Atualiza o estado da descoberta enquanto o popup estiver aberto.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'MEMOS_DISCOVERY_PROGRESS') {
    discoveryStatus.textContent = 'Descobrindo: ' + msg.pagesDone + ' pagina(s), ' + msg.candidatesSoFar + ' candidato(s).';
    discoveryStatus.classList.remove('hidden');
  }
  if (msg && msg.type === 'MEMOS_DISCOVERY_DONE') {
    discoveryStatus.textContent = 'Descoberta concluida: ' + msg.candidatesSoFar + ' candidato(s). Valide no /connections do MemoryOS.';
    discoveryStatus.classList.remove('hidden');
    discoverBtn.disabled = false;
    discoverBtn.textContent = 'Descobrir via extensao';
  }
});