# RFC-009 — Base44 Connector Expansion (B44-EXP)

**Status:** DRAFT (proposta)
**Data:** 2026-08-04
**Autor:** MemoryOS
**Relacionados:** RFC-008 (Execution Intelligence), ADR-015 (Safety Gate), ADR-013 (MS Graph Capability Executors), GITHUB-CONNECTOR-MULTIACCOUNT-AND-UPGRADE-PLAN.md

---

## 1. Contexto

O `Base44Connector` (`src/lib/connector-runtime/connectors/Base44Connector.ts`, v2.0.0,
Beta-02 PCS certified) e o segundo conector certificado do MemoryOS. Hoje expoe
**15 capabilities, todas read-only**:

- `connectivity.ping`, `auth.me`, `auth.validate`, `auth.permissions`
- `workspace.info`, `app.info`
- `projects.list`, `projects.get`
- `sessions.list`, `sessions.get`
- `entities.list`, `entities.count`
- `health.full`, `test.ping`, `test.echo`

Ele implementa `IProductionConnector` (PCS v1.0) — tem health, metrics,
diagnostics, certification, logExecution. Mas NAO declara
`capabilityReversibility` (foi pulado em EI-01 porque todas as caps eram
`safe` implicito) e NAO expoe escritas, integracoes Core, gestao de
usuarios, workflows ou analytics — embora o SDK Base44 ja suporte tudo isso.

O pipeline do MemoryOS hoje chama `base44.entities.X.create/update/delete` e
`base44.integrations.Core.*` direto no codigo, **bypassando** o conector
(nenhuma observabilidade do UCRBridge, nenhum enriquecimento do Execution
Intelligence, nenhuma trava do Safety Gate). Evoluir o conector unifica
esses fluxos pela cadeia ADR-015 (Intelligence → Safety → Dispatch).

## 2. Objetivo

Evoluir o `Base44Connector` para cobrir escritas em entidades, integracoes
Core, gestao de usuarios, visibilidade de conectores, workflows e analytics
— seguindo o mesmo padrao aditivo usado no GitHub (multi-conta + 6 upgrades)
e no Microsoft Graph (Capability Executors). Nenhuma capability existente e
alterada; nenhuma quebra.

## 3. Principios (mesmos do projeto)

- **Aditivo apenas** — nada apagado. Cada fase adiciona cases ao `_dispatch`,
  entradas ao `CAPABILITIES` e ao `capabilityReversibility`, e mappings ao
  `GoalCapabilityRegistry`. As 15 capabilities existentes ficam 100% intocadas.
- **Zero codigo morto/legado/paralelo** — os novos cases sao o unico caminho
  vivo para as novas capabilities. Nao se cria implementacao alternativa em
  `src/sdk/connectors/base44/` (SDK de referencia, nao runtime).
- **Reversibility declarada desde a primeira fase** — toda capability nova
  declara `safe` / `reversible` / `irreversible` no
  `metadata().capabilityReversibility`. O Safety Gate (EI-03) le este campo.
- **Nao-quebra por construcao** — `capabilityReversibility` e campo opcional
  (nao validado pelo `ConnectorBootstrap.validateConnector`); mappings no
  `GoalCapabilityRegistry` sao aditivos; nenhum caller vivo e migrado
  (caminho antigo direto segue intocado ate decisao explicita pos-fases).
- **Cada fase independente e testavel** — nenhuma fase depende de outra para
  compilar/funcionar. Ordem e so recomendacao de impacto.

## 4. Arquitetura

### 4.1 Decisao: manter o switch (nao extrair para executors)

O `MicrosoftGraphConnector` foi extraido para 11 Capability Executors
(ADR-013) porque tinha 8 cases monoliticos e cresceria para 32. O
`Base44Connector` tem 15 cases e crescera para ~30. A extracao seria
**opcional e mecanica** (mesmo padrao), mas **NAO e obrigatoria** para esta
expansao:

- O switch do `_dispatch` ja e bem-estruturado (cases curtos, helpers `ok`/`fail`/`requireObject`).
- O conector implementa `IProductionConnector` (PCS) — a camada de executors
  adicionaria indirecao sem beneficiar o PCS (que ja e a "interface rica").
- **Decisao:** manter o switch. Adicionar cases novos no final, antes do
  `default`. Se o switch passar de ~50 cases, reabrir a decisao de extracao
  (fase futura, NAO desta RFC).

Extracao fica como **Fase 0 opcional** (mecanica, zero comportamento novo) —
so se o usuario quiser antes de comecar as escritas.

### 4.2 Decisao: adicionar `capabilityReversibility` (EI-01)

O `Base44Connector` foi pulado em EI-01 porque todas as 15 capabilities eram
`safe` implicito. Ao adicionar escritas, DEVE declarar o campo:

```ts
metadata(): ConnectorMetadata {
  return {
    id: "base44", name: ..., version: ...,
    capabilities: CAPABILITIES.map(c => c.id),
    capabilityReversibility: {
      // Phase 1
      "entities.create": "reversible",
      "entities.update": "reversible",
      "entities.delete": "irreversible",
      "entities.bulkCreate": "reversible",
      "entities.bulkUpdate": "reversible",
      "entities.filter": "safe",
      // Phase 2 — integracoes Core (sem efeito colateral persistente)
      "integrations.invokeLLM": "safe",
      "integrations.uploadFile": "reversible",
      "integrations.generateImage": "safe",
      "integrations.generateSpeech": "safe",
      "integrations.generateVideo": "safe",
      "integrations.transcribeAudio": "safe",
      "integrations.extractDataFromFile": "safe",
      // Phase 3 — usuarios
      "users.invite": "reversible",
      "users.list": "safe",
      "auth.updateMe": "reversible",
      // Phase 4 — conectores (leitura)
      "connectors.list": "safe",
      "connectors.appUserStatus": "safe",
      // Phase 5 — workflows
      "workflows.list": "safe",
      "workflows.activate": "reversible",
      "workflows.deactivate": "reversible",
      "workflows.runs": "safe",
      // Phase 6 — analytics
      "analytics.track": "safe",
    },
  };
}
```

### 4.3 Mapa de capacidades por fase

| Fase | Sprint | Capabilities | Reversibilidade |
|---|---|---|---|
| 1 — Entity Writes | B44-EXP-01 | `entities.create`, `entities.update`, `entities.delete`, `entities.filter`, `entities.bulkCreate`, `entities.bulkUpdate` | reversible / irreversible / safe |
| 2 — Integracoes Core | B44-EXP-02 | `integrations.invokeLLM`, `uploadFile`, `generateImage`, `generateSpeech`, `generateVideo`, `transcribeAudio`, `extractDataFromFile` | safe (uploadFile: reversible) |
| 3 — User Management | B44-EXP-03 | `users.invite`, `users.list`, `auth.updateMe` | reversible / safe |
| 4 — Connector Visibility | B44-EXP-04 | `connectors.list`, `connectors.appUserStatus` | safe |
| 5 — Workflows | B44-EXP-05 | `workflows.list`, `workflows.activate`, `workflows.deactivate`, `workflows.runs` | safe / reversible |
| 6 — Analytics | B44-EXP-06 | `analytics.track` | safe |

Total: +23 capabilities (15 → 38).

### 4.4 GoalCapabilityRegistry mappings

Cada fase adiciona mappings `base44.<group>.<action>` →
`{ connector: "base44", capability: "base44.<group>.<action>", params: {} }`
no `GoalCapabilityRegistry.ts`, ANTES do bloco `general.conversation`/`unknown`
no final do `_builtins` (mesma convencao usada por Microsoft e WhatsApp).

## 5. Fases de implementacao

### Fase 0 (opcional) — Extracao para executors (mecanica, zero comportamento)

Se o usuario quiser, extrair os 15 cases atuais para
`src/lib/connector-runtime/connectors/base44/` (irmao de `microsoft/`):
`Base44SDKHelper.ts`, `Base44CapabilityTypes.ts`, `Base44CapabilityRegistry.ts`,
`AuthCapability.ts`, `WorkspaceCapability.ts`, `ProjectsCapability.ts`,
`SessionsCapability.ts`, `EntitiesReadCapability.ts`, `HealthCapability.ts`.

Shell vira fino: `metadata`, `health`, `validate`, `execute` (token +
`resolveCapability`). Zero comportamento novo. Mesmo padrao da Fase 0 do
MS-EXP (ADR-013).

**Recomendacao:** NAO fazer nesta RFC. Manter o switch. Reabrir se passar de
~50 cases.

### Fase 1 — Entity Writes (B44-EXP-01) — MAIOR VALOR

**Capabilities:**
- `entities.create` — `sdk.entities[entityName].create(payload)`. Reversible.
- `entities.update` — `sdk.entities[entityName].update(id, payload)`. Reversible.
- `entities.delete` — `sdk.entities[entityName].delete(id)`. **Irreversible.**
- `entities.filter` — `sdk.entities[entityName].filter(query, sort, limit)`. Safe.
- `entities.bulkCreate` — `sdk.entities[entityName].bulkCreate([...])`. Reversible.
- `entities.bulkUpdate` — `sdk.entities[entityName].bulkUpdate([...])`. Reversible.

**Validacao:** `entityName` deve existir em `sdk.entities` (mesmo check do
`entities.list` atual). `delete` retorna 405 se a entidade nao permite
(Users — platform limit; documentado no caso).

**Valor:** o chat pode criar Tasks, Projects, Watchs, KnowledgeObservations
via capability em vez de codigo hardcoded no pipeline. O Safety Gate freia
`entities.delete` (irreversible) pedindo confirmacao.

### Fase 2 — Integracoes Core (B44-EXP-02)

**Capabilities:**
- `integrations.invokeLLM` — `sdk.integrations.Core.InvokeLLM({ prompt, ... })`. Safe.
- `integrations.uploadFile` — `sdk.integrations.Core.UploadFile({ file })`. Reversible.
- `integrations.generateImage` — `sdk.integrations.Core.GenerateImage({ prompt })`. Safe.
- `integrations.generateSpeech` — `sdk.integrations.Core.GenerateSpeech({ text, voice? })`. Safe.
- `integrations.generateVideo` — `sdk.integrations.Core.GenerateVideo({ prompt, ... })`. Safe.
- `integrations.transcribeAudio` — `sdk.integrations.Core.TranscribeAudio({ audio_url })`. Safe.
- `integrations.extractDataFromFile` — `sdk.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema })`. Safe.

**Caveat de custo:** `generateVideo` custa 5 credits/segundo (30 credits
para 6s default), `generateImage`/`Speech` tambem consomem integration
credits. Documentar no header do case. O Safety Gate nao freia por creditos
(so por reversibility), mas o `ExecutionIntelligence` futuro (EI-07+)
poderia ter um budget — fora desta RFC.

**Valor:** unifica o pipeline pelo conector. Hoje o `conversationPipeline`
chama `base44.integrations.Core.InvokeLLM` direto; migrar pra
`integrations.invokeLLM` capability da observabilidade do UCRBridge
(eventos, metricas) e enriquecimento do Intelligence.

### Fase 3 — User Management (B44-EXP-03)

**Capabilities:**
- `users.invite` — `sdk.users.inviteUser(email, role)`. Reversible (convite pode ser revogado). Validacao: `role` deve ser `"user"` ou `"admin"`.
- `users.list` — `sdk.entities.User.list(sort, limit)`. Safe. Built-in admin-only (platform RLS).
- `auth.updateMe` — `sdk.auth.updateMe(data)`. Reversible. Atualiza dados do usuario corrente (built-ins id/email/full_name nao podem ser overridden).

**Caveat:** User records NAO podem ser criados (platform limit —
`base44.entities.User.create` retorna 405). So via invite. Documentado no caso.

**Valor:** admin onboarding via chat ("convita joao@x.com como user").

### Fase 4 — Connector Visibility (B44-EXP-04)

**Capabilities:**
- `connectors.list` — `sdk.asServiceRole.connectors.list()` (ou API
  equivalente). Safe. Lista conectores autorizados no workspace.
- `connectors.appUserStatus` — `sdk.asServiceRole.connectors.getCurrentAppUserConnection(connectorId)`. Safe. Status de conexao app-user.

**Valor:** visibilidade no chat de "quais contas estao conectadas" sem
precisar ir na pagina /connections. Hoje voce tem o `outlook` (MemoryOS
Microsoft 365) registrado — `connectors.list` mostraria.

### Fase 5 — Workflows (B44-EXP-05)

**Capabilities:**
- `workflows.list` — lista workflows do workspace. Safe.
- `workflows.activate` — ativa workflow pausado. Reversible.
- `workflows.deactivate` — pausa workflow ativo. Reversible.
- `workflows.runs` — historico de execucoes. Safe.

**Valor:** gestao de automacoes via chat ("pausa o WatchEngineScheduler").

### Fase 6 — Analytics (B44-EXP-06)

**Capability:**
- `analytics.track` — `sdk.analytics.track({ eventName, properties })`. Safe. Fire-and-forget.

**Valor:** o chat pode emitir eventos customizados ("user_created_task_via_chat").

## 6. Ordem recomendada

1. **Fase 1 (Entity Writes)** — maior valor direto no chat. Sem dependencia.
2. **Fase 2 (Integracoes Core)** — unifica o pipeline pelo conector.
3. **Fase 3 (User Management)** — admin onboarding.
4. **Fase 4 (Connector Visibility)** — simples, leitura pura.
5. **Fase 5 (Workflows)** — gestao de automacoes.
6. **Fase 6 (Analytics)** — fire-and-forget, menor.

Cada fase = PR separado, testavel isoladamente, sem deixar o app quebrar
entre uma e outra.

## 7. Nao-quebra (verificacao)

- As 15 capabilities existentes continuam com mesmos IDs, mesma assinatura,
  mesmo comportamento. Zero rename.
- `IProductionConnector` (connect, disconnect, health, metrics, diagnostics,
  certification, logExecution) — intocado.
- `ConnectorBootstrap` registra o conector pela classe `Base44Connector` —
  import inalterado, mesmo `id`.
- `UCRBridge` (Event Layer) e `PipelineObservationBridge` (Observation Layer)
  envolvem o conector automaticamente — nenhuma acao necessaria.
- `capabilityReversibility` e campo opcional — adicionar nao quebra
  `validateConnector` (so checa `capabilities` array).
- `GoalCapabilityRegistry` mappings sao aditivos — inseridos antes do bloco
  `general.*` final, mesma convencao do MS-EXP.
- Nenhum caller vivo e migrado — o `ConversationPipeline` e o
  `ConnectorGoalIntentExecutor` (ja migrado em EI-04 sub-step) continuam
  funcionando. Novas capabilities sao acessiveis via `processCapability`
  (cadeia EI) ou direto via `ConnectorRegistry.get("base44").execute()`.
- `Reversibility` importado de `ConnectorTypes` (ja existe desde EI-01).

## 8. Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| `entities.delete` irreversivel em producao sem confirmacao | Safety Gate (EI-03) freia automaticamente se chamado via `processCapability`. Callers diretos (registry.execute) nao passam pelo gate — documentado; migracao de callers e EI-04 sub-step. |
| `integrations.generateVideo` consome muitos credits | Documentar custo no caso. Budget de credits fica fora desta RFC (EI-07+ ou policy futura). |
| `users.invite` envia email real | `SendEmail` so alcanc usuarios registrados; invite usa `sdk.users.inviteUser` que envia o convite. Reversible (revogavel). Safety Gate classifica como reversible (nao freia). Se quiser freiar, policy futura. |
| `sdk.entities[entityName]` para entidade inexistente | Mesmo check do `entities.list` atual: `if (!entityApi) return fail(...)`. |
| `workflows.activate/deactivate` em workflow critico (WatchEngineScheduler) | Reversible — pode reativar. Safety Gate nao freia reversible. Documentar no caso. |
| Extracao para executors (Fase 0) criar arvore paralela | NAO fazer nesta RFC. Manter switch. |

## 9. Estado final esperado

- `Base44Connector` v2.1.0 com 38 capabilities (15 read-only originais + 23
  novas cobrindo escritas, integracoes, usuarios, conectores, workflows,
  analytics).
- `capabilityReversibility` declarado — Safety Gate opera sobre as novas
  escritas.
- `GoalCapabilityRegistry` com mappings `base44.*` para todas as novas
  capabilities.
- Pipeline do MemoryOS pode (opcionalmente, pos-fases) migrar chamadas
  diretas `base44.entities.X.create` / `base44.integrations.Core.*` para as
  novas capabilities — ganha observabilidade + enriquecimento. Migracao e
  EI-04 sub-step, nao desta RFC.

## 10. NAO esta no escopo

- Migracao de callers vivos (EI-04 sub-step) — deferida apos as fases.
- Extracao para executors (Fase 0) — opcional, nao recomendada nesta RFC.
- Budget de integration credits (EI-07+ ou PolicyRegistry futuro).
- UI de chat/Connections para as novas capabilities — o conector expoe; a UI
  consome via Planner/GoalCapabilityRegistry como ja faz para os outros
  conectores.
- Testes automatizados (sem runner no projeto). Corretude verificada por
  inspecao + `validateAsync()`/`health()` existentes.

## 11. Proximo passo

Aguardar autorizacao para iniciar **B44-EXP-01 (Entity Writes)** — 6 cases
novos + `capabilityReversibility` + mappings. Zero risco, maior valor.

---

## 12. Status de execucao (atualizado 2026-08-04 20:41 BRT)

| Sprint | Status | Notas |
|---|---|---|
| B44-EXP-01 | EXECUTADO | 6 capabilities (create, update, delete, filter, bulkCreate, bulkUpdate). Smoke test via exec_tool OK (entidade Task). |
| B44-EXP-02 | EXECUTADO | 8 capabilities: ai.invokeLLM, ai.generateImage, ai.generateSpeech, ai.generateVideo, ai.transcribeAudio, files.upload, files.extractData, email.send. invokeLLM validado ao vivo (InvokeLLM real). generateVideo = irreversible (custo 5 credits/s). |
| B44-EXP-03 | EXECUTADO | 4 capabilities (users.invite, users.list, auth.updateMe, auth.logout). |
| B44-EXP-04 | DEFERRED | SDK runtime (`base44.connectors`) so expoe `connectAppUser`/`disconnectAppUser` — sem `connectors.list`/`connectors.appUserStatus`. |
| B44-EXP-05 | DEFERRED | Nao existe `base44.workflows` no client runtime — workflows sao ferramentas de plataforma (`manage_workflow`, `get_workflow_run`), nao SDK do app. |
| B44-EXP-06 | EXECUTADO | analytics.track (reversible). |

**Contagem final:** 15 (originais) + 15 (EXP-01/02/03/06) = 30 capabilities. EXP-04/05 somam +6 quando o SDK liberar (30 -> 36, abaixo das 38 previstas).

**Invariante preservado:** as 15 capabilities read-only originais, `IProductionConnector` e `ConnectorBootstrap` intocados. Nenhum caller vivo migrado (deferido, conforme decisao 4).

**Desbloqueio de EXP-04/05:** requer a plataforma expor metodos SDK de runtime para (a) listar conectores/estado de app-user e (b) gerenciar workflows do app. Ate la, essas duas frentes ficam como placeholder conceitual no roadmap, sem codigo que fabrica chamadas inexistentes.