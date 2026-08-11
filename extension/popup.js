const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const discoverBtn = document.getElementById('discover-btn');
const discoveryStatus = document.getElementById('discovery-status');
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
    } else {
      showError(res && res.error ? res.error : 'Falha ao desconectar.');
    }
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