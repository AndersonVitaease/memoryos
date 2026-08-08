# Playwright MCP Self-Hosted Server — Infraestrutura Operacional

**ID:** INFRA-PLAYWRIGHT-MCP
**Category:** INFRASTRUCTURE_KNOWLEDGE
**Status:** PLANNED
**Last Updated:** 2026-08-07
**Authority:** ENGINEERING

---

> Documentacao operacional da instancia Playwright MCP (standalone HTTP) self-hosted
> em VPS que atende ao Bug Hunter do MemoryOS. Conhecimento acumulado entre
> sessoes para evitar re-descobrir instalacao/endpoints/autenticacao.

---

## Visao Geral

O MemoryOS usa o **Playwright MCP** (open-source, da Microsoft) como servidor MCP
externo que da ao agente Bug Hunter capacidade de **navegar no app publicado como
um usuario real** — abrir paginas, clicar, preencher forms, ler o DOM/acessibilidade
e capturar erros de console. A instancia roda em modo **standalone HTTP**
(`@playwright/mcp --port 8931`) na VPS do usuario, exposta via DuckDNS + reverse
proxy com API key, no mesmo padrao do Stirling-PDF.

**Backend function que consome:** `base44/functions/mcpClientCall/entry.ts` (generico
— olha o registro `MCPServerConfig` por name='playwright-bug-hunter')
**Backend function orquestradora (futura):** `bugHunterRun` — loop LLM + Playwright
**Entity de findings:** `BugFinding`
**Secrets (planejados):** `PLAYWRIGHT_MCP_URL` (URL publica base), `PLAYWRIGHT_MCP_API_KEY` (chave do reverse proxy)

---

## Topologia

```
Workflow "Bug Hunter" (schedule 3x/dia)
  -> base44.functions.invoke("bugHunterRun", { targetUrl, scenario })
    -> Deno backend function (sandbox cloud)
      -> InvokeLLM/openrouterChat (decide proxima acao no browser)
      -> base44.functions.invoke("mcpClientCall", {
           serverId: <MCPServerConfig playwright-bug-hunter>,
           action: "call",
           toolName: "browser_navigate" | "browser_click" | ...,
           arguments: { ... }
         })
        -> Deno backend function (mcpClientCall, generico)
          -> fetch(PLAYWRIGHT_MCP_URL/mcp, headers: { "X-Api-Key": PLAYWRIGHT_MCP_API_KEY })
            -> Caddy reverse proxy (VPS) -> valida X-Api-Key -> roteia para localhost:8931
              -> Playwright MCP standalone (Node, --port 8931)
                -> Chromium headless (VPS) -> navega no app publicado
```

### Por que standalone HTTP (nao stdio):
- O sandbox Deno (runtime das backend functions) **nao roda processos locais nem
  browser**. Servers MCP stdio-only (`npx @playwright/mcp@latest` sem `--port`) sao
  known-issue KI-010 — incompativeis com o sandbox.
- O modo standalone HTTP expoe o MCP em `http://localhost:8931/mcp`, consumivel por
  `mcpClientCall` via Streamable HTTP (transporte suportado pelo SDK oficial).

### Por que reverse proxy com API key (nao porta direta):
- O endpoint MCP exposto publicamente sem auth permitiria qualquer cliente
  comandar o browser da VPS. O Caddy valida um header `X-Api-Key` antes de
  rotear — mesmo padrao do Stirling-PDF (`X-API-KEY`).
- O `mcpClientCall` resolve o header via `MCPServerConfig.auth_type='api_key'`,
  `auth_header_name='X-Api-Key'`, `api_key_secret_name='PLAYWRIGHT_MCP_API_KEY'`.

---

## Requisitos de Recursos (VPS)

**Criticidade:** o Chromium headless e pesado de RAM (~300-500MB por contexto de
browser ativo). O Stirling-PDF (Java) ja consome ~1GB. Rodar ambos **always-on**
exige:

| RAM da VPS | Viabilidade | Recomendacao |
|---|---|---|
| 1-2 GB | **NAO recomendado** | On-demand (start/stop por run) ou segunda VPS |
| 4 GB | OK | Os dois always-on confortavel |
| 8+ GB | Confortavel | Multi-contexto (testes paralelos) viavel |

> **On-demand (VPS pequena):** o workflow pode fazer `docker start playwright-mcp`
> antes da run e `docker stop` apos — o processo idle entre runs e leve, mas o pico
> de navegacao pode estourar RAM e derrubar o Stirling (OOM killer). Avaliar antes.

**Dependencias de sistema do Chromium (Debian/Ubuntu):**
```
libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0
libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0
libcairo2 libasound2 libatspi2.0-0 libxshmfence1 fonts-liberation
```
A imagem Docker `mcr.microsoft.com/playwright:v1.x` ja traz tudo isso — prefira
Docker para evitar instalar dezenas de libs na mao.

---

## Instalacao (Docker, recomendado)

### 1. Imagem
```bash
docker pull mcr.microsoft.com/playwright:v1.49.0-jammy
```
> Pinar versao (nao `:latest`) — versoes do Playwright MCP mudam a superficie de
> tools e quebram chamadas antigas. Sempre revalidar `tools/list` apos update.

### 2. docker-compose.yml
```yaml
version: "3.8"
services:
  playwright-mcp:
    image: mcr.microsoft.com/playwright:v1.49.0-jammy
    container_name: playwright-mcp
    restart: unless-stopped
    command: npx @playwright/mcp@latest --port 8931 --host 0.0.0.0 --headless
    ports:
      - "127.0.0.1:8931:8931"   # so localhost — Caddy expoe publicamente
    environment:
      - PLAYWRIGHT_MCP_BROWSER=chromium
    shm_size: "1gb"            # evita crashes no Chromium headless
    tmpfs:
      - /tmp
```
> `--host 0.0.0.0` dentro do container + bind `127.0.0.1:8931` no host = so o host
> (e o Caddy) alcancam. Nunca expor 8931 direto na internet.

### 3. Caddy reverse proxy (API key gate + Host rewrite)
Adicionar ao `Caddyfile` (mesmo Caddy que atende o Stirling-PDF):
```
playwright-mcp.<seu>.duckdns.org {
  @haskey header X-Api-Key {key}
  handle @haskey {
    reverse_proxy localhost:8931 {
      header_up Host localhost:8931
    }
  }
  handle {
    respond "Unauthorized" 401
  }
}
```
Gerar a key: `openssl rand -hex 32` -> salvar como secret `PLAYWRIGHT_MCP_API_KEY`
no Base44 e no Caddyfile.

> **CRITICO — Host header rewrite (`header_up Host localhost:8931`):** o
> Playwright MCP valida o header `Host` da requisicao (protecao CSRF) e rejeita
> (`Access is only allowed at localhost:8931`) qualquer requisicao cujo Host nao
> seja exatamente `localhost:8931`. Sem o `header_up`, o Caddy repassa o Host
> original (`playwright-mcp.<seu>.duckdns.org`) e o servidor bloqueia todas as
> chamadas com resposta vazia / 522. O `header_up Host localhost:8931`
> sobrescreve o Host antes de encaminhar ao upstream, mantendo a protecao CSRF
> satisfeita. Causa raiz do bug 522/empty-response na sessao 2026-08-08.

### 4. Subir
```bash
docker compose up -d playwright-mcp
docker compose logs -f playwright-mcp   # confirmar "Server started on port 8931"
```

### 5. Smoke test (na VPS)
```bash
curl -s http://localhost:8931/mcp -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}'
```
Deve retornar o JSON-RPC de Initialize (capabilities do servidor).

---

## Registro no MemoryOS (apos VPS up)

Criar registro `MCPServerConfig`:
```
name:                  playwright-bug-hunter
server_url:            https://playwright-mcp.<seu>.duckdns.org/mcp
transport:             json   (Streamable HTTP — mcpClient tenta streamable primeiro)
auth_type:              api_key
api_key_secret_name:   PLAYWRIGHT_MCP_API_KEY
auth_header_name:      X-Api-Key
enabled:               true
```

Validar via `mcpClientCall` (action: "list") — deve retornar as tools do Playwright
(`browser_navigate`, `browser_click`, `browser_snapshot`, `browser_console_messages`,
`browser_take_screenshot`, `browser_close`, ...). O `discovered_tools` do registro
eh cacheado apos o list com sucesso.

---

## Browser Binary (chromium) — Gotcha Critico

O `@playwright/mcp` precisa do binario Chromium instalado para QUALQUER tool de
navegacao (browser_navigate, browser_click, ...). O handshake `initialize`
**nao** precisa do browser — ele passa mesmo com o chromium ausente, mascarando
o problema. O erro so aparece na primeira tool de navegacao:

```
Error: Browser "chrome-for-testing" is not installed; expected executable
at /ms-playwright/chromium-1237/chrome-linux64/chrome.
Run `npx @playwright/mcp install-browser chrome-for-testing` to install
```

**Causa raiz:** mismatch entre a versao do `@playwright/mcp` (que espera um
build especifico do chromium, ex: chromium-1237) e a imagem Docker
`mcr.microsoft.com/playwright:vX.Y.Z` (que traz o chromium da versao X.Y.Z).
Usar `@playwright/mcp@latest` com uma imagem pinada em versao antiga quebra.

**2 fixes (um deles resolve):**

1. **Pinar a versao do MCP para casar com a imagem** (recomendado, permanente):
   ```yaml
   command: npx @playwright/mcp@1.49.0 --port 8931 --host 0.0.0.0 --headless
   ```
   A imagem `mcr.microsoft.com/playwright:v1.49.0-jammy` ja traz o chromium
   que essa versao espera. Reconstruir: `docker compose up -d --force-recreate`.

2. **Instalar o browser no container atual** (rapido, porem fragil — quebra no
   proximo `docker compose up --force-recreate` que recria o container):
   ```bash
   docker exec -it playwright-mcp npx @playwright/mcp@latest install-browser chrome-for-testing
   ```

> **Regra:** sempre pino a versao do `@playwright/mcp` para casar com a tag da
> imagem Docker. `@latest` + imagem pinada = mismatch de browser garantido.

---

## Versao e Surface de Tools

**Versao recomendada:** `@playwright/mcp` matching `mcr.microsoft.com/playwright:v1.49.0`.
A superficie de tools muda entre versoes — sempre revalidar via `tools/list` apos
qualquer update e antes de codar nova chamada no `bugHunterRun`.

### Tools tipicas (validar por list):
| Tool | Uso no Bug Hunter |
|---|---|
| `browser_navigate` | Abrir a pagina alvo do app publicado |
| `browser_snapshot` | Ler a arvore de acessibilidade (estrutura da pagina) |
| `browser_click` | Interagir com elementos (botoes, links, tabs) |
| `browser_type` | Preencher inputs (login, compose, busca) |
| `browser_console_messages` | Capturar erros de console do app |
| `browser_take_screenshot` | Evidencia visual da finding |
| `browser_close` | Encerrar o contexto (libera RAM na VPS) |

> **Regra:** antes de adicionar qualquer chamada nova no `bugHunterRun`, confirmar
> o nome exato da tool via `tools/list` — nomes mudam entre versoes do `@playwright/mcp`.

---

## Manutencao do VPS (operacional, fora do codigo)

- **Atualizar a imagem:** `docker pull mcr.microsoft.com/playwright:v1.49.0-jammy`
  (ou nova versao pinada) + recreate container. Apos update, **revalidar tools/list**
  via `mcpClientCall` e rodar uma run de smoke do Bug Hunter.
- **Renovar DuckDNS:** mesmo cronjob de keepalive do Stirling-PDF atende.
- **Rotacionar API key:** gerar nova (`openssl rand -hex 32`) -> atualizar secret
  `PLAYWRIGHT_MCP_API_KEY` no Base44 + Caddyfile + reload Caddy.
- **shm_size:** manter `1gb` — sem isso o Chromium pode crashar em paginas pesadas.
- **On-demand (VPS pequena):** se RAM < 4GB, considerar `docker stop playwright-mcp`
  entre runs e start no inicio do workflow.

---

## Referencias Cruzadas

- **Backend function generica (consome):** `base44/functions/mcpClientCall/entry.ts`
- **Modulo compartilhado MCP:** `base44/shared/mcpClient.ts`
- **Entity de findings:** `base44/entities/BugFinding.jsonc`
- **Infra irma (mesmo padrao):** `src/docs/01-operational-knowledge/STIRLING-PDF-SERVER-INFRASTRUCTURE.md`
- **Known issue stdio:** `src/docs/01-operational-knowledge/KNOWN-ISSUES.md` (KI-010)

---

## Licoes (reutilizar de STIRLING-PDF)

1. **Sandbox Deno bloqueia IP cru** — usar dominio DuckDNS (mesma lógica do Stirling).
2. **Endpoint publico exige auth** — reverse proxy + header de API key, nunca porta
   direta na internet.
3. **Versao pinada > :latest** — surface de tools do Playwright MCP muda entre
   versoes; revalidar `tools/list` apos update.
4. **Chromium e RAM-hungry** — `shm_size: 1gb` obrigatorio; avaliar coexistencia
   com Stirling-PDF em VPS < 4GB.