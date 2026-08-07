# UPDATED-PIPELINE-CONVERGENCE-MATRIX.md
# MemoryOS — Matriz de Convergência de Pipelines v2.0
**Sprint SPR-FREEZE-01 · Engineering First**
Date: 2026-07-11
Version: 2.0
Status: OFFICIAL · FROZEN
Supersede: PIPELINE-CONVERGENCE-MATRIX.md (ARC-01)

> Atualizado com ADR-003 (plan→executionMetrics), ADR-007 (Reasoning Engine→Reserved),
> separação Path A/B, restrições de Scheduler/Queue, canonical declarations.

---

## 1. Matriz Principal de Convergência v2.0

| Pipeline Atual | Arquivo | Pipeline EF | Módulo EF | Estratégia | Sprint | Path |
|---|---|---|---|---|---|---|
| `interpretIntent()` | memoryPipeline.js | Intent Layer | EF-22 | **SUBSTITUIR** — determinística (ADR-001 Proposed) | INT-02 | A |
| `runMemoryPipeline()` (queries) | memoryPipeline.js | Context Engine | EF-20 | **INCORPORAR** — Context Engine engloba queries | INT-05 | A |
| `detectGoal()` | goalDetector.js | Goal Runtime | EF-24 | **INCORPORAR** — detectGoal() → factory dentro de GoalRuntime | INT-03 | A |
| `detectSkills()` | skills/detector.js | Specialist Layer | EF-25 | **PERMANECE** — sem substituto; EF-25 futuro | — | A |
| `SpecialistRouter.route()` | routing/specialistRouter.js | Specialist Layer | EF-25 | **PERMANECE** — Specialists de conhecimento permanecem | — | A |
| `CapabilityOrchestrator` | capabilityOrchestrator.js | Capability Runtime | EF-15 | **SUBSTITUIR** — EF-15 após certificação (ADR-004) | INT-04 | A |
| `detectCapabilities()` + `hasEnoughInfo` | capabilityOrchestrator.js | Decision Engine | EF-06 | **SUBSTITUIR** — Decision Engine é o árbitro | INT-03 | A |
| `executeCapabilities()` | capabilityExecutor.js | Capability Runtime | EF-15 | **SUBSTITUIR** — execução via EF-15 | INT-04 | A |
| `detectService()` | serviceDetector.js | Connector Runtime | EF-16+ | **PERMANECE** — aguarda EF-16 | — | A |
| `getConnectorsForService()` | connectors/registry.js | Connector Runtime | EF-16+ | **PERMANECE** — canonical temporário (ADR-005) | — | A |
| `buildReasoningContext()` | contextBuilder.js | Context Engine | EF-20 | **INCORPORAR** — Context Engine engloba | INT-05 | A |
| `runReasoningPlan()` (orquestrador) | memoryReasoningPlanner.js | Conversation Engine | EF-21 | **TRANSFORMAR** — evolui para EF-21 | INT-07 | A |
| `plan` analytics (objeto) | memoryReasoningPlanner.js | `executionMetrics` | — | **RENOMEAR** — plan→executionMetrics (ADR-003 Proposed) | pré-INT-03 | A |
| `synthesizeResponse()` | memorySynthesizer.js | Reflection Engine | EF-08 | **INCORPORAR** — vira etapa SYNTHESIS de EF-08 | INT-05 | A |
| `processConversationBatch()` produtor | conversationEngine.js | Knowledge + Memory Engine | EF-10 + EF-12 | **INCORPORAR** — Knowledge Engine valida; Memory Engine persiste | INT-06 | B |
| `getOrCreateActiveSession()` | conversationEngine.js | Conversation Engine | EF-21 | **INCORPORAR** — gestão de sessão no EF-21 | INT-07 | A |
| `InvokeLLM()` (intent) | memoryPipeline.js | Intent Layer | EF-22 | **ELIMINAR** — Intent Layer determinística elimina esta chamada | INT-02 | A |
| `InvokeLLM()` (resposta) | memoryReasoningPlanner.js | LLM Gateway | EF-23 | **ENCAPSULAR** — via Gateway quando EF-23 disponível | INT-08 | A |
| `InvokeLLM()` (batch) | conversationEngine.js | Knowledge Engine | EF-10 | **ENCAPSULAR** — Knowledge Engine gerencia seu próprio LLM | INT-06 | B |
| `CognitivePipelineAdapter.execute()` | cognitive-pipeline-adapter/ | Conversation Engine | EF-21 | **TEMPORÁRIO** — scaffold INT-01; removido em INT-07 | INT-07 | A |

---

## 2. Matriz por Módulo EF — Ponto de Entrada no Produto

| Módulo EF | Status | Sprint | Ponto de Entrada | Substitui | Path |
|---|---|---|---|---|---|
| Goal Runtime v1.0 (EF-24) | Official/Pending | INT-03 | `runReasoningPlan()` após detectGoal() | `detectGoal()` | A |
| Goal Registry Service (EF-02) | Official/Frozen | INT-03 | Interno ao Goal Runtime | Nenhum | A+B |
| Goal Scheduler (EF-03) | Official/Frozen | PATH B ONLY | Apenas fluxos background | Nenhum no path crítico | B |
| Goal Execution Queue (EF-04) | Official/Frozen | PATH B ONLY | Pós-despacho, pré-execução | Execução síncrona de batch | B |
| Execution Dispatcher (EF-05) | Official/Frozen | PATH B ONLY | Entre Scheduler e Queue | Nenhum no path crítico | B |
| Decision Engine (EF-06) | Official/Frozen | INT-03 | `runReasoningPlan()` pós-Goal | `detectCapabilities()` | A |
| Planning Engine (EF-07) | Official/Frozen | INT-03 | `runReasoningPlan()` pós-Decision | objeto `plan` analytics | A |
| Reflection Engine (EF-08) | Official/Frozen | INT-05 | `runReasoningPlan()` pós-InvokeLLM | `synthesizeResponse()` | A |
| Self Evaluation Engine (EF-09) | Official/Frozen | PATH B | Background pós-resposta | Nenhum | B |
| Knowledge Engine (EF-10) | Official/Frozen | INT-06 | `processConversationBatch()` como validador | Persistência direta | B |
| Learning Engine (EF-11) | Official/Frozen | INT-06 | Background pós-Knowledge | Nenhum | B |
| Memory Engine (EF-12) | Official/Frozen | INT-06 | Pós-Learning | bulkCreate direto | B |
| Retrieval Engine (EF-13) | Official/Frozen | INT-05 | Dentro de Context Engine | Queries paralelas | A |
| Capability Registry (EF-14) | Official/Frozen | INT-04 | Dentro de Capability Runtime | 3 registries duplicados | A |
| Capability Runtime (EF-15) | Official/Pending Cert | INT-04 | `runReasoningPlan()` onde hoje é orchestrateCapabilities() | CapabilityOrchestrator | A |
| Intent Layer (EF-22) | Reserved | INT-02 | `runMemoryPipeline()` substituindo interpretIntent() | InvokeLLM #1 | A |
| Context Engine (EF-20) | Reserved | INT-05 | `runReasoningPlan()` substituindo buildReasoningContext() + queries | contextBuilder + memoryPipeline | A |
| Conversation Engine (EF-21) | Reserved | INT-07 | ChatPage em vez de runReasoningPlan() | runReasoningPlan() | A |
| LLM Gateway (EF-23) | Reserved | INT-08 | Todos os pontos de InvokeLLM() | InvokeLLM() direto | A |

---

## 3. Matriz de Decisão — Estratégia por Componente

| Componente | Decisão v2.0 | Justificativa | ADR |
|---|---|---|---|
| `runReasoningPlan()` | **TRANSFORMA** → EF-21 | Orquestrador central — evolui, não substituído abruptamente | — |
| `interpretIntent()` | **SUBSTITUI** → EF-22 | LLM call desnecessária; Intent Layer determinística (ADR-001) | ADR-001 |
| `runMemoryPipeline()` | **DIVIDE** → EF-22 + EF-20 | Duas responsabilidades distintas no mesmo arquivo | ADR-001 |
| `detectGoal()` | **INCORPORA** → EF-24 | detectGoal é stub do ciclo de vida Goal | ADR-002 |
| `plan` analytics | **RENOMEIA** → `executionMetrics` | Libera nome para EF-07 (ADR-003) | ADR-003 |
| `detectSkills()` | **PERMANECE** | Sem substituto; EF-25 futuro | — |
| `SpecialistRouter` | **PERMANECE** | Specialists de conhecimento ≠ Capabilities EF | — |
| `CapabilityOrchestrator` | **SUBSTITUI** → EF-15 | Duplicata direta do EF; após ADR-004 | ADR-004 |
| `detectCapabilities()` | **SUBSTITUI** → EF-06 | Decision Engine é árbitro formal | — |
| `detectService()` | **PERMANECE** | Aguarda EF-16 | ADR-005 |
| `connectors/registry.js` | **PERMANECE** (canonical temporário) | Declarado canonical até EF-16 (ADR-005) | ADR-005 |
| `buildReasoningContext()` | **INCORPORA** → EF-20 | Implementação atual do Context Engine | — |
| `synthesizeResponse()` | **INCORPORA** → EF-08 SYNTHESIS | Síntese é etapa de Reflection | — |
| `processConversationBatch()` | **INCORPORA** → EF-10 + EF-12 | Extração permanece; destino muda para EF | — |
| `InvokeLLM (intent)` | **ELIMINA** via EF-22 | Intent Layer determinística elimina esta chamada | ADR-001 |
| `InvokeLLM (resposta)` | **ENCAPSULA** → EF-23 | Gateway isola dependência de provider | — |
| `InvokeLLM (batch)` | **ENCAPSULA** → EF-10 | Knowledge Engine gerencia seu próprio LLM | — |
| `CognitivePipelineAdapter` | **TEMPORÁRIO** → EF-21 | Scaffold INT-01; removido em INT-07 | — |
| `memory-engine/` (47 arquivos) | **DEPRECA** → EF-12 | Legado multi-responsabilidade; EF-12 é canonical | ADR-006 |
| Capability Registry (duplicatas) | **DEPRECA** → EF-14 | EF-14 é canonical declarado (ADR-004) | ADR-004 |
| Reasoning Engine | **RESERVED** | Responsabilidade distribuída (ADR-007) | ADR-007 |

---

## 4. Canonical Declarations v2.0

| Registry / Engine | Canonical Oficial | Status | Locais Deprecated/Congelados |
|---|---|---|---|
| Capability Registry | `src/lib/capability-registry/` (EF-14) | Official · Frozen | `capability-runtime/CapabilityRegistry.ts`, `capabilities/registry/` |
| Memory Engine | `src/lib/memory-engine-v1/` (EF-12) | Official · Frozen | `src/lib/memory-engine/` (47 arquivos) |
| Connector Registry | `src/lib/connectors/registry.js` (temporário) | Legacy · Canonical Temporário | `connector-registry/`, `connector-runtime/ConnectorRegistry.ts`, `enterprise-integration/connectorRegistry.js` |
| Goal Runtime | `src/lib/goal-runtime-v01/` (EF-01 → EF-24) | Official · Pending v1.0 | Nenhum duplicado |
| Planning Engine | `src/lib/planning-engine/` (EF-07) | Official · Frozen | Nenhum duplicado |

---

*SPR-FREEZE-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*