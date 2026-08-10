# Live Browser Launcher — Setup na VPS (RFC-015)

> Serviço que expõe um navegador Chromium **ao vivo** (noVNC) para o usuário
> fazer login manualmente e resolver CAPTCHA. A captura de cookies é feita via
> Selenium WebDriver (`getCookies()` inclui HttpOnly).

## Pré-requisitos

- VPS com Docker + Caddy (mesma infra do Playwright MCP e Stirling-PDF).
- RAM: a imagem `selenium/standalone-chromium` consome ~1-1.5GB ativa. Avaliar
  coexistência com Playwright MCP + Stirling (~2.5GB total). Em VPS < 4GB,
  rodar o live-browser **on-demand** (start no launch, stop no close).

## 1. Subir o container Selenium (noVNC + Chromium)

### docker-compose.yml (em `/opt/live-browser/docker-compose.yml`)

```yaml
version: "3.8"
services:
  selenium-chromium:
    image: selenium/standalone-chromium:latest
    container_name: live-browser-selenium
    restart: unless-stopped
    ports:
      - "127.0.0.1:4444:4444"   # Selenium WebDriver (só localhost — launcher)
      - "127.0.0.1:7900:7900"   # noVNC web (só localhost — Caddy expõe)
    environment:
      - SE_VNC_NO_PASSWORD=1    # sem password no VNC — Caddy faz o gate com X-Api-Key
      - SE_NODE_MAX_SESSIONS=1
      - SE_SESSION_TIMEOUT=300
    shm_size: "1gb"             # evita crashes no Chromium
    tmpfs:
      - /tmp
```

> `SE_VNC_NO_PASSWORD=1` desativa a password do VNC. O acesso público é
> controlado pelo Caddy (header `X-Live-Token` por sessão — ver passo 3). Se
> preferir password no VNC, troque por `SE_VNC_PASSWORD=<sua-password>` e
> ajuste o launcher (`VNC_PASSWORD`).

```bash
mkdir -p /opt/live-browser
cd /opt/live-browser
# (cole o docker-compose.yml acima)
docker compose up -d selenium-chromium
docker compose logs -f selenium-chromium   # confirmar "Selenium Grid ... ready"
```

### Smoke test (na VPS)

```bash
curl -s http://localhost:4444/status | jq .   # {"value": {... ready ...}}
curl -sI http://localhost:7900/              # 200 — noVNC web client
```

## 2. Instalar e rodar o launcher

```bash
cd /opt/live-browser
# Copie launcher.mjs para aqui (do repositório: infra/live-browser/launcher.mjs)
npm init -y
npm install selenium-webdriver

# Configure variáveis de ambiente (crie /opt/live-browser/.env)
cat > /opt/live-browser/.env << 'EOF'
PORT=8941
SELENIUM_REMOTE_URL=http://localhost:4444
NOVNC_PUBLIC_URL=https://live-browser.SEUHOST.duckdns.org
LAUNCHER_API_KEY=SUBSTITUA_POR_UMA_KEY_LONGA
EOF
```

Gerar a API key:

```bash
openssl rand -hex 32
```

### systemd service (`/etc/systemd/system/live-browser-launcher.service`)

```ini
[Unit]
Description=MemoryOS Live Browser Launcher (RFC-015)
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/live-browser
EnvironmentFile=/opt/live-browser/.env
ExecStart=/usr/bin/node /opt/live-browser/launcher.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now live-browser-launcher
systemctl status live-browser-launcher   # confirmar "ouvindo em 127.0.0.1:8941"
```

## 3. Caddy reverse proxy

Adicionar ao `Caddyfile` (mesmo Caddy do Playwright MCP):

```
live-browser.SEUHOST.duckdns.org {
  # noVNC web client (ws upgrade nativo do Caddy)
  @haskey header X-Live-Token {token-fixa-ou-por-sessao}
  handle @haskey {
    reverse_proxy localhost:7900
  }
  handle {
    respond "Unauthorized" 401
  }
}

live-launcher.SEUHOST.duckdns.org {
  @haskey header X-Api-Key {LIVE_BROWSER_API_KEY}
  handle @haskey {
    reverse_proxy localhost:8941 {
      header_up Host localhost:8941
    }
  }
  handle {
    respond "Unauthorized" 401
  }
}
```

> **noVNC + WebSocket:** o Caddy faz upgrade de WebSocket automaticamente para
> `reverse_proxy`, então o noVNC funciona sem config extra. O gate via
> `X-Live-Token` protege o noVNC público. Para simplicidade MVP, use uma token
> fixa (igual à `LAUNCHER_API_KEY`) — o noVNC é de uso único por sessão e
> expira em 15min.

Recarregar Caddy:

```bash
sudo systemctl reload caddy
```

## 4. Registrar secrets no MemoryOS (app)

No app (Base44 → Secrets), adicionar:

- `LIVE_BROWSER_LAUNCHER_URL` = `https://live-launcher.SEUHOST.duckdns.org`
- `LIVE_BROWSER_API_KEY` = (mesma key do `LAUNCHER_API_KEY`)

## 5. Validação end-to-end (na VPS)

```bash
# launch
curl -s -X POST https://live-launcher.SEUHOST.duckdns.org/launch \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $LIVE_BROWSER_API_KEY" \
  -d '{"url":"https://www.saucedemo.com"}'
# → {"sessionId":"live_...","novncUrl":"https://live-browser.../?autoconnect=1...","expiresAt":"..."}

# Abra novncUrl no navegador (com header X-Live-Token ou ajuste o gate).
# Faça login manual (standard_user / secret_sauce no saucedemo).

# capture
curl -s -X POST https://live-launcher.SEUHOST.duckdns.org/cookies \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $LIVE_BROWSER_API_KEY" \
  -d '{"sessionId":"live_..."}'
# → {"cookies":[...],"currentUrl":"https://www.saucedemo.com/inventory.html"}

# close
curl -s -X POST https://live-launcher.SEUHOST.duckdns.org/close \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $LIVE_BROWSER_API_KEY" \
  -d '{"sessionId":"live_..."}'
```

Se o `/cookies` retornar cookies com `httpOnly:true` (ex: `session` no
saucedemo), o fluxo está correto.

## 6. Próximos passos (no app)

Após F2 confirmada (launcher respondendo), reporte de volta para conectar:
- Backend function `webConnectorLive` (F3)
- Frontend `LiveLogin.jsx` + toggle no WebConnectorPage (F4)

## Limitações MVP

- 1 sessão live por vez (lock no launcher).
- noVNC sem password (gate via Caddy token) — aceitável para uso único de 15min.
- `navigator.webdriver=true` no Chromium Selenium: alguns sites detectam. Se
  ML/Google bloquearem, avaliar `undetected-chromedriver` numa Fase 6.