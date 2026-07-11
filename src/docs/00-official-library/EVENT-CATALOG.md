# EVENT-CATALOG.md
# MemoryOS — Catálogo Oficial de Eventos
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

> Todos os eventos são versionados. Mudança de payload requer nova versão de evento.
> Consumidores devem ser tolerantes a campos extras (forward-compat).

---

## Convenção de Nomenclatura

```
{domínio}.{entidade}.{ação}.v{N}
Exemplos:
  goal.created.v1
  memory.stored.v1
  capability.executed.v1
```

---

## Domínio: Goal

### goal.created.v1

| Campo | Valor |
|---|---|
| **Nome** | `goal.created.v1` |
| **Versão** | 1 |
| **Producer** | Goal Runtime (EF-01/EF-24) |
| **Consumer** | Goal Registry Service (EF-02), Goal Scheduler (EF-03) |
| **Criticidade** | HIGH |
| **Retry** | 3x exponential backoff (100ms base) |
| **Idempotência** | Sim — `goalId` como chave de deduplicação |
| **Ordering** | Por `createdAt` |
| **Dead Letter Policy** | DLQ após 3 falhas; alerta manual |
| **Observabilidade** | correlationId obrigatório |

```typescript
interface GoalCreatedV1 {
  eventId: string
  eventType: "goal.created.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    goalId: string
    type: string
    priority: number
    metadata: Record<string, unknown>
    createdBy: string
  }
}
```

---

### goal.status_changed.v1

| Campo | Valor |
|---|---|
| **Nome** | `goal.status_changed.v1` |
| **Versão** | 1 |
| **Producer** | Goal Runtime (EF-01) |
| **Consumer** | Execution Dispatcher (EF-05), Conversation Engine (EF-21) |
| **Criticidade** | HIGH |
| **Retry** | 3x |
| **Idempotência** | Sim — `goalId + newStatus` |
| **Ordering** | Por `goalId` (preservar sequência de transições) |
| **Dead Letter Policy** | DLQ após 3 falhas |

```typescript
interface GoalStatusChangedV1 {
  eventId: string
  eventType: "goal.status_changed.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    goalId: string
    previousStatus: string
    newStatus: string
    reason?: string
    changedBy: string
  }
}
```

---

### goal.completed.v1

| Campo | Valor |
|---|---|
| **Nome** | `goal.completed.v1` |
| **Versão** | 1 |
| **Producer** | Goal Runtime (EF-01) |
| **Consumer** | Self Evaluation Engine (EF-09), Knowledge Engine (EF-10) |
| **Criticidade** | CRITICAL |
| **Retry** | 5x |
| **Idempotência** | Sim — `goalId + completedAt` |
| **Dead Letter Policy** | DLQ + alerta crítico |

```typescript
interface GoalCompletedV1 {
  eventId: string
  eventType: "goal.completed.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    goalId: string
    executionPlanId: string
    reflectionId: string
    durationMs: number
    outcome: "success"|"partial"|"failure"
  }
}
```

---

## Domínio: Decision

### decision.made.v1

| Campo | Valor |
|---|---|
| **Nome** | `decision.made.v1` |
| **Versão** | 1 |
| **Producer** | Decision Engine (EF-06) |
| **Consumer** | Planning Engine (EF-07) |
| **Criticidade** | HIGH |
| **Retry** | 2x |
| **Idempotência** | Sim — `decisionId` |

```typescript
interface DecisionMadeV1 {
  eventId: string
  eventType: "decision.made.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    decisionId: string
    goalId: string
    selectedCandidateId: string
    confidence: number
    risk: "low"|"medium"|"high"
    evaluatedCount: number
  }
}
```

---

## Domínio: Planning

### plan.created.v1

| Campo | Valor |
|---|---|
| **Nome** | `plan.created.v1` |
| **Versão** | 1 |
| **Producer** | Planning Engine (EF-07) |
| **Consumer** | Capability Runtime (EF-15), Reflection Engine (EF-08) |
| **Criticidade** | HIGH |
| **Retry** | 2x |
| **Idempotência** | Sim — `planId` |

```typescript
interface PlanCreatedV1 {
  eventId: string
  eventType: "plan.created.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    planId: string
    goalId: string
    decisionId: string
    stepCount: number
    complexity: "simple"|"moderate"|"complex"
    estimatedMs: number
    risk: "low"|"medium"|"high"
  }
}
```

---

## Domínio: Capability

### capability.registered.v1

| Campo | Valor |
|---|---|
| **Nome** | `capability.registered.v1` |
| **Versão** | 1 |
| **Producer** | Capability Registry (EF-14) |
| **Consumer** | Decision Engine (EF-06), Capability Runtime (EF-15) |
| **Criticidade** | MEDIUM |
| **Retry** | 1x |
| **Idempotência** | Sim — `capabilityId + version` |

```typescript
interface CapabilityRegisteredV1 {
  eventId: string
  eventType: "capability.registered.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    capabilityId: string
    capabilityVersion: string
    name: string
    owner: string
    idempotent: boolean
    sideEffects: string[]
  }
}
```

---

### capability.executed.v1

| Campo | Valor |
|---|---|
| **Nome** | `capability.executed.v1` |
| **Versão** | 1 |
| **Producer** | Capability Runtime (EF-15) |
| **Consumer** | Reflection Engine (EF-08), Audit Log |
| **Criticidade** | HIGH |
| **Retry** | 0 (já executou — não retentar automaticamente) |
| **Idempotência** | N/A — evento de fato passado |
| **Dead Letter Policy** | Arquivar com alerta |

```typescript
interface CapabilityExecutedV1 {
  eventId: string
  eventType: "capability.executed.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    capabilityId: string
    executionId: string
    planId: string
    stepId: string
    durationMs: number
    status: "SUCCESS"|"FAILED"|"TIMEOUT"
    outputSummary: string
    errorCode?: string
  }
}
```

---

### capability.failed.v1

| Campo | Valor |
|---|---|
| **Nome** | `capability.failed.v1` |
| **Versão** | 1 |
| **Producer** | Capability Runtime (EF-15) |
| **Consumer** | Reflection Engine (EF-08), Audit Log, Alert System |
| **Criticidade** | CRITICAL |
| **Retry** | Policy declarada no manifest da Capability |
| **Dead Letter Policy** | DLQ + alerta imediato |

```typescript
interface CapabilityFailedV1 {
  eventId: string
  eventType: "capability.failed.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    capabilityId: string
    executionId: string
    planId: string
    errorCode: string
    errorMessage: string
    attemptNumber: number
    willRetry: boolean
  }
}
```

---

## Domínio: Reflection

### reflection.completed.v1

| Campo | Valor |
|---|---|
| **Nome** | `reflection.completed.v1` |
| **Versão** | 1 |
| **Producer** | Reflection Engine (EF-08) |
| **Consumer** | Self Evaluation Engine (EF-09), Conversation Engine (EF-21) |
| **Criticidade** | HIGH |
| **Retry** | 2x |
| **Idempotência** | Sim — `reflectionId` |

```typescript
interface ReflectionCompletedV1 {
  eventId: string
  eventType: "reflection.completed.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    reflectionId: string
    planId: string
    verdict: "APPROVED"|"REJECTED"|"INCONCLUSIVE"
    confidence: number
    risk: "low"|"medium"|"high"
    suggestionCount: number
  }
}
```

---

## Domínio: Knowledge

### knowledge.extracted.v1

| Campo | Valor |
|---|---|
| **Nome** | `knowledge.extracted.v1` |
| **Versão** | 1 |
| **Producer** | Knowledge Engine (EF-10) |
| **Consumer** | Learning Engine (EF-11) |
| **Criticidade** | MEDIUM |
| **Retry** | 3x |
| **Idempotência** | Sim — `knowledgeId` |
| **Ordering** | Não requerido |

```typescript
interface KnowledgeExtractedV1 {
  eventId: string
  eventType: "knowledge.extracted.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    knowledgeId: string
    sourceEvaluationId: string
    type: string
    importance: string
    confidence: number
    tagCount: number
  }
}
```

---

## Domínio: Memory

### memory.stored.v1

| Campo | Valor |
|---|---|
| **Nome** | `memory.stored.v1` |
| **Versão** | 1 |
| **Producer** | Memory Engine (EF-12) |
| **Consumer** | Retrieval Engine (EF-13), Audit Log |
| **Criticidade** | HIGH |
| **Retry** | 3x |
| **Idempotência** | Sim — `memoryId` |
| **Ordering** | Por `createdAt` |
| **Dead Letter Policy** | DLQ — memory loss é crítico |

```typescript
interface MemoryStoredV1 {
  eventId: string
  eventType: "memory.stored.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    memoryId: string
    sourceLearningId: string
    memoryType: string
    memoryScore: number
    importance: string
  }
}
```

---

### memory.rejected.v1

| Campo | Valor |
|---|---|
| **Nome** | `memory.rejected.v1` |
| **Versão** | 1 |
| **Producer** | Memory Engine (EF-12) |
| **Consumer** | Audit Log, Metrics |
| **Criticidade** | LOW |
| **Retry** | 0 — rejeição é decisão, não falha |

```typescript
interface MemoryRejectedV1 {
  eventId: string
  eventType: "memory.rejected.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    learningId: string
    rejectionReason: "SCORE_BELOW_THRESHOLD"|"INVALID_LEARNING"|"GATE_FAILED"
    learningScore: number
    threshold: number
  }
}
```

---

## Domínio: Retrieval

### retrieval.completed.v1

| Campo | Valor |
|---|---|
| **Nome** | `retrieval.completed.v1` |
| **Versão** | 1 |
| **Producer** | Retrieval Engine (EF-13) |
| **Consumer** | Context Engine (EF-20) |
| **Criticidade** | MEDIUM |
| **Retry** | 2x |
| **Ordering** | Não requerido |

```typescript
interface RetrievalCompletedV1 {
  eventId: string
  eventType: "retrieval.completed.v1"
  version: 1
  correlationId: string
  timestamp: string
  payload: {
    queryId: string
    memoryCount: number
    searchDurationMs: number
    topScore: number
  }
}
```

---

## Política Geral de Eventos

| Política | Regra |
|---|---|
| **Schema Evolution** | Adicionar campos opcionais é non-breaking. Remover ou renomear requer nova versão. |
| **Correlação** | Todo evento carrega `correlationId` rastreável ao `conversationId` ou `goalId` de origem. |
| **Timestamp** | ISO8601 UTC. |
| **Deduplicação** | Consumidores devem ser idempotentes para eventos com `idempotência: true`. |
| **Tamanho** | Payload máximo: 64KB. Conteúdo maior → referência por ID. |
| **Ordering** | Eventos sem ordering explícito podem chegar fora de ordem. Consumidores devem tolerar. |

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- OFFICIAL-CONTRACTS.md
- DOMAIN-MODEL.md
- OFFICIAL-DEPENDENCY-GRAPH.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*