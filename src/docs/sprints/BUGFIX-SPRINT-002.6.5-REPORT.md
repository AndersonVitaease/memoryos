# BUGFIX-SPRINT-002.6.5 — REPORT
## Conversation Runtime Guard Adoption

**Data:** 2026-07-20
**Status:** CONCLUÍDA — CCG migrado de invokeCompat → invokeCompatGuarded

---

## 1. Auditoria — Fase 1

### 1.1 Chamadas invokeCompat() no ConversationCognitiveGateway.ts

| # | Linha | Trecho | ConnectorId | Operação | Origem do connectorId | ResolvedCapability disponível antes? |
|---|---|---|---|---|---|---|
| 1 | 385 | `officialRuntimeBridge.invokeCompat("github", capability, payload, ...)` | `"github"` (hardcoded) | `ghRoute.capability` (dinâmico, determinado pelo `GitHubQueryRouter`) | `GitHubQueryRouter.route()` | Não — apenas `ghRoute.capability` string |
| 2 | 568 | `officialRuntimeBridge.invokeCompat("github", "repos.list", { per_page: 10 }, ...)` | `"github"` (hardcoded) | `"repos.list"` (hardcoded) | Hardcoded | Não |

**Total: 2 chamadas invokeCompat() no CCG, 0 em outros arquivos auditados.**

### 1.2 Trecho real — chamada 1 (linha 385)

```typescript
const invocationResult = await officialRuntimeBridge.invokeCompat(
  "github",
  capability,      // ← valor de ghRoute.capability, ex: "repos.list", "files.get", "search.symbol"
  payload,
  { originComponent: "ConversationCognitiveGateway", reason: `User query: ${capability}`, goalId: null },
);
```

**Risco de divergência:** Se `ghRoute.capability` fosse `"drive.files.list"` (impossível hoje
porque `GitHubQueryRouter` só retorna capabilities do domínio github), o `invokeCompat` passaria para
`invoke()` → `GoalCapabilityRegistry` → `google-drive`. Sem guard, a execução seria silenciosa.

### 1.3 Trecho real — chamada 2 (linha 568)

```typescript
const reposInv = await officialRuntimeBridge.invokeCompat("github", "repos.list", { per_page: 10 },
  { originComponent: "ConversationCognitiveGateway", reason: "Repository resolution" });
```

**Risco de divergência:** Hardcoded `"github"` + `"repos.list"` — sem risco presente. Mas sem
guard, uma futura mudança no `CIS_TO_GOAL_TYPE` poderia divergir silenciosamente.

### 1.4 Análise de risco

| Chamada | connectorId | operation fonte | Risco hoje | Risco futuro |
|---|---|---|---|---|
| Linha 385 | `"github"` | `GitHubQueryRouter.capability` (domínio github) | **Baixo** | **Médio** — se router expandir |
| Linha 568 | `"github"` | `"repos.list"` (hardcoded) | **Mínimo** | **Baixo** |

**Conclusão:** Sem risco imediato de execução de connector errado, mas sem guard qualquer
refactor do `GitHubQueryRouter` ou do `CIS_TO_GOAL_TYPE` poderia introduzir divergência silenciosa.

---

## 2. invokeCompatGuarded — Implementação (Fase 2)

### Contrato

```typescript
async invokeCompatGuarded(
  connectorId: string,   // connector DECLARADO pelo CCG
  operation:   string,   // operação dinâmica (ex: ghRoute.capability)
  payload:     Record<string, unknown>,
  _ctx?:       Record<string, unknown>,
): Promise<{
  record: { id: string; status: string; durationMs: number; error: string | null };
  result: { data: unknown; success: boolean } | null;
}>
```

### Fluxo

```
CCG.invokeCompatGuarded("github", capability, payload)
    ↓  invokeGuarded("github", capability, payload)
    ↓  GoalType = CIS_TO_GOAL_TYPE[capability]
    ↓  plan = GoalCapabilityRegistry.resolve(GoalType)
    ↓  resolvedConnector = plan.steps[0].connector
    ↓
    if (resolvedConnector !== "github")
        → status = "CONNECTOR_DIVERGENCE"
        → result = null
        → NEVER executes google-drive / google-calendar / etc.
    else
        → engine.execute(plan) → GitHubConnector ✓
```

### Status mapping

| invokeGuarded status | invokeCompatGuarded record.status | result |
|---|---|---|
| `"completed"` (success) | `"SUCCESS"` | `{ data, success: true }` |
| `"NOT_ROUTABLE"` | `"NOT_CONFIGURED"` | `null` |
| `"CONNECTOR_DIVERGENCE"` | `"CONNECTOR_DIVERGENCE"` | `null` |
| `"FAILED"` | `"FAILED"` | `null` |

---

## 3. CCG — Mudanças aplicadas

### Antes (linha 385)

```typescript
const invocationResult = await officialRuntimeBridge.invokeCompat(
  "github", capability, payload, { ... }
);
```

### Depois (linha 385)

```typescript
// BUGFIX-002.6.5: invokeCompatGuarded enforces declaredConnector===resolvedConnector guard
const invocationResult = await officialRuntimeBridge.invokeCompatGuarded(
  "github", capability, payload, { ... }
);
```

### Antes (linha 568)

```typescript
const reposInv = await officialRuntimeBridge.invokeCompat("github", "repos.list", { per_page: 10 }, { ... });
```

### Depois (linha 568)

```typescript
// BUGFIX-002.6.5: invokeCompatGuarded enforces declaredConnector===resolvedConnector guard
const reposInv = await officialRuntimeBridge.invokeCompatGuarded("github", "repos.list", { per_page: 10 }, { ... });
```

**Compatibilidade:** O shape do retorno é identico ao `invokeCompat()`. Zero mudança no código
consumidor de `invocationResult.record.status` e `invocationResult.result.data` no CCG.

---

## 4. Arquivos Alterados

| Arquivo | Alteração |
|---|---|
| `OfficialRuntimeBridge.ts` | ATUALIZADO — `invokeCompatGuarded()` adicionado |
| `ConversationCognitiveGateway.ts` | ATUALIZADO — 2× `invokeCompat` → `invokeCompatGuarded` |
| `conversation-runtime-guard.spec.ts` | CRIADO — 8 testes |
| `BUGFIX-SPRINT-002.6.5-REPORT.md` | CRIADO |

**NÃO alterados:**
- `LiveCognitivePipeline.ts` — já migrado em 002.6.3
- `ConnectorInvocationService.ts` — wrappers mantidos
- `GitHubQueryRouter.ts` — nenhuma mudança
- Todos os connectors — nenhuma mudança

---

## 5. Testes — conversation-runtime-guard.spec.ts (8 testes)

| # | Cenário | Esperado | Status |
|---|---|---|---|
| T1 | `invokeCompatGuarded("github", "repos.list")` | SUCCESS, github | PASS |
| T2 CRÍTICO | `invokeCompatGuarded("github", "drive.files.list")` | CONNECTOR_DIVERGENCE | PASS |
| T3 | `invokeCompat("github", "drive.files.list")` (legacy) | Silently returns wrong data | PASS (demonstra o risco) |
| T4 | Guard captura o que legacy perde | legacy=SUCCESS, guarded=CONNECTOR_DIVERGENCE | PASS |
| T5 | `_resolveRepository` path → `invokeCompatGuarded("github","repos.list")` | SUCCESS | PASS |
| T6 | CONNECTOR_DIVERGENCE propagado em compat shape | status=CONNECTOR_DIVERGENCE, result=null | PASS |
| T7 | Todas as ops github reais passam sem falso positivo | Nenhuma CONNECTOR_DIVERGENCE | PASS |
| T8 | Nenhuma drive op executada quando github declarado | Todas CONNECTOR_DIVERGENCE, result=null | PASS |

---

## 6. Critério de Aceite — STATUS

> **Nenhuma chamada originada do CCG pode executar connector sem passar pelo divergence guard.**

| Caminho CCG | Antes | Depois |
|---|---|---|
| `process()` → GitHub query → `invokeCompat` | Sem guard | `invokeCompatGuarded` — GUARDED ✓ |
| `_resolveRepository()` → `invokeCompat` | Sem guard | `invokeCompatGuarded` — GUARDED ✓ |
| `_pipeline.execute()` (LCP) | LCP já migrado em 002.6.3 | GUARDED ✓ |

**Critério atingido. Todas as chamadas do CCG passam pelo divergence guard.**

---

## 7. Estado global da migração após 002.6.5

| Componente | Status |
|---|---|
| `OfficialRuntimeBridge.invokeGuarded()` | DISPONÍVEL (002.6.3) |
| `OfficialRuntimeBridge.invokeCompatGuarded()` | DISPONÍVEL (002.6.5) |
| `LiveCognitivePipeline` — 13 calls | MIGRADO (002.6.3) |
| `ConversationCognitiveGateway` — 2 calls | MIGRADO (002.6.5) |
| `ConnectorInvocationService` wrappers — 21 calls | Pendente (risco baixo, connectorId sempre explícito) |
| `invokeCompat()` legado | Mantido para retrocompatibilidade |

---

## 8. Plano de Rollback

1. Reverter `ConversationCognitiveGateway.ts`: 2× `invokeCompatGuarded` → `invokeCompat`
2. Remover `invokeCompatGuarded()` de `OfficialRuntimeBridge.ts`
3. Deletar `conversation-runtime-guard.spec.ts`

Nenhum contrato público alterado. `invokeCompat()` permanece inalterado.

---

## 9. Impacto MAS/MES

| Princípio | Status |
|---|---|
| No Wrong Connector Execution | CONFORME — guard aborta antes de executar |
| OCP | CONFORME — `invokeCompatGuarded` é adição; `invokeCompat` intacto |
| Drop-in compatibility | CONFORME — mesmo shape de retorno; zero mudança no CCG além das 2 linhas |
| Progressive Migration | CONFORME — legacy path ainda disponível onde risco é aceitável |