# SESSION 2026-08-04 — GitHub Connector Upgrade 3: Webhooks

**Data:** 2026-08-04
**Status:** CONCLUIDO
**Escopo:** `base44/functions/githubWebhook/entry.ts`, `src/lib/connector-runtime/connectors/github/GitHubWriteOps.ts`, `src/lib/connector-runtime/connectors/GitHubConnector.ts`, `src/docs/sprints/GITHUB-CONNECTOR-MULTIACCOUNT-AND-UPGRADE-PLAN.md`
**Plano de origem:** `src/docs/sprints/GITHUB-CONNECTOR-MULTIACCOUNT-AND-UPGRADE-PLAN.md` (Upgrade 3)

---

## 1. Contexto

O conector GitHub ja tinha 5 dos 6 upgrades do plano multi-conta concluidos (Escritas,
Token Bucket, Code Search proxy, Retry, Actions/Releases). Faltava o Upgrade 3
(Webhooks) — o unico que envolve um endpoint publico recebido PELO GitHub (sem auth
de usuario), validacao criptografica de assinatura e persistencia de evento para o
WatchEngine/CognitiveEventBus consumir.

A demanda surgiu da verificacao pratica: ao listar repos do usuario
(@AndersonVitaease, 3 repos), confirmou-se que a conexao OAuth multi-conta esta
ativa e o RuntimeContext marca GitHub como conectado. O Upgrade 3 fecha o plano
completo do conector.

## 2. O que foi feito

### 2.1 Receptor de webhook (backend function nova)

`base44/functions/githubWebhook/entry.ts` — endpoint publico:

- **Sem auth de usuario** — chamado diretamente pelo GitHub. Valida origem por
  assinatura criptografica (nao por session/token).
- **Validacao HMAC-SHA256:** le `x-hub-signature-256` (formato `sha256=<hex>`),
  importa a chave `GITHUB_WEBHOOK_SECRET` via Web Crypto (`importKey` + `sign`),
  compara o MAC computado com o esperado em **constant-time** (XOR bit-a-bit,
  rejeita length mismatch). Sem secret configurado → 503 (nao podemos validar).
- **Eventos suportados (resumo dedicado):** `push` (ref, commits[], forced),
  `pull_request` (action, number, title, head/base, state, draft, merged),
  `issues` (action, number, title, state, labels[]), `release` (action,
  tagName, name, prerelease), `workflow_run` (action, runId, name, status,
  conclusion, branch). Outros eventos passam como generico (repo + sender).
- **Persistencia:** grava um `SystemEvent` (entidade ja existente) com:
  - `conversationId`: `github:<repoFullName>` (namespace por repo) ou
    `github:webhook` (fallback).
  - `correlationId`: `x-github-delivery` (UUID de entrega do GitHub).
  - `type`: `github_webhook_<event>` (ex: `github_webhook_push`).
  - `source`: `GitHubWebhook`.
  - `actor`: `sender.login` (ou `system`).
  - `status`: `success`.
  - `payload`: resumo estruturado do evento.
  - `metadata`: `{ deliveryId, event, receivedAt }`.
- **SLA do GitHub:** responde 200 em <10s. Mesmo em erro interno, responde 200
  (com `{ ok: false, error }`) para evitar retransmissao infinita do GitHub.

### 2.2 Ops de webhook no conector (escritas)

`src/lib/connector-runtime/connectors/github/GitHubWriteOps.ts` — 3 ops
adicionadas ao `WRITE_OPS`:

| Op | Metodo | Endpoint | Reversibilidade |
|---|---|---|---|
| `repos.createWebhook` | POST | `/repos/{o}/{r}/hooks` | `reversible` |
| `repos.listWebhooks` | GET | `/repos/{o}/{r}/hooks?per_page=50` | `safe` (implicito) |
| `repos.deleteWebhook` | DELETE | `/repos/{o}/{r}/hooks/{hook_id}` | `reversible` |

`repos.createWebhook` aceita `webhookUrl`, `secret` (opcional) e `events`
(default `["push", "pull_request"]`). Config enviada ao GitHub:
`{ name: "web", content_type: "json", secret }`. Erro 403 claro se o token
nao tiver scope `admin:repo_hook`. Erro 422 se webhook ja existe ou config invalida.

### 2.3 Metadata do conector

`src/lib/connector-runtime/connectors/GitHubConnector.ts`:
- `metadata().capabilities` agora inclui as 3 ops de webhook.
- `metadata().capabilityReversibility` marca `repos.createWebhook` e
  `repos.deleteWebhook` como `reversible` (webhooks podem ser removidos a
  qualquer momento — sao administrativos, nao destrutivos de estado de repo).
  `repos.listWebhooks` e leitura → `safe` implicito (nao precisa declarar).

Isso integra o Upgrade 3 ao Safety Gate (ADR-015): ops de webhook passam pelo
gate como `reversible` (aprovadas sem confirmacao), mas ficam classificadas
caso policies futuras queiram freia-las.

## 3. Para ativar (passos manuais do usuario)

O receptor e ops existem, mas o fluxo ponta-a-ponta exige configuracao
manual (alinhado ao padrao do projeto: secrets configurados pelo dashboard,
nao via ferramenta automatica — dead-end recorrente: usuario rejeitou
`set_secrets` em sprint anterior):

1. **Configurar o secret** `GITHUB_WEBHOOK_SECRET` em
   **Dashboard > Settings > Environment Variables**. Nao esta na lista de
   secrets atuais (adicionar manualmente). Valor: string aleatoria forte.
2. **Pegar a URL publica** da funcao `githubWebhook` em
   **Dashboard > Code > Functions**.
3. **Registrar o webhook** num repo de duas formas:
   - **Via conector:** chamar `repos.createWebhook` com
     `{ owner, repo, webhookUrl: <url do passo 2>, secret: <mesmo secret do passo 1>, events: ["push","pull_request"] }`.
   - **Direto no GitHub:** Settings do repo > Webhooks > Add webhook, com a
     mesma URL + secret + content type `application/json`.
4. **Disparar um evento** (push, abrir PR) — o receptor valida a assinatura,
   grava um `SystemEvent`, e o evento aparece na timeline / pode ser consumido
   por Watch/CognitiveEventBus.

## 4. Nao-quebra

- **Receptor e endpoint novo** — nao afeta nenhum fluxo existente. OAuth
  multi-conta, leituras, escritas, Actions, Code Search, Retry, Token Bucket
  todos intocados.
- **Ops de webhook sao novos cases** no dispatch (`_dispatch` switch) —
  leituras e escritas existentes (issues, PRs, files, actions) seguem
  identicas. Reversibilidade declarada e aditiva (campo opcional).
- **`GITHUB_WEBHOOK_SECRET` ausente** so rejeita webhooks recebidos (503) —
  nao afeta OAuth multi-conta, `githubRefreshToken`, `githubCodeSearch` ou
  nenhuma outra funcao backend existente.
- **Sem codigo morto/legado/paralelo** — os 3 ops sao o unico caminho vivo
  para gerenciar webhooks; nao existe implementacao alternativa em
  `src/sdk/connectors/github/` (SDK de referencia, nao runtime).

## 5. Cuidados tomados (criterios do usuario)

- **Aditivo apenas** — nada apagado. O plano de upgrades documenta cada um
  como PR separado e testavel isoladamente; esta sessao so fecha o Upgrade 3.
- **Validacao criptografica real** — Web Crypto (nao `crypto.createHmac` que
  nao existe no Deno sandbox). Comparacao constant-time previne timing attack
  na validacao de assinatura.
- **SLA do GitHub respeitado** — 200 mesmo em erro evita retransmissao
  infinita (GitHub reenvia ate 8x se receber != 2xx, poluindo o log).
- **Namespace por repo** — `conversationId: github:<repoFullName>` isola
  eventos de repos diferentes no SystemEvent, permitindo que o WatchEngine
  filtre por repo sem parse do payload.
- **Sem `set_secrets`** — usuario rejeitou configuracao automatica em sprint
  anterior; secret fica como passo manual explicito na doc.

## 6. Estado final do conector GitHub

TODOS os 6 upgrades do plano concluidos:

| Upgrade | Sprint | Status |
|---|---|---|
| 1. Escritas (issues/PRs/files) | anterior | CONCLUIDO |
| 2. Token Bucket por conta | anterior | CONCLUIDO |
| 3. Webhooks | **esta sessao** | **CONCLUIDO** |
| 4. Code Search proxy | anterior | CONCLUIDO |
| 5. Retry com backoff | anterior | CONCLUIDO |
| 6. Actions & Releases | anterior | CONCLUIDO |

Multi-conta OAuth ativa desde sprint anterior (@AndersonVitaease, 3 repos
confirmados via teste pratico nesta sessao). RuntimeContext registra GitHub
como conector ativo apos a operacao de listar repos rodar no chat.

## 7. NAO foi feito (fora do escopo)

- **Nenhum UI de "registrar webhook"** no /connections — o conector expoe a
  op `repos.createWebhook`, mas a UI de chat/Connections nao tem um botao
  especifico. O usuario registra via chat (pedindo pra IA chamar a op) ou
  direto no GitHub.
- **Nenhum Watch automatico por webhook** — o receptor persiste SystemEvent,
  mas nenhum Watch esta configurado para CONSUMIR esses eventos ainda
  (Watch Engine hoje e polling-based; integrar webhook→Watch seria um
  passo futuro, quando o usuario pedir "me avise quando abrir PR no repo X").
- **Nenhum teste de webhook real** — sem secret configurado, o receptor
  retorna 503; teste ponta-a-ponta exige configuracao manual do usuario.
- **Nenhuma mudanca no WatchEngine** (`src/lib/watch-engine/*`) — o webhook
  so enfileira SystemEvent; o scheduler/despacho existente nao foi tocado.

## 8. Proximo passo (opcional)

Quando o usuario quiser "me avise quando abrir PR no repo X", criar um Watch
com `provider: github` (via `ConnectorGateway`) que le `SystemEvent` do tipo
`github_webhook_pull_request` filtrando por `conversationId: github:<repo>`.
Isso liga o receptor (backend) ao WatchEngine (frontend) sem polling — o
ganho real do Upgrade 3. Aguarda demanda explicita.