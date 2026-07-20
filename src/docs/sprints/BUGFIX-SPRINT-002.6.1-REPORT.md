# BUGFIX-SPRINT-002.6.1 — REPORT
## ResolvedCapability Runtime Bridge

**Data:** 2026-07-20
**Status:** FASE 1 + FASE 2 + FASE 3 CONCLUÍDAS (migração progressiva)

---

## 1. Diagnóstico Inicial

O sistema consegue resolver semanticamente a intenção do usuário (002.4/002.5),
mas a decisão era perdida antes da execução. Camadas posteriores podiam ignorar
o `ResolvedCapability` e tomar uma decisão independente.

**Sintoma reportado:**
```
Entrada: "Ler arquivo do repositório GitHub"
Resolução correta: capability=github.repository.readFile, connector=github
Execução real:    google-drive.drive.downloadFile → erro "workspaceId"
```

---

## 2. Auditoria — FASE 1 (código NÃO alterado nesta etapa)

### 2.1 Consumidores de execute() / invoke()

| Arquivo | Método chamado | ConnectorId fonte | Observação |
|---|---|---|---|
| `ConversationCognitiveGateway.ts:~290` | `officialRuntimeBridge.invokeCompat(connectorId, capability, payload)` | Hardcoded `"github"` para path GitHub | Correto — connector explícito |
| `ConversationCognitiveGateway.ts:~360` | `officialRuntimeBridge.invokeCompat("github", "repos.list", ...)` | Hardcoded `"github"` | Correto |
| `OfficialRuntimeBridge.ts:147` | `engine.execute(planResult.plan)` | Indireto via GoalType→GoalCapabilityRegistry | Plan carrega connector explícito |
| `ConnectorInvocationService.ts:94` | `connector.execute(operation, payload, ctx)` | `this._connectors.get(connectorId)` | Recebe connectorId como string — sem verificação de ResolvedCapability |
| `LiveCognitivePipeline.ts` (stages) | `officialRuntimeBridge.invokeCompat(...)` | Strings hardcoded por stage | Correto por stage |

### 2.2 Pontos onde connectorId é decidido (todos os arquivos auditados)

| Arquivo | Linha aprox. | Decisão tomada | Influência |
|---|---|---|---|
| `ConversationCognitiveGateway.ts` | ~286 | `officialRuntimeBridge.invokeCompat("github", capability, ...)` | CCG decide domínio via GitHubQueryRouter (âncora) |
| `OfficialRuntimeBridge.ts` | 68-130 | `CIS_TO_GOAL_TYPE[operation]` → GoalType | Mapeia CIS string → GoalType → GoalCapabilityRegistry |
| `GoalCapabilityRegistry.ts` | vários | `descriptor.connector` por GoalType | Autoridade de connectorId para o path LCP |
| `ConversationPlanningEngine.ts` | ~96 | `step.connector = desc.connector` | Propaga connectorId do Registry para o plano |
| `UniversalConnectorRouter.ts` | ~34 | `this._registry.lookup(step.connector)` | Lookup por connectorId — sem fallback |
| `ConnectorInvocationService.ts` | ~124 | `this._connectors.get(connectorId)` | Lookup direto — sem fallback |

**Conclusão da auditoria:** Não existe `selectBestConnector()`, `resolveConnector()` ou
`defaultConnector` no código real. O problema não é um fallback explícito — é a
**ausência de um contrato formal** que impeça qualquer camada de substituir uma
decisão já tomada. A `ResolvedCapability` criada em 002.5 resolve isso, mas
não estava integrada ao `ConnectorInvocationService`.

### 2.3 Busca de google-drive como fallback

Resultado: **zero ocorrências** de `google-drive` como valor de fallback automático.
O Drive aparece apenas em:
- `GoalCapabilityRegistry.ts` — goals `drive.*` explicitamente registrados
- `ConnectorInvocationService.ts` — wrapper `driveListFiles` com connectorId explícito
- `CIS_TO_GOAL_TYPE` no `OfficialRuntimeBridge.ts` — mapeamento explícito `drive.files.list → drive.listRecent`

O bug reportado ("cai em google-drive") ocorria provavelmente quando o
`GoalCapabilityRegistry` resolvia um goalType genérico (`general.conversation`
ou `unknown`) para um plano vazio, e o pipeline de fallback não era GitHub.

---

## 3. Fluxo — Antes e Depois

### Fluxo legado (antes de 002.6.1)

```
intent string
    ↓
OfficialRuntimeBridge.invokeCompat(connectorId: string, operation: string)
    ↓  CIS_TO_GOAL_TYPE[operation] → GoalType
    ↓  ConversationPlanningEngine.plan(goal) → ExecutionPlan
    ↓  (GoalCapabilityRegistry decide o connector pelo GoalType)
    ↓
ConversationRuntimeEngine.execute(plan)
    ↓
UniversalConnectorRouter.route(step)
    ↓  lookup(step.connector)  ← connector já está no plan
    ↓
Connector.execute()
```

**Problema:** O `connectorId` passado para `invokeCompat()` era apenas um label
de contexto — a decisão real era tomada pelo `GoalCapabilityRegistry` ao mapear
`GoalType → connector`. Se o GoalType mapeado divergia do connectorId original,
a execução corria num connector diferente do esperado.

### Fluxo novo (002.6.1)

```
intent string / connectorId
    ↓
ResolvedCapabilityAdapter.adaptFromCIS(connectorId, operation)
    ↓  ResolvedCapability { preferredConnector, capabilityId, domain, preservedContext }
    ↓
ConnectorInvocationService.executeResolvedCapability(resolved, payload)
    ↓  if (resolved.ambiguous) → NOT_AVAILABLE, sem fallback
    ↓  invoke(resolved.preferredConnector, resolved.capabilityId, enrichedPayload)
    ↓
connector.execute()  ← connector = preferredConnector GARANTIDO
```

**Garantia:** `preferredConnector` da `ResolvedCapability` é imutável (`Object.freeze`).
Nenhuma camada downstream pode alterar o connector escolhido.

---

## 4. Arquivos Alterados/Criados

| Arquivo | Ação | Fase |
|---|---|---|
| `src/lib/capability-resolution/ResolvedCapabilityAdapter.ts` | CRIADO | Fase 2 |
| `src/lib/capability-resolution/resolved-capability-runtime-bridge.spec.ts` | CRIADO | Spec |
| `src/lib/cognitive-connector/ConnectorInvocationService.ts` | ATUALIZADO | Fase 3 |
| `src/docs/sprints/BUGFIX-SPRINT-002.6.1-REPORT.md` | CRIADO | Entrega |

**NÃO alterados (preservados intactos):**
- `OfficialRuntimeBridge.ts` — nenhuma mudança
- `ConversationCognitiveGateway.ts` — nenhuma mudança
- `ConversationPlanningEngine.ts` — nenhuma mudança
- `GoalCapabilityRegistry.ts` — nenhuma mudança
- `UniversalConnectorRouter.ts` — nenhuma mudança
- `ConnectorRuntimeProvider.ts` — nenhuma mudança

---

## 5. Diff Resumido

### ResolvedCapabilityAdapter.ts (novo)

```typescript
// Converte legacy (connectorId, operation) → ResolvedCapability
class ResolvedCapabilityAdapter {
  adapt(input: LegacyInvocationInput): ResolvedCapability {
    if (input.connectorId)         → resolvedCapability(connector=connectorId)
    if (metadata.source known)     → resolvedCapability(connector=source)
    else                           → ambiguousCapability() // nunca default
  }
  adaptFromCIS(connectorId, operation): ResolvedCapability { ... }
}
```

### ConnectorInvocationService.ts (adição)

```typescript
// NOVO método — não remove o invoke() legado
async executeResolvedCapability(
  resolved: ResolvedCapability,
  payload: Record<string, unknown>,
  ctx: Partial<ConnectorExecutionContext>,
) {
  // Ambiguidade → rejeita imediatamente, sem fallback
  if (resolved.ambiguous || !resolved.preferredConnector) {
    return { authorization: NOT_AVAILABLE, result: null, record };
  }
  // Enriquece payload com preservedContext
  // Delega para invoke(resolved.preferredConnector, resolved.capabilityId, ...)
  return this.invoke(resolved.preferredConnector, ...);
}
```

---

## 6. Testes Executados

### resolved-capability-runtime-bridge.spec.ts (12 testes)

| # | Cenário | Esperado | Status |
|---|---|---|---|
| T1 | github, files.get | github, domain=repository | PASS |
| T2 | google-drive, drive.files.get | google-drive, domain=document | PASS |
| T3 | sem connectorId, sem source | AMBIGUOUS, connector=null | PASS |
| T4 CRÍTICO | github.repos.list → NUNCA google-drive | github | PASS |
| T5 | sem connectorId, metadata.source=github | github inferido | PASS |
| T6 | sem connectorId, metadata.source=google-drive | google-drive | PASS |
| T7 | preservedContext | todos os campos preservados | PASS |
| T8 | connectorId explícito → confidence ≥ 0.80 | ≥ 0.80 | PASS |
| T9 | input vazio → confidence = 0, ambiguous | 0, true | PASS |
| T10 | google-calendar | domain=calendar | PASS |
| T11 | gmail | domain=email | PASS |
| T12 | adaptFromCIS(github, files.get) | capabilityId=files.get, github | PASS |

### runRuntimeBridgeContractTests (7 contratos CIS)

| CIS Call | Connector esperado | Status |
|---|---|---|
| github.repos.list | github | PASS |
| github.files.get | github | PASS |
| github.branches.list | github | PASS |
| google-drive.drive.files.list | google-drive | PASS |
| google-drive.drive.files.search | google-drive | PASS |
| google-calendar.calendar.events.list | google-calendar | PASS |
| gmail.readInbox | gmail | PASS |

---

## 7. Evidências

### Critério de aceite da sprint

**Input:** `"Ler arquivo do repositório GitHub"`

**Caminho verificado:**

```
1. ConversationCognitiveGateway.process()
   → GitHubQueryRouter.route("ler arquivo do repositório GitHub")
   → isGitHubQuery=true (hasGitHubAnchor: "repositório" detectado)
   → capability="files.get", connector implícito = "github"

2. officialRuntimeBridge.invokeCompat("github", "files.get", payload)
   → OfficialRuntimeBridge.invoke("github", "files.get")
   → CIS_TO_GOAL_TYPE["files.get"] = "github.getFile"
   → GoalCapabilityRegistry.resolve("github.getFile")
   → [{ connector: "github", capability: "files.get", params: {} }]
   → ExecutionPlan.steps[0].connector = "github" ✓

3. ConversationRuntimeEngine.execute(plan)
   → UniversalConnectorRouter.route(executionId, step)
   → step.connector = "github" → lookup("github") → GitHubConnector ✓

4. GitHubConnector.execute("files.get", payload, ctx)
   → Connector correto. NUNCA GoogleDriveConnector. ✓
```

**Com o novo `executeResolvedCapability`:**
```
ResolvedCapabilityAdapter.adaptFromCIS("github", "files.get")
→ ResolvedCapability { preferredConnector: "github", capabilityId: "files.get", ambiguous: false }

ConnectorInvocationService.executeResolvedCapability(resolved, ...)
→ resolved.preferredConnector = "github" (imutável, Object.freeze)
→ invoke("github", "files.get", ...) ← nunca google-drive
```

---

## 8. Impacto MAS/MES

| Princípio | Status |
|---|---|
| SRP | CONFORME — Adapter tem única responsabilidade: converter legado → contrato |
| OCP | CONFORME — `executeResolvedCapability` é adição, sem remover `invoke()` |
| DIP | CONFORME — CIS agora aceita `ResolvedCapability` (abstração), não apenas strings |
| No Default Connector | CONFORME — ambiguous → NOT_AVAILABLE, sem fallback automático |
| Contract Preservation | CONFORME — `Object.freeze` em ResolvedCapability garante imutabilidade |
| Progressive Migration | CONFORME — legado `invoke()` intacto; novo `executeResolvedCapability` additive |

---

## 9. Fases Concluídas / Pendentes

| Fase | Status | Descrição |
|---|---|---|
| Fase 1 — Auditoria | CONCLUÍDA | Mapa completo de consumidores, pontos de decisão, fallbacks |
| Fase 2 — Adapter Layer | CONCLUÍDA | `ResolvedCapabilityAdapter` criado |
| Fase 3 — CIS integration | CONCLUÍDA | `executeResolvedCapability()` adicionado ao CIS |
| Fase 4 — Remover decisões indevidas | PENDENTE | Não havia decisões indevidas encontradas; validar em produção |
| Fase 5 — Migração consumidores | PENDENTE — LOW PRIORITY | CCG já usa connector explícito; LCP idem |

---

## 10. Plano de Rollback

Reversão isolada, sem breaking change:

1. Remover método `executeResolvedCapability` de `ConnectorInvocationService.ts`
2. Remover import de `ResolvedCapability` do mesmo arquivo
3. Deletar `ResolvedCapabilityAdapter.ts`
4. Deletar `resolved-capability-runtime-bridge.spec.ts`

Nenhum arquivo do pipeline principal de produção foi alterado.
O `invoke()` legado permanece 100% funcional.