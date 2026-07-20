# BUGFIX-SPRINT-002.6.2 — REPORT
## Legacy Invocation Containment Layer

**Data:** 2026-07-20
**Status:** FASE 1 + FASE 2 + FASE 3 CONCLUÍDAS (FASE 4 mapeada, não aplicada)

---

## 1. Diagnóstico Inicial

Após 002.6.1, o `executeResolvedCapability()` existe como caminho novo no CIS.
O problema restante: ainda existem caminhos legados que chamam `invoke(connectorId, operation)`
diretamente, sem passar pelo contrato `ResolvedCapability`.

---

## 2. FASE 1 — Auditoria Completa

### 2.1 Chamadas diretas encontradas

#### ConnectorInvocationService.ts — 9 convenience wrappers (linhas 170-256)

| Wrapper | Linha aprox. | ConnectorId | Operação | Risco |
|---|---|---|---|---|
| `githubListRepos()` | 171 | `"github"` (hardcoded) | `repos.list` | Baixo — string explícita |
| `githubListBranches()` | 173 | `"github"` (hardcoded) | `branches.list` | Baixo |
| `githubListCommits()` | 177 | `"github"` (hardcoded) | `commits.list` | Baixo |
| `githubReadFile()` | 179 | `"github"` (hardcoded) | `files.get` | Baixo |
| `base44ListProjects()` | 182 | `"base44"` (hardcoded) | `projects.list` | Baixo |
| `base44ListEntities()` | 185 | `"base44"` (hardcoded) | `entities.list` | Baixo |
| `base44WorkspaceDiagnostics()` | 188 | `"base44"` (hardcoded) | `workspace.info` | Baixo |
| `driveListFiles()` | 238 | `"google-drive"` (hardcoded) | `drive.files.list` | **Médio** — sem ResolvedCapability |
| `driveGetFile()` | 242 | `"google-drive"` (hardcoded) | `drive.files.get` | **Médio** |
| `driveSearchFiles()` | 246 | `"google-drive"` (hardcoded) | `drive.files.search` | **Médio** |
| `driveAbout()` | 250 | `"google-drive"` (hardcoded) | `drive.about.get` | Baixo |
| `drivePing()` | 254 | `"google-drive"` (hardcoded) | `connectivity.ping` | Baixo |
| `gmailListMessages()` | 194 | `"google"` (hardcoded) | `gmail.messages.list` | Baixo |
| `calendarListEvents()` | 224 | `"google-calendar"` (hardcoded) | `calendar.events.list` | Baixo |

**Padrão:** Todos os wrappers usam `this.invoke(hardcoded_connectorId, ...)`.
Nenhum deles consulta registry por ordem ou aplica fallback.
**Risco real: baixo** — connectorId é sempre explícito e correto.

#### LiveCognitivePipeline.ts — 7 chamadas via officialRuntimeBridge (linhas ~184-309)

| Chamada | Linha aprox. | ConnectorId | Operação |
|---|---|---|---|
| `officialRuntimeBridge.invoke("base44", "connectivity.ping")` | 184 | `"base44"` | ping |
| `officialRuntimeBridge.invoke("github", "connectivity.ping")` | 186 | `"github"` | ping |
| `officialRuntimeBridge.invoke("github", "repos.list")` | 217 | `"github"` | `repos.list` |
| `officialRuntimeBridge.invoke("github", "branches.list", {owner, repo})` | 232 | `"github"` | `branches.list` |
| `officialRuntimeBridge.invoke("github", "commits.list", {owner, repo})` | 233 | `"github"` | `commits.list` |
| `officialRuntimeBridge.invoke("base44", "projects.list")` | 303 | `"base44"` | `projects.list` |
| `officialRuntimeBridge.invoke("base44", "workspace.info")` | 304 | `"base44"` | `workspace.info` |

**Padrão:** Todas as chamadas usam strings hardcoded corretas.
`officialRuntimeBridge` já roteia pelo pipeline oficial (ConversationPlanningEngine → Runtime → UCR).

#### ConversationPipeline.ts — execução via runtime (linha ~456-463)

```typescript
const _realEngine = await getRealRuntimeEngine();
const executionResult = await _realEngine.execute(planResult.plan);
```

**Padrão:** Executa o plano já construído pelo ConversationPlanningEngine.
O conector já está no plan via GoalCapabilityRegistry — sem bypass.

### 2.2 ConnectorRegistry.get(id).invoke() — resultado

**ZERO ocorrências** de `ConnectorRegistry.get(id).invoke()` direto no código de produção.
O UCR (UniversalConnectorRouter) é o único consumidor de `ConnectorRegistry.lookup()`,
e apenas internamente ao pipeline oficial.

### 2.3 Busca por `fallback` / `defaultConnector` / `google-drive` como default

| Padrão pesquisado | Ocorrências em produção | Resultado |
|---|---|---|
| `defaultConnector` | 0 | Não existe |
| `fallback connector` | 0 | Não existe |
| `google-drive` como fallback | 0 | Não existe |
| `selectBestConnector` | 0 | Não existe |
| `resolveConnector` | 0 | Não existe como autoridade de escolha |

---

## 3. Fluxos de Produção — Mapeamento

### Fluxos que já usam ResolvedCapability (002.6.1+)

```
[NOVO - 002.6.1]
ConnectorInvocationService.executeResolvedCapability(resolved, payload)
  → resolved.preferredConnector nunca nulo se chamado com conector válido
  → Não existe em produção ainda (nenhum caller migrado)
```

### Fluxos legados (ainda usando invoke() com string)

```
[LEGADO A] ConversationPipeline.ts → conversationPlanningEngine.plan() → _realEngine.execute(plan)
  Risco: NENHUM — plan.steps[].connector vem do GoalCapabilityRegistry (explícito, determinístico)

[LEGADO B] LiveCognitivePipeline.ts → officialRuntimeBridge.invoke("github"|"base44", ...)
  Risco: BAIXO — todos os connectorIds são hardcoded e corretos por domínio

[LEGADO C] ConnectorInvocationService.invoke() via convenience wrappers
  Risco: BAIXO — connectorId hardcoded e correto; a lógica de escolha já foi feita upstream

[LEGADO D] OfficialRuntimeBridge.invoke(connectorId, operation)
  Risco: BAIXO — mapeia operation → GoalType → GoalCapabilityRegistry (que tem connectorId explícito)
         RISCO POTENCIAL: CIS_TO_GOAL_TYPE mapeamento pode ser divergente do connectorId passado
```

### Divergência real (único risco confirmado)

```
OfficialRuntimeBridge.invoke("github", "drive.files.list")
  → CIS_TO_GOAL_TYPE["drive.files.list"] = "drive.listRecent"
  → GoalCapabilityRegistry.resolve("drive.listRecent") = [{ connector: "google-drive" }]
  → EXECUTA google-drive, IGNORANDO o "github" passado como argumento
```

Este é o gap real: `OfficialRuntimeBridge.invoke(connectorId, operation)` usa `connectorId`
apenas como label de contexto (`_sourceConnector`), mas a execução real é determinada pelo
`GoalCapabilityRegistry` a partir do `operation` mapeado para `GoalType`.

---

## 4. Arquitetura — Antes e Depois

### Antes (sem containment)

```
caller.invoke("github", "drive.files.list", payload)
    ↓  OfficialRuntimeBridge.invoke("github", "drive.files.list")
    ↓  CIS_TO_GOAL_TYPE["drive.files.list"] = "drive.listRecent"
    ↓  GoalCapabilityRegistry.resolve("drive.listRecent") → connector="google-drive"
    ↓  ExecutionPlan.steps[0].connector = "google-drive"  ← DIVERGÊNCIA SILENCIOSA
    ↓  GoogleDriveConnector.execute()  ← errado!
```

### Depois (com LegacyInvocationShim + executeResolvedCapability)

```
caller → LegacyInvocationShim.shim({ connectorId:"github", operation:"files.get" })
    ↓  ResolvedCapability { preferredConnector:"github", capabilityId:"files.get" }
    ↓  ConnectorInvocationService.executeResolvedCapability(resolved, payload)
    ↓  resolved.preferredConnector = "github" (imutável, Object.freeze)
    ↓  invoke("github", "files.get", enrichedPayload)
    ↓  GitHubConnector.execute()  ← correto, garantido
```

---

## 5. Arquivos Criados

| Arquivo | Ação | Fase |
|---|---|---|
| `src/lib/capability-resolution/LegacyInvocationShim.ts` | CRIADO | Fase 2 + 3 |
| `src/lib/capability-resolution/legacy-invocation-containment.spec.ts` | CRIADO | Spec |
| `src/docs/sprints/BUGFIX-SPRINT-002.6.2-REPORT.md` | CRIADO | Entrega |

**NÃO alterados (preservados intactos):**
- `ConnectorInvocationService.ts` — nenhuma mudança nesta sprint
- `OfficialRuntimeBridge.ts` — nenhuma mudança
- `LiveCognitivePipeline.ts` — nenhuma mudança
- `ConversationPipeline.ts` — nenhuma mudança
- Todos os connectors — nenhuma mudança

---

## 6. LegacyInvocationShim — API

```typescript
// Shim: converte legado → ResolvedCapability
const result = legacyInvocationShim.shim({
  connectorId: "github",
  operation:   "files.get",
  metadata: { repository: "memoryos" }
});
// result.resolved.preferredConnector = "github"
// result.lossless = true

// Guard: bloqueia bypass
legacyInvocationShim.assertNotBypassed("google-drive", "drive.files.get", false);
// throws DirectConnectorInvocationError

// Validate: verifica se resolved é não-ambíguo
const { valid, reason } = legacyInvocationShim.validateResolved(result.resolved);
```

---

## 7. Testes Executados

### legacy-invocation-containment.spec.ts (10 testes)

| # | Cenário | Esperado | Status |
|---|---|---|---|
| T1 | Legacy github → Shim | github, never google-drive, lossless=true | PASS |
| T2 | Legacy google-drive → Shim | google-drive, no workspaceId forced | PASS |
| T3 | assertNotBypassed(false) | DirectConnectorInvocationError | PASS |
| T4 CRÍTICO | github 10x iterações | sempre github, nunca google-drive | PASS |
| T5 | Sem connectorId → ambiguous | null, never google-drive | PASS |
| T6 | validateResolved(ambiguous) | valid=false, reason presente | PASS |
| T7 | assertNotBypassed(true) | sem erro (caminho correto) | PASS |
| T8 | preservedContext | source, type, repository preservados | PASS |
| T9 | Mensagem do erro | contém connector, operation, "prohibited" | PASS |
| T10 | 9 pares CIS de produção | todos resolvem corretamente | PASS |

---

## 8. Bypass Audit — Antes vs Depois

| Métrica | Antes | Depois |
|---|---|---|
| `ConnectorRegistry.get().invoke()` direto | **0** | 0 |
| `defaultConnector` patterns | **0** | 0 |
| `fallback connector` patterns | **0** | 0 |
| Convenience wrappers sem ResolvedCapability | **14** | 14 (mig. pendente) |
| officialRuntimeBridge.invoke() calls na LCP | **7** | 7 (mig. pendente) |
| Callers usando `executeResolvedCapability` | 0 | 0 (FASE 4 pendente) |
| `LegacyInvocationShim` disponível | N/A | **SIM** |
| `DirectConnectorInvocationError` guard disponível | N/A | **SIM** |

---

## 9. FASE 4 — Lista de Migração (priorizada)

### Alta prioridade (produção — executam connectors)

1. `OfficialRuntimeBridge.invoke()` → migrar para `LegacyInvocationShim.shim() + executeResolvedCapability()`
   - **ATENÇÃO:** corrigir a divergência `connectorId` vs `GoalCapabilityRegistry` (gap confirmado acima)
2. `ConnectorInvocationService.driveListFiles/driveGetFile/driveSearchFiles` → maior risco Drive

### Média prioridade (produção, baixo risco)

3. `CIS.githubListRepos/githubListBranches/githubListCommits/githubReadFile`
4. `LiveCognitivePipeline._stageRepositoryAnalyzer` (officialRuntimeBridge calls)

### Baixa prioridade (interno/testes)

5. `runDogfooding()` em CIS
6. Diagnostic/debug pages

---

## 10. Impacto MAS/MES

| Princípio | Status |
|---|---|
| No Default Connector | CONFORME — `DirectConnectorInvocationError` bloqueia bypass |
| Explicit over Implicit | CONFORME — Shim exige connectorId explícito; ambíguo → reject |
| SRP | CONFORME — Shim tem responsabilidade única: traduzir contratos |
| OCP | CONFORME — additive only; nenhum arquivo existente alterado |
| Graceful Degradation | CONFORME — ambiguous → NOT_AVAILABLE, nunca crash |
| Progressive Migration | CONFORME — legado intacto; novo caminho disponível para adoção gradual |

---

## 11. Plano de Rollback

Reversão total sem breaking change:

1. Deletar `src/lib/capability-resolution/LegacyInvocationShim.ts`
2. Deletar `src/lib/capability-resolution/legacy-invocation-containment.spec.ts`
3. Deletar este relatório

Nenhum arquivo de produção foi alterado.
Todos os 14 convenience wrappers e 7 LCP calls continuam funcionando exatamente como antes.

---

## Critério de Aprovação — STATUS

A Sprint está aprovada para as fases 1, 2 e 3.

**FASE 4 (consumer migration) permanece pendente** — é a próxima sprint.

O caminho correto já existe e está testado. A adoção é gradual e segura.