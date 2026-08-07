# GOAL-SCHEMA.md
# MemoryOS — Schema Oficial de Goal
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## Schema Completo

```typescript
interface Goal {
  // ── Identidade (imutável após criação) ──────────────────────────────
  id: string                              // UUID v4, gerado pelo Goal Runtime
  type: string                            // ex: "conversation", "task_extraction", "document_analysis"
  createdAt: string                       // ISO8601 UTC, imutável
  createdBy: string                       // userId ou "system"
  version: number                         // schema version, ex: 1

  // ── Status e Ciclo de Vida ───────────────────────────────────────────
  status: GoalStatus                      // PENDING | ACTIVE | COMPLETED | FAILED | CANCELLED
  updatedAt: string                       // ISO8601 UTC, atualizado a cada mutação
  activatedAt?: string                    // quando foi ativado
  completedAt?: string                    // quando foi completado/falhou/cancelado
  expiresAt?: string                      // TTL — null = sem expiração

  // ── Prioridade ──────────────────────────────────────────────────────
  priority: number                        // 1-100 (maior = mais prioritário)
  priorityClass: "critical"|"high"|"normal"|"low"
  urgency: "immediate"|"scheduled"|"background"

  // ── Metadata ────────────────────────────────────────────────────────
  metadata: GoalMetadata

  // ── Owner e Contexto ────────────────────────────────────────────────
  owner: GoalOwner
  context: GoalContext

  // ── Dependências ────────────────────────────────────────────────────
  parentGoalId?: string                   // Goal pai (hierarquia)
  dependsOnGoalIds: string[]              // Goals que devem completar antes

  // ── Execution Policy ────────────────────────────────────────────────
  executionPolicy: ExecutionPolicy

  // ── Retry Policy ────────────────────────────────────────────────────
  retryPolicy: RetryPolicy

  // ── Permissões ──────────────────────────────────────────────────────
  permissions: GoalPermissions

  // ── Rastreabilidade ─────────────────────────────────────────────────
  correlationId: string                   // rastreabilidade end-to-end
  sessionId?: string                      // sessão de origem
  projectId?: string                      // espaço de trabalho
}

type GoalStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED"
```

---

## GoalMetadata

```typescript
interface GoalMetadata {
  title: string                           // descrição legível (max 200 chars)
  description?: string                    // detalhe opcional
  tags: string[]                          // classificação livre (max 20 tags)
  source: "user_message"|"document"|"system"|"scheduler"
  inputSummary?: string                   // resumo do input que originou o Goal
  customFields: Record<string, string|number|boolean>  // campos livres do caller
}
```

---

## GoalOwner

```typescript
interface GoalOwner {
  userId: string                          // dono do Goal
  projectId?: string                      // escopo de projeto
  sessionId?: string                      // escopo de sessão
  delegatedTo?: string                    // módulo executor atual
}
```

---

## GoalContext

```typescript
interface GoalContext {
  messageContent?: string                 // mensagem de usuário (se origin = user_message)
  documentId?: string                     // documento relacionado
  previousGoalId?: string                 // Goal anterior na sequência
  intent?: string                         // intent detectada (output de EF-22)
  queryTypes?: string[]                   // tipos de query (output de EF-22)
  searchKeywords?: string[]               // palavras-chave (output de EF-22)
}
```

---

## ExecutionPolicy

```typescript
interface ExecutionPolicy {
  path: "A"|"B"                           // PATH A (interativo) ou PATH B (background)
  maxDurationMs: number                   // timeout total da execução
  allowParallelSteps: boolean             // permite steps paralelos no plano
  requireReflection: boolean              // obriga passar por EF-08
  requireSelfEvaluation: boolean          // obriga passar por EF-09
  capabilityConstraints?: string[]        // lista de capabilityIds permitidos
  connectorConstraints?: string[]         // lista de connectorIds permitidos
}
```

---

## RetryPolicy

```typescript
interface RetryPolicy {
  maxAttempts: number                     // 0 = sem retry
  strategy: "none"|"linear"|"exponential"|"fixed"
  delayMs: number                         // delay base em ms
  maxDelayMs: number                      // cap do delay (para exponential)
  retryOn: GoalStatus[]                   // estados que trigam retry (geralmente ["FAILED"])
  resetStatusTo: GoalStatus               // status após retry (geralmente "PENDING")
}
```

---

## GoalPermissions

```typescript
interface GoalPermissions {
  canRead: string[]                       // roles/userIds que podem ler
  canCancel: string[]                     // roles/userIds que podem cancelar
  canReprioritize: string[]               // roles/userIds que podem mudar prioridade
  requiresApproval: boolean               // requer aprovação humana antes de ACTIVE
  approvers?: string[]                    // lista de aprovadores (se requiresApproval)
}
```

---

## Validation Rules

| Campo | Regra |
|---|---|
| `id` | UUID v4, único no sistema |
| `type` | string non-empty, max 100 chars, lowercase com hífens |
| `priority` | número inteiro 1-100 |
| `status` | deve ser um dos valores GoalStatus válidos |
| `metadata.title` | non-empty, max 200 chars |
| `metadata.tags` | máximo 20 tags, cada tag max 50 chars |
| `executionPolicy.path` | "A" ou "B" |
| `executionPolicy.maxDurationMs` | > 0, <= 3600000 (1h) |
| `retryPolicy.maxAttempts` | >= 0, <= 10 |
| `retryPolicy.delayMs` | >= 0, <= 60000 |
| `correlationId` | UUID v4, obrigatório |
| `createdAt` | ISO8601 UTC, não pode ser futuro |
| `expiresAt` | ISO8601 UTC, deve ser futuro em relação a createdAt |
| `dependsOnGoalIds` | máximo 10 dependências diretas |

---

## Imutabilidade por Campo

| Campo | Imutável? | Quando pode mudar |
|---|---|---|
| `id` | ✅ Sim | Nunca |
| `type` | ✅ Sim | Nunca |
| `createdAt` | ✅ Sim | Nunca |
| `createdBy` | ✅ Sim | Nunca |
| `correlationId` | ✅ Sim | Nunca |
| `status` | ❌ Mutável | Via transições explícitas da máquina de estados |
| `priority` | ❌ Mutável | Somente por usuários com permissão canReprioritize |
| `metadata` | ❌ Mutável | Com auditoria e incremento de versão |
| `updatedAt` | ❌ Mutável | Automaticamente a cada mutação |
| `activatedAt` | ❌ Mutável | Somente na transição PENDING → ACTIVE |
| `completedAt` | ❌ Mutável | Somente em estados terminais |

---

## Exemplos de Goal por Tipo

### Tipo: conversation (PATH A)

```json
{
  "id": "goal-abc123",
  "type": "conversation",
  "priority": 80,
  "priorityClass": "high",
  "urgency": "immediate",
  "status": "PENDING",
  "executionPolicy": { "path": "A", "maxDurationMs": 5000, "requireReflection": true },
  "retryPolicy": { "maxAttempts": 0, "strategy": "none" },
  "metadata": { "title": "Responder consulta sobre projetos", "tags": ["conversational"] },
  "correlationId": "corr-xyz789"
}
```

### Tipo: batch_knowledge (PATH B)

```json
{
  "id": "goal-def456",
  "type": "batch_knowledge",
  "priority": 30,
  "priorityClass": "low",
  "urgency": "background",
  "status": "PENDING",
  "executionPolicy": { "path": "B", "maxDurationMs": 60000, "requireReflection": false },
  "retryPolicy": { "maxAttempts": 3, "strategy": "exponential", "delayMs": 1000, "maxDelayMs": 10000 },
  "metadata": { "title": "Processar batch de 10 mensagens", "tags": ["batch", "knowledge"] },
  "correlationId": "corr-batch001"
}
```

---

## Versionamento de Schema

| Versão | Mudança | Compatibilidade |
|---|---|---|
| 1.0 | Criação — SPR-GOV-01 | — |

Mudanças de schema de Goal requerem ADR aprovada. Campos novos opcionais são non-breaking (minor). Remoção ou rename de campos é breaking (major).

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- DOMAIN-MODEL.md
- OFFICIAL-CONTRACTS.md — EF-01, EF-24
- STATE-MACHINES.md — Goal State Machine

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*