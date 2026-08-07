# OFFICIAL-DEPENDENCY-GRAPH.md
# MemoryOS — Grafo Oficial de Dependências
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## Diagrama ASCII — Pipeline Completo

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                        MEMORYOS DEPENDENCY GRAPH v2.0                         ║
╚══════════════════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────────┐
                              │   USUÁRIO / CLIENT   │
                              └──────────┬──────────┘
                                         │ message
                                         ▼
                              ┌─────────────────────┐
                              │  Conversation Engine │◄── Session, ChatHistory
                              │      EF-21           │
                              │   [Reserved]         │
                              └──────────┬──────────┘
                                         │ ConversationInput
                          ┌──────────────┼──────────────┐
                          │              │              │
                          ▼              ▼              ▼
               ┌──────────────┐  ┌────────────┐  ┌──────────────┐
               │ Intent Layer │  │ Goal Runtime│  │Context Engine│
               │   EF-22      │  │  EF-24      │  │  EF-20       │
               │ [Reserved]   │  │ [Pending]   │  │ [Reserved]   │
               └──────┬───────┘  └──────┬──────┘  └──────┬───────┘
                      │                 │                 │
               IntentResult         Goal              Context
                      │                 │                 │
                      └────────────────►│◄────────────────┘
                                        ▼
                              ┌─────────────────────┐
                              │   Decision Engine    │◄── CapabilityRegistry (EF-14)
                              │       EF-06          │
                              │   [Official·Frozen]  │
                              └──────────┬──────────┘
                                         │ ExecutionDecision
                                         ▼
                              ┌─────────────────────┐
                              │   Planning Engine    │
                              │       EF-07          │
                              │   [Official·Frozen]  │
                              └──────────┬──────────┘
                                         │ ExecutionPlan
                          ┌──────────────┼──────────────┐
                          │                             │
                          ▼                             ▼
               ┌──────────────────┐         ┌─────────────────────┐
               │Capability Runtime│         │ Specialist Layer     │
               │     EF-15        │         │     EF-25            │
               │[Pending Cert.]   │         │   [Reserved]         │
               └──────┬───────────┘         └──────────────────────┘
                      │                              │
                      │◄── CapabilityRegistry(EF-14)│
                      │◄── ConnectorRuntime(EF-16+) │
                      │                              │
                      └──────────────┬───────────────┘
                                     │ ExecutionResult
                                     ▼
                              ┌─────────────────────┐
                              │   LLM Gateway        │
                              │       EF-23           │
                              │   [Reserved]         │
                              └──────────┬──────────┘
                                         │ LLMResponse
                                         ▼
                              ┌─────────────────────┐
                              │  Reflection Engine   │◄── ExecutionPlan (EF-07)
                              │       EF-08           │
                              │   [Official·Frozen]  │
                              └──────────┬──────────┘
                                         │ ReflectionResult
                                         ▼
                              ┌─────────────────────┐
                              │Self Evaluation Engine│
                              │       EF-09           │
                              │   [Official·Frozen]  │
                              └──────────┬──────────┘
                                         │ (PATH B branches here)
                          ┌──────────────┼──────────────┐
                          │ PATH A       │               │ PATH B
                          ▼              │               ▼
                    [Response to user]   │    ┌─────────────────────┐
                                         │    │  Goal Scheduler      │
                                         │    │       EF-03           │
                                         │    │   [Official·Frozen]  │
                                         │    └──────────┬──────────┘
                                         │               │
                                         │               ▼
                                         │    ┌─────────────────────┐
                                         │    │Execution Dispatcher  │
                                         │    │       EF-05           │
                                         │    │   [Official·Frozen]  │
                                         │    └──────────┬──────────┘
                                         │               │
                                         │               ▼
                                         │    ┌─────────────────────┐
                                         │    │ Goal Execution Queue │
                                         │    │       EF-04           │
                                         │    │   [Official·Frozen]  │
                                         │    └──────────┬──────────┘
                                         │               │
                                         │               ▼
                                         │    ┌─────────────────────┐
                                         │    │  Knowledge Engine    │◄── SelfEvaluation (EF-09)
                                         │    │       EF-10           │
                                         │    │   [Official·Frozen]  │
                                         │    └──────────┬──────────┘
                                         │               │ Knowledge[]
                                         │               ▼
                                         │    ┌─────────────────────┐
                                         │    │   Learning Engine    │
                                         │    │       EF-11           │
                                         │    │   [Official·Frozen]  │
                                         │    └──────────┬──────────┘
                                         │               │ Learning[]
                                         │               ▼
                                         │    ┌─────────────────────┐
                                         │    │   Memory Engine      │◄── Learning (EF-11)
                                         │    │       EF-12           │
                                         │    │  Canonical: memory-  │
                                         │    │   engine-v1/         │
                                         │    │   [Official·Frozen]  │
                                         │    └──────────┬──────────┘
                                         │               │ Memory[]
                                         │               ▼
                                         │    ┌─────────────────────┐
                                         │    │  Goal Registry Svc   │
                                         │    │       EF-02           │
                                         │    │   [Official·Frozen]  │
                                         │    └─────────────────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │  Retrieval Engine    │◄── Memory Store
                              │       EF-13           │
                              │   [Official·Frozen]  │
                              └──────────┬──────────┘
                                         │ (feeds back to Context Engine EF-20)
                                         ▼
                                   [Context Engine EF-20]
```

---

## EF-01 — Goal Runtime v0.1

| Campo | Valor |
|---|---|
| **Depends On** | EF-02 (Goal Registry Service) |
| **Consumes** | GoalInput (type, priority, metadata) |
| **Produces** | Goal (id, status, lifecycle) |
| **Owner** | Goal Runtime Module |
| **Input** | `GoalInput { type: string, priority: number, metadata: Record<string,unknown> }` |
| **Output** | `Goal { id, type, priority, status, metadata, createdAt, updatedAt }` |
| **Responsibility** | Criar e gerenciar ciclo de vida de Goals. Único ponto de criação de Goals no sistema. |
| **Side Effects** | Persiste Goal via EF-02 |
| **Failure Modes** | InvalidGoalInput, GoalRegistrationFailed, RegistryUnavailable |

---

## EF-02 — Goal Registry Service v1.0

| Campo | Valor |
|---|---|
| **Depends On** | Nenhum (leaf node) |
| **Consumes** | Goal objects |
| **Produces** | RegistrationResult, Goal (leitura) |
| **Owner** | Goal Registry Module |
| **Input** | `Goal` object completo |
| **Output** | `RegistrationResult { success, goalId, timestamp }` |
| **Responsibility** | Persistência e indexação de Goals. Única fonte de verdade de Goals armazenados. |
| **Side Effects** | Escreve em storage (entidades Base44) |
| **Failure Modes** | DuplicateGoalId, StorageUnavailable, ValidationFailed |

---

## EF-03 — Goal Scheduler v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-01 (Goal Runtime), EF-02 (Goal Registry) |
| **Consumes** | Goal, ScheduleOptions |
| **Produces** | ScheduledGoal |
| **Owner** | Goal Scheduler Module |
| **Input** | `Goal + ScheduleOptions { runAt?, interval?, priority }` |
| **Output** | `ScheduledGoal { goalId, scheduledAt, status }` |
| **Responsibility** | Agendar Goals para execução futura. **PATH B ONLY** — proibido em PATH A interativo. |
| **Side Effects** | Registra schedule em estado interno |
| **Failure Modes** | InvalidScheduleTime, GoalNotFound, ScheduleConflict |

---

## EF-04 — Goal Execution Queue v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-03 (Goal Scheduler), EF-05 (Execution Dispatcher) |
| **Consumes** | Goal (via Dispatcher) |
| **Produces** | ExecutionQueueEntry |
| **Owner** | Goal Execution Queue Module |
| **Input** | `Goal` despacha pelo Dispatcher |
| **Output** | `ExecutionQueueEntry { queueId, goalId, priority, enqueueTime, status, attempts }` |
| **Responsibility** | Ordenar Goals por prioridade para execução. Ordering: Priority DESC → enqueueTime ASC. **PATH B ONLY.** |
| **Side Effects** | Mantém fila ordenada em memória |
| **Failure Modes** | QueueFull, DuplicateEnqueue, DequeueOnEmpty |

---

## EF-05 — Execution Dispatcher v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-03 (Goal Scheduler), EF-04 (Goal Execution Queue) |
| **Consumes** | ScheduledGoal (do Scheduler) |
| **Produces** | DispatchResult |
| **Owner** | Execution Dispatcher Module |
| **Input** | `ScheduledGoal` com status READY |
| **Output** | `DispatchResult { goalId, dispatched, timestamp, queueId }` |
| **Responsibility** | Mover Goals do Scheduler para a Queue. Orquestrador entre Scheduler e Queue. **PATH B ONLY.** |
| **Side Effects** | Escreve na Queue (EF-04), atualiza Scheduler (EF-03) |
| **Failure Modes** | QueueUnavailable, SchedulerUnavailable, DispatchTimeout |

---

## EF-06 — Decision Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-14 (Capability Registry), EF-01 (Goal Runtime) |
| **Consumes** | Goal, Context, Candidates[] |
| **Produces** | ExecutionDecision |
| **Owner** | Decision Engine Module |
| **Input** | `DecisionInput { goal, context, candidates }` |
| **Output** | `ExecutionDecision { selectedCandidate, confidence, risk, reasoning }` |
| **Responsibility** | Avaliar candidatos e selecionar estratégia de execução. Árbitro central de decisão. |
| **Side Effects** | Nenhum (módulo puro) |
| **Failure Modes** | NoCandidatesAvailable, InsufficientContext, LowConfidence |

---

## EF-07 — Planning Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-06 (Decision Engine) |
| **Consumes** | ExecutionDecision |
| **Produces** | ExecutionPlan (imutável) |
| **Owner** | Planning Engine Module |
| **Input** | `ExecutionDecision` |
| **Output** | `ExecutionPlan { id, goalId, steps[], complexity, estimatedMs, risk, status }` |
| **Responsibility** | Transformar decisão em plano de execução imutável com steps, complexidade e estimativas. |
| **Side Effects** | Nenhum (módulo puro) |
| **Failure Modes** | InvalidDecision, PlanningTimeout, ComplexityOverflow |

---

## EF-08 — Reflection Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-07 (Planning Engine), EF-09 (Self Evaluation) |
| **Consumes** | ExecutionResult, ExecutionPlan, rawResponse |
| **Produces** | ReflectionResult |
| **Owner** | Reflection Engine Module |
| **Input** | `ReflectionInput { rawResponse, plan, executionResult }` |
| **Output** | `ReflectionResult { verdict, confidence, risk, cleanedResponse, evaluation, suggestions }` |
| **Responsibility** | Avaliar resultado de execução contra plano. Incorpora etapa SYNTHESIS (síntese da resposta). |
| **Side Effects** | Nenhum (módulo puro) |
| **Failure Modes** | InvalidPlanReference, ReflectionTimeout, VerdictInconclusive |

---

## EF-09 — Self Evaluation Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-08 (Reflection Engine) |
| **Consumes** | CompletedExecution |
| **Produces** | SelfEvaluation |
| **Owner** | Self Evaluation Engine Module |
| **Input** | `CompletedExecution { executionId, plan, reflection, result }` |
| **Output** | `SelfEvaluation { id, qualityScore, reliabilityScore, performanceScore, overallScore, verdict }` |
| **Responsibility** | Score de qualidade, confiabilidade e performance de execuções completadas. |
| **Side Effects** | Nenhum (módulo puro) |
| **Failure Modes** | InvalidExecution, ScoringFailed |

---

## EF-10 — Knowledge Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-09 (Self Evaluation Engine) |
| **Consumes** | SelfEvaluation[] |
| **Produces** | Knowledge[] |
| **Owner** | Knowledge Engine Module |
| **Input** | `SelfEvaluation[]` com overallScore >= threshold |
| **Output** | `Knowledge[] { id, type, content, importance, confidence, tags }` |
| **Responsibility** | Filtrar SelfEvaluations aprovadas e transformar em Knowledge estruturado. Quality Gate de Knowledge. |
| **Side Effects** | Nenhum (módulo puro) |
| **Failure Modes** | NoApprovedEvaluations, ExtractionFailed, LowQualityInput |

---

## EF-11 — Learning Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-10 (Knowledge Engine) |
| **Consumes** | Knowledge[] |
| **Produces** | Learning[] (imutável) |
| **Owner** | Learning Engine Module |
| **Input** | `Knowledge[]` |
| **Output** | `Learning[] { id, sourceKnowledgeId, pattern, strength, applications }` |
| **Responsibility** | Transformar Knowledge em Learning imutável com padrões extraídos. |
| **Side Effects** | Nenhum (módulo puro) |
| **Failure Modes** | WeakKnowledge, PatternExtractionFailed |

---

## EF-12 — Memory Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-11 (Learning Engine) |
| **Consumes** | Learning[] |
| **Produces** | Memory[] (imutável, Object.freeze) |
| **Owner** | Memory Engine Module · Canonical: `src/lib/memory-engine-v1/` |
| **Input** | `Learning[]` com learningScore >= 70 |
| **Output** | `Memory[] { id, type, content, importance, confidence, tags, sourceLearningId }` |
| **Responsibility** | Transformar Learnings aprovados em Memory imutável. Memory Gate (score 70+). Mirror Principle. |
| **Side Effects** | Persiste Memory em entidades Base44 |
| **Failure Modes** | MemoryGateRejected, StorageFailed, InvalidLearning |

---

## EF-13 — Retrieval Engine v1.0

| Campo | Valor |
|---|---|
| **Depends On** | EF-12 (Memory Engine) — leitura de Memory store |
| **Consumes** | RetrievalQuery |
| **Produces** | RetrievalResult |
| **Owner** | Retrieval Engine Module |
| **Input** | `RetrievalQuery { keywords, types?, limit?, minConfidence? }` |
| **Output** | `RetrievalResult { memories[], totalFound, searchDurationMs }` |
| **Responsibility** | Recuperação semântica de memórias. Único ponto de acesso a Memory para fins cognitivos. |
| **Side Effects** | Nenhum (read-only) |
| **Failure Modes** | NoMemoriesFound, SearchTimeout, QueryParsingFailed |

---

## EF-14 — Capability Registry v1.0

| Campo | Valor |
|---|---|
| **Depends On** | Nenhum (leaf node) |
| **Consumes** | CapabilityDefinition |
| **Produces** | CapabilityDefinition (leitura/discovery) |
| **Owner** | Capability Registry Module · Canonical: `src/lib/capability-registry/` |
| **Input** | `CapabilityDefinition { id, name, description, version, inputSchema, outputSchema }` |
| **Output** | `CapabilityDefinition[]` (listagem/discovery) |
| **Responsibility** | Índice central de Capabilities. Único canonical após INT-04. Discovery determinístico de Capabilities. |
| **Side Effects** | Mantém índice em memória |
| **Failure Modes** | DuplicateCapabilityId, InvalidManifest, RegistryCorrupted |

---

## Matriz de Dependências

```
         EF-01 EF-02 EF-03 EF-04 EF-05 EF-06 EF-07 EF-08 EF-09 EF-10 EF-11 EF-12 EF-13 EF-14
EF-01      —     W     .     .     .     .     .     .     .     .     .     .     .     .
EF-02      .     —     .     .     .     .     .     .     .     .     .     .     .     .
EF-03      R     R     —     .     .     .     .     .     .     .     .     .     .     .
EF-04      .     .     R     —     W     .     .     .     .     .     .     .     .     .
EF-05      .     .     RW    W     —     .     .     .     .     .     .     .     .     .
EF-06      R     .     .     .     .     —     .     .     .     .     .     .     .     R
EF-07      .     .     .     .     .     R     —     .     .     .     .     .     .     .
EF-08      .     .     .     .     .     .     R     —     .     .     .     .     .     .
EF-09      .     .     .     .     .     .     .     R     —     .     .     .     .     .
EF-10      .     .     .     .     .     .     .     .     R     —     .     .     .     .
EF-11      .     .     .     .     .     .     .     .     .     R     —     .     .     .
EF-12      .     .     .     .     .     .     .     .     .     .     R     —     .     .
EF-13      .     .     .     .     .     .     .     .     .     .     .     R     —     .
EF-14      .     .     .     .     .     R     .     .     .     .     .     .     .     —

R = reads/consumes  W = writes/produces  RW = both  . = no dependency
```

**Verificação:** Grafo é acíclico (DAG). Nenhuma dependência circular.

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- OFFICIAL-CONTRACTS.md
- MEMORYOS-ARCHITECTURE-v2.0.md
- UPDATED-TARGET-ARCHITECTURE.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*