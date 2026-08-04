# GITHUB CONNECTOR — Multi-conta OAuth + Plano de Upgrades

**Data:** 2026-08-04
**Status:** Multi-conta CONCLUÍDO · Upgrade 1 (Escritas) CONCLUÍDO · Upgrade 2 (Token Bucket) CONCLUÍDO · Upgrade 5 (Retry) CONCLUÍDO · Upgrade 6 (Actions/Releases) CONCLUÍDO · Upgrade 3/4 PROPOSTOS
**Escopo:** `src/lib/connector-runtime/connectors/GitHubConnector.ts`, `src/lib/github-auth/*`, `src/components/connections/GitHubWorkspaceSection.jsx`

---

## PARTE 1 — O que foi feito (multi-conta + acesso em lote)

### 1.1 Contexto e problema

O conector GitHub já suportava multi-conta via PAT legacy (`__GITHUB_TOKEN__`), mas
operava sempre na conta "ativa". Não havia fluxo OAuth App multi-conta nem acesso
paralelo a repos de contas diferentes.

### 1.2 Arquitetura adotada (aditiva, sem quebrar legado)

Seguindo o padrão já usado pelo Google (`GoogleAuthSession` / `GoogleMultiAccount`):

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| OAuth Init/Exchange/Revoke | `base44/functions/githubOAuth{Init,Exchange,Revoke}/entry.ts` | Backend Deno: gera authUrl, troca code por token, revoga |
| Token hydration (reload) | `base44/functions/githubRefreshToken/entry.ts` | Repõe token em memória após reload (GitHub não expira token) |
| Sessão (frontend) | `src/lib/github-auth/GitHubAuthSession.js` | Token em memória (Map por workspaceId), metadata em localStorage |
| Multi-conta (slots) | `src/lib/github-auth/GitHubMultiAccount.js` | Slots `__ghacct2`, `__ghacct3`... sobre a chave base |
| Conector | `src/lib/connector-runtime/connectors/GitHubConnector.ts` | `getToken()` prefere token da conta ativa, fallback PAT legacy |
| UI | `src/components/connections/GitHubWorkspaceSection.jsx` | Conectar/desconectar/reconectar, switcher de conta ativa, seletor de repos |

**Token nunca exposto ao frontend persistente:** access_token vive só em memória
(`_tokenStore` Map); localStorage guarda apenas metadata (login, avatar, scopes).
Após reload, `hydrateToken()` chama `githubRefreshToken` (que só lê do banco, não
refresh real) para repor o token em memória.

### 1.3 Funcionalidades entregues

1. **Conectar múltiplas contas GitHub** — cada uma num slot de workspace (`default`,
   `default__ghacct2`, ...). A primeira vira a ativa automaticamente.
2. **Switcher de conta ativa** — `setActiveGitHubWorkspaceId()` + evento
   `memoryos:gh-active-account-changed` que a UI escuta.
3. **Seletor de repos por conta** — `getSelectedRepos(workspaceId)` /
   `setSelectedRepos` em localStorage (chaveada por workspaceId).
4. **Acesso em lote — "Conta ativa"** — `runBatchAccess`: acessa em paralelo
   (concorrência 4) os repos selecionados da conta ativa, com o token dela.
5. **Acesso em lote — "Todas as contas"** — `runBatchAllAccounts`: varre os repos
   selecionados de **cada** conta conectada, cada um autenticado com o token da sua
   própria conta; resultados etiquetados com `@login` da conta de origem.
6. **Operação `repos.batch` no conector** — espelho server-side do lote: recebe
   `repos: ["owner/repo", ...]` + `operation` e executa a sub-operação em paralelo
   sobre cada repo (útil para pipelines cognitivos, não só UI).

### 1.4 Decisões registradas

- **`account_login` era vazio após exchange** — corrigido com retry (3x) no
  `githubOAuthExchange` porque o GitHub às vezes recusa a primeira chamada `/user`
  com "Request forbidden by administrative rules" (bloqueio transitório). Profile
  fetching tolerante a resposta não-JSON.
- **PAT legacy mantido como fallback** — `getToken()` tenta primeiro o token da
  conta ativa (OAuth); se ausente, cai pro `__GITHUB_TOKEN__` global. Nenhum fluxo
  legado quebrou.
- **Concorrência limitada a 4** — evita thundering herd e estouro de rate-limit
  quando muitas contas disparam juntas.

### 1.5 Known issues herdados (não resolvidos aqui)

- `x-ratelimit-remaining` é lido mas **não respeitado** — não há Token Bucket real
  (vide Upgrade 2).
- `/search/code` tem CORS restrito no browser — workaround atual usa `files.list`
  + filtro quando a query parece nome de arquivo; busca de conteúdo/símbolo
  genuína segue quebrada (vide Upgrade 4).
- `githubFetch` não retenta em 403/429 transitórios (vide Upgrade 5).

---

## PARTE 2 — Plano de upgrades (6 frentes)

### Princípios de segurança (iguais aos do MemoryOS)

- **Estritamente aditivo** — nada de reescrever o conector; cada upgrade adiciona
  um case no `switch` do `_dispatch` ou um módulo novo importado pelo conector.
- **Zero paralelo** — antes de criar um módulo, conferir se já existe um que faz
  quase o mesmo (lista de riscos abaixo). Se existir, estender em vez de duplicar.
- **Legado permanece vivo até o novo cobrir 100%** — PAT fallback, `GitHubAuthFlow`
  legacy, e o conector SDK de referência não são removidos sem validação.
- **Cada upgrade entrega e testa isoladamente** — nenhum upgrade depende de outro
  para compilar/funcionar. Ordem é só recomendação de impacto.

### Riscos de paralelo / legado a vigiar

| Risco | Onde | Ação |
|---|---|---|
| Dois `GitHubConnector` | `src/lib/connector-runtime/connectors/GitHubConnector.ts` (LIVE — usado pela UI/runtime) vs `src/sdk/connectors/github/GitHubConnector.ts` (SDK reference) | **Não tocar no SDK**. Todos os upgrades vão no connector-runtime. Documentar no header do SDK que ele é referência, não runtime. |
| PAT legacy | `src/lib/connection-manager/GitHubAuthFlow.ts` + `__GITHUB_TOKEN__` | Manter como fallback em `getToken()`. Upgrade 2 (Token Bucket) opera em cima do token resolvido, não importa a origem. |
| `repos.batch` (UI) vs `repos.batch` (conector) | Já unificados — a UI chama a API direto; o conector `repos.batch` serve pipelines cognitivos | Não duplicar; o Token Bucket (Upgrade 2) deve envolver ambos. |

---

### Upgrade 1 — Operações de escrita (irreversíveis via Safety Gate)

**Objetivo:** `files.commit`, `issues.create`, `pullRequests.comment`,
`branches.create`, `releases.create`.

**Como (não quebra):**
1. Adicionar os cases no `switch` do `_dispatch` — mesmo padrão das leituras.
2. Declarar reversibilidade no `metadata().capabilityReversibility`:
   ```ts
   capabilityReversibility: {
     "files.commit": "irreversible",
     "issues.create": "irreversible",
     "pullRequests.comment": "irreversible",
     "branches.create": "reversible",   // pode deletar branch
     "releases.create": "irreversible",
   }
   ```
3. **Não criar confirmação paralela.** O `SafetyGate.guard()` (ADR-015) já lê
   `capabilityReversibility` via Runtime e bloqueia `irreversible` sem
   `confirmedByUser`. Só falta o Runtime repassar o campo — conferir se já o faz;
   se não, essa é a única mudança fora do conector.
4. Escopos: o OAuth App já pede `repo` (escopo de escrita). PAT legacy com `repo`
   também serve. Validar escopo em runtime e retornar `DENIED` com mensagem clara
   se faltar.

**Entrega:** novos cases + mapa de reversibilidade. Zero mudança em leituras.

---

### Upgrade 2 — Token Bucket por conta (rate limiting real)

**Objetivo:** respeitar `x-ratelimit-remaining` e `x-ratelimit-reset` por conta;
evitar 403/429 quando 5 contas disparam em paralelo.

**Como (não quebra):**
1. Criar **módulo novo** `src/lib/connector-runtime/connectors/github/GitHubRateLimiter.ts`
   — não enxugar no conector. Token Bucket indexado por `workspaceId` (ou por token
   hash), lendo os headers de cada resposta.
2. O `githubFetch` (helper privado do conector) passa a consultar o limiter
   **antes** de disparar: se `remaining <= 0`, espera até `reset` (com teto de
   segurança, ex. 60s) ou retorna `DENIED` com `retryAt`.
3. `_updateRateLimit` já existe e alimenta `internalMetrics` — estender para
   também alimentar o limiter (mesma fonte, sem duplicar leitura de header).
4. O `repos.batch` e a UI `runBatchAllAccounts` passam pelo mesmo `githubFetch`
   → ganham o limite automaticamente, sem mudança nesses callers.
5. Concorrência padrão (4 hoje) vira configurável e diminui se `remaining` estiver
   baixo.

**Risco paralelo:** existe `src/lib/ucr/UCRRateLimiter.ts` (genérico do UCR).
**Não reusar** — ele é por-connector, não por-conta. O GitHub precisa de
limiter por conta (token). Documentar a diferença no header do módulo novo.

**Entrega:** módulo novo + 2 pontos de integração no conector (`githubFetch`
pré-check e `_updateRateLimit` pós-update). Nenhuma capability nova.

---

### Upgrade 3 — Trigger por webhook (GitHub → Watch automático)

**Objetivo:** "quando abrir PR no repo X, notifica" sem polling.

**Como (não quebra):**
1. Base44 suporta `connector` trigger em workflows (vide
   `get_capability_guide("workflows")`). GitHub é um connector suportado.
2. **Autorizar o connector GitHub** via `request_oauth_authorization` (shared mode,
   escopos mínimos: `repo` + `read:org` — já temos) **ou** registrar um
   `OrganizationConnector` BYO-shared (se a workspace quiser o próprio OAuth app).
3. Criar workflow `base44/workflows/GitHubWebhookRouter.jsonc` com `connector`
   trigger filtrando evento `pull_request` / `push` / `issues`, roteando para um
   `invoke_backend_function` que cria um `PendingWatchAction` ou dispara
   notificação.
4. **Não mexer no WatchEngine existente** (`src/lib/watch-engine/*`) — o webhook
   só enfileira `PendingWatchAction`, e o WatchOutbox/scheduler que já existe
   despacha. Reuso total.
5. UI: adicionar na aba de Watch uma origem "GitHub webhook" ao lado de "polling".

**Risco paralelo:** hoje Watches são só polling. O webhook é **complementar**,
não substitui. Manter ambos; o usuário escolhe a origem ao criar o Watch.

**Entrega:** workflow novo + autorização do connector. Zero mudança no WatchEngine.

---

### Upgrade 4 — Busca de código via proxy server-side (desbloqueia CORS)

**Objetivo:** `search.symbol` / `search.text` reais (hoje quebrados no browser).

**Como (não quebra):**
1. Criar **backend function** `base44/functions/githubCodeSearch/entry.ts` que
   chama `https://api.github.com/search/code` server-side (sem CORS). Recebe
   `{ query, owner, repo, workspaceId }`, resolve o token da conta ativa
   (mesmo padrão do `githubRefreshToken`), repassa.
2. No conector, o case `search.*` (quando não for nome-de-arquivo) passa a chamar
   essa function via `base44.functions.invoke('githubCodeSearch', ...)` em vez de
   `githubFetch` direto. O path de "parece nome de arquivo" (CORS-safe,
   `files.list`) permanece como está — é o fallback rápido.
3. **Não remover** o workaround atual; ele continua valendo para nomes de
   arquivo. O proxy só ativa para queries de conteúdo/símbolo genuínas.

**Risco paralelo:** existe `src/lib/search-engine/GitHubSearchProvider.ts`.
Conferir se ele já usa proxy ou chamada direta; se direta, rotear pelo mesmo
`githubCodeSearch` para ter fonte única de busca server-side.

**Entrega:** 1 function nova + 1 case ajustado. Workaround de nome-de-arquivo
intacto.

---

### Upgrade 5 — Retry com backoff exponencial

**Objetivo:** tolerar 403/429/5xx transitórios.

**Como (não quebra):**
1. Envolver o `githubFetch` (helper privado) num wrapper de retry — **não** criar
   um segundo fetch. O wrapper respeita `Retry-After` (GitHub envia em 429/403 de
   rate-limit) e backoff exponencial para 5xx (cap 3 tentativas, teto 8s).
2. Timeout por tentativa permanece `DEFAULT_TIMEOUT_MS`; o abort atual já existe.
3. Integra naturalmente com o Token Bucket (Upgrade 2): se o limiter disser
   "espere N segundos", o retry usa esse N em vez do backoff cego.
4. Métrica: `internalMetrics.retries` já existe — incrementar por retry.

**Entrega:** wrapper em volta de `githubFetch`. Zero capability nova.

---

### Upgrade 6 — GitHub Actions & Releases

**Objetivo:** `actions.listRuns`, `actions.trigger (workflow_dispatch)`,
`releases.list`, `releases.get`.

**Como (não quebra):**
1. Novos cases no `switch` do `_dispatch`, mesmo padrão.
2. `actions.trigger` (dispatch de workflow) é **irreversível** → entra no mapa
   `capabilityReversibility` (Upgrade 1). `actions.listRuns` / `releases.list` /
   `releases.get` são leitura (`safe`).
3. Escopos: `actions:read` (Fine-Grained PAT) ou `repo` (OAuth App clássico — já
   temos). Para *dispachar* workflows, o OAuth App clássico com `repo` basta.
4. Sem paralelo: conferir se `src/sdk/connectors/github/GitHubConnector.ts`
   (referência) já tem esses ops; se sim, **portar** do SDK pro runtime (não
   duplicar nem inverter a direção de verdade).

**Entrega:** novos cases. Depende de Upgrade 1 só para `actions.trigger`.

---

### Ordem recomendada (impacto / independência)

1. **Upgrade 2 (Token Bucket)** — base de estabilidade para multi-conta; todos os
   outros se beneficiam. Sem dependência.
2. **Upgrade 5 (Retry)** — combina com o Token Bucket; mesmo ponto de integração
   (`githubFetch`).
3. **Upgrade 1 (Escritas)** — desbloqueia automação; só metadata + cases.
4. **Upgrade 6 (Actions/Releases)** — estende 1.
5. **Upgrade 4 (Code Search proxy)** — independente, menor.
6. **Upgrade 3 (Webhook)** — maior superfície (workflow + autorização de
   connector); por último.

Cada um é um PR separado, testável isoladamente, sem deixar o app quebrar entre
um e outro.

---

## Anexo — Verificação anti-regressão (rodar antes/depois de cada upgrade)

- Conectar 1 conta → `repos.list` retorna (leitura legado intacta).
- Conectar 2ª conta → switcher muda ativa; `repos.list` da 2ª.
- Selecionar repos em ambas → "Todas as contas" retorna agregado etiquetado.
- Recarregar página → `hydrateAll` repõe tokens; nada reconecta.
- PAT legacy (`__GITHUB_TOKEN__`) sem OAuth conectado → ainda funciona (fallback).
- `health()` e `validateAsync()` → sem regressão nos 6 checks.