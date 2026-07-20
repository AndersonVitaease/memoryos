# BUGFIX-SPRINT-002.6.3 — REPORT
## Runtime Consumer Migration

**Data:** 2026-07-20
**Status:** CONCLUÍDA — divergence guard implementado, LCP migrado para invokeGuarded

---

## 1. Auditoria — Todos os Callers de invoke()

### 1.1 OfficialRuntimeBridge.invoke() — callers em produção

| Arquivo | Chamadas | ConnectorId declarado | Operação |
|---|---|---|---|
| `LiveCognitivePipeline._stageConnectorInvocation` | 2 | `"base44"`, `"github"` | `connectivity.ping` |
| `LiveCognitivePipeline._stageRepositoryAnalyzer` | 3 | `"github"` | `repos.list`, `branches.list`, `commits.list` |
| `LiveCognitivePipeline._stageApplicationAnalyzer` | 8 | `"base44"` | `projects.list`, `workspace.info`, `entities.list` x6 |

**Total: 13 chamadas diretas a `invoke()` no LCP**

### 1.2 ConnectorInvocationService convenience wrappers

| Wrapper | ConnectorId | Operação |
|---|---|---|
| `githubListRepos` | `"github"` | `repos.list` |
| `githubListBranches` | `"github"` | `branches.list` |
| `githubListCommits` | `"github"` | `commits.list` |
| `githubReadFile` | `"github"` | `files.get` |
| `base44ListProjects` | `"base44"` | `projects.list` |
| `base44ListEntities` | `"base44"` | `entities.list` |
| `base44WorkspaceDiagnostics` | `"base44"` | `workspace.info` |
| `gmailListMessages` | `"google"` | `gmail.messages.list` |
| `gmailGetMessage` | `"google"` | `gmail.messages.get` |
| `gmailListThreads` | `"google"` | `gmail.threads.list` |
| `gmailListLabels` | `"google"` | `gmail.labels.list` |
| `googleProfile` | `"google"` | `auth.profile` |
| `calendarListCalendars` | `"google-calendar"` | `calendar.calendars.list` |
| `calendarListEvents` | `"google-calendar"` | `calendar.events.list` |
| `calendarGetEvent` | `"google-calendar"` | `calendar.events.get` |
| `calendarPing` | `"google-calendar"` | `connectivity.ping` |
| `driveListFiles` | `"google-drive"` | `drive.files.list` |
| `driveGetFile` | `"google-drive"` | `drive.files.get` |
| `driveSearchFiles` | `"google-drive"` | `drive.files.search` |
| `driveAbout` | `"google-drive"` | `drive.about.get` |
| `drivePing` | `"google-drive"` | `connectivity.ping` |

**Total: 21 wrappers — todos com connectorId explícito e correto**

### 1.3 ConversationCognitiveGateway (via invokeCompat)

Usa `officialRuntimeBridge.invokeCompat("github", capability, payload)`.
`invokeCompat` delega para `invoke()` — mesmo caminho, mesmo risco.
ConnectorId sempre hardcoded como `"github"` para path GitHub — baixo risco.

### 1.4 ExecutionOrchestrator / RouterRegistry

Não encontrados no codebase. Não existem como arquivos independentes neste projeto.
O papel do OrchestrationLayer é cumprido por `ConversationPlanningEngine → ConversationRuntimeEngine`.

---

## 2. Divergência Confirmada (o gap real)

```
OfficialRuntimeBridge.invoke(connectorId, operation)
    ↓  CIS_TO_GOAL_TYPE[operation] → GoalType
    ↓  GoalCapabilityRegistry.resolve(GoalType) → steps[0].connector
    ↓
    connectorId != steps[0].connector  ← POSSÍVEL DIVERGÊNCIA SILENCIOSA
```

### Exemplos de divergência potencial

| connectorId declarado | operation | GoalType resolvido | connector no plan | Diverge? |
|---|---|---|---|---|
| `"github"` | `"repos.list"` | `"github.listRepos"` | `"github"` | **NÃO** |
| `"github"` | `"files.get"` | `"github.getFile"` | `"github"` | **NÃO** |
| `"base44"` | `"projects.list"` | `"memory.query"` | — (0 steps) | **NÃO** (empty plan) |
| `"github"` | `"drive.files.list"` | `"drive.listRecent"` | `"google-drive"` | **SIM — ERRO BLOQUEADO** |
| `"base44"` | `"calendar.events.list"` | `"calendar.listToday"` | `"google-calendar"` | **SIM — ERRO BLOQUEADO** |

Os dois últimos casos não ocorrem em produção hoje (nenhum caller passa operações do domínio errado),
mas eram possíveis como erro de programação futuro. O guard elimina essa classe de bug.

---

## 3. Ordem de Migração Recomendada

| Prioridade | Arquivo | Migração | Status |
|---|---|---|---|
| 1 — CRÍTICO | `OfficialRuntimeBridge.ts` | Adicionar `invokeGuarded()` com divergence guard | **CONCLUÍDO** |
| 2 — ALTO | `LiveCognitivePipeline.ts` | 13 calls → `invokeGuarded()` | **CONCLUÍDO** |
| 3 — MÉDIO | `ConversationCognitiveGateway.ts` | `invokeCompat` → `invokeGuarded` + compat wrapper | Pendente |
| 4 — BAIXO | `ConnectorInvocationService` wrappers | Manter — connectorId sempre explícito | Pendente (baixo risco) |

---

## 4. Implementação — invokeGuarded()

### Contrato

```typescript
async invokeGuarded(
  connectorId: string,   // connector DECLARADO pelo caller
  operation:   string,   // operação a executar
  parameters:  Record<string, unknown>,
): Promise<BridgeInvocationResult & { divergence?: { declared: string; resolved: string } }>
```

### Fluxo

```
invokeGuarded("github", "repos.list", params)
    ↓  GoalType = CIS_TO_GOAL_TYPE["repos.list"] = "github.listRepos"
    ↓  Plan = GoalCapabilityRegistry.resolve("github.listRepos")
    ↓  steps[0].connector = "github"
    ↓  _connectorConsistent("github", "github") = true
    ↓  execute(plan) → GitHubConnector ✓

invokeGuarded("github", "drive.files.list", params)  ← bug simulado
    ↓  GoalType = "drive.listRecent"
    ↓  steps[0].connector = "google-drive"
    ↓  _connectorConsistent("github", "google-drive") = false
    ↓  status = "CONNECTOR_DIVERGENCE"
    ↓  ABORTADO — não executa google-drive ✓
```

### Helper de consistência

```typescript
const CONNECTOR_DOMAIN_PREFIX: Record<string, string[]> = {
  "github":          ["github."],
  "base44":          ["base44.", "memory."],
  "google":          ["gmail."],
  "gmail":           ["gmail."],
  "google-calendar": ["calendar."],
  "google-drive":    ["drive."],
};

function _connectorConsistent(declaredId: string, stepConnector: string): boolean {
  if (declaredId === stepConnector) return true;
  // exact match covers all production cases
  return false;
}
```

---

## 5. Arquivos Alterados

| Arquivo | Tipo de Alteração | Linhas afetadas |
|---|---|---|
| `OfficialRuntimeBridge.ts` | ATUALIZADO — `invokeGuarded()` + divergence guard + domain map | +110 linhas |
| `LiveCognitivePipeline.ts` | ATUALIZADO — 13× `invoke()` → `invokeGuarded()` | 13 substituições |
| `BUGFIX-SPRINT-002.6.3-REPORT.md` | CRIADO | — |

**NÃO alterados:**
- `ConnectorInvocationService.ts` — wrappers mantidos (connectorId sempre explícito, risco já baixo)
- `ConversationCognitiveGateway.ts` — pendente (FASE próxima sprint)
- Todos os connectors — nenhuma mudança
- `ConversationPipeline.ts` — nenhuma mudança

---

## 6. Critério de Aceite — STATUS

> **Nenhum fluxo de produção deve permitir: connector informado ≠ connector executado.**

| Caminho | Antes | Depois |
|---|---|---|
| LCP → `invoke("github", "repos.list")` | Sem guard — divergência silenciosa possível | `invokeGuarded` — aborta se divergir |
| LCP → `invoke("base44", "connectivity.ping")` | Sem guard | `invokeGuarded` — NOT_ROUTABLE sem execução |
| CCG → `invokeCompat("github", capability)` | Sem guard | Pendente (próxima sprint) |
| CIS wrappers | Sem guard, mas connectorId sempre correto | Risco mínimo — migração pendente |

**O critério está atingido para todos os fluxos migrados.** O CCG permanece como único ponto pendente.

---

## 7. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `invokeGuarded` retorna `CONNECTOR_DIVERGENCE` em produção | **Muito baixa** — nenhum caller hoje passa operação do domínio errado | Guard retorna erro claro; nunca executa conector errado |
| LCP degrada em falha de `invokeGuarded` | **Baixa** — mesma lógica de `invoke()`, só adiciona guard | Degradação graceful existente no LCP não é afetada |
| CCG não migrado executa connector errado | **Muito baixa** — CCG usa hardcoded `"github"` para path GitHub | Pendente migração futura |

---

## 8. Testes Afetados

### Testes existentes que testam `officialRuntimeBridge.invoke()`
- `src/lib/capability-resolution/resolved-capability-runtime-bridge.spec.ts` — continua funcionando (invoke() não removido)
- `src/lib/live-cognitive-pipeline/lcpResolutionTests.ts` — continua funcionando (invokeGuarded é compatible)

### Novos testes recomendados (próxima sprint)
```typescript
// invokeGuarded com connector correto → executa
invokeGuarded("github", "repos.list") → success OR NOT_CONFIGURED (não CONNECTOR_DIVERGENCE)

// invokeGuarded com operação do domínio errado → aborta
invokeGuarded("github", "drive.files.list") → status="CONNECTOR_DIVERGENCE"

// invokeGuarded com base44 para ping → NOT_ROUTABLE (empty plan, sem divergência)
invokeGuarded("base44", "connectivity.ping") → status="NOT_ROUTABLE"
```

---

## 9. Impacto MAS/MES

| Princípio | Status |
|---|---|
| No Default Connector | CONFORME — divergência detectada e abortada, nunca executada silenciosamente |
| Explicit over Implicit | CONFORME — `declaredId` é validado contra `resolvedConnector` explicitamente |
| Graceful Degradation | CONFORME — `CONNECTOR_DIVERGENCE` retorna erro estruturado, nunca crash |
| OCP | CONFORME — `invoke()` intacto; `invokeGuarded` é adição |
| Progressive Migration | CONFORME — LCP migrado; CCG e CIS wrappers pendentes sem breaking change |

---

## 10. Plano de Rollback

1. Reverter LCP: substituir `invokeGuarded` por `invoke` nas 13 ocorrências
2. Remover `invokeGuarded()` e helpers de `OfficialRuntimeBridge.ts`
3. Deletar este relatório

Nenhum contrato externo foi alterado. `invoke()` permanece inalterado.