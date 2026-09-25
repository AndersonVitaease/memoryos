# GWS-TOOLS-01 — Runbook das tools Google Workspace (eng-mcp)

> Mission GWS-TOOLS-01 · 2026-09-25 · caminho: eng-mcp → `googleWorkspaceApi` (base44) → Google OAuth (borecomba@gmail.com)

## Arquitetura (uma frase)

Cada tool `engineering.google.*` valida a entrada contra um schema zod `.strict()` em `src/gws.ts`, dá um POST `{op, params}` ao backend function base44 `googleWorkspaceApi` (que refresca e usa o token OAuth server-side — **tokens nunca cruzam a fronteira**), e devolve a resposta redactada + size-capped; zero LLM no caminho da tool.

```
Hermes / supervisor → /mcp-proxy → eng-mcp tool (gate de tier)
  → runGws (strict schema, redact, audit /data/audit/gws.jsonl)
    → base44 function googleWorkspaceApi (header x-agent-memory-token)
      → GoogleOAuthToken (refresh server-side) → Gmail/Calendar/Drive APIs
```

## Governança de tiers — QUAL TIER CADA AÇÃO PERTENCE

| Tier | Tool | Op backend | Gate de scope do bearer | Gate de PLAN do caller |
|---|---|---|---|---|
| **T1 leitura** (autônoma) | `engineering.google.gmail.list` | `gmail.list` | `engineering:google:read` **OU** `engineering:read` | nenhum — executa direto |
| T1 | `engineering.google.gmail.get` | `gmail.get` | idem | nenhum |
| T1 | `engineering.google.calendar.list` | `calendar.list` | idem | nenhum |
| T1 | `engineering.google.drive.list` | `drive.list` | idem | nenhum |
| T1 | `engineering.google.contacts.list` | `contacts.list` | idem | nenhum (⚠ 403 até consentir People API) |
| **T2 escrita** (PLAN) | `engineering.google.gmail.send` | `gmail.send` | `engineering:google:write` **OU** `engineering:write` | supervisor propõe, **operador aprova no chat** |
| T2 | `engineering.google.gmail.reply` | `gmail.reply` | idem | idem |
| T2 | `engineering.google.calendar.createEvent` | `calendar.createEvent` | idem | idem |
| T2 | `engineering.google.drive.upload` | `drive.upload` | idem | idem |
| T2 | `engineering.google.drive.update` | `drive.update` | idem | idem |
| T2 | `engineering.google.docs.create` | `docs.create` | idem | idem (⚠ cria doc vazio) |
| T2 | `engineering.google.docs.append` | `docs.append` | idem | idem (⚠ 403 até consentir Documents API) |
| **T3 externo/destrutivo** (PLAN + custo explícito) | `engineering.google.gmail.sendExternal` | `gmail.sendExternal` | `engineering:google:manage` **SÓ** (sem OR) | supervisor propõe com custo/irreversibilidade explícitos (padrão emissão Wooba), **operador aprova no chat** |
| T3 | `engineering.google.calendar.deleteEvent` | `calendar.deleteEvent` | idem | idem |
| T3 | `engineering.google.drive.delete` | `drive.delete` | idem | idem (⚠ `permanent:true` = DELETE físico, não reversível) |

### Regras dos gates

1. **Scope gate (server-side, fail-closed):** cada tool checa o bearer ANTES de tocar rede; ausente → `AUTHORIZATION_SCOPE_REQUIRED`. T1 aceita `:google:read` OU `:read` (subjects existentes continuam funcionando); T2 aceita `:google:write` OU `:write`; T3 aceita **apenas** `:google:manage` — nenhum subject read/write existente alcança sendExternal/deletes sem grant explícito do operador (`engineering.registry.scope.grant`, non-self).
2. **PLAN gate (do caller):** quem chama (supervisor) propõe; o operador aprova no chat ANTES de executar. O server não impõe isso — é contrato documentado aqui, honrado pelo fluxo Hermes.
3. **dryRun (DUMMY path):** todas as T2/T3 aceitam `dryRun: true` (literal — `dryRun:false` é rejeitado). O backend devolve o preview `{preview, tier, warning}` **sem tocar o Google**. É o caminho dos testes dummy e do primeiro movimento de um PLAN.
4. **Campos estritos:** schemas `.strict()` — chave desconhecida é rejeitada (`GWS_INPUT_INVALID`); caller nunca manda parâmetro bruto.

## Prova E2E (camino Hermes, identidade hermes-2026-09)

```bash
SECRET=$(cat /data/credentials/hermes-proxy-secret)
curl -sS -X POST http://127.0.0.1:8787/mcp-proxy \
  -H "Content-Type: application/json" -H "X-Proxy-Secret: $SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"engineering.google.gmail.list","arguments":{"maxResults":5,"query":"newer_than:1d"}}}'
```

O bearer de `hermes-2026-09` é injetado server-side (o client nunca o envia); o proxy autentica `X-Proxy-Secret` constant-time e audita em `/data/audit/mcp-proxy.jsonl`; a tool audita em `/data/audit/gws.jsonl` (metadata-only).

## Caveats honestos (upstream, não bugs)

- **contacts.list** — o conector Google não tem People API consentida → 403 honesto até novo consent em `/connections`.
- **docs.create** — cria doc VAZIO via Drive mimeType (sem Documents API scope).
- **docs.append** — falha com `DOCUMENTS_SCOPE_NOT_CONSENTED` até consentir Documents API.
- **drive.delete permanent:true** — hard DELETE irreversível (404 tolerado como já-gone).

## Audit & observabilidade

- `/data/audit/gws.jsonl` — `{ts, op, tier, status, durationMs, dryRun, error?}` — nunca conteúdo de e-mail/agenda/arquivo.
- Latência da tool = `durationMs` da própria linha de audit.
- `src/gws.ts` redacta qualquer chave `authorization|token|secret|password|cookie|bearer` e capta a resposta em 200KB.