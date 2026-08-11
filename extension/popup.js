const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
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
      connectBtn.classList.remove('hidden');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Conectar este site';
    } else {
      showError(res && res.error ? res.error : 'Falha ao desconectar.');
    }
  });
});