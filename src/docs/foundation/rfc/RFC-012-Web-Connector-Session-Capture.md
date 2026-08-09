# RFC-012 — Web Connector: Captura de Sessão (Frente A)

**Status:** Sprint 1 implementado (2026-08-09) — ver seção "Implementação" no final
**ADR relacionada:** ADR-019
**Sprints:** WEB-CONN-00 (fundação), WEB-CONN-01 (captura)
**Data:** 2026-08-09
**Autores:** Anderson (arquitetura), MemoryOS Engineering (Claude)

---

## Contexto

Esta é a primeira das três frentes que implementam a arquitetura de Web Connector genérico descrita por Anderson (ver ADR-019 para a decisão que a fundamenta: nunca armazenar senha de terceiros). Esta frente resolve apenas **como capturar e reutilizar uma sessão autenticada** — não resolve descoberta de capabilities (RFC-013) nem integração ao Connector Runtime (RFC-014).

### Princípio de não-regressão

Nada nesta frente edita arquivos existentes. Toda peça é nova:
- Nova entidade (`WebSession`)
- Novo `MCPServerConfig` (instância Playwright separada da já existente `playwright-bug-hunter`)
- Nova função backend (`webConnectorConnect`, arquivo próprio — **não** `bugHunterRun/entry.ts`)
- Nova página de frontend

O `bugHunterRun`, o `BugHunterConsole`, e os connectors `GitHubConnector`/`Base44Connector` continuam intocados até o fim desta frente.

---

## Escopo funcional

1. Usuário informa a URL do sistema que quer conectar.
2. MemoryOS abre a URL num contexto Playwright dedicado, em modo `headed` (visível), usando a instância `playwright-web-connector` (nova, separada da instância de Bug Hunter).
3. Usuário realiza o login manualmente, diretamente no site — o MemoryOS não recebe usuário/senha em nenhum momento.
4. Após confirmação do usuário ("já fiz login"), o backend extrai os cookies do contexto e grava em `WebSession`.
5. Chamadas futuras reutilizam a sessão salva sem exigir novo login, até expirar (TTL) ou ser revogada.

---

## Modelo de dados

### Entidade `WebSession`

```jsonc
{
  "name": "WebSession",
  "type": "object",
  "properties": {
    "site_url": { "type": "string", "description": "URL base do sistema conectado" },
    "site_name": { "type": "string", "description": "Nome legível (ex: 'Wooba', 'CRM interno')" },
    "browser_context_id": { "type": "string", "description": "ID do contexto Playwright associado, para reuso" },
    "cookies": { "type": "string", "description": "JSON serializado dos cookies capturados (nunca senha, nunca campos de login)" },
    "status": { "type": "string", "enum": ["pending_login", "active", "expired", "revoked"], "default": "pending_login" },
    "last_used_at": { "type": "string", "format": "date-time" },
    "expires_at": { "type": "string", "format": "date-time", "description": "TTL da sessão — reautenticação manual solicitada após expirar" }
  },
  "required": ["site_url", "status"],
  "rls": {
    "read": { "created_by_id": "{{user.id}}" },
    "update": { "created_by_id": "{{user.id}}" },
    "delete": { "created_by_id": "{{user.id}}" }
  }
}
```

Nenhum campo de senha, email de login, ou credencial existe neste schema — por decisão da ADR-019.

---

## Infraestrutura

### Nova instância Playwright MCP

Registrar novo `MCPServerConfig`:

```
name: playwright-web-connector
server_url: https://playwright-web.<vps>.duckdns.org/mcp  (porta diferente de 8931, ex: 8932)
transport: json
auth_type: api_key
api_key_secret_name: PLAYWRIGHT_WEB_CONNECTOR_API_KEY
```

Instância Docker separada na VPS (mesmo padrão já documentado em `PLAYWRIGHT-MCP-SERVER-INFRASTRUCTURE.md`), para não competir por RAM/contextos com o Bug Hunter.

### Nova função backend: `webConnectorConnect`

Arquivo próprio: `base44/functions/webConnectorConnect/entry.ts`. **Não reaproveita nem edita `bugHunterRun/entry.ts`** — só chama `mcpClientCall` com `serverId` apontando para o `MCPServerConfig` novo, do mesmo jeito que `bugHunterRun` já faz com o dele.

Operações:
```
POST webConnectorConnect { operation: "start", siteUrl }
→ { webSessionId, status: "pending_login" }   // abre contexto headed, aguarda login

POST webConnectorConnect { operation: "confirm", webSessionId }
→ { status: "active" }                         // captura cookies, fecha modo headed

POST webConnectorConnect { operation: "revoke", webSessionId }
→ { status: "revoked" }
```

### Frontend

Página nova (`WebConnectorPage.jsx` ou dentro de uma seção "Conectores" já existente, a definir com Anderson) com o fluxo "Conectar novo sistema" → cola URL → botão "Já fiz login" → confirmação.

---

## Critérios de aceite (Sprint WEB-CONN-01)

- [ ] `WebSession` criada com `status=active` após login manual em 1 site de teste (não-produção)
- [ ] Segunda chamada à mesma sessão reutiliza cookies salvos, sem pedir novo login
- [ ] Sessão expira corretamente após TTL e status muda para `expired`
- [ ] Nenhum campo de senha/credencial aparece em nenhum log, entidade ou payload
- [ ] `bugHunterRun`, `BugHunterConsole`, `GitHubConnector`, `Base44Connector` seguem funcionando sem alteração de comportamento

---

## Riscos

| Risco | Mitigação |
|---|---|
| Site bloqueia automação/detecta Playwright (anti-bot) | Aceitar como limitação conhecida por site; registrar em `WebSession.status` um estado de falha específico, não silencioso |
| Usuário fecha a aba antes de confirmar login | `WebSession` fica em `pending_login` com TTL curto próprio (ex: 10min), expira sozinha |
| Custo de RAM da nova instância Playwright na VPS pequena | Mesma mitigação já documentada para Bug Hunter: `docker stop` on-demand se RAM < 4GB |

---

## Fora de escopo (frentes seguintes)

- Descoberta automática de capabilities → RFC-013
- Registro do connector no `ConnectorRuntime` e fila de execução → RFC-014
- Extensão Chrome como via alternativa de captura → RFC futuro, pós-validação

---

## Implementação (Sprint 0 + Sprint 1, 2026-08-09)

**Infraestrutura (Sprint 0):**
- Entidade `WebSession` criada
- Container `playwright-web-connector` na VPS (porta 8932, `/root/playwright-mcp/docker-compose.yml`)
- Caddy: bloco `memoryos-webconnector.duckdns.org` (`/etc/caddy/Caddyfile`), auth via `X-Api-Key`
- `MCPServerConfig` registrado (`server_url: https://memoryos-webconnector.duckdns.org/mcp`)
- Secret `PLAYWRIGHT_WEB_CONNECTOR_API_KEY` cadastrado pelo usuário

**Código (Sprint 1):**
- `base44/functions/webConnectorConnect/entry.ts` — operations `start`/`login`/`confirm`/`revoke`
- `src/pages/WebConnectorPage.jsx` — UI do fluxo de conexão
- Rota `/web-connector` registrada em `src/App.jsx` (aditivo, ao lado de `/bug-hunter`)

**Adendo à ADR-019** documentando a decisão de bootstrap de login via snapshot/relay (não streaming de tela) — ver ADR-019 para detalhes e a consequência de segurança explícita (senha transita transitoriamente, nunca persistida).

**Pendente de validação:** 1 teste manual ponta a ponta com site real (login → confirm → cookies capturados) ainda não executado nesta sessão — recomendado antes de avançar para RFC-013.

---

*RFC-012 — Web Connector: Captura de Sessão — 2026-08-09 — Sprint 1 implementado*
