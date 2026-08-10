# SESSION 2026-08-10 — Web Connector: Live Login via Selenium/noVNC (RFC-015)

**ID:** SESSION-2026-08-10-WEB-CONNECTOR-LIVE-LOGIN
**Category:** SESSION_KNOWLEDGE
**Status:** IMPLEMENTED
**Last Updated:** 2026-08-10
**Authority:** ENGINEERING

---

## Contexto

O Web Connector (RFC-012) captura sessões autenticadas de sites sem API — o usuário
cola a URL, faz login, e o sistema persiste os cookies para reuso. O modo
**Automático** (Playwright MCP, login via DOM) funciona para sites simples, mas falha
em sites com CAPTCHA, 2FA, ou detecção anti-bot (ex: Bling, Mercado Livre).

A **RFC-015** propôs uma arquitetura "Live Login": um navegador Chromium **visível**
via noVNC onde o usuário resolve desafios manualmente. O backend captura cookies
HttpOnly via Selenium `getCookies()` — mesma entidade `WebSession`, mesma UI.

Esta sessão implementou a RFC-015 ponta a ponta: infraestrutura na VPS + backend
function + UI.

---

## O Que Foi Feito

### 1. Infraestrutura na VPS (Docker Selenium + Caddy)

**Container Selenium (standalone-chromium):**
- Imagem `selenium/standalone-chromium` — traz Chromium + Xvfb + VNC + noVNC em um container.
- Portas: 4444 (WebDriver), 7900 (noVNC web), 5900 (VNC raw).
- Password VNC configurado via `SE_VNC_PASSWORD`.
- Rode na VPS do usuário (mesma do Stirling-PDF / Playwright MCP).

**Launcher API (`infra/live-browser/launcher.mjs`):**
- Node.js HTTP server na porta 8941 (bind 127.0.0.1, Caddy expõe publicamente).
- Usa `selenium-webdriver` para gerenciar WebDriver sessions persistentes.
- Endpoints:
  - `POST /launch { url, siteName? }` → cria WebDriver session, navega, retorna `{ sessionId, novncUrl, expiresAt }`.
  - `POST /cookies { sessionId }` → `driver.manage().getCookies()` (inclui HttpOnly — requisito ADR-019).
  - `POST /close { sessionId }` → encerra WebDriver session.
  - `GET /health` → liveness.
- Limite MVP: 1 sessão ativa por vez (lock). TTL de 15 min por sessão.
- Auth: header `X-Api-Key` validado contra `LAUNCHER_API_KEY`.

**systemd service (`live-browser-launcher.service`):**
- Roda `node /opt/live-browser/launcher.mjs` como serviço persistente.
- Lê config de `/opt/live-browser/.env`: `PORT`, `SELENIUM_REMOTE_URL`, `NOVNC_PUBLIC_URL`, `LAUNCHER_API_KEY`, `VNC_PASSWORD`.

**DuckDNS subdomains:**
- `memoryos-novnc.duckdns.org` → VPS:7900 (noVNC web, `basic_auth` no Caddy).
- `memoryos-launcher.duckdns.org` → VPS:8941 (launcher API, `X-Api-Key` no Caddy).

**Caddyfile:**
- noVNC: `basic_auth` com usuário/senha (proteção extra além do VNC password).
- Launcher: `@haskey header X-Api-Key {key}` + `handle @haskey { reverse_proxy }` — rejeita sem key (401).

### 2. Backend Function `webConnectorLive`

**Arquivo:** `base44/functions/webConnectorLive/entry.ts`

Proxy seguro entre o sandbox Deno (Base44) e o launcher na VPS. Mesmo padrão do
`webConnectorConnect` (Playwright MCP) mas para login manual via Selenium/noVNC.

**Operations:**
- `launch { siteUrl, siteName? }` → chama launcher `/launch`, cria `WebSession(pending_login, browser_context_id=sessionId)`, retorna `{ webSessionId, novncUrl, expiresAt }`.
- `capture { webSessionId }` → chama launcher `/cookies`, grava cookies na `WebSession(active, cookies, expires_at, site_url=currentUrl)`, encerra a sessão do launcher (libera RAM), retorna `{ ok, status, currentUrl, cookieCount }`.
- `close { webSessionId }` → encerra launcher session + marca `WebSession(revoked)`.
- `status { webSessionId }` → retorna estado atual da WebSession.

**Segurança (ADR-019):** as credenciais de login do site alvo (email/senha) **nunca**
passam por esta função — o usuário digita direto no navegador live (noVNC). Apenas
os cookies resultantes são persistidos. O launcher roda atrás de Caddy com `X-Api-Key`.

**Secrets usados:**
- `LIVE_BROWSER_LAUNCHER_URL` — URL pública do launcher (ex: `https://memoryos-launcher.duckdns.org`).
- `LIVE_BROWSER_API_KEY` — chave enviada no header `X-Api-Key` (mesma do Caddyfile).

### 3. Componente `LiveLoginPanel`

**Arquivo:** `src/components/web-connector/LiveLoginPanel.jsx`

UI isolada para o fluxo de login live:
1. Input de URL + nome opcional → botão "Iniciar navegador live".
2. `launch` → abre noVNC em nova aba (`window.open`), mostra link "Reabrir noVNC" + botão "Capturar sessão".
3. Usuário faz login manualmente na janela noVNC (resolve CAPTCHA/2FA).
4. "Capturar sessão" → `capture` → `onSessionActive(webSessionId, currentUrl)` → pai assume com `status=active`.
5. "Cancelar" → `close` → limpa estado.

Helper `callLive()` extrai erro real de `err.response.data.error` (mesmo padrão do `callWebConnector`).

### 4. Atualização do `WebConnectorPage`

**Arquivo:** `src/pages/WebConnectorPage.jsx`

- Estado `mode` adicionado: `'automated'` (Playwright DOM) | `'live'` (Selenium noVNC, RFC-015).
- Toggle de modo no topo (só visível quando `!webSessionId`).
- Modo `automated`: fluxo existente (URL → start → login → confirm) intocado.
- Modo `live`: renderiza `LiveLoginPanel`. Quando a sessão fica `active`, a view
  existente (test/revoke/discover/executor) assume — mesma entidade `WebSession`,
  mesmas capabilities.

---

## Validação (test_backend_function)

**Launch** com `https://the-internet.herokuapp.com/login`:
```json
{ "ok": true, "webSessionId": "6a79...", "launcherSessionId": "live_0f67...",
  "novncUrl": "https://memoryos-novnc.duckdns.org?autoconnect=1&resize=scale",
  "expiresAt": "2026-08-10T13:55:37Z", "status": "pending_login" }
```

**Capture** (sem login manual, mas the-internet seta cookies de sessão ao visitar):
```json
{ "ok": true, "webSessionId": "6a79...", "status": "active",
  "currentUrl": "https://the-internet.herokuapp.com/login", "cookieCount": 5,
  "expiresAt": "2026-08-10T14:10:42Z" }
```

**Close**:
```json
{ "ok": true, "webSessionId": "6a79...", "status": "revoked" }
```

Fluxo completo `launch → capture → close` validado ponta a ponta. Launcher na VPS
criou WebDriver session, capturou 5 cookies (incluindo HttpOnly), e encerrou limpo.

---

## Arquitetura Final

```
Usuário (browser)
  └─ WebConnectorPage (/web-connector, modo "Live")
      └─ LiveLoginPanel
          └─ base44.functions.invoke("webConnectorLive", { operation, ... })
              └─ Backend Deno (sandbox Base44)
                  └─ fetch(LIVE_BROWSER_LAUNCHER_URL + path, { X-Api-Key: LIVE_BROWSER_API_KEY })
                      └─ Caddy (VPS) — valida X-Api-Key
                          └─ launcher.mjs (127.0.0.1:8941)
                              └─ selenium-webdriver
                                  └─ Chromium (selenium/standalone-chromium container)
                                      ├─ WebDriver session (cookies HttpOnly via getCookies)
                                      └─ noVNC (porta 7900) ← usuário abre em nova aba
                                          └─ Caddy (basic_auth) → memoryos-novnc.duckdns.org
```

**Entidade compartilhada:** `WebSession` — mesma entidade usada pelo modo
Automático (Playwright). Campo `browser_context_id` guarda o `sessionId` do
launcher (no Automated, guarda `'shared'`). Cookies HttpOnly persistidos no campo
`cookies` (JSON).

---

## Diferença: Automated (Playwright) vs Live (Selenium)

| Aspecto | Automated (Playwright MCP) | Live (Selenium noVNC) |
|---|---|---|
| Login | Automático via DOM (preenche email/senha) | Manual pelo usuário no noVNC |
| CAPTCHA/2FA | Não resolve | Usuário resolve manualmente |
| Anti-bot | Pode ser detectado (headless) | Menos detectável (browser visível) |
| Cookies HttpOnly | `context.cookies()` | `driver.manage().getCookies()` |
| Backend function | `webConnectorConnect` | `webConnectorLive` |
| Infraestrutura | Playwright MCP standalone (porta 8932) | Selenium + noVNC (porta 8941/7900) |
| Entidade | `WebSession` (mesma) | `WebSession` (mesma) |
| UI | Form de email/senha + "Entrar" | Botão "Iniciar navegador live" + "Capturar" |

Ambos coexistem na mesma página (`/web-connector`) via toggle de modo. A view de
sessão ativa (test/revoke/discover/executor) é compartilhada — independe do modo
usado para criar a sessão.

---

## Limitações Conhecidas (MVP)

1. **1 sessão live por vez** — o launcher tem lock de 1 sessão simultânea. Pool
   em fase futura (RFC-015 Fase 6).
2. **TTL de 15 min** — a WebDriver session expira se o usuário não capturar a
   sessão a tempo. O TTL é do launcher; a `WebSession` tem TTL próprio de 30 min
   após `capture`.
3. **noVNC em aba separada** — não é iframe embutido (browsers bloqueiam basic_auth
   em iframes). O usuário abre o noVNC em nova aba e volta pra app pra capturar.
4. **Credenciais do site alvo** — o usuário digita no navegador live; o MemoryOS
   nunca vê email/senha (ADR-019). Só os cookies são capturados.

---

## Lições (reutilizar)

1. **Selenium `getCookies()` inclui HttpOnly** — ao contrário de `document.cookie`
   (que não vê HttpOnly), a API do WebDriver captura todos os cookies. Requisito
   para sessões de auth reais.
2. **Launcher persistente vs per-call** — o launcher mantém o `driver` no Map de
   sessões entre chamadas HTTP. Reanexar por session id é frágil no Selenium; o
   padrão de guardar o `driver` vivo no mapa é mais confiável.
3. **noVNC em aba separada > iframe** — browsers modernos bloqueiam iframes com
   `basic_auth` na URL. Abrir em nova aba (`window.open`) é mais confiável e permite
   que o usuário interaja livremente com o navegador live.
4. **Mesma entidade, 2 modos** — `WebSession` é agnóstica ao modo de criação. O
   campo `browser_context_id` distingue (`'shared'` para Playwright, `sessionId`
   para Selenium). A UI de sessão ativa não precisa saber como a sessão foi criada.
5. **Proxy com API key** — mesmo padrão do Stirling-PDF e Playwright MCP: Caddy
   valida `X-Api-Key` antes de rotear pro upstream. Nunca expor a porta do
   launcher direto na internet.

---

## Referências Cruzadas

- **RFC:** `src/docs/foundation/rfc/RFC-015-Web-Connector-Live-Login.md`
- **ADR (segurança):** `src/docs/foundation/adr/ADR-019.md` (nunca armazenar credenciais)
- **RFC-012 (Web Connector base):** `src/docs/foundation/rfc/RFC-012-Web-Connector-Session-Capture.md`
- **RFC-014 (Runtime integration):** `src/docs/foundation/rfc/RFC-014-Web-Connector-Runtime-Integration.md`
- **Infra setup:** `infra/live-browser/SETUP.md` + `infra/live-browser/launcher.mjs`
- **Infra irmã (mesmo padrão):** `STIRLING-PDF-SERVER-INFRASTRUCTURE.md` + `PLAYWRIGHT-MCP-SERVER-INFRASTRUCTURE.md`
- **Sessão anterior (loginVerified fix):** `SESSION-2026-08-09-WEB-CONNECTOR-LOGINVERIFIED-FIX.md