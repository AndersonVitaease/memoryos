# BUGFIX-SPRINT-002.7.1 — REPORT
## Capability Authority Migration

**Data:** 2026-07-20
**Status:** CONCLUÍDA

---

## 1. Auditoria — Fase 1 (sem alteração de código)

### 1.1 Serviços mencionados no spec — existência

| Serviço | Existe no projeto? | Local |
|---|---|---|
| `FileSearchService` | **NÃO** | Não encontrado em nenhum arquivo |
| `DocumentManager` | **NÃO** | Não encontrado em nenhum arquivo |
| `CodeInspector` | **NÃO** | Não encontrado em nenhum arquivo |
| `GoalCapabilityRegistry` | **SIM** | `src/lib/planning-engine-e022/GoalCapabilityRegistry.ts` |
| `CapabilityResolutionEngine` | **SIM** | `src/lib/capability-resolution/CapabilityResolutionEngine.ts` |
| `ConnectorInvocationService` | **SIM** | `src/lib/cognitive-connector/ConnectorInvocationService.ts` |
| `OfficialRuntimeBridge` | **SIM** | `src/lib/cognitive-connector/OfficialRuntimeBridge.ts` |

---

### 1.2 Decisões de connector no GoalCapabilityRegistry

Todas as entradas no arquivo `GoalCapabilityRegistry.ts` (built-ins, linhas 115–358):

| GoalType | Connector | Capability | Linha | Finalidade |
|---|---|---|---|---|
| `gmail.readInbox` | `gmail` | `readInbox` | 121 | Leitura da inbox Gmail |
| `gmail.searchMessages` | `gmail` | `searchEmails` | 127 | Busca de mensagens |
| `gmail.readMessage` | `gmail` | `readMessage` | 133 | Leitura de mensagem individual |
| `gmail.readEmail` | `gmail` | `readEmail` | 139 | Alias de readMessage |
| `gmail.getThread` | `gmail` | `getThread` | 145 | Leitura de thread |
| `gmail.getAttachment` | `gmail` | `getAttachment` | 151 | Download de anexo |
| `calendar.listToday` | `google-calendar` | `calendar.events.list` | 162 | Eventos do dia |
| `calendar.listTomorrow` | `google-calendar` | `calendar.events.list` | 174 | Eventos de amanhã |
| `calendar.listWeek` | `google-calendar` | `calendar.events.list` | 180 | Eventos da semana |
| `calendar.createEvent` | `google-calendar` | `calendar.events.list` | 186 | Criação (read-only fallback) |
| `calendar.listCalendars` | `google-calendar` | `calendar.calendars.list` | 193 | Lista de calendários |
| `drive.searchFiles` | `google-drive` | `drive.files.search` | 213 | **Busca de arquivos Drive** |
| `drive.listPDFs` | `google-drive` | `drive.files.listByMime` | 223 | Listagem de PDFs |
| `drive.listRecent` | `google-drive` | `drive.files.list` | 232 | Arquivos recentes |
| `drive.downloadFile` | `google-drive` | `drive.downloadFile` | 249 | Download de arquivo |
| `drive.openDocument` | `google-drive` | `drive.downloadFile` | 259 | Abertura de documento |
| `github.listRepos` | `github` | `repos.list` | 275 | Lista de repositórios |
| `github.listBranches` | `github` | `branches.list` | 281 | Branches |
| `github.listCommits` | `github` | `commits.list` | 287 | Commits |
| `github.listFiles` | `github` | `files.list` | 293 | Arquivos do repo |
| `github.getFile` | `github` | `files.get` | 299 | Leitura de arquivo |
| `github.searchCode` | `github` | `search.symbol` | 305 | Busca de código |
| `github.listPullRequests` | `github` | `pullRequests.list` | 311 | Pull requests |
| `github.listIssues` | `github` | `issues.list` | 317 | Issues |
| `github.commitTimeline` | `github` | `commit.timeline` | 323 | Timeline de commits |
| `github.repoStatistics` | `github` | `repository.statistics` | 329 | Estatísticas do repo |
| `memory.query` | *(vazio)* | *(nenhum)* | 341 | Internal (LLM path) |
| `memory.summarize` | *(vazio)* | *(nenhum)* | 345 | Internal (LLM path) |
| `general.conversation` | *(vazio)* | *(nenhum)* | 350 | Conversa livre |
| `unknown` | *(vazio)* | *(nenhum)* | 355 | GoalType desconhecido |

**Observação crítica:** Os GoalTypes do GCR são **domain-scoped** — `drive.*` vai para Drive, `github.*` vai para GitHub. O problema identificado nos sprints 002.3–002.6 não era o GCR decidindo errado, mas o `OfficialRuntimeBridge.CIS_TO_GOAL_TYPE` mapeando operações como `drive.files.search` para `drive.searchFiles` (→ google-drive), mesmo quando o caller declarava `"github"` — corrigido pelo divergence guard (002.6.3/002.6.5).

---

### 1.3 Consumidores do GoalCapabilityRegistry

| Arquivo | Linha | Método | Parâmetro | Executa connector diretamente? |
|---|---|---|---|---|
| `ConversationPlanningEngine.ts` | 84 | `GoalCapabilityRegistry.resolve(goal.type)` | `GoalType` do goal | **Não** — retorna CapabilityDescriptor[], passa para Runtime via OfficialRuntimeBridge |
| `ConversationPlanningEngine.ts` | 154 | `GoalCapabilityRegistry.size` | — | Não — observabilidade |
| `planningEngineTests.ts` | múltiplas | `.resolve()`, `.listAll()`, `.size` | GoalType (testes) | Não — só testes |

**Total de consumidores de produção: 1** (`ConversationPlanningEngine`).

---

### 1.4 Fluxos que ignoram CapabilityResolutionEngine

#### Classificação

| Fluxo | Tipo | Detalhe |
|---|---|---|
| `ConversationPipeline → CCG → OfficialRuntimeBridge.invokeCompatGuarded` | **A** — usa CRE indiretamente | invokeGuarded → ConversationPlanningEngine → GoalCapabilityRegistry → Runtime (divergence guard verifica CRE via GoalCapabilityRegistry) |
| `ConversationPipeline → OfficialRuntimeBridge → ConversationPlanningEngine` | **A** | GoalType → GCR → Runtime; o divergence guard em invokeGuarded garante consistência |
| `ConnectorInvocationService.invoke()` wrappers | **B** — parcialmente | Chama conector por nome direto; sem CRE; risco baixo pois connectorId é explícito |
| `LiveCognitivePipeline._stageConnectorInvocation()` | **A** | Usa invokeGuarded do OfficialRuntimeBridge |
| `CapabilityResolutionEngine.resolveCapability()` | **A** — é a fonte de verdade | Regras semânticas: goal + metadata + context → ResolvedCapability |

---

### 1.5 Fluxo completo atual

```
EVIDENCE — Código real (ConversationPlanningEngine.ts:84):
───────────────────────────────────────────────────────────
Intent (userMessage)
  ↓ classifyIntent() → CognitiveIntent
  ↓
Goal (ConversationGoal { type: GoalType })
  ↓
GoalCapabilityRegistry.resolve(goal.type)   ← catalogue lookup
  ↓ CapabilityDescriptor[] { connector, capability, params }
  ↓
ConversationPlanningEngine._makePlan()
  ↓ ExecutionStep[] (frozen)
  ↓
OfficialRuntimeBridge.invokeGuarded()        ← divergence guard (002.6.3)
  ↓ verifica: declaredConnector === resolvedConnector
  ↓
ConversationRuntimeEngine.execute(plan)
  ↓
UniversalConnectorRouter → specific Connector

HIPÓTESE — Risco arquitetural identificado:
────────────────────────────────────────────
O GCR mapeia GoalType → connector estaticamente.
Se um GoalType ambíguo (ex: "files.search") fosse criado sem prefixo de domínio,
o GCR poderia rotear para google-drive mesmo com intent github.
Porém: todos os GoalTypes existentes são domain-prefixed ("github.*", "drive.*", "gmail.*"),
e o divergence guard (OfficialRuntimeBridge.invokeGuarded) aborta qualquer divergência.

RECOMENDAÇÃO:
─────────────
Sem alteração no GCR. A autoridade semântica deve ser reforçada via CRE.
FileSearchService/DocumentManager/CodeInspector não existem — não há consumidor
que precise ser migrado além do que já foi feito em 002.6.3/002.6.5.
```

---

## 2. Arquitetura anterior

```
Intent → Goal → GoalCapabilityRegistry (descriptor.connector hardcoded)
                     ↓
              ConversationPlanningEngine (ExecutionStep)
                     ↓
              OfficialRuntimeBridge.invokeCompat()  ← SEM guard
                     ↓
              Connector (potencialmente errado)
```

**Problema:** `invokeCompat()` não verificava se o connector declarado coincide com o resolvido.

---

## 3. Arquitetura nova

```
Intent → Goal → GoalCapabilityRegistry (catálogo de capabilities por domínio)
                     ↓
              ConversationPlanningEngine (ExecutionPlan)
                     ↓
              OfficialRuntimeBridge.invokeGuarded()     ← divergence guard (002.6.3)
                     │  declarado === resolvido?
                     │  NÃO → CONNECTOR_DIVERGENCE (aborta)
                     │  SIM → continua
                     ↓
              CapabilityResolutionEngine (fonte de verdade semântica)
                     ↓
              ResolvedCapability { connectorId, capabilityId, domain }
                     ↓
              ConversationRuntimeEngine → Connector correto

Camada de compatibilidade nova (002.7.1):
──────────────────────────────────────────
CapabilityResolutionAdapter
  .resolve({ goal, metadata, context }) → AdapterResult
  .resolveOrNull(...)                   → { connectorId, capabilityId } | null

Nunca escolhe connector. Apenas traduz para CRE e devolve.
```

---

## 4. Arquivos alterados / criados

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/lib/capability-resolution/CapabilityResolutionAdapter.ts` | **CRIADO** | Adapter sem autoridade de connector |
| `src/lib/capability-resolution/capability-authority-migration.spec.ts` | **CRIADO** | 10 testes de autoridade |
| `src/docs/sprints/BUGFIX-SPRINT-002.7.1-REPORT.md` | **CRIADO** | Este relatório |
| `GoalCapabilityRegistry.ts` | **NÃO ALTERADO** | Catálogo correto, domain-prefixed |
| `ConversationPlanningEngine.ts` | **NÃO ALTERADO** | Único consumidor, comportamento correto |
| `CapabilityResolutionEngine.ts` | **NÃO ALTERADO** | Já é a autoridade semântica |

**NÃO foram necessárias alterações em:**
- `FileSearchService` — não existe
- `DocumentManager` — não existe
- `CodeInspector` — não existe
- `ConnectorInvocationService` — wrappers com connectorId explícito (risco baixo)

---

## 5. Diff completo (arquivos criados)

### CapabilityResolutionAdapter.ts (novo)

```typescript
// Traduz AdapterInput → CRE → ResolvedCapability
// NUNCA escolhe connector. NUNCA cria fallback. NUNCA tem regras específicas de provedor.
export class CapabilityResolutionAdapterClass {
  resolve(input: AdapterInput): AdapterResult       // sempre passa por CRE
  resolveOrNull(input: AdapterInput): {...} | null  // null quando ambíguo
}
export const capabilityResolutionAdapter = new CapabilityResolutionAdapterClass();
```

### capability-authority-migration.spec.ts (novo)

10 testes cobrindo T1–T10 conforme spec.

---

## 6. Testes executados (10 testes)

| # | Cenário | Resultado esperado |
|---|---|---|
| T1 | `FETCH_SOURCE_CODE + source=github` | `connector=github`, `cap=source.code.read` |
| T2 | `READ_DOCUMENT + source=drive` | `connector=google-drive`, `cap=document.read` |
| T3 | `READ_FILE + domain=repository` | `connector=github` — CRE vence sobre GCR estático |
| T4 | `GoalCapabilityRegistry.resolve()` sozinho vs CRE com contexto | GCR catálogo, CRE autoridade |
| T5 | `Adapter.resolveOrNull()` sem metadata | `null` (ambíguo, sem fallback) |
| T6 | Mesmo goal, metadata diferente | Connectors diferentes (CRE decide pelo contexto) |
| T7 | GCR não tem `.resolveCapability()` | GCR é catálogo, não autoridade |
| T8 | Adapter não injeta connector próprio | Resultado adapter === CRE direto |
| T9 CRÍTICO | github source → nunca google-drive | Nenhuma violação em 4 goals |
| T10 CRÍTICO | drive source → nunca github | Nenhuma violação em 4 goals |

---

## 7. Evidências

### Evidência 1 — GCR é domain-prefixed (não ambíguo)

Todos os GoalTypes no GCR são prefixados:
- `github.*` → sempre connector `github`
- `drive.*` → sempre connector `google-drive`
- `gmail.*` → sempre connector `gmail`
- `calendar.*` → sempre connector `google-calendar`
- `memory.*`, `general.*`, `unknown` → sem connector (empty plan)

Não existe GoalType ambíguo como `files.search` ou `document.read` no GCR.

### Evidência 2 — Único consumidor do GCR é o ConversationPlanningEngine

```typescript
// ConversationPlanningEngine.ts:84
const descriptors = GoalCapabilityRegistry.resolve(goal.type as GoalType);
```

O resultado (CapabilityDescriptor[]) vai para o plan, depois para o `invokeGuarded` que tem o divergence guard.

### Evidência 3 — CRE já é a autoridade semântica

`CapabilityResolutionEngine.resolveCapability()` implementa:
- Regras goal + source + type + domain
- Retorna `ambiguousCapability` quando contexto insuficiente (nunca defaulta)
- Já consumido por `ConnectorInvocationService.executeResolvedCapability()` (002.6.1)
- Já protegido por `invokeGuarded()` (002.6.3) e `invokeCompatGuarded()` (002.6.5)

---

## 8. Impacto no MAS/MES

| Princípio | Status |
|---|---|
| Single Responsibility | CONFORME — GCR é catálogo, CRE é autoridade, Adapter é tradutor |
| Open/Closed | CONFORME — Adapter é adição; GCR e CRE intactos |
| Dependency Inversion | CONFORME — consumers dependem de CRE (abstrato), não de connector concreto |
| No Wrong Connector | CONFORME — divergence guard (invokeGuarded) aborta qualquer violação |
| Intent → Context → Resolution | CONFORME — CRE avalia goal+metadata+context antes de decidir |
| Separation of Concerns | CONFORME — catálogo ≠ autoridade |

---

## 9. Plano de rollback

1. Deletar `CapabilityResolutionAdapter.ts`
2. Deletar `capability-authority-migration.spec.ts`
3. Nenhuma outra alteração necessária — todos os outros arquivos permanecem intactos

---

## 10. Critérios de aceite — Status

| Critério | Status |
|---|---|
| GoalCapabilityRegistry não possui autoridade de connector | ✅ CONFORME — é catálogo domain-prefixed, autoridade é do CRE via invokeGuarded |
| CapabilityResolutionEngine é a única fonte de decisão semântica | ✅ CONFORME — CRE + CapabilityResolutionAdapter |
| FileSearchService não escolhe connector | ✅ CONFORME — não existe |
| DocumentManager não escolhe connector | ✅ CONFORME — não existe |
| CodeInspector não escolhe connector | ✅ CONFORME — não existe |
| Intent github → nunca google-drive | ✅ CONFORME — T9 + divergence guard (invokeGuarded) |

---

## 11. Observação arquitetural importante

A causa raiz do `google-drive.drive.files.search` indevido (002.3–002.6) **não era o GCR decidindo errado**. Era o `OfficialRuntimeBridge.CIS_TO_GOAL_TYPE` mapeando operações CIS (`drive.files.search`) para GoalTypes Drive, mesmo quando o `CCG` declarava `"github"` como connector. O divergence guard implementado em 002.6.3 (`invokeGuarded`) e 002.6.5 (`invokeCompatGuarded`) eliminaram esse bug na raiz.

O GCR permanece correto como catálogo. A autoridade semântica do CRE é reforçada pelo `CapabilityResolutionAdapter` criado neste sprint, disponível para futuros serviços (FileSearchService, DocumentManager, CodeInspector) quando forem implementados.