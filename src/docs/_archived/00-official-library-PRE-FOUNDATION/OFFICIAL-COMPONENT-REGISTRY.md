# OFFICIAL-COMPONENT-REGISTRY.md
# MemoryOS — Registro Oficial de Componentes
**Sprint SPR-FREEZE-01 · Engineering First**
Date: 2026-07-11
Version: 2.0
Status: OFFICIAL · FROZEN

---

## Legenda de Status

| Status | Significado |
|---|---|
| **Official** | Módulo EF certificado, contrato congelado, ativo |
| **Frozen** | Oficial + contratos imutáveis sem nova ADR |
| **Pending** | Oficial mas aguarda ação específica (auditoria, promoção) |
| **Reserved** | Posição reservada no pipeline; implementação futura |
| **Legacy** | Funcional no produto mas será substituído |
| **Deprecated** | Substituto disponível; não deve receber novos desenvolvimentos |
| **Experimental** | Scaffolding ou POC; não certificado |

---

## Seção 1 — Módulos EF Oficiais (Certified)

### EF-01 · Goal Runtime v0.1

| Campo | Valor |
|---|---|
| **Status** | Official · Pending (promoção v1.0 via EF-24) |
| **Localização** | `src/lib/goal-runtime-v01/` |
| **Cenários** | 21 (padrão EF: 28) |
| **ADR associada** | ADR-002 (Proposed) |
| **Responsabilidade** | Criação e gerenciamento do ciclo de vida de Goals |
| **Canonical?** | SIM — único Goal Runtime EF |
| **Bloqueio** | Promoção para v1.0 antes de INT-03 |

---

### EF-02 · Goal Registry Service v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/goal-registry-service/` |
| **Cenários** | 22 |
| **Responsabilidade** | Persistência e indexação de Goals |
| **Canonical?** | SIM |
| **Pendência editorial** | GoalRegistryServiceTypes.ts separado (NB-01) |

---

### EF-03 · Goal Scheduler v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/goal-scheduler/` |
| **Cenários** | 22 |
| **Responsabilidade** | Agendamento temporal de Goals |
| **Restrição** | PATH B ONLY — não usar no path interativo |
| **Canonical?** | SIM |

---

### EF-04 · Goal Execution Queue v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/goal-execution-queue/` |
| **Cenários** | 24 |
| **Responsabilidade** | Ordenação de Goals por prioridade (Priority DESC, FIFO tiebreak) |
| **Restrição** | PATH B ONLY |
| **Canonical?** | SIM |

---

### EF-05 · Execution Dispatcher v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/execution-dispatcher/` |
| **Cenários** | 24 |
| **Responsabilidade** | Movimentação de Goals do Scheduler para a Queue |
| **Restrição** | PATH B ONLY |
| **Canonical?** | SIM |

---

### EF-06 · Decision Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/decision-engine/` |
| **Cenários** | 24 |
| **Responsabilidade** | Avaliação de candidatos e seleção com scoring |
| **Canonical?** | SIM |
| **Substitui (após INT-03)** | `detectCapabilities()` + `hasEnoughInfo` em capabilityOrchestrator.js |

---

### EF-07 · Planning Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/planning-engine/` |
| **Cenários** | 24 |
| **Responsabilidade** | Transformação de ExecutionDecision em ExecutionPlan imutável |
| **Canonical?** | SIM |
| **Contrato congelado** | `PlanningEngine.plan(decision) → ExecutionPlan { steps[], complexity, estimatedMs, risk }` |
| **ADR associada** | ADR-003 (Proposed) — semântica `plan` vs `executionMetrics` |

---

### EF-08 · Reflection Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/reflection-engine/` |
| **Cenários** | 24 |
| **Responsabilidade** | Avaliação estruturada de resultado de execução contra ExecutionPlan |
| **Canonical?** | SIM |
| **Incorpora** | `synthesizeResponse()` como etapa SYNTHESIS interna |
| **Substitui (após INT-05)** | `synthesizeResponse()` em memorySynthesizer.js |

---

### EF-09 · Self Evaluation Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/self-evaluation-engine/` |
| **Cenários** | 24 |
| **Responsabilidade** | Score de qualidade, confiabilidade e performance |
| **Canonical?** | SIM |
| **Restrição** | PATH B — avaliação background após resposta persistida |

---

### EF-10 · Knowledge Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/knowledge-engine/` |
| **Cenários** | 28 |
| **Responsabilidade** | Filtragem de SelfEvaluations em Knowledge estruturado |
| **Canonical?** | SIM |
| **Substitui (após INT-06)** | Persistência direta em `processConversationBatch()` |

---

### EF-11 · Learning Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/learning-engine/` |
| **Cenários** | 28 |
| **Responsabilidade** | Transformação de Knowledge aprovado em Learning imutável |
| **Canonical?** | SIM |

---

### EF-12 · Memory Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/memory-engine-v1/` |
| **Cenários** | 28 |
| **Responsabilidade** | Transformação de Learnings aprovados em Memory imutável |
| **Canonical?** | SIM — declarado oficial v2.0 |
| **ADR associada** | ADR-006 (Proposed) — deprecação do legado |

---

### EF-13 · Retrieval Engine v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/retrieval-engine/` |
| **Cenários** | 28 |
| **Responsabilidade** | Recuperação semântica de memória para Context Engine |
| **Canonical?** | SIM |

---

### EF-14 · Capability Registry v1.0

| Campo | Valor |
|---|---|
| **Status** | Official · Frozen |
| **Localização** | `src/lib/capability-registry/` |
| **Cenários** | 28 |
| **Responsabilidade** | Índice central canônico de capabilities disponíveis |
| **Canonical?** | SIM — declarado oficial v2.0 (ADR-004) |
| **Duplicatas deprecated** | `capability-runtime/CapabilityRegistry.ts`, `capabilities/registry/` |

---

## Seção 2 — Módulos EF Pendentes de Certificação

### EF-15 · Capability Runtime

| Campo | Valor |
|---|---|
| **Status** | Official · Pending Certification |
| **Localização** | `src/lib/capability-runtime/` |
| **Cenários** | testCount=0 (auditoria automática — possível falso negativo) |
| **Responsabilidade** | Execução de capabilities operacionais via Executor |
| **ADR associada** | ADR-004 (Proposed) — auditoria manual obrigatória |
| **Bloqueio** | ADR-004 deve ser resolvida antes de INT-04 |

---

## Seção 3 — Módulos Reserved for Future Evolution

### EF-20 · Context Engine

| Campo | Valor |
|---|---|
| **Status** | Reserved for Future Evolution |
| **Responsabilidade** | Montagem do contexto cognitivo completo (queries + prompt) |
| **Implementação atual** | `buildReasoningContext()` + queries em `runMemoryPipeline()` |
| **Pré-requisito** | INT-02 concluída |
| **Substitui** | `contextBuilder.js` + parte de `memoryPipeline.js` |

---

### EF-21 · Conversation Engine

| Campo | Valor |
|---|---|
| **Status** | Reserved for Future Evolution |
| **Responsabilidade** | Orquestração completa do fluxo conversacional |
| **Implementação atual** | `runReasoningPlan()` em memoryReasoningPlanner.js |
| **Pré-requisito** | INT-02 a INT-06 concluídas |
| **Substitui** | `runReasoningPlan()` + `getOrCreateActiveSession()` |

---

### EF-22 · Intent Layer

| Campo | Valor |
|---|---|
| **Status** | Reserved for Future Evolution |
| **Responsabilidade** | Classificação determinística de intent da mensagem do usuário |
| **ADR associada** | ADR-001 (Proposed) — estratégia de classificação |
| **Implementação atual** | `interpretIntent()` via InvokeLLM (legado) |
| **Pré-requisito** | ADR-001 aprovada |

---

### EF-23 · LLM Gateway

| Campo | Valor |
|---|---|
| **Status** | Reserved for Future Evolution |
| **Responsabilidade** | Proxy isolado para todas as chamadas LLM |
| **Implementação atual** | `InvokeLLM()` direto (4 pontos de chamada) |
| **Pré-requisito** | INT-07 concluída |

---

### EF-24 · Goal Runtime v1.0 (promoção de EF-01)

| Campo | Valor |
|---|---|
| **Status** | Reserved — sprint EF-24 pendente |
| **Responsabilidade** | Promoção de Goal Runtime v0.1 para v1.0 (28 cenários + Types) |
| **ADR associada** | ADR-002 (Proposed) |
| **Pré-requisito** | ADR-002 aprovada |

---

### EF-25 · Specialist Layer (futuro)

| Campo | Valor |
|---|---|
| **Status** | Reserved — candidato futuro |
| **Responsabilidade** | Seleção de Specialists de conhecimento de domínio |
| **Implementação atual** | `detectSkills()` + `SpecialistRouter` (permanece ativo) |
| **Nota** | Sem ADR definida; permanece como referência arquitetural |

---

### EF-16 · Connector Registry (futuro)

| Campo | Valor |
|---|---|
| **Status** | Reserved for Future Evolution |
| **Responsabilidade** | Consolidação dos Connector Registries (5 implementações) |
| **ADR associada** | ADR-005 (Proposed) — canonical temporário declarado |
| **Canonical temporário** | `src/lib/connectors/registry.js` |

---

## Seção 4 — Componentes Legacy (produto atual)

| Componente | Arquivo | Substituto EF | Sprint |
|---|---|---|---|
| `runReasoningPlan()` | memoryReasoningPlanner.js | EF-21 | INT-07 |
| `interpretIntent()` | memoryPipeline.js | EF-22 | INT-02 |
| `detectGoal()` | goalDetector.js | EF-01/EF-24 | INT-03 |
| `detectCapabilities()` + `hasEnoughInfo` | capabilityOrchestrator.js | EF-06 | INT-03 |
| `CapabilityOrchestrator` | capabilityOrchestrator.js | EF-15 | INT-04 |
| `buildReasoningContext()` | contextBuilder.js | EF-20 | INT-05 |
| `synthesizeResponse()` | memorySynthesizer.js | EF-08 (SYNTHESIS) | INT-05 |
| `processConversationBatch()` (produtor) | conversationEngine.js | EF-10 + EF-12 | INT-06 |
| `detectSkills()` | skills/detector.js | EF-25 (futuro) | — |
| `SpecialistRouter` | routing/specialistRouter.js | EF-25 (futuro) | — |
| `getOrCreateActiveSession()` | conversationEngine.js | EF-21 | INT-07 |
| `detectService()` | reasoning/serviceDetector.js | EF-16 (futuro) | — |
| `CognitivePipelineAdapter` | cognitive-pipeline-adapter/ | EF-21 | INT-07 |

---

## Seção 5 — Componentes Deprecated

| Componente | Localização | Substituto | ADR |
|---|---|---|---|
| Capability Registry (duplicata) | `src/lib/capability-runtime/CapabilityRegistry.ts` | EF-14 (`capability-registry/`) | ADR-004 |
| Capability Registry (legado JS) | `src/lib/capabilities/registry/` | EF-14 (`capability-registry/`) | ADR-004 |
| Memory Engine (legado) | `src/lib/memory-engine/` (47 arquivos) | EF-12 (`memory-engine-v1/`) | ADR-006 |
| connector-registry/ (congelado) | `src/lib/connector-registry/` | EF-16 (futuro) | ADR-005 |
| connector-runtime/ConnectorRegistry.ts (congelado) | `src/lib/connector-runtime/ConnectorRegistry.ts` | EF-16 (futuro) | ADR-005 |
| enterprise-integration/connectorRegistry.js (congelado) | `src/lib/enterprise-integration/connectorRegistry.js` | EF-16 (futuro) | ADR-005 |

---

## Seção 6 — Componentes Experimentais

| Componente | Localização | Observação |
|---|---|---|
| `connector-simulator/` | `src/lib/connector-simulator/` | 14 arquivos; POC; sem uso no produto |
| `enterprise-integration/` | `src/lib/enterprise-integration/` | 13 arquivos; sem uso no produto |
| `autonomous-executive-engine/` | `src/lib/autonomous-executive-engine/` | 5 arquivos; sem uso no produto |
| `universal-event-bus/` | `src/lib/universal-event-bus/` | 14 arquivos; candidato a reutilização |

---

*SPR-FREEZE-01 · 2026-07-11 · Status: OFFICIAL · FROZEN*