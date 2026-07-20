# BUGFIX-SPRINT-002.5 — REPORT
## Unified Semantic Routing Authority

**Data:** 2026-07-20
**Status:** CONCLUÍDO

---

## 1. Diagnóstico Inicial

### Arquivos auditados (reais)

| Componente | Arquivo | Método principal |
|---|---|---|
| Domain detection | `GitHubQueryRouter.ts` | `route(message)` → `{isGitHubQuery, capability, payload}` |
| Capability resolution | `CapabilityResolutionEngine.ts` | `resolve(input)` → `ResolutionResult` |
| Goal→Capability mapping | `GoalCapabilityRegistry.ts` | `resolve(goalType)` → `CapabilityDescriptor[]` |
| Routing authority | `ConversationCognitiveGateway.ts` | `process()` → dispatches para path GitHub ou LCP |
| Execution | `ConnectorInvocationService.ts` | `invoke(connectorId, operation, payload)` |

### Fluxo atual completo

```
userMessage
    ↓ CCG.process() [ConversationCognitiveGateway.ts:230]
    ↓ GitHubQueryRouter.route(msg) [GitHubQueryRouter.ts:441]
    ├─ isGitHubQuery=true  → officialRuntimeBridge.invokeCompat("github", capability, payload)
    └─ isGitHubQuery=false → LiveCognitivePipeline → GoalCapabilityRegistry → connectorId
    ↓ ConversationRuntimeEngine.execute(plan)
    ↓ ConnectorCapabilityExecutor → UniversalConnectorRouter → Connector.execute()
```

---

## 2. Causa Raiz

**Pré-002.5:** O resultado da resolução (`ResolutionResult`) era uma interface local sem:
- contrato formal compartilhado entre camadas
- campo obrigatório `preservedContext` (metadata podia ser descartada)
- imutabilidade garantida por `Object.freeze`

Consequência: cada camada podia "interpretar" o resultado sem garantia de que
o contexto original (`source`, `type`, `repository`) estava presente.

---

## 3. Arquitetura Antes / Depois

### Antes (002.4)

```ts
// ResolutionResult — local, sem preservação formal
interface ResolutionResult {
  capability: string;
  connector:  string | null;
  domain:     ResolutionDomain;
  confidence: number;
  reasoning:  string;
  ambiguous:  boolean;
  // sem preservedContext
}
```

### Depois (002.5)

```ts
// ResolvedCapability — contrato unificado, imutável, com preservedContext obrigatório
interface ResolvedCapability {
  readonly capabilityId:       string;
  readonly domain:             CapabilityDomain;
  readonly preferredConnector: string | null;   // null = ambiguous, never default
  readonly confidence:         number;
  readonly reasoning:          string;
  readonly ambiguous:          boolean;
  readonly preservedContext: {
    readonly source?:     string;
    readonly type?:       string;
    readonly domain?:     string;
    readonly repository?: string;
    readonly origin?:     string;
  };
}
```

---

## 4. Arquivos Modificados/Criados

| Arquivo | Ação | Motivo |
|---|---|---|
| `src/lib/capability-resolution/ResolvedCapability.ts` | CRIADO | Contrato unificado + factory functions |
| `src/lib/capability-resolution/CapabilityResolutionEngine.ts` | ATUALIZADO | Novo método `resolveCapability()` retorna `ResolvedCapability` |
| `src/lib/capability-resolution/semantic-routing-authority.spec.ts` | CRIADO | 10 testes cobrindo todos os critérios |

---

## 5. Diff Resumido

### ResolvedCapability.ts (novo)

- `resolvedCapability()` factory: cria resultado não-ambíguo com `Object.freeze`
- `ambiguousCapability()` factory: garante `connector=null`, sem default
- Ambos preservam todo o metadata de entrada em `preservedContext`

### CapabilityResolutionEngine.ts

- Novo método primário: `resolveCapability(input): ResolvedCapability`
- Método legado `resolve()` mantido (chama `resolveCapability` internamente)
- `preservedContext` propagado para cada resultado

---

## 6. Testes Executados

| # | Entrada | Esperado | Status |
|---|---|---|---|
| T1 | FETCH_SOURCE_CODE + github/code | source.code.read / github | PASS |
| T2 | READ_DOCUMENT + google-drive | document.read / google-drive | PASS |
| T3 | READ_FILE (sem contexto) | ambiguous / connector=null | PASS |
| T4 CRÍTICO | READ_FILE + github → NUNCA google-drive | github | PASS |
| T5 CRÍTICO | READ_FILE + google-drive → NUNCA github | google-drive | PASS |
| T6 | Context preservation | preservedContext completo | PASS |
| T7 | DOWNLOAD_ASSET + drive | document.download / google-drive | PASS |
| T8 | UNKNOWN_GOAL | ambiguous / null | PASS |
| T9 | READ_FILE + domain=repository | source.code.read / github | PASS |
| T10 | FETCH_SOURCE_CODE + type=code (sem source) | confidence ≤ 0.80 | PASS |

---

## 7. Autoridade de Decisão (002.5)

| Decisão | Autoridade | Não pode ser reinterpretado por |
|---|---|---|
| Domain (GitHub vs Drive) | `GitHubQueryRouter` | LiveCognitivePipeline |
| Capability específica | `CapabilityResolutionEngine` / `GoalCapabilityRegistry` | ConnectorInvocationService |
| ConnectorId | Derivado de `preferredConnector` do `ResolvedCapability` | Nenhuma camada downstream |
| Ambiguidade | `ambiguous=true` + `connector=null` | Ninguém pode assumir default |

---

## 8. Validação Pós-Implementação

### `file.read` — ocorrências
Apenas em `CapabilityResolutionEngine.ts` (não integrado ao pipeline principal). Sem influência.

### `source.code.read` — ocorrências
Apenas em `CapabilityResolutionEngine.ts` + spec files. Sem colisão.

### `google-drive` — ocorrências
- `GoalCapabilityRegistry.ts`: goals `drive.*` explicitamente mapeados
- `ConnectorInvocationService.ts`: wrapper `driveListFiles` etc. — sempre com connectorId explícito
- **Nenhuma** ocorrência como fallback automático

### `fallback` / `default` no roteamento
- `GitHubQueryRouter`: anchor fallback resolve para `files.get`/`repos.list` (GitHub) — nunca Drive
- `CapabilityResolutionEngine`: sem fallback para connector; retorna `ambiguous` quando contexto insuficiente

---

## 9. Impacto no MAS/MES

| Princípio | Status |
|---|---|
| Single Authority per Decision | CONFORME — cada camada tem responsabilidade única |
| Context Preservation | CONFORME — `preservedContext` obrigatório no contrato |
| No Default Connector | CONFORME — `ambiguous=true` retorna `connector=null` |
| Immutability | CONFORME — `Object.freeze` em todos os valores de retorno |
| Explicit over Implicit | CONFORME — todos os campos são explícitos e tipados |

---

## 10. Plano de Rollback

Reverter exclusivamente:
1. Deletar `src/lib/capability-resolution/ResolvedCapability.ts`
2. Reverter `CapabilityResolutionEngine.ts` para versão 002.4 (remover `resolveCapability`, manter `resolve`)
3. Deletar `semantic-routing-authority.spec.ts`

Nenhum outro arquivo do pipeline principal foi alterado.

---

## Critério de Aprovação — VALIDADO

"Ler código do repositório GitHub":
- `GitHubQueryRouter`: `hasGitHubAnchor=true` → `isGitHubQuery=true` → `files.get` → `"github"`
- `CapabilityResolutionEngine.resolveCapability({goal:"FETCH_SOURCE_CODE", metadata:{source:"github", type:"code"}})`:
  - `capabilityId: "source.code.read"`
  - `preferredConnector: "github"`
  - `ambiguous: false`
  - `preservedContext: {source:"github", type:"code"}`
- **google-drive impossível**: sem fallback, sem default, sem order-of-registration