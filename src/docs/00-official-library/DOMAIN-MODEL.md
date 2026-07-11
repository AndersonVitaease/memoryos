# DOMAIN-MODEL.md
# MemoryOS — Domain Model Oficial
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## Goal

**Responsabilidade:** Representar uma intenção de execução com ciclo de vida rastreável.
**Ownership:** Goal Runtime (EF-01/EF-24) — criação exclusiva. Goal Registry (EF-02) — persistência.
**Imutabilidade:** Campos `id`, `type`, `createdAt` são imutáveis após criação. `status` e `metadata` são mutáveis com auditoria.
**Lifecycle:** `PENDING → ACTIVE → COMPLETED | FAILED | CANCELLED`

```typescript
interface Goal {
  id: string                              // UUID v4, imutável
  type: string                            // ex: "conversation", "task", "analysis"
  priority: number                        // 1-100, maior = mais prioritário
  status: "PENDING"|"ACTIVE"|"COMPLETED"|"FAILED"|"CANCELLED"
  metadata: Record<string, unknown>       // dados livres, versionados
  createdAt: string                       // ISO8601, imutável
  updatedAt: string                       // ISO8601, atualizado a cada mutação
  createdBy: string                       // userId ou systemId
  version: number                         // incrementa a cada mutação de status
  parentGoalId?: string                   // Goal pai (composição)
  expiresAt?: string                      // TTL opcional
}
```

**Relacionamentos:**
- `Goal` → `ExecutionDecision` (1:1 por execução)
- `Goal` → `ExecutionPlan` (1:1 por execução)
- `Goal` → `Goal` (hierarquia via parentGoalId)
- `Goal` → `GoalRegistryEntry` (1:1)

---

## ExecutionDecision

**Responsabilidade:** Representar a decisão tomada pelo Decision Engine sobre como executar um Goal.
**Ownership:** Decision Engine (EF-06) — criação e ownership exclusivos.
**Imutabilidade:** Completamente imutável após produção. Supersedido por nova decisão, nunca modificado.
**Lifecycle:** Criado → consumido por Planning Engine → arquivado.

```typescript
interface ExecutionDecision {
  id: string
  goalId: string
  selectedCandidate: Candidate            // capability ou estratégia selecionada
  confidence: number                      // 0.0-1.0
  risk: "low"|"medium"|"high"
  reasoning: string                       // justificativa legível
  evaluatedCandidates: EvaluationResult[] // todos os candidatos avaliados
  decidedAt: string
  decisionVersion: string                 // versão do Decision Engine
}
```

**Relacionamentos:**
- `ExecutionDecision` ← `Goal` (1:1)
- `ExecutionDecision` → `ExecutionPlan` (1:1)

---

## ExecutionPlan

**Responsabilidade:** Representar o plano de execução estruturado produzido pelo Planning Engine.
**Ownership:** Planning Engine (EF-07) — criação exclusiva. `ExecutionPlan` ≠ objeto `plan` legacy do produto.
**Imutabilidade:** Completamente imutável após produção (Object.freeze). Nenhum módulo altera steps ou estimativas.
**Lifecycle:** `pending → active → completed | failed`

```typescript
interface ExecutionPlan {
  id: string
  goalId: string
  decisionId: string
  steps: PlanStep[]                       // lista ordenada de steps
  complexity: "simple"|"moderate"|"complex"
  estimatedMs: number                     // estimativa total em ms
  risk: "low"|"medium"|"high"
  status: "pending"|"active"|"completed"|"failed"
  createdAt: string                       // imutável
  completedAt?: string
  planVersion: string                     // versão do Planning Engine
}

interface PlanStep {
  id: string
  stepNumber: number
  type: string                            // ex: "capability", "connector", "llm"
  capabilityId?: string
  input: Record<string, unknown>
  estimatedMs: number
  required: boolean
  rollbackable: boolean
}
```

**Relacionamentos:**
- `ExecutionPlan` ← `ExecutionDecision` (1:1)
- `ExecutionPlan` → `ReflectionResult` (1:1)
- `ExecutionPlan.steps[]` → `Capability` (N:M via capabilityId)

---

## Capability

**Responsabilidade:** Unidade atômica de comportamento que o sistema pode executar.
**Ownership:** Capability Registry (EF-14) — registro. Capability Runtime (EF-15) — execução.
**Imutabilidade:** `id` e `version` são imutáveis. Novas versões criam novas entradas no Registry.
**Lifecycle:** `registered → active | deprecated`

```typescript
interface Capability {
  id: string                              // ex: "read-document-v1"
  name: string
  description: string
  version: string                         // semver
  status: "registered"|"active"|"deprecated"
  manifest: CapabilityManifest            // spec completa
  registeredAt: string
  deprecatedAt?: string
}
```

**Relacionamentos:**
- `Capability` → `CapabilityManifest` (1:1)
- `Capability` ← `ExecutionPlan.steps[]` (N:M)
- `Capability` → `ConnectorManifest` (N:M via requiredConnectors)

---

## CapabilityManifest

**Responsabilidade:** Especificação completa de uma Capability. Contrato formal entre Registry e Runtime.
**Ownership:** Declarado pelo autor da Capability. Validado pelo Registry.
**Imutabilidade:** Imutável por versão. Mudanças requerem nova versão.
**Lifecycle:** `draft → validated → active | deprecated`

```typescript
interface CapabilityManifest {
  id: string
  version: string
  owner: string
  name: string
  description: string
  inputSchema: JSONSchema
  outputSchema: JSONSchema
  permissions: string[]
  requiredConnectors: string[]
  requiredMemories: string[]
  requiredContext: string[]
  timeoutMs: number
  retryPolicy: RetryPolicy
  rollbackPolicy: RollbackPolicy
  cost: CapabilityCost
  latency: LatencySpec
  healthChecks: HealthCheckSpec[]
  telemetry: TelemetrySpec
  idempotent: boolean
  sideEffects: string[]
}
```

---

## ConnectorManifest

**Responsabilidade:** Especificação de um Connector externo.
**Ownership:** Connector Runtime. Declarado pelo desenvolvedor do Connector.
**Imutabilidade:** Imutável por versão.

```typescript
interface ConnectorManifest {
  id: string
  version: string
  name: string
  description: string
  authType: "oauth2"|"apikey"|"basic"|"none"
  scopes: string[]
  permissions: string[]
  rateLimits: RateLimitSpec
  timeoutMs: number
  retryPolicy: RetryPolicy
  supportedActions: ConnectorAction[]
  webhooks: WebhookSpec[]
  healthCheck: HealthCheckSpec
  telemetry: TelemetrySpec
  failureModes: FailureMode[]
}
```

---

## Knowledge

**Responsabilidade:** Conhecimento estruturado extraído de execuções avaliadas.
**Ownership:** Knowledge Engine (EF-10) — criação exclusiva.
**Imutabilidade:** Imutável após criação. Invalidação via flag `supersededById`.
**Lifecycle:** `active → archived | superseded`

```typescript
interface Knowledge {
  id: string
  sourceEvaluationId: string
  type: "fact"|"pattern"|"decision"|"preference"|"rule"|"anti_pattern"|"observation"
  content: string
  importance: "critical"|"high"|"medium"|"low"
  confidence: number                      // 0.0-1.0
  tags: string[]
  evidence: string[]                      // trechos que suportam o conhecimento
  createdAt: string
  supersededById?: string
  knowledgeVersion: string
}
```

**Relacionamentos:**
- `Knowledge` ← `SelfEvaluation` (N:1)
- `Knowledge` → `Learning` (1:1)

---

## Learning

**Responsabilidade:** Padrão aprendido derivado de Knowledge aprovado.
**Ownership:** Learning Engine (EF-11) — criação exclusiva.
**Imutabilidade:** Imutável após criação. `learningScore` nunca alterado.
**Lifecycle:** `ACTIVE → ARCHIVED | SUPERSEDED`

```typescript
interface Learning {
  id: string
  sourceKnowledgeId: string
  learningType: string                    // espelha Knowledge.type
  pattern: string
  strength: number                        // 0-100
  learningScore: number                   // 0-100 (threshold para Memory Gate: 70)
  applications: string[]
  insights: string[]
  patterns: string[]
  recommendations: string[]
  importance: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"
  confidence: number
  status: "ACTIVE"|"ARCHIVED"|"SUPERSEDED"
  createdAt: string
}
```

**Relacionamentos:**
- `Learning` ← `Knowledge` (1:1)
- `Learning` → `Memory` (1:1 se learningScore >= 70)

---

## Memory

**Responsabilidade:** Memória permanente e imutável do sistema.
**Ownership:** Memory Engine (EF-12) — criação exclusiva. Nenhum módulo altera Memory.
**Imutabilidade:** TOTAL. Object.freeze() em runtime. Sem update endpoint.
**Lifecycle:** `ACTIVE → REJECTED (na criação) | ARCHIVED (explícito)`

```typescript
interface Memory {
  readonly id: string
  readonly sourceLearningId: string
  readonly memoryType: string             // mirror de Learning.learningType
  readonly memoryScore: number            // mirror de Learning.learningScore
  readonly importance: string             // mirror de Learning.importance
  readonly confidence: number             // mirror de Learning.confidence
  readonly evidence: {
    readonly insights: string[]
    readonly patterns: string[]
    readonly recommendations: string[]
  }
  readonly tags: string[]
  readonly status: "ACTIVE"|"ARCHIVED"
  readonly createdAt: string
  readonly memoryVersion: string
  readonly pipelineIntegrity: string      // hash de rastreabilidade
  // Forward-compat (empty in v1.0):
  readonly memoryFingerprint: null
  readonly memoryEmbedding: null
  readonly memoryVector: null
  readonly memoryCluster: null
}
```

**Relacionamentos:**
- `Memory` ← `Learning` (1:1)
- `Memory` → consumida por `Retrieval Engine` (EF-13)

---

## Conversation

**Responsabilidade:** Agrupamento lógico de sessões de chat relacionadas.
**Ownership:** Conversation Engine (EF-21) — gerenciamento.
**Lifecycle:** `active → historical → archived`

```typescript
interface Conversation {
  id: string
  userId: string
  projectId?: string
  title: string
  status: "active"|"historical"|"archived"
  summary?: string
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}
```

---

## Session (ChatSession)

**Responsabilidade:** Sessão de chat individual com histórico de mensagens.
**Ownership:** Conversation Engine (EF-21).
**Lifecycle:** `active → historical → archived`

```typescript
interface Session {
  id: string
  conversationId?: string
  projectId?: string
  title: string
  summary?: string
  messageCount: number
  lastMessageAt: string
  status: "active"|"historical"|"archived"
  createdAt: string
  updatedAt: string
}
```

---

## Message

**Responsabilidade:** Unidade atômica de comunicação em uma sessão.
**Ownership:** Conversation Engine (EF-21).
**Imutabilidade:** Imutável após criação.

```typescript
interface Message {
  id: string
  sessionId: string
  projectId?: string
  role: "user"|"assistant"
  content: string
  memoryTier: "active"|"historical"|"archived"
  sourcesUsed: string[]                   // IDs de Memory/Knowledge usados
  createdAt: string
}
```

---

## Document

**Responsabilidade:** Conteúdo externo ingerido na memória do sistema.
**Ownership:** Knowledge Ingestion Pipeline.

```typescript
interface Document {
  id: string
  name: string
  fileType: string
  sourceType: "file"|"link"|"text"
  fileUrl?: string
  originalUrl?: string
  extractedText?: string
  summary?: string
  category?: string
  processingStatus: "pending"|"processing"|"completed"|"failed"
  tags: string[]
  sessionId?: string
  projectId?: string
}
```

---

## Decision (Base44 entity)

**Responsabilidade:** Decisão registrada pelo usuário ou detectada pelo sistema durante conversas.
**Ownership:** Conversation Processing (legacy → EF-10 futuro).

```typescript
interface DecisionEntity {
  id: string
  sessionId?: string
  projectId?: string
  title: string
  description?: string
  rationale?: string
  decidedDate?: string
}
```

*Nota: Não confundir com `ExecutionDecision` (EF-06). São entidades distintas.*

---

## Task

**Responsabilidade:** Tarefa identificada em conversas.
**Ownership:** Conversation Processing.

```typescript
interface Task {
  id: string
  sessionId?: string
  projectId?: string
  title: string
  description?: string
  status: "pending"|"in_progress"|"done"
  dueDate?: string
  assignee?: string
}
```

---

## Topic

**Responsabilidade:** Assunto/tema identificado em conversas.
**Ownership:** Conversation Processing.

```typescript
interface Topic {
  id: string
  sessionId?: string
  projectId?: string
  name: string
  description?: string
  status: "active"|"historical"|"archived"
}
```

---

## Keyword

**Responsabilidade:** Palavra-chave extraída de documentos ou mensagens para indexação.
**Ownership:** Knowledge Ingestion Pipeline.

```typescript
interface Keyword {
  id: string
  keyword: string
  sourceType: "document"|"message"
  documentId?: string
  messageId?: string
  sessionId?: string
  projectId?: string
}
```

---

## ReflectionResult

**Responsabilidade:** Resultado da avaliação da execução pelo Reflection Engine.
**Ownership:** Reflection Engine (EF-08).
**Imutabilidade:** Imutável após produção.

```typescript
interface ReflectionResult {
  id: string
  planId: string
  verdict: "APPROVED"|"REJECTED"|"INCONCLUSIVE"
  confidence: number
  risk: "low"|"medium"|"high"
  cleanedResponse: string
  evaluation: string
  suggestions: string[]
  reflectedAt: string
}
```

---

## SelfEvaluation

**Responsabilidade:** Score de qualidade de uma execução completa.
**Ownership:** Self Evaluation Engine (EF-09).
**Imutabilidade:** Imutável após produção.

```typescript
interface SelfEvaluation {
  id: string
  executionId: string
  qualityScore: number                    // 0-100
  reliabilityScore: number                // 0-100
  performanceScore: number                // 0-100
  overallScore: number                    // média ponderada
  verdict: "APPROVED"|"REJECTED"|"INCONCLUSIVE"
  notes: string[]
  evaluatedAt: string
}
```

---

## Diagrama de Relacionamentos

```
User ──────────────────────────────────┐
                                       │
Conversation ◄──────────── Session ◄──┤
                               │       │
                            Message ◄──┘
                               │
                          [processamento]
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
           Goal           Document           Knowledge
             │                                    │
    ExecutionDecision                          Learning
             │                                    │
      ExecutionPlan                            Memory
             │                                    │
      [Execution]                    [Retrieval Engine → Context]
             │
      ReflectionResult
             │
      SelfEvaluation ──────────────────────► Knowledge
```

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- OFFICIAL-CONTRACTS.md
- MEMORYOS-ARCHITECTURE-v2.0.md
- base44/entities/*.jsonc

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*