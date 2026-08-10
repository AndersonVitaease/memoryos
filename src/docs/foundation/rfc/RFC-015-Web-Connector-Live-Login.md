# RFC-015 — Web Connector: Login ao Vivo (Human-in-the-Loop)

**Status:** DRAFT
**Created:** 2026-08-10
**Author:** ENGINEERING
**Relates to:** RFC-012 (Web Connector Session Capture), RFC-013 (Capability Discovery), RFC-014 (Runtime Integration), INFRA-PLAYWRIGHT-MCP

---

## 1. Problema

O fluxo de login do Web Connector (RFC-012) roda **headless** no servidor
(Playwright MCP na VPS): a operação `login` preenche email/senha via DOM e
submete o formulário automaticamente. Isso não funciona para sites com:

- **CAPTCHA** (Mercado Livre, Google reCAPTCHA, hCaptcha, etc.)
- **Verificação 2FA** interativa
- **Fluxos de login em múltiplas etapas** com desafios visuais
- **Detecção de automação** que exige comportamento humano real

O usuário só vê o **snapshot de acessibilidade (texto)** — não há janela
interativa onde ele resolva o CAPTCHA manualmente.

## 2. Objetivo

Permitir que o usuário **faça o login manualmente** num navegador **ao vivo**
exposto na VPS, resolvendo CAPTCHA/2FA como num browser normal, e que o
MemoryOS **capture os cookies da sessão autenticada** ao final — reusando o
modelo de `WebSession` (RFC-012) e as capabilities descobertas (RFC-013).

## 3. Decisão de Arquitetura: noVNC sobre Selenium Standalone-Chromium

**Decisão:** usar a imagem Docker `selenium/standalone-chromium`, que já
empacota **Chromium headed + Xvfb + x11vnc + noVNC web client**. A janela ao
vivo é o **noVNC** embarcado da própria imagem (porta 7900), e a captura de
cookies usa o **Selenium WebDriver** (`driver.manage().getCookies()`, que
inclui cookies HttpOnly — o mesmo requisito do RFC-012).

### Por que Selenium standalone-chromium (não Playwright MCP + noVNC custom):

- A imagem `selenium/standalone-chromium` já traz Xvfb + x11vnc + noVNC
  **configurados e integrados** — zero wiring manual de display/VNC/websockify.
- `driver.manage().getCookies()` retorna cookies HttpOnly (requisito ADR-019).
- Mantém o Playwright MCP (RFC-012) **intacto** para o fluxo headless — o
  live-login é um canal paralelo, não substitui o existente.
- A imagem é mantida pela comunidade Selenium, com healthchecks prontos.

### Por que não CDP-over-WebSocket + renderer custom no frontend:

- Renderizar um browser remoto no frontend via CDP exige um renderer canvas
  (ex: `remote-screen`) — complexo, frágil, e reinventa o que o noVNC já faz.
- noVNC é o padrão de fato, leve, e roda num `<iframe>` simples.

## 4. Topologia

```
Usuário (navegador, no app MemoryOS)
  └─ WebConnectorPage [modo "Login ao vivo"]
       ├─ <iframe src={noVNC URL}> ────────────────► Caddy (live-browser.<host>.duckdns.org)
       │                                                  └─ reverse_proxy → selenium container :7900 (noVNC web)
       │                                                  (auth: VNC password por sessão — gate no Caddy via query token OU password)
       │
       └─ botão "Concluí o login — capturar sessão"
            └─ base44.functions.invoke("webConnectorLive", { op: "capture", sessionId })
                 └─ Deno backend function (webConnectorLive)
                      └─ fetch(LIVE_BROWSER_LAUNCHER_URL/cookies, { sessionId })
                           └─ live-browser-launcher (Node, VPS, porta 8941)
                                └─ selenium-webdriver → container selenium/standalone-chromium :4444
                                     └─ driver.manage().getCookies() → cookies (incl. HttpOnly)
                          ← cookies
                      └─ base44.entities.WebSession.create/update({ status:'active', cookies })
                 ← { webSessionId, status:'active' }
```

### Componentes na VPS:

| Componente | Imagem/Processo | Porta | Auth | Expõe |
|---|---|---|---|---|
| **Live Browser** (noVNC + Chromium) | `selenium/standalone-chromium` | 7900 (noVNC web), 4444 (Selenium) | VNC password por sessão | noVNC web client |
| **Live Browser Launcher** | Node script (`infra/live-browser/launcher.mjs`) | 8941 (HTTP) | `X-Api-Key` (`LIVE_BROWSER_API_KEY`) | `/launch`, `/cookies`, `/close` |
| **Caddy reverse proxy** | (já existe) | 443 | por subdomínio | live-browser + launcher públicos |

### Limitação MVP (herdada do RFC-012):

Uma sessão live por vez no launcher (1 container/WebDriver session ativa).
RFC-014 Fase 2 escala com pool de containers. Suficiente para login manual
individual — o uso real do Web Connector.

## 5. Contrato do Launcher (HTTP)

Serviço Node na VPS (`infra/live-browser/launcher.mjs`), atrás de Caddy com
`X-Api-Key`. Endpoints:

### POST /launch
Request:
```json
{ "url": "https://www.mercadolivre.com", "siteName": "Mercado Livre" }
```
Response 200:
```json
{
  "sessionId": "live_abc123",
  "novncUrl": "https://live-browser.<host>.duckdns.org/?host=...&password=<per-session>",
  "seleniumSessionId": "<webdriver session id>",
  "expiresAt": "ISO-8601 (+15min)"
}
```
- Cria um WebDriver session novo no container Selenium, navega para `url`.
- Gera uma VNC password aleatória por sessão (configurada no container via
  `SE_VNC_PASSWORD` — ver SETUP.md; MVP usa password fixa + token na URL se a
  imagem não suportar troca em runtime).
- TTL 15min: sessão auto-close se `/cookies` ou `/close` não chegarem.

### POST /cookies
Request:
```json
{ "sessionId": "live_abc123" }
```
Response 200:
```json
{
  "cookies": [
    { "name": "session", "value": "...", "domain": ".mercadolivre.com", "httpOnly": true, ... }
  ],
  "currentUrl": "https://www.mercadolivre.com/my-account"
}
```
- Conecta ao WebDriver session, chama `driver.manage().getCookies()`.
- Não fecha a sessão (permite retry/inspeção).

### POST /close
Request: `{ "sessionId": "live_abc123" }`
Response 200: `{ "ok": true }`
- Encerra o WebDriver session (libera RAM).

## 6. Backend Function: `webConnectorLive`

Nova backend function (`base44/functions/webConnectorLive/entry.ts`), separada
do `webConnectorConnect` (mantém RFC-012 intacto).

Operations:
- `launch { siteUrl, siteName }` → chama launcher `/launch`, cria
  `WebSession` com `status:'pending_login'` e `browser_context_id=sessionId`,
  retorna `{ webSessionId, novncUrl }`.
- `capture { webSessionId }` → chama launcher `/cookies` (sessionId =
  `browser_context_id`), valida que `currentUrl` não está em /login (sessão
  autenticada), persiste cookies em `WebSession.cookies`, marca `status:'active'`,
  chama launcher `/close`, retorna `{ status:'active', expiresAt }`.
- `abort { webSessionId }` → chama launcher `/close`, marca `WebSession.status='failed'`.

Secrets necessários (via `set_secrets`):
- `LIVE_BROWSER_LAUNCHER_URL` — URL pública do launcher (Caddy).
- `LIVE_BROWSER_API_KEY` — API key do launcher (X-Api-Key).

## 7. Frontend: modo "Login ao vivo"

Componente novo `src/components/web-connector/LiveLogin.jsx`, acionado por um
toggle no `WebConnectorPage` ("Login automático" vs "Login ao vivo").

Fluxo UI:
1. Usuário cola URL + ativa "Login ao vivo" → chama `webConnectorLive:launch`.
2. Retorna `novncUrl` → abre num `<iframe>` (modal full-screen no app).
3. Usuário interage **manualmente** no noVNC: digita email, senha, resolve
   CAPTCHA, completa 2FA. O MemoryOS não toca no browser.
4. Usuário clica "Concluí o login — capturar sessão" (fora do iframe).
5. Chama `webConnectorLive:capture` → `WebSession` vira `active`.
6. A partir daqui, o fluxo é idêntico ao RFC-012: descobrir capabilities,
   executar capabilities validadas, reusar sessão.

## 8. Segurança (extensão do ADR-019)

- **Credenciais nunca passam pelo MemoryOS**: o usuário digita email/senha
  **direto no noVNC** (no browser da VPS). O launcher e o backend function
  **não veem** email/senha — só capturam cookies já autenticados.
- **VNC password por sessão**: cada launch gera uma password aleatória,
  embutida na `novncUrl` retornada só ao usuário autenticado. Outros usuários
  não alcançam o noVNC sem a password.
- **Launcher atrás de API key** (`LIVE_BROWSER_API_KEY`): só o backend function
  (com a secret) invoca `/launch`, `/cookies`, `/close`.
- **TTL 15min**: sessão live sem `/capture` ou `/close` expira sozinha — não
  deixa browser exposto indefinidamente.
- **Cookies**: mesmas regras do ADR-019 — só cookies de sessão, nunca
  credenciais.

## 9. Fases de Implementação

| Fase | Entrega | Onde |
|---|---|---|
| **F1** | Design doc (este RFC) + launcher service + SETUP.md | repositório |
| **F2** | Deploy do launcher + container na VPS (manual, guia) | VPS (usuário) |
| **F3** | Backend function `webConnectorLive` + secrets | repositório |
| **F4** | Frontend `LiveLogin.jsx` + toggle no WebConnectorPage | repositório |
| **F5** | Validação end-to-end com saucedemo (sem CAPTCHA) e ML (com CAPTCHA) | manual |

## 10. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Imagem Selenium pesada (~1.5GB) coexiste com Playwright MCP + Stirling | Avaliar RAM; live-browser on-demand (start no launch, stop no close) |
| VNC password fixa na imagem (não troca em runtime) | Usar `SE_VNC_PASSWORD` fixa + token assinado na URL do noVNC como gate extra; ou `VNC_NO_PASSWORD=1` + Caddy com `X-Api-Key` (preferível) |
| noVNC sem TLS exposto | Caddy termina TLS no subdomínio DuckDNS (padrão já usado) |
| Detecção de automação pelo site (Chromium `navigator.webdriver=true`) | `selenium/standalone-chromium` já seta flags anti-detecção; se insuficiente, avaliar `undetected-chromedriver` numa Fase 6 |
| Concorrência (2 logins live simultâneos) | MVP: 1 por vez (lock no launcher). Pool na Fase 6. |

## 11. Estado

- **F1:** Em progresso (este doc + `infra/live-browser/`).
- **F2-F5:** Pendentes (requer deploy VPS manual).