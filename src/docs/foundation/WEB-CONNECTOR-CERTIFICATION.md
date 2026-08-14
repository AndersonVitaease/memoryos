# OFFICIAL WEB CONNECTOR — ENGINEERING CERTIFICATION

**Versão:** 1.0
**Status:** CERTIFICADO (rotas principais) / NÃO CERTIFICADO (produção em escala)
**Data:** 2026-08-14
**Escopo:** Web Connector pós-Fase B9 (Discovery → Auth Probe → Candidate → Compiler → Selector → Adapter → Validation → Governance → CapabilityMap → Runtime → 2ª Execução)

---

> **PRINCÍPIO DE CERTIFICAÇÃO:** Este documento descreve estritamente o que está
> comprovado pelo código-fonte atual e pelos testes B1–B9 executados. Tudo que
> não possui evidência direta é marcado **NÃO COMPROVADO** ou **LIMITAÇÃO CONHECIDA**.
> Nenhuma funcionalidade é inferida. Nenhum código foi alterado para produzir
> esta certificação.

---

## 1. Scope

O **Web Connector** é o subsistema do MemoryOS que descobre, valida, promove e
executa capabilities de sites web arbitrários — públicos ou autenticados — usando
dois executores: **Maxun Cloud** (scrape público) e **Playwright** (form-fill e
páginas autenticadas via WebSession com cookies).

Esta certificação cobre o ciclo de vida **pós-descoberta**:

```
Discovery → Auth Probe → CapabilityCandidate → AutomationCompiler
→ ExecutorSelector → ExecutorAdapter → Validation
→ Governance (admin) → CapabilityMap (persistência)
→ Runtime (ler automation persistida) → 2ª Execução (rota persistida) → PASS
```

**Fora do escopo desta certificação (NÃO CERTIFICADO aqui):**
- Descoberta em larga escala em sites arbitrários além dos fixtures de teste.
- Path da Extensão Chrome end-to-end (coberto parcialmente por B8, não por B9).
- Escala/concorrência de produção (limite de 1 browser Playwright compartilhado).
- Telemetria/observabilidade de execuções de produção.

---

## 2. Architecture (Diagrama Textual Final)

```
                    ┌─────────────────────────────────────────────┐
                    │  webConnectorDiscover / webConnectorExtension │
                    │  (Discovery: BFS + LLM + snapshot refs)       │
                    └───────────────────────┬─────────────────────┘
                                            │
                            ┌───────────────▼───────────────┐
                            │  Auth Probe (B4)              │
                            │  probeAuthenticationRequirement│
                            │  → public | session_required | unknown
                            └───────────────┬───────────────┘
                                            │
                            ┌───────────────▼───────────────┐
                            │  CapabilityCandidate (entidade)│
                            │  evidence[] com auth_requirement
                            └───────────────┬───────────────┘
                                            │
                  ┌─────────────────────────▼─────────────────────────┐
                  │  AutomationCompiler (automationCompiler.ts)        │
                  │  WRITE → write_blocked | READ → spec                │
                  │  Decide executor + webSessionRequired + targetUrl  │
                  └─────────────────────────┬─────────────────────────┘
                                            │
                            ┌───────────────▼───────────────┐
                            │  ExecutorSelector              │
                            │  (único ponto de decisão)      │
                            └──────┬──────────┬──────────┬───┘
                                   │          │          │
                    ┌──────────────▼──┐ ┌──────▼──────┐ ┌─▼────────────────┐
                    │ Maxun Adapter   │ │ Playwright │ │ Playwright       │
                    │ (robotId/       │ │ Public     │ │ Authenticated    │
                    │  targetUrl)     │ │ (no WS)    │ │ (WebSession+cookies)│
                    └──────────────┬──┘ └──────┬──────┘ └─┬────────────────┘
                                   │          │          │
                            ┌──────▼──────────▼──────────▼──────┐
                            │  capabilityValidator (validateSpec) │
                            │  detectAuthWall (B2) → PASS/FAIL/INCONCLUSIVE
                            └───────────────┬────────────────────┘
                                            │ (somente PASS)
                            ┌───────────────▼───────────────┐
                            │  capabilityGovernance (admin)  │
                            │  validateWithExecution → promove│
                            └───────────────┬───────────────┘
                                            │
                            ┌───────────────▼───────────────┐
                            │  CapabilityMap (persistência)  │
                            │  cap.automation = {executor,   │
                            │   robotId, targetUrl, wsReq...} │
                            └───────────────┬───────────────┘
                                            │
                            ┌───────────────▼───────────────┐
                            │  Runtime (ler automation       │
                            │  persistida) → selectExecutor  │
                            └───────────────┬───────────────┘
                                            │
                            ┌───────────────▼───────────────┐
                            │  2ª Execução (rota persistida) │
                            │  → PASS                        │
                            └───────────────────────────────┘
```

**Três rotas oficiais (comprovadas):**
1. **PUBLIC READ → Maxun** (robotId reuse / targetUrl duplicate)
2. **PUBLIC FORM → Playwright** (webSessionRequired=false, sem cookies)
3. **AUTHENTICATED → Playwright + WebSession** (cookies injetados)

---

## 3. Discovery

**Arquivos:** `base44/functions/webConnectorDiscover/entry.ts`, `base44/shared/webDiscovery.ts`

- Crawling BFS guiado por LLM sobre o snapshot de acessibilidade do Playwright.
- `buildDiscoveryPrompt()` instrui o LLM a catalogar READ/WRITE com `element_ref`
  real do snapshot (proibido inventar refs — regra inegociável #3).
- `saveDiscoveryCandidates()` resolve o `element_ref` deterministicamente via
  `resolveElementFromSnapshot()`, computa `identity_hash` (conservador — só
  consolida se hash bater exatamente), e persiste `CapabilityCandidate` com
  `evidence[]` estruturada + `capability_type` + `risk_level`.
- **Read-only por design:** o motor de descoberta NUNCA clica/submete/preenche.

**Comprovado por:** `discoveryStep2Tests` (27 testes) — regressão B9/test8.

---

## 4. Authentication Probe (B4)

**Arquivo:** `base44/shared/webDiscovery.ts` — `probeAuthenticationRequirement`, `classifyAuthenticationRequirement`

Probe **determinístico** (sem LLM, sem cookies, sem WebSession) sobre a
necessidade de autenticação de uma URL:

| Resultado | Condição (classificação) |
|-----------|--------------------------|
| `session_required` | `finalUrl` em rota `/login`, `/signin`, `/sign-in`, `/account/login`, `/auth` (segmento final) **OU** snapshot com campo de senha + marcador de login |
| `public` | probe carregou sem sinais de auth-wall |
| `unknown` | erro, timeout, `finalUrl` vazia/about:blank, ou CAPTCHA/anti-bot |

- Não casa `/login-history`, `/author`, `/authenticate` (evita falso-positivo).
- Não transforma mera presença da palavra "login" em `session_required` — exige
  campo de senha **junto** a marcador, ou `finalUrl` claramente em rota de auth.

`deriveAuthenticationRequirement(evidences[])` reduz o array de evidências a um
único requisito — **conservador**: qualquer `session_required` → session_required;
senão qualquer `unknown` → unknown (não assume público); senão `public`.

**Comprovado por:** `discoveryStep3Tests` (41 testes, incl. routing por auth) +
probe real executado em test1/test2/test3/test4/test7 (B9).

---

## 5. Compiler

**Arquivo:** `base44/shared/automationCompiler.ts` — `compileCandidateToSpec`

Transforma `CapabilityCandidate` em `AutomationSpec` (determinístico, sem browser/Maxun/CapabilityMap):

| Caso | Condição | Resultado |
|------|----------|-----------|
| WRITE | `capability_type === 'WRITE'` | `COMPILATION_FAILED { reason: 'write_blocked' }` |
| Sem `discovered_from_url` | — | `COMPILATION_FAILED { reason: 'missing_entry_url' }` |
| READ + inputs + sem evidence confiável | — | `COMPILATION_FAILED { reason: 'no_reliable_evidence' }` |
| robotId pré-existente (maxunImport) | `associatedRobot` presente | `executor: 'maxun'`, reusa robotId, `wsReq: false` |
| public + READ + inputs=[] (Maxun-creatable) | `isMaxunCreatable()` true | `executor: 'maxun'`, `targetUrl: entryUrl`, `wsReq: false` |
| public + inputs>0 | auth probe = public | `executor: 'playwright'`, `wsReq: false` |
| session_required OU unknown | auth probe conservador | `executor: 'playwright'`, `wsReq: true` |

- `webSessionRequired` é decidido por `deriveAuthenticationRequirement(evidence)`,
  **nunca** por `web_session_id` (que é apenas proveniência da descoberta).
- `expectedResult`: READ com inputs → `{kind:'links', minItems:1}`; READ scrape
  puro → `{kind:'snapshot'}`.

**Comprovado por:** `discoveryStep3Tests` (41 testes) + test5 (WRITE block, B9).

---

## 6. Executor Selection

**Arquivo:** `base44/shared/executorSelector.ts` — `selectExecutor`

Ponto **único** de decisão (fonte de verdade = `spec.executor` setado pelo Compiler):

| spec | Resultado |
|------|-----------|
| `capabilityType === 'WRITE'` | `{ executor: null, reason: 'write_blocked' }` |
| `executor: 'playwright'` + `webSessionRequired: true` | `playwright` (`playwright_websession_required`) |
| `executor: 'playwright'` + `webSessionRequired: false` (B5) | `playwright` (`playwright_public`) |
| `executor: 'maxun'` + robotId | `maxun` (`maxun_existing_robot`) |
| `executor: 'maxun'` + targetUrl (sem robotId) | `maxun` (`maxun_auto_create`) |
| `executor: 'maxun'` sem robotId nem targetUrl | `{ executor: null, reason: 'maxun_no_robot_and_no_target' }` |

**Comprovado por:** test5 (WRITE block no selector) + 2ª execução de test1
(`maxun_existing_robot`), test2 (`playwright_public`), test3 (`playwright_websession_required`).

---

## 7. Maxun Adapter

**Arquivo:** `base44/shared/maxunAdapter.ts`

Dois estados:
1. **robotId pré-existente** → `maxunRun.execute(robotId)` (reutilização).
2. **robotId ausente + Maxun-creatable** → `maxunRun { targetUrl }` (duplicate +
   execute). Captura `duplicatedRobotId` e devolve em `robotIdUsed` para persistência.

**Segurança (por design):**
- `validate()`: rejeita se `webSessionRequired === true`
  (`websession_required_incompatible_with_maxun`).
- **NUNCA** envia cookies/WebSession ao Maxun Cloud.
- Não toca em `MAXUN_API_KEY` (vive em `maxunRun`).

`robotIdUsed = spec.robotId || d.duplicatedRobotId` — habilita a reutilização na
2ª execução via robotId persistido.

**Comprovado por:** test1 (1ª exec PASS, robotId criado → promoção → 2ª exec PASS
reusando `maxun_existing_robot`), test7 (regressão Maxun direta, PASS).

**LIMITAÇÃO (Maxun Cloud):** `duplicate+execute` concorrente no mesmo targetUrl
pode retornar 502 transitório (observado em test1 vs test7 em paralelo).
Resolvido executando sequencialmente. Robots criados no Maxun Cloud não são
deletados pela nossa integração (resíduo de teste — sem endpoint de delete usado).

---

## 8. Playwright Public Adapter (B5)

**Arquivo:** `base44/shared/playwrightAdapter.ts` + `webConnectorConnect` (`operation: 'executeCapability'`, `webSessionRequired: false`)

- `playwrightAdapter.execute()` monta payload `{ operation:'executeCapability',
  webSessionRequired: spec.webSessionRequired, ... }` e delega a
  `webConnectorConnect` (mesmo contrato do Planner e do WebConnector runtime).
- Em `webConnectorConnect`, `webSessionRequired === false` (B5) relaxa o gate de
  sessão/cookies: executa **sem WebSession**, **sem cookies**, caminho `playwright_public`.
- Executa form-fill heurístico (localiza form por score de campos, write-guard
  antes do submit, submit in-DOM, scroll progressivo para lazy-load, extrai links).

**Comprovado por:** test2 — Public FORM wikipedia, `noWebSessionUsed: true`,
`filledCount: 1`, `linksCount: 30`, `finalUrl: /wiki/Albert_Einstein`, PASS →
promoção → 2ª exec PASS (`playwright_public`).

---

## 9. Playwright Authenticated Adapter

**Arquivo:** `base44/shared/playwrightAdapter.ts` + `webConnectorConnect` (`webSessionRequired: true`)

- `playwrightAdapter` exige `ctx.webSessionId` quando `webSessionRequired: true`
  (senão retorna erro `webSessionRequired mas ctx.webSessionId ausente`).
- `webConnectorConnect.executeCapability` carrega a `WebSession`, injeta cookies
  via `page.context().addCookies()`, navega para `discoveredFromUrl`, executa
  page-read (sem inputs) ou form-fill (com inputs), com:
  - **B6 early auth-wall check**: se `page.url()` cai em `/login` logo após goto →
    `session_expired` (fail-fast, evita consumir timeout MCP em redirects lentos).
  - **Warm-up** (3s + networkidle): só para autenticado (renova access token em SPAs).
  - **Write guard** no DOM: botões de escrita (Salvar/Excluir/Editar/...) → aborta.

**Comprovado por:** test3 — Auth READ the-internet `/secure`, WebSession ativa
(loginVerified=true), `snapshotTextLen: 862`, `finalUrl: /secure`, conteúdo
verificado contém `Secure Area`, `Welcome to the Secure Area`, `Logout` → PASS
→ promoção → 2ª exec PASS (`playwright_websession_required`).

**Pré-requisito de infra (NÃO COMPROVADO em B9):** `MCPServerConfig` com name
`'playwright-web-connector'` (porta 8932 na VPS) deve existir. B9 assumiu configurado.

---

## 10. Validation

**Arquivo:** `base44/shared/capabilityValidator.ts` — `validateSpec`, `detectAuthWall`

`ValidationResult.status`:

| Status | Condição |
|--------|----------|
| `pass` | execução sem erro **E** `expectedResult` satisfeito (links≥min OU snapshot não-vazio OU extracted não-vazio) |
| `fail` | erro explícito do executor (session_expired, form_not_found, write_guard, no_field_filled, maxun falhou) **OU** auth-wall detectado (B2) |
| `inconclusive` | executou sem erro mas `expectedResult` não satisfeito |

**Ordem de gates em `validateSpec`:**
1. `selectExecutor` → sem executor = FAIL.
2. `adapter.validate()` (pre-check estático) → falha = FAIL.
3. `adapter.execute()` → exceção = FAIL (`adapter_threw`).
4. `!result.ok` → FAIL (erro explícito).
5. Auth-wall heurístico (finalUrl `/login` ou snapshot login+senha) → FAIL.
6. **B2** `detectAuthWall(spec, result)` — **só para `webSessionRequired: true`**:
   finalUrl em rota de login OU (marcador de login + campo de senha) → FAIL.
   Capabilities públicas (Maxun, wsReq=false) **não** filtradas aqui.
7. `checkExpectedResult` → satisfeito = PASS, senão INCONCLUSIVE.

**Comprovado por:** test4 (auth-wall → FAIL), test7 (Maxun PASS), test2/test3 (PASS),
`discoveryStep3Tests` (41 testes de validation routing).

---

## 11. Governance / Promotion

**Arquivo:** `base44/functions/capabilityGovernance/entry.ts` — `validateWithExecution`

**Admin-only** (`user.role !== 'admin'` → 403). Defesa em profundidade a nível de
aplicação + RLS nativa (`CapabilityMap` create/update/delete = admin-only).

Fluxo `validateWithExecution`:
1. Resolve robot associado pré-existente no `CapabilityMap` (provider=maxun+robotId).
2. `compileCandidateToSpec` → se `!ok`, marca candidate `rejected` e retorna 422.
3. `validateSpec` (execução controlada) — `ctx.base44` injetado nos adapters.
4. **Somente `pass` promove.** `fail` → `rejected`; `inconclusive` → volta a `candidate`.
5. Persiste no `CapabilityMap` um `capObj` com `automation` + campos legados
   (`provider`/`robotId`/`flow` para compatibilidade com `WebSiteIntentResolver`
   e branch early do `webConnectorConnect`).

`automation` persistida:
```json
{
  "executor": "maxun" | "playwright",
  "webSessionRequired": boolean,
  "specVersion": 1,
  "actions": WhereWhatPair[] | null,
  "robotId": string | null,
  "targetUrl": string | null,
  "riskLevel": "safe" | "reversible" | "irreversible",
  "capabilityType": "READ"
}
```

`robotIdToPersist = validation.robotIdUsed || spec.robotId || null` — para Maxun
auto-create, persiste o robotId criado pelo duplicate (habilita reutilização).

**Comprovado por:** test1/test2/test3 — `promotion.persisted: true`,
`automation` presente, `robotId` persistido (Maxun).

---

## 12. CapabilityMap

**Entidade:** `base44/entities/CapabilityMap.jsonc` — `capabilities` (JSON array)

- Chave natural: `site_url` (um mapa por site, compartilhado entre usuários).
- `read: {}` (globalmente legível); `create/update/delete: { user_condition: { role: 'admin' } }`.
- Cada cap: `{ id, description, inputSchema, discoveredFrom, automation, provider?, robotId?, flow? }`.
- `version` incrementa a cada add/update; `last_validated_at` atualizado.

**Comprovado por:** test1/test2/test3 — leitura da automation persistida na 2ª
execução (`specFromPersisted`), sem resíduos após cleanup (0 caps B9).

---

## 13. Runtime (ler automation persistida)

**Arquivo:** `base44/functions/b9E2ETest/entry.ts` — `specFromPersisted` (simula o Runtime)

O Runtime reconstrói a `AutomationSpec` **a partir do persistido** (não do
candidate original):
- `executor`, `webSessionRequired`, `robotId`, `targetUrl`, `actions` de `capObj.automation`.
- `inputs` de `capObj.inputSchema.properties`.
- `entryUrl` de `capObj.discoveredFrom`.

Aplica `selectExecutor(spec2)` sobre o persistido e chama `validateSpec` → 2ª execução.

> **Nota:** `specFromPersisted` vive no teste B9, que **simula** o caminho real do
> Runtime. O Runtime de produção (`src/lib/connector-runtime/...`) lê o mesmo
> contrato persistido. **NÃO COMPROVADO** que o Runtime de produção chama
> `selectExecutor`+`validateSpec` exatamente como B9 simula — apenas o contrato de
> persistência e a viabilidade da 2ª execução estão comprovados.

---

## 14. Persistence & 2ª Execução (Prova B9)

**Critério B9:** para cada uma das 3 rotas, provar
`1ª exec → PASS → promotion → CapabilityMap → 2ª exec (rota persistida) → PASS`.

### Rota 1 — PUBLIC READ → Maxun (example.com)
| Etapa | Evidência |
|-------|-----------|
| Probe | `authReq: public`, status 200 |
| 1ª exec (governance) | `status: validated`, `executor: maxun`, `robotId: c27f99bc-...`, `targetUrl: https://example.com`, `snapshotTextLen: 643` |
| Promotion | `persisted: true`, `automation.executor: maxun`, `robotId: c27f99bc-...`, `provider: maxun` |
| 2ª exec spec (persistida) | `executor: maxun`, `robotId: c27f99bc-...`, `targetUrl: https://example.com` |
| 2ª exec selector | `executor: maxun`, `reason: maxun_existing_robot` ← **reutilizou o robotId persistido** |
| 2ª exec | `status: pass`, `robotIdUsed: c27f99bc-...` (mesmo robotId), `snapshotTextLen: 639` |
| **PASS** | ✓ |

### Rota 2 — PUBLIC FORM → Playwright (wikipedia, sem WebSession)
| Etapa | Evidência |
|-------|-----------|
| Probe | `authReq: public`, status 200 |
| 1ª exec (governance) | `status: validated`, `executor: playwright`, `filledCount: 1`, `linksCount: 30`, `finalUrl: /wiki/Albert_Einstein`, `snapshotTextLen: 12000` |
| Promotion | `persisted: true`, `automation.executor: playwright`, `webSessionRequired: false` |
| 2ª exec spec (persistida) | `executor: playwright`, `webSessionRequired: false`, `inputs: [search]` |
| 2ª exec selector | `executor: playwright`, `reason: playwright_public` |
| 2ª exec | `status: pass`, `filledCount: 1`, `linksCount: 30`, `finalUrl: /wiki/Albert_Einstein` |
| `noWebSessionUsed` | `true` |
| **PASS** | ✓ |

### Rota 3 — AUTHENTICATED READ → Playwright + WebSession (the-internet /secure)
| Etapa | Evidência |
|-------|-----------|
| WebSession | `loginVerified: true`, `status: active` (tomsmith/SuperSecretPassword!) |
| Probe | `authReq: session_required`, status 200 |
| 1ª exec (governance) | `status: validated`, `executor: playwright`, `snapshotTextLen: 862`, `finalUrl: /secure` |
| Promotion | `persisted: true`, `automation.executor: playwright`, `webSessionRequired: true` |
| 2ª exec spec (persistida) | `executor: playwright`, `webSessionRequired: true`, `inputs: []` |
| 2ª exec selector | `executor: playwright`, `reason: playwright_websession_required` |
| 2ª exec | `status: pass`, `snapshotTextLen: 862`, `finalUrl: /secure` |
| Conteúdo real | `Secure Area` ✓, `Welcome to the Secure Area` ✓, `Logout` ✓ |
| **PASS** | ✓ |

**Cleanup:** 0 CapabilityCandidates B9, 0 capabilities B9 em CapabilityMap,
0 WebSessions B9 após testes (verificado).

---

## 15. Multi-Workspace Isolation (B8)

**Arquivo:** `base44/shared/webSessionWorkspace.ts` + guards em
`webConnectorConnect` (login/confirm/use/executeCapability/revoke) e
`webConnectorExtension` (pollTasks/completeTask).

**Modelo:**
- Workspace ativo resolvido **server-side** (`User.active_workspace_id`) — nunca
  confia em valor do cliente.
- `assertSessionWorkspace(sessionWsId, activeWsId)`:
  - `sessionWsId` null/vazio (headless legada) → permitida.
  - `sessionWsId === activeWsId` → permitida.
  - `sessionWsId` setado e ≠ ativo → **REJEITADA** (`session_wrong_workspace`).
- `credentialMatchesWorkspace`: tokens legados (workspace_id não-real) aceitos
  sem backfill; tokens em outro workspace real do usuário → rejeitados.
- `serializeByBrowserSession`: no máximo **1 tarefa por `browser_session_id`**
  por ciclo de poll (evita corrupção de estado da aba).
- `pollTasks`: claim **atômico** via `updateMany` condicional
  (`status: pending → in_progress`, `claimed_by: bridge_id`, `claimed_at`) —
  chamadas concorrentes não claimam a mesma tarefa.

**Resultados comprovados (test6, B9):**
| Cenário | Resultado |
|---------|----------|
| A usando sua própria sessão | Permitido (não-403-workspace; 502 Playwright downstream, `wsRejected: false`) |
| A → sessão de B | 403 `WebSession pertence a outro workspace`, `rejected: true` |
| B → sessão de A | 403 `WebSession pertence a outro workspace`, `rejected: true` |

**Resultados comprovados (`b8WorkspaceIsolationTest`, 14 testes):**
- pollTasks A não recebe tarefas de B; pollTasks B não recebe de A.
- Claim concorrente → somente um vencedor (atomicidade via `updateMany` condicional).
- Tokens legados compatíveis sem backfill.

**Comprovado por:** test6 + `b8WorkspaceIsolationTest` (14/14) + `webBridgeRelinkTests` (9/9).

---

## 16. Security

### Matriz de Segurança

| Cenário | Resultado | Evidência |
|---------|-----------|-----------|
| WRITE candidate | `write_blocked` no Compiler e no Selector; não executa | test5 |
| Public cap em `/login` (auth-wall) | `session_expired` (B6) → FAIL → não promove | test4 |
| Cross-workspace WebSession (A→B, B→A) | 403 rejeitado | test6 + b8 (14) |
| WebSession errada (status não-active) | 409 `WebSession is not active` | `webConnectorConnect` guards |
| Credencial OAuth de outro workspace real | rejeitada (`credential_wrong_workspace`) | `credentialMatchesWorkspace` |
| Tarefa de outro workspace (pollTasks) | não entregue (filtra por bridge+sessão do workspace) | b8 testes |
| Claim concorrente de tarefa | somente um vencedor (`updateMany` condicional) | b8 |
| Maxun público (cookies/WebSession) | NUNCA enviado ao Maxun Cloud | `maxunAdapter.validate` |
| Playwright público | sem WebSession, sem cookies (`webSessionRequired: false`) | test2 |
| Playwright autenticado | cookies injetados, warm-up, write-guard no DOM | test3 |
| Governance (validate/promote) | admin-only (app + RLS) | `capabilityGovernance` |
| Credenciais (email/password) | só em memória durante `login`; nunca persistidas | ADR-019, `webConnectorConnect` |

### Anti-Falso-Pass (B2/B6)

**B6 (early auth-wall, `webConnectorConnect`):** após `goto(waitUntil:"load")`,
se `page.url()` cai em `/login` → `session_expired` imediato (fail-fast). Recheck
após networkidle/warm-up para SPAs que redirecionam via JS.

**B2 (`detectAuthWall` no Validator):** **só para `webSessionRequired: true`**:
- `finalUrl` em rota de login (`/login`, `/signin`, `/sign-in`, `/auth`, `/account/login`) → bloqueado.
- Snapshot com marcador de login (`login page`, `log in`, `sign in`, `enter your password`, ...) **E** campo de senha → bloqueado.
- Capabilities **públicas** (Maxun, wsReq=false) **não** filtradas (preserva fluxo Maxun público aprovado).

**Quando a validação:**
- **PASS:** execução sem erro + `expectedResult` satisfeito + (se autenticada) não caiu em auth-wall.
- **FAIL:** erro explícito do executor, auth-wall detectado (B2/B6), write-guard, ou adapter rejeitou.
- **INCONCLUSIVE:** executou sem erro mas `expectedResult` não satisfeito (ex: snapshot vazio sem auth-wall).

---

## 17. Failure Modes (Rotas Bloqueadas)

| Rota bloqueada | Comportamento | Onde |
|----------------|---------------|------|
| **WRITE** | `COMPILATION_FAILED { reason: 'write_blocked' }` (Compiler); `{ executor: null, reason: 'write_blocked' }` (Selector). Não executa automaticamente. Governança manual permanece. | `automationCompiler`, `executorSelector`, test5 |
| **Public que redireciona para `/login`** | `session_expired` (B6 early check) → `fail` → **não promove** | `webConnectorConnect`, `capabilityValidator`, test4 |
| **UNKNOWN authentication** | Comportamento **conservador**: Compiler ruteia para `playwright` + `webSessionRequired: true` (CASE 3/4). **NUNCA** vai para Maxun (não assume público). | `automationCompiler` |

> **NÃO COMPROVADO por E2E:** o caso `unknown` é coberto pela lógica unitária em
> `discoveryStep3Tests`, mas nenhum teste B9 executa E2E um candidate `unknown`
> de ponta a ponta. Comportamento documentado pelo código, não por execução B9.

---

## 18. Test Certification

### Suites de regressão (executadas em B9/test8)
| Suite | Total | Resultado |
|-------|-------|-----------|
| `discoveryStep2Tests` | 27 | allPassed ✓ |
| `discoveryStep3Tests` | 41 | allPassed ✓ |
| `webBridgeRelinkTests` | 9 | allPassed ✓ |
| `b8WorkspaceIsolationTest` | 14 | allPassed ✓ |
| **Total** | **91** | **100% verdes** |

### Testes E2E B9 (`b9E2ETest`)
| Teste | Rota | 1ª exec | Promoção | 2ª exec | Status |
|-------|------|---------|----------|---------|--------|
| test1 | Public READ → Maxun | PASS | ✓ robotId persistido | PASS (`maxun_existing_robot`) | ✅ |
| test2 | Public FORM → Playwright | PASS | ✓ wsReq=false | PASS (`playwright_public`) | ✅ |
| test3 | Auth READ → Playwright+WS | PASS | ✓ wsReq=true | PASS (`playwright_websession_required`) | ✅ |
| test4 | Auth-wall /login | FAIL (`session_expired`) | ✗ não promovido | — | ✅ |
| test5 | WRITE block | `write_blocked` | — | — | ✅ |
| test6 | Multi-workspace | A→própria ok; A→B e B→A 403 | — | — | ✅ |
| test7 | Regressão Maxun | PASS | — | — | ✅ |
| test8 | 4 suites regressão | 91/91 | — | — | ✅ |

---

## 19. Limitations

### Limitação arquitetural
- **Single Playwright browser compartilhado:** o MCP mantém 1 browser por processo
  — só um bootstrap de login por vez em todo o sistema. `callMcpWithRetry`
  auto-recupera de "Browser is already in use" com `browser_close` + retry.
  Escala exige mais instâncias `MCPServerConfig` (RFC-014 Fase 2).
- **Runtime de produção vs simulação B9:** `specFromPersisted` (em `b9E2ETest`)
  simula o Runtime. O contrato de persistência está comprovado; a integração
  exata do Runtime de produção chamando `selectExecutor`+`validateSpec` **NÃO
  COMPROVADA** em B9.
- **UNKNOWN sem E2E:** coberto só por testes unitários, não por execução B9.

### Limitação do Maxun Cloud
- `duplicate+execute` concorrente no mesmo targetUrl → 502 transitório (resolvido
  sequencialmente).
- Robots criados no Maxun Cloud não são deletados pela nossa integração (resíduo
  de teste; sem endpoint de delete usado).
- `originUrl`/`inputParameters` ignorados no contrato de execução do Maxun Cloud →
  `duplicate-then-run` é o único caminho suportado para targetUrl dinâmico.

### Limitação de infraestrutura
- `MCPServerConfig` `'playwright-web-connector'` (porta 8932 VPS) é pré-requisito.
  B9 assumiu configurado; **não validado** como auto-provisionável.
- Dependência de VPS Playwright MCP + Maxun Cloud + secrets (MAXUN_API_KEY,
  PLAYWRIGHT_WEB_CONNECTOR_API_KEY, etc.) — indisponibilidade = falha de rota.

### Limitação de teste
- B9 usa **fixtures** (example.com, wikipedia, the-internet.herokuapp.com), não
  sites de produção arbitrários. Descoberta em sites autenticados reais além
  do playground **NÃO COMPROVADA** em B9.
- Path da **Extensão Chrome** não tem E2E B9 (coberto por `b8WorkspaceIsolationTest`
  + `webBridgeRelinkTests`, que são unitários/integrados, não E2E pela extensão).

### Comportamento deliberadamente bloqueado
- **WRITE:** nunca auto-executa (Compiler + Selector + Governance). Promoção
  manual por admin permanece obrigatória para qualquer capability WRITE.
- **Maxun com WebSession:** rejeitado pelo adapter (segurança — nunca envia
  cookies ao Maxun Cloud).

---

## 20. Final Status

### WEB CONNECTOR STATUS

| Dimensão | Status | Base |
|----------|--------|------|
| Implementação funcional | **CERTIFICADO** para as 3 rotas (Maxun, Playwright Public, Playwright Authenticated) | test1/2/3 |
| E2E (ciclo completo) | **CERTIFICADO** — Discovery → Probe → Compile → Validate → Promote → Persist → 2ª exec → PASS | test1/2/3 |
| Persistência (CapabilityMap) | **CERTIFICADO** — automation persistida com executor/robotId/targetUrl/wsReq | test1/2/3 |
| Runtime (2ª exec via persistida) | **CERTIFICADO** — selectExecutor + validateSpec sobre persistido → PASS | test1/2/3 (via `specFromPersisted`) |
| Segurança (WRITE block, auth-wall, write-guard, admin-only) | **CERTIFICADO** | test4/5 + guards |
| Multi-workspace (B8) | **CERTIFICADO** — isolamento cross-workspace, atomic claim | test6 + b8 (14) |
| Testes de regressão | **CERTIFICADO** — 91/91 verdes | test8 |
| Anti-falso-pass (B2/B6) | **CERTIFICADO** — auth-wall → FAIL, não promove | test4 |

### NÃO CERTIFICADO (requisitos de produção não comprovados)
| Item | Razão |
|------|-------|
| Produção em escala | Limite de 1 browser Playwright; concorrência não validada |
| Sites arbitrários de produção | B9 usa fixtures (example.com, wikipedia, the-internet) |
| Path Extensão Chrome E2E | Coberto só por testes B8 unitários/integrados, não E2E |
| Runtime de produção chamando selectExecutor+validateSpec | Simulado em B9 (`specFromPersisted`); integração real não executada |
| UNKNOWN authentication E2E | Só unitário (`discoveryStep3Tests`), sem execução B9 |
| Long-lived WebSession em produção | TTL 30min; reauth em produção não validado |
| Telemetria/observabilidade de runs | Não parte do escopo B9 |
| Auto-provisionamento do Playwright MCP | Pré-requisito de infra assumido configurado |

### Conclusão objetiva

O Web Connector está **CERTIFICADO** no ciclo de vida funcional das três rotas
oficiais em fixtures de teste, com persistência, segunda execução via rota
persistida, segurança (WRITE block, auth-wall, admin-only governance) e
isolamento multi-workspace — comprovados por 91 testes de regressão + 8 testes
E2E B9.

**NÃO CERTIFICADO** como production-ready: escala, sites arbitrários, path
Extensão E2E, integração exata do Runtime de produção, caso `unknown` E2E,
sessões longas e telemetria não foram comprovados. A declaração de
"production-ready" requer validação adicional desses itens.

---

## Matriz Oficial de Decisão

| authentication_requirement | capability_type | inputs | WebSession | Executor | Comprovado |
|---------------------------|-----------------|--------|------------|----------|------------|
| public | READ | [] | não | maxun (targetUrl duplicate) | test1 ✓ |
| public | READ | [] | não | maxun (robotId existente) | test1 2ª exec ✓ |
| public | READ | >0 | não | playwright (public) | test2 ✓ |
| public | WRITE | * | — | **bloqueado** (write_blocked) | test5 ✓ |
| session_required | READ | [] | sim | playwright (autenticado) | test3 ✓ |
| session_required | READ | >0 | sim | playwright (autenticado form-fill) | NÃO COMPROVADO E2E (lógica em discoveryStep3) |
| session_required | WRITE | * | — | **bloqueado** | test5 ✓ |
| unknown | READ | * | sim (conservador) | playwright (autenticado) | NÃO COMPROVADO E2E (unitário) |
| public + redirect /login | READ | >0 | — | **bloqueado** (session_expired) | test4 ✓ |

---

## Evidências B1–B9

| Fase | Objetivo | Evidência | Resultado |
|------|----------|-----------|-----------|
| **B1** | Branch page-read autenticado em `webConnectorConnect` | `webConnectorConnect` branch `_hasFlow && !inputFields` → injeta cookies, navega, snapshot | Comprovado (test3 usa este branch) |
| **B2** | Anti-falso-pass `detectAuthWall` no Validator | `capabilityValidator.detectAuthWall` + gate antes de `checkExpectedResult` | Comprovado (test4) |
| **B3** | *Não identificado como fase independente no código* | — | **NÃO COMPROVADO** como fase B3 separada |
| **B4** | Auth Probe determinístico | `webDiscovery.probeAuthenticationRequirement` + `classifyAuthenticationRequirement` + `deriveAuthenticationRequirement` | Comprovado (test1/2/3/4/7 probe + discoveryStep3Tests) |
| **B5** | Path `playwright_public` (sem WebSession) | `executorSelector` reason `playwright_public` + `webConnectorConnect` `webSessionRequired===false` | Comprovado (test2) |
| **B6** | Early auth-wall detection no `webConnectorConnect` | check `page.url()` em `/login` pós-goto → `session_expired` | Comprovado (test4) |
| **B7** | Pipeline test in-memory | `b7PipelineTest` (orquestra discovery→compile→exec sem persistir) | Comprovado (suite existe; regressão coberta por step2/3) |
| **B8** | Multi-workspace isolation | `webSessionWorkspace.ts` + guards em `webConnectorConnect`/`webConnectorExtension` + `b8WorkspaceIsolationTest` (14) | Comprovado (test6 + b8) |
| **B9** | E2E final 3 rotas + 2ª exec | `b9E2ETest` test1–test8 (8/8 PASS) | Comprovado |

---

*Fim da certificação. Nenhum código foi alterado. Documento produzido em
2026-08-14 com base no estado do código pós-Fase B9.*