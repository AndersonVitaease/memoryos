# Checkpoint: Pre OpenHands Task Process REST V1 — 2026-08-20

## Estado antes da implementacao

- `openHandsTaskProcess` certificado em criacao (POST /api/v1/app-conversations),
  polling de start-tasks e polling de execution_status.
- Bloqueio restante: recuperacao da resposta final do agente.
- Causa raiz do bloqueio (auditoria oficial confirmada):
  - Path incorreto: usava `/api/conversations/{id}/events/search` (legado V0, plural).
  - Auth incorreta: usava `X-Session-API-Key` com `session_api_key` transitiva.
- Contrato oficial V1 certificado por execucao real contra conversation
  `7853fa4309664461af15b3522237c056` (HTTP 200, 49 eventos, agent_reply recuperado).

## Contrato V1 correto (a implementar)

- Endpoint: `GET https://app.all-hands.dev/api/v1/conversation/{conversation_id}/events/search`
- Query: `sort_order=TIMESTAMP`, `limit=100`, `page_id` (paginacao), `kind__eq` (filtro opcional)
- Auth: `X-Access-Token: <OPENHANDS_API_KEY>` (chave persistente — nao session_api_key)
- Resposta: `{ items: Event[], next_page_id: string|null }`
- Evento da resposta do agente: `MessageEvent` com `source="agent"`, texto em `llm_message.content[].text`

## Escopo

- Alterar SOMENTE `base44/functions/openHandsTaskProcess/entry.ts`.
- Preservar fluxo de criacao + polling.
- NAO alterar Runtime, GoalRegistry, AdaptiveProcess, ENG-MCP, MCPConnector.
- NAO criar nova entity/connector/capability.