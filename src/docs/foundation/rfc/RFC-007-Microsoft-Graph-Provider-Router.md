# RFC-007 — Microsoft Graph Provider Router (Multi-Provider + Multi-Account)

**Status:** Proposed
**Categoria:** Connector Architecture Evolution
**Prioridade:** High
**Foundation:** v1.0
**Data:** 2026-08-04
**Autor:** MemoryOS Engineering
**Rastreabilidade:** MES §16 (Connector Runtime), MCF (Connector Framework), RFC-006 (Capability Executors — base sobre a qual esta RFC evolui), ADR-013 (Capability Executors Pattern — decision a emendar), ADR-012 (Watch Engine — padrão de camadas), RFC-005 (Watch Engine — referência de método), WhatsApp 5-layer architecture (referência de Provider Registry vivo)

---

## Objetivo

Introduzir uma camada de **Provider Router** no conector Microsoft Graph, transformando o `MicrosoftGraphConnector` atual (shell que decide "como" executar) em um shell fino que **delega a decisão** a um registro de providers. Cada provider implementa a mesma interface e cobre um conjunto de operations. O router pergunta "quem consegue executar `mail.list`?" e devolve o primeiro provider disponível.

Adicionalmente, elevar o **multi-account** (multi-conta Microsoft simultânea, já existente no Google Workspace) a requisito de primeira classe: o router é `workspaceId`-aware, espelhando o padrão `workspaceId` já vivo no `MicrosoftAuthSession.js` e no `GoogleAuthSession.js`.

---

## Contexto

### O que já existe (RFC-006 / ADR-013, concluídos)

- `MicrosoftGraphConnector.ts` — shell fino com `execute()` que pega token (Flow 1: `microsoftOAuthInit`/`Exchange` próprios) e delega ao `MicrosoftCapabilityRegistry`.
- 11 Capability Executors isolados (OutlookMail, OutlookCalendar, OneDrive, Contacts, ToDo, OneNote, Teams, SharePoint, Excel, Word, PowerPoint) — 32 operations.
- `MicrosoftGraphHelper.ts` — `graphFetch`, `ok`, `fail`.
- `MicrosoftAuthSession.js` — OAuth completo com `workspaceId` (multi-conta já suportado na sessão).
- `MicrosoftWatchProvider.ts` — stub do Watch Engine.

### O que mudou desde ADR-013

O ADR-013 **rejeitou** explicitamente a arquitetura 5-camadas do WhatsApp com a justificativa: *"o Microsoft Graph é uma única API oficial — não há provedores concorrentes a abstrair. Criar `MicrosoftProviderRegistry` com um único `GraphProvider` seria indireção sem benefício."*

Essa justificativa **continua correta para o Graph como API**, mas o contexto evoluiu: hoje existem **dois fluxos OAuth viáveis e concorrentes** para acessar o mesmo Microsoft Graph, cada um com vantagens distintas:

| Fluxo | Auth | Redirect URI | Gestão de token | Cobertura |
|---|---|---|---|---|
| **Flow 1 — OAuth próprio** (já existe) | `microsoftOAuthInit`/`Exchange` + entidade `MicrosoftOAuthToken` | `https://ever-mind-core.base44.app/oauth/microsoft/callback` (rota do app) | Totalmente nossa (refresh no backend, multi-conta via `workspaceId`) | 32 operations, totalmente sob nosso controle |
| **Flow 2 — Base44 App-User Connector** (descoberto 2026-08-04) | `register_workspace_connector` + `base44.connectors.connectAppUser(connectorId)` | Redirect URI gerenciada pelo Base44 (única por app, ambiente Live + Preview + Custom domain) | Delegada à plataforma (`getCurrentAppUserConnection`) | Limitada às operations expostas pelo connector `outlook` nativo |

Sem um Provider Router, escolher entre os dois fluxos exige um `if` espalhado pelo código — exatamente o padrão rejeitado pelo projeto. **Com** o router, ambos coexistem atrás da mesma interface, e o router escolhe por disponibilidade/preferência.

### O que NÃO mudou

- O Microsoft Graph continua sendo a **única API oficial**. O router não abstrai "qual API chamar" — abstrai "qual fluxo de credencial/token usar para chamar a mesma API". Sutil, mas fundamental: os providers não são APIs concorrentes, são **estratégias de acesso** à mesma API.
- O Softeria MS-365 MCP Server foi testado e descartado (dead end: incompatível com sandbox Deno, exige stdio/WAM local, risco de provisioning tenant-wide de Dataverse). O slot MCP fica reservado como stub interface-conforme, não como implementação ativa.

---

## Principio

> O `MicrosoftGraphConnector` deixa de decidir "como" executar. Ele passa a ser apenas um roteador que pergunta ao `MicrosoftProviderRegistry`: "quem consegue executar `mail.list` para a conta `workspaceId`?"
>
> Cada provider responde a mesma interface (`MicrosoftProvider`) e decide COMO: OAuth próprio (Flow 1), App-User Connector da plataforma (Flow 2), servidor MCP futuro, ou SDK REST direto.
>
> O router é **`workspaceId`-aware**: multi-conta é resolvido no lookup, não em `if`s espalhados.

### Diferença crucial vs. WhatsApp

No WhatsApp, a camada de Provider abstrai **qual backend** chamar (Meta, Evolution, Baileys) — APIs diferentes.

No Microsoft, a camada de Provider abstrai **qual credencial** usar para chamar a **mesma** API (Graph). Por isso os providers não são "APIs concorrentes" no sentido do WhatsApp; são "estratégias de acesso". A indireção traz valor real porque resolve o dilema OAuth (dois fluxos viáveis) sem `if`s espalhados — justificativa que NÃO existia quando o ADR-013 foi escrito.

---

## Arquitetura Proposta

```
Planner
   │  (GoalCapabilityRegistry mapeia ms.* → connector: "microsoft-graph" — INALTERADO)
   ▼
MicrosoftGraphConnector (shell fino — id "microsoft-graph" INALTERADO)
   │  execute(operation, payload, ctx)
   ▼
MicrosoftProviderRegistry  ← NOVO (singleton HMR-safe, workspaceId-aware)
   │  resolveProvider(operation, workspaceId) → MicrosoftProvider | null
   ▼
┌──────────────────┬─────────────────────┬────────────────────┐
│ OfficialGraph    │ Base44Outlook       │ McpMicrosoft        │ ... (slots futuros)
│ Provider         │ Provider            │ Provider (stub)    │
│ (Flow 1 — OAuth  │ (Flow 2 — App-User  │ (isAvailable=false)│
│  próprio, já     │  Connector, futuro) │                    │
│  existe)         │                     │                    │
└────────┬─────────┴──────────┬──────────┴────────────────────┘
         │                    │
         ▼                    ▼
   MicrosoftCapabilityRegistry (INALTERADO — vira interno do OfficialGraphProvider)
         │
         ▼
   11 Capability Executors (INALTERADOS)
```

**Fluxo:**
1. Shell recebe `execute("mail.list", payload, ctx)`.
2. Extrai `workspaceId` do `ctx` (default `"default"`).
3. `microsoftProviderRegistry.resolveProvider("mail.list", workspaceId)` → provider.
4. Provider escolhido pega token (`ensureValidToken(workspaceId)` no Official, `getCurrentAppUserConnection(connectorId)` no Base44) e chama Graph.
5. Retorna `ConnectorResult` (mesma shape de sempre).

**Para fora do conector:** nada muda. `id`, `execute`, `metadata`, `health`, `validate` continuam idênticos. `UCRBridge` (Event Layer), `PipelineObservationBridge` (Observation Layer), `ConnectorBootstrap`, `GoalCapabilityRegistry` — todos intocados.

---

## Interface do Provider (workspaceId-aware)

Espelha `WhatsAppProvider` mas com `workspaceId` em toda chamada que toca credencial:

```typescript
// MicrosoftProviderTypes.ts
export interface MicrosoftProviderContext {
  workspaceId: string;        // NOVO — qual conta executar
  start: number;
  eid: string;
  logs: ConnectorLog[];
}

export interface MicrosoftProvider {
  readonly id: string;            // "official-graph" | "base44-outlook" | "mcp" | "rest-sdk"
  readonly displayName: string;
  readonly isOfficial: boolean;

  /** Operations que este provider cobre (ex.: ["mail.list","mail.search",...]). */
  readonly operations: readonly string[];

  /** Tem credencial/token válido para a conta workspaceId? */
  isAvailable(workspaceId: string): Promise<boolean>;

  /** Executa a operation e retorna ConnectorResult. */
  execute(
    operation: string,
    payload: Record<string, unknown>,
    ctx: MicrosoftProviderContext,
  ): Promise<ConnectorResult>;
}

export interface MicrosoftProviderRegistry {
  /** Resolve o provider ativo que cobre a operation para a conta dada. */
  resolveProvider(operation: string, workspaceId: string): MicrosoftProvider | null;
  /** Lista todas as contas conhecidas (workspaceId, email, providerId) — para UI de switcher. */
  listAccounts(): Promise<{ workspaceId: string; email: string; providerId: string }[]>;
  /** Define qual provider é preferido para uma operation (override manual). */
  setPreferred(operation: string, providerId: string): void;
  /** Registra um novo provider (Open/Closed). */
  register(provider: MicrosoftProvider): void;
}
```

**Singleton HMR-safe** via `globalThis` (mesmo padrão do `WhatsAppProviderRegistry`, `KnowledgeRegistry`, `CognitiveEventBus`).

---

## Lineup de Providers

| Provider | Status | Auth | Cobertura (operations) | Valor |
|---|---|---|---|---|
| **OfficialGraphProvider** | Re-homed do shell atual (Fase 2) | Flow 1 — OAuth próprio (`microsoftOAuthInit`/`Exchange`), token por `workspaceId` | 32 operations (herda dos 11 executors) | O que já funciona hoje, isolado |
| **Base44OutlookProvider** | Novo (Fase 4 — opcional) | Flow 2 — `register_workspace_connector` + `connectAppUser` + `getCurrentAppUserConnection` | Subset exposto pelo connector `outlook` nativo | Resolve o dilema OAuth; gestão de token delegada à plataforma |
| **McpMicrosoftProvider** | Stub interface-conforme (Fase 3) | Servidor MCP (Softeria descartado) | `isAvailable()=false` sempre | Slot reservado p/ MCP compatível no futuro |
| **RestSdkProvider** | Stub interface-conforme (Fase 3) | Graph JS SDK direto | `isAvailable()=false` sempre | Slot reservado p/ SDK oficial ou REST alternativo |

**Ordem de precedência no router:** preferido declarado → OfficialGraph → Base44Outlook → fallback stub. O `setPreferred` permite override por operation.

---

## Multi-Account (requisito de primeira classe)

O `MicrosoftAuthSession.js` **já** suporta multi-conta via `workspaceId` (`connect({ workspaceId })`, `_storeToken(workspaceId, ...)`, `getConnection(workspaceId)`). O que falta é **subir o `workspaceId` ao router**, porque hoje o shell pega sempre `"default"`.

### Mudanças para multi-conta

1. **`MicrosoftProviderContext` ganha `workspaceId`** — repassado pelo shell em `execute()`, igual o Gmail/Drive já fazem com `accountEmail`/`workspaceId`.
2. **`OfficialGraphProvider` extrai token por `workspaceId`** — `ensureValidToken(workspaceId)` + `getAccessToken(workspaceId)` já existem; só parametrizar.
3. **UI de multi-conta no `/connections`** — switcher "Conta Microsoft 1 / 2 / 3" (espelha o switcher do Google Workspace). Cada conta = 1 linha em `MicrosoftOAuthToken` + 1 entrada de `localStorage` (metadata só, sem token — token nunca sai do backend).
4. **Watch Engine** — `MicrosoftWatchProvider` já recebe `action` + `params`; basta incluir `workspaceId` nos params ao criar um Watch, e o evaluator chama o provider com a conta certa.

### Compatibilidade

- Quem usa a conta `default` hoje não sente nada — `workspaceId` defaulta para `"default"`.
- `GoalCapabilityRegistry` continua mapeando `ms.*` → `"microsoft-graph"`; a escolha de conta fica no router, não no planner.
- A Fase 4 (Base44 outlook) herda o mesmo `workspaceId` — cada conta conectada via `connectAppUser` vira um workspace no router. Os dois fluxos OAuth coexistem **e** cada um suporta N contas.

---

## Estrutura de Arquivos (aditiva)

```
src/lib/connector-runtime/connectors/
  MicrosoftGraphConnector.ts            # shell (edicao Fase 2 — delega ao router)
  microsoft/
    MicrosoftGraphHelper.ts             # INALTERADO
    MicrosoftCapabilityTypes.ts          # INALTERADO
    MicrosoftCapabilityRegistry.ts       # INALTERADO (vira interno do OfficialGraphProvider)
    OutlookMailCapability.ts             # INALTERADO
    ... (10 outros executors)            # INALTERADOS
    MicrosoftWatchProvider.ts             # INALTERADO
  microsoft-providers/                   # NOVO diretorio
    MicrosoftProviderTypes.ts             # NOVO (interface)
    MicrosoftProviderRegistry.ts         # NOVO (singleton HMR-safe)
    OfficialGraphProvider.ts              # NOVO (re-home da logica atual do shell)
    Base44OutlookProvider.ts              # NOVO (Fase 4 — opcional)
    McpMicrosoftProvider.ts               # NOVO stub (Fase 3)
    RestSdkProvider.ts                    # NOVO stub (Fase 3)
```

**Observação de localização:** `microsoft-providers/` fica **dentro** de `connectors/` (irmão de `microsoft/`), não em `src/lib/` raiz. Motivo: o router é interno ao conector Microsoft Graph; não é uma camada global do runtime. Evita criar árvore paralela (dead end recorrente: `src/sdk/` vs `src/lib/` vs `src/runtime/`).

---

## Fases de Implementacao (aditivas, reversíveis)

- **Fase 0 — Documentação (este RFC + ADR-014):** só documento. Zero código. Builder revisa e aprova.
- **Fase 1 — Tipos + Registry (aditivo, zero runtime):** `MicrosoftProviderTypes.ts` + `MicrosoftProviderRegistry.ts` (singleton HMR-safe). Registra 0 providers. Build verde. Nada muda em produção.
- **Fase 2 — OfficialGraphProvider (refator, comportamento idêntico):** extrai a lógica atual do `MicrosoftGraphConnector.execute()` (token + `resolveCapability` + delegação) para dentro de `OfficialGraphProvider`. Shell vira fino: delega ao `microsoftProviderRegistry.resolveProvider(op, workspaceId)`. Mesmo `id`, mesma assinatura `execute`, mesmo `metadata` → `UCRBridge`/`GoalCapabilityRegistry`/`ConnectorBootstrap` intocados. Build verde = paridade confirmada. Os 11 executors e o `MicrosoftCapabilityRegistry` **não são tocados** — viram internos do OfficialGraphProvider.
- **Fase 3 — Stubs MCP + REST/SDK (aditivo, `isAvailable()=false`):** `McpMicrosoftProvider` + `RestSdkProvider` interface-conformes, registrados mas nunca ativos. Arquitetura pronta, zero impacto em runtime.
- **Fase 4 — Base44OutlookProvider (opcional, valor real):** segundo provider de verdade. Usa `base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId)` para pegar token e chama Graph com ele. Exige `register_workspace_connector` (integration_type `outlook`) + UI de connect via `connectAppUser`. É aqui que o dilema OAuth se resolve de verdade.
- **Fase 5 (opcional) — Watch:** o `MicrosoftWatchProvider` já é stub. O router poderia alimentá-lo no futuro, mas fica fora deste escopo.

Cada fase é **aditiva e reversível** — nenhuma quebra o conector existente.

---

## Por que NÃO quebra

- O conector continua registrado como `"microsoft-graph"` no `ConnectorBootstrap` — o router é interno, invisível pro resto do runtime.
- `GoalCapabilityRegistry` continua mapeando `ms.*` → `connector: "microsoft-graph"` — zero mudança.
- `UCRBridge` (Event Layer) e `PipelineObservationBridge` (Observation Layer) envolvem o conector automaticamente — nada a instrumentar.
- O side-effect import do `MicrosoftWatchProvider` no shell é preservado.
- Fases 1-3 não adicionam comportamento; só a Fase 4 traz capacidade nova, e é **opcional**.

---

## Escalabilidade (milhares de usuários)

- **Sem estado no router** — é um mapa em memória + lookup por operation/workspaceId. O(1).
- **Token por usuário/conta**, nunca por app — cada provider pega o token do `workspaceId` corrente. Mil usuários = mil tokens isolados.
- **Provider é stateless** — instância única compartilhada (singleton), não guarda nada entre chamadas. Escala horizontal sem nada.
- O custo marginal de um novo usuário é zero no router; só cresce o backend de tokens (que já escala sozinho no Base44).
- `isAvailable(workspaceId)` é chamada só na resolução, não em todo request — e é barata (check de credencial em memória/localStorage).

---

## Atualizabilidade (futuro)

Tudo é slot:
- **Novo provider** (servidor MCP compatível, Graph JS SDK, provedor terceirizado): 1 arquivo implementando `MicrosoftProvider` + 1 linha no registry. Shell, planner e capability registry intocados.
- **Nova capability** num provider existente: adicionar à lista `operations` do provider + executor. Router cobre automaticamente.
- **Trocar provider padrão**: `registry.setPreferred(op, "base44-outlook")` — uma linha, sem migrar usuários.
- **Deprecar provider**: `isAvailable()=false` — some do roster, outros cobrem. Sem deleção destrutiva.
- **A/B ou rollback**: registrar dois providers para a mesma operation; router pega o preferido, fallback automático se `isAvailable()=false`.

O Softeria descartado vira **stub interface-conforme** e não código morto: o slot fica reservado para um MCP compatível sem reescrever nada quando ele surgir.

---

## Criterios de Aceitacao

- [ ] RFC-007 + ADR-014 escritos e aprovados pelo builder (Fase 0).
- [ ] `MicrosoftProviderTypes.ts` + `MicrosoftProviderRegistry.ts` existem, singleton HMR-safe, sem providers ativos (Fase 1).
- [ ] `OfficialGraphProvider` re-homed; shell delega ao router; 32 operations continuam funcionando (paridade total) (Fase 2).
- [ ] `McpMicrosoftProvider` + `RestSdkProvider` registrados, `isAvailable()=false` (Fase 3).
- [ ] `Base44OutlookProvider` implementado (opcional); `register_workspace_connector` para `outlook` feito; UI de connect via `connectAppUser` funciona (Fase 4).
- [ ] Multi-conta: `workspaceId` flui do shell até o token; UI de `/connections` mostra switcher de contas Microsoft (espelha Google).
- [ ] `id` do conector permanece `"microsoft-graph"`; `metadata.capabilities` retorna as mesmas 32 operations; `GoalCapabilityRegistry` intocado.
- [ ] Build verde após cada fase.
- [ ] Zero código morto/legado/paralelo criado: `microsoft-providers/` é irmão de `microsoft/`, dentro de `connectors/`; nenhum diretório paralelo em `src/lib/`, `src/sdk/` ou `src/runtime/`.

---

## Riscos e Mitigacoes

| Risco | Mitigacao |
|---|---|
| Refator da Fase 2 quebra paridade das 32 operations | Fase 2 é puramente mecânica; teste de paridade (mesmas 32 operations) antes de avançar |
| Indireção do router adiciona latência | Lookup é O(1) em mapa em memória; `isAvailable` só na resolução; custo desprezível vs. chamada Graph |
| Multi-conta vaza token entre workspaces | Token é sempre lido por `workspaceId` no provider; nunca cacheado cross-workspace; session storage isolado por `workspaceId` |
| Base44 outlook connector não cobre todas as 32 operations | Router cai no OfficialGraph para operations que o Base44 não cobre; `operations` do provider declara só o que ele suporta |
| Softeria MCP revive e vira código morto | Permanece stub interface-conforme; nunca implementado ativamente; remoção segura se o slot for reusado por outro MCP |
| Árvore paralela de providers (dead end recorrente) | `microsoft-providers/` fica dentro de `connectors/`, irmão de `microsoft/`; nada em `src/lib/` raiz, `src/sdk/` ou `src/runtime/` |
| ADR-013 dizia "não replicar WhatsApp" | ADR-014 emenda explicitamente: a justificativa original (Graph único provedor) era correta para API, mas o contexto evoluiu (dois fluxos OAuth viáveis); a emenda é circunscrita e justificada |

---

## Relacao com ADR-013 (emenda, não revogação)

O ADR-013 estabeleceu o padrão **Capability Executors** (shell fino + 11 executors isolados). Esta RFC **não revoga** essa decisão — os 11 executors e o `MicrosoftCapabilityRegistry` continuam intactos, virando internos do `OfficialGraphProvider`.

O ADR-013 **rejeitou** a alternativa C (Provider Registry estilo WhatsApp) com a justificativa de "indireção sem benefício porque Graph é provedor único". O ADR-014 **emenda** essa rejeição: a justificativa era correta quando escrita (provedor único de API), mas o contexto evoluiu — hoje existem **dois fluxos OAuth viáveis** para a mesma API, e a indireção agora traz valor (resolve o dilema sem `if`s espalhados). A emenda é **circunscrita à camada de Provider**; tudo o mais do ADR-013 permanece válido.

---

## Referencias

- `RFC-006` — Microsoft Graph Connector Expansion (base sobre a qual esta RFC evolui)
- `ADR-013` — Microsoft Graph Connector: Capability Executors Pattern (decision a emendar)
- `ADR-012` — Watch Engine (padrão de camadas, referência de decisão Provider vs Connector)
- `RFC-005` — Watch Engine (método de verificação antes de codar)
- `src/lib/whatsapp/WhatsAppProviderTypes.ts` — interface de Provider a espelhar (workspaceId-aware version derivada)
- `src/lib/whatsapp/WhatsAppProviderRegistry.ts` — padrão de singleton HMR-safe a espelhar
- `src/lib/microsoft-auth/MicrosoftAuthSession.js` — sessão OAuth multi-conta já existente
- `src/lib/connector-runtime/connectors/MicrosoftGraphConnector.ts` — shell atual a refinar
- `src/lib/connector-runtime/connectors/microsoft/MicrosoftCapabilityRegistry.ts` — registry de executors (interno do OfficialGraphProvider)

---

*RFC-007 — Microsoft Graph Provider Router — 2026-08-04 — Proposed*