/**
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
})();