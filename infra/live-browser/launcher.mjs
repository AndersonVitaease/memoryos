#!/usr/bin/env node
/**
 * live-browser-launcher — Launcher HTTP para login ao vivo (RFC-015).
 *
 * Serviço Node que roda na VPS, atrás de Caddy com X-Api-Key.
 * Usa a imagem Docker `selenium/standalone-chromium` (que já traz noVNC +
 * VNC + Xvfb) para expor um navegador ao vivo onde o usuário resolve CAPTCHA
 * manualmente. A captura de cookies usa Selenium WebDriver
 * (driver.manage().getCookies() — inclui HttpOnly, requisito ADR-019).
 *
 * Endpoints:
 *   POST /launch   { url, siteName? }          -> cria WebDriver session, navega, retorna noVNC URL
 *   POST /cookies  { sessionId }               -> getCookies (HttpOnly incluído) sem fechar sessão
 *   POST /close    { sessionId }               -> encerra sessão
 *   GET  /health                              -> liveness
 *
 * Limitação MVP: 1 sessão ativa por vez (lock). Pool em Fase 6 (RFC-015).
 *
 * Dependências (instalar na VPS antes de rodar):
 *   npm install selenium-webdriver
 *   (e Docker rodando o container selenium/standalone-chromium — ver SETUP.md)
 *
 * Execução:
 *   node launcher.mjs
 *   (lê SELENIUM_REMOTE_URL, SE_VNC_NO_PASSWORD ou SE_VNC_PASSWORD,
 *    NOVNC_PUBLIC_URL, LAUNCHER_API_KEY, PORT do ambiente)
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = parseInt(process.env.PORT || '8941', 10);
const SELENIUM_REMOTE_URL = process.env.SELENIUM_REMOTE_URL || 'http://localhost:4444';
// URL PÚBLICA do noVNC (via Caddy). O launcher monta o link com o password.
const NOVNC_PUBLIC_URL = process.env.NOVNC_PUBLIC_URL || 'https://live-browser.example.duckdns.org';
// Auth: API key esperada no header X-Api-Key
const LAUNCHER_API_KEY = process.env.LAUNCHER_API_KEY || '';
// VNC password exposta no noVNC. Se a imagem usa password fixa, defina via env.
// MVP: password fixa configurada no container (SE_VNC_PASSWORD). Deixe vazio
// se usar SE_VNC_NO_PASSWORD=1 + Caddy X-Api-Key gate.
const VNC_PASSWORD = process.env.VNC_PASSWORD || '';
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min

if (!LAUNCHER_API_KEY) {
  console.warn('[launcher] AVISO: LAUNCHER_API_KEY não definida — endpoints abertos!');
}

// Mapa sessionId -> { webdriverSessionId, siteName, expiresAt, timer }
const sessions = new Map();

// Importa selenium-webdriver dinamicamente (dependência externa da VPS).
let webdriver = null;
let until = null;
let By = null;
let chrome = null;
try {
  const sw = await import('selenium-webdriver');
  webdriver = sw.default;
  until = sw.until;
  By = sw.By;
  chrome = await import('selenium-webdriver/chrome.js');
} catch (e) {
  console.error('[launcher] selenium-webdriver não instalado. Rode: npm install selenium-webdriver');
  process.exit(1);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function checkAuth(req) {
  if (!LAUNCHER_API_KEY) return true;
  const key = req.headers['x-api-key'] || '';
  return key === LAUNCHER_API_KEY;
}

function closeSession(sessionId, reason) {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  // Encerra o WebDriver session
  try {
    const driver = new webdriver.Builder()
      .usingServer(SELENIUM_REMOTE_URL)
      .forBrowser('chrome')
      .build();
    // Não há API direta pra reanexar por session id sem session store; o
    // container Selenium mantém a sessão. Encerramos pedindo quit no driver
    // recém-criado (fecha todas as janelas do container) — aceitável no MVP
    // de 1 sessão por vez. Em pool (Fase 6), cada launch teria seu próprio
    // driver handle persistido no mapa.
    driver.quit().catch(() => {});
  } catch (e) { /* best-effort */ }
  sessions.delete(sessionId);
  console.log(`[launcher] sessão ${sessionId} fechada (${reason})`);
}

// Tenta reanexar a um WebDriver session existente via sessionId.
// selenium-webdriver suporta reanexar via WebDriver.attachToSession se o
// container mantém o session store. Se indisponível, capturamos criando um
// novo driver e navegando para currentUrl — mas isso perde a sessão. Por isso
// o MVP usa um driver PERSISTENTE por launch (guardado no mapa).
//
// Anti-deteccao (patch 2026-08-10): sites com anti-bot (Cloudflare, hCaptcha,
// Datadome) e o proprio Google recusam sessoes com sinais obvios de
// automacao Selenium ("Chrome is being controlled by automated test
// software", navigator.webdriver=true). Isso reduz a deteccao mas NAO e
// garantia — Google especificamente detecta o uso do protocolo CDP em si,
// nao so essas flags, e pode continuar bloqueando login via Google mesmo
// assim. Funciona melhor para formularios de login nativos (sem OAuth de
// terceiros) e a maioria dos anti-bots comerciais.
async function buildPersistentDriver() {
  const chromeOptions = new chrome.Options();
  chromeOptions.excludeSwitches('enable-automation');
  chromeOptions.addArguments(
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-size=1366,768'
  );
  chromeOptions.setUserPreferences({ credentials_enable_service: false });
  const driver = await new webdriver.Builder()
    .usingServer(SELENIUM_REMOTE_URL)
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();
  // Mascara navigator.webdriver antes de qualquer script da pagina rodar,
  // via CDP Page.addScriptToEvaluateOnNewDocument — persiste entre navegacoes
  // dentro da mesma sessao (diferente de executeScript, que so roda uma vez).
  try {
    const cdpConnection = await driver.createCDPConnection('page');
    await cdpConnection.execute('Page.addScriptToEvaluateOnNewDocument', 1, {
      source: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });",
    });
  } catch (e) {
    console.warn('[launcher] CDP stealth script falhou (nao critico):', e.message);
  }
  return driver;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, activeSessions: sessions.size });
  }

  if (!checkAuth(req)) return json(res, 401, { error: 'Unauthorized' });

  if (path === '/launch' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.url || typeof body.url !== 'string') return json(res, 400, { error: 'Missing url' });
    if (sessions.size >= 1) {
      return json(res, 409, { error: 'Já existe uma sessão live ativa. Aguarde ou feche-a antes de iniciar outra.' });
    }
    let driver;
    try {
      driver = await buildPersistentDriver();
    } catch (e) {
      return json(res, 502, { error: 'Selenium indisponível: ' + e.message });
    }
    try {
      await driver.get(body.url);
    } catch (e) {
      try { await driver.quit(); } catch {}
      return json(res, 502, { error: 'Navegação falhou: ' + e.message });
    }
    const sessionId = 'live_' + randomUUID();
    const webdriverSessionId = await driver.getSession().then((s) => s ? s.getId() : '').catch(() => '');
    const novncUrl = VNC_PASSWORD
      ? `${NOVNC_PUBLIC_URL}?password=${encodeURIComponent(VNC_PASSWORD)}&autoconnect=1&resize=scale`
      : `${NOVNC_PUBLIC_URL}?autoconnect=1&resize=scale`;
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const timer = setTimeout(() => closeSession(sessionId, 'ttl'), SESSION_TTL_MS);
    sessions.set(sessionId, { driver, webdriverSessionId, siteName: body.siteName || '', url: body.url, expiresAt, timer });
    console.log(`[launcher] launch ok ${sessionId} -> ${body.url}`);
    return json(res, 200, { sessionId, novncUrl, seleniumSessionId: webdriverSessionId, expiresAt });
  }

  if (path === '/cookies' && req.method === 'POST') {
    const body = await readBody(req);
    const s = sessions.get(body.sessionId);
    if (!s) return json(res, 404, { error: 'Sessão não encontrada (expirou ou nunca existiu).' });
    try {
      const cookies = await s.driver.manage().getCookies();
      const currentUrl = await s.driver.getCurrentUrl();
      return json(res, 200, { cookies, currentUrl });
    } catch (e) {
      return json(res, 502, { error: 'Falha ao ler cookies: ' + e.message });
    }
  }

  if (path === '/close' && req.method === 'POST') {
    const body = await readBody(req);
    // Fix definitivo (2026-08-10): antes so fechava se soubesse o sessionId
    // EXATO — se o usuario abandonasse o fluxo (fechou aba, caiu conexao,
    // esqueceu de capturar), a trava so liberava sozinha apos o TTL de 15min,
    // e ninguem sem acesso SSH a VPS conseguia destravar antes disso. Como so
    // existe NO MAXIMO 1 sessao por vez (limite do MVP), fechar "tudo" e
    // sempre seguro — nao ha risco de fechar a sessao de outro usuario.
    // { all: true } ou ausencia de sessionId fecha qualquer sessao pendurada.
    if (body.all === true || !body.sessionId) {
      const ids = Array.from(sessions.keys());
      for (const id of ids) {
        try { await sessions.get(id).driver.quit(); } catch {}
        closeSession(id, 'force-all');
      }
      return json(res, 200, { ok: true, closedCount: ids.length });
    }
    if (!sessions.has(body.sessionId)) return json(res, 200, { ok: true, alreadyClosed: true });
    try { await sessions.get(body.sessionId).driver.quit(); } catch {}
    closeSession(body.sessionId, 'explicit');
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[launcher] live-browser-launcher ouvindo em 127.0.0.1:${PORT}`);
  console.log(`[launcher] Selenium: ${SELENIUM_REMOTE_URL} | noVNC público: ${NOVNC_PUBLIC_URL}`);
});