# UPDATED-TARGET-ARCHITECTURE.md
# MemoryOS — Arquitetura Alvo Atualizada v2.0
**Sprint SPR-FREEZE-01 · Engineering First**
Date: 2026-07-11
Version: 2.0
Status: OFFICIAL · FROZEN
Supersede: TARGET-ARCHITECTURE.md (ARC-01)

> Atualizado com: ADR-007 (Reasoning Engine → Reserved), ADR-003 (plan → executionMetrics),
> separação explícita Path A / Path B, restrições de Scheduler/Queue documentadas.

---

## 1. Pipeline Atual (Estado Real — 2026-07-11)

```
USUÁRIO
  ↓
ChatPage.jsx → sendAndReceive()
  ↓
[fire-and-forget] CognitivePipelineAdapter.execute()   ← INT-01 (scaffold, não afeta resposta)
  ↓ (paralelo, não afeta resposta)
runReasoningPlan()                                      ← LEGACY (será EF-21)
  ↓
runMemoryPipeline()                                     ← LEGACY (será dividido em EF-22 + EF-20)
  ├── interpretIntent()    ← InvokeLLM #1 (será EF-22)
  └── queries paralelas    ← base44.entities.* (será EF-20)
  ↓
detectSkills()             ← LEGACY (permanece até EF-25)
detectGoal()               ← LEGACY (será EF-01/EF-24)
SpecialistRouter.route()   ← LEGACY (permanece até EF-25)
  ↓
CapabilityOrchestrator()   ← LEGACY (será EF-15)
  ├── detectCapabilities() ← LEGACY (será EF-06)
  ├── detectService()      ← LEGACY (permanece até EF-16)
  └── executeCapabilities()← LEGACY (será EF-15)
  ↓
buildReasoningContext()    ← LEGACY (será EF-20)
  ↓
InvokeLLM()                ← InvokeLLM #2 (será via EF-23)
  ↓
synthesizeResponse()       ← LEGACY (será SYNTHESIS em EF-08)
  ↓
Message.create()           ← Storage permanente (inalterado)
  ↓ [a cada 5 msgs, background]
processConversationBatch() ← LEGACY produtor (será EF-10 + EF-12)
  └── InvokeLLM #3 + bulkCreate direto
  ↓
RENDER
```

---

## 2. Pipeline Intermediário (Fases INT-02 a INT-04)

```
USUÁRIO
  ↓
ChatPage.jsx → sendAndReceive()                        ← UI layer (inalterado)
  ↓
runReasoningPlan()                                     ← ainda ativo (será EF-21)
  ↓
── PATH A (interativo) ─────────────────────────────────
  │
  ├── IntentLayer.detect()             ← [INT-02] substitui interpretIntent()
  │                                       Elimina InvokeLLM #1
  │
  ├── GoalRuntime.createFromMessage()  ← [INT-03] substitui detectGoal()
  │
  ├── DecisionEngine.decide()          ← [INT-03] substitui detectCapabilities()
  │
  ├── PlanningEngine.plan()            ← [INT-03] novo — produz ExecutionPlan
  │
  ├── detectSkills()                   ← permanece (EF-25 futuro)
  ├── SpecialistRouter.route()         ← permanece (EF-25 futuro)
  │
  ├── CapabilityRuntime.execute(plan)  ← [INT-04] substitui CapabilityOrchestrator
  │
  ├── buildReasoningContext()          ← ainda ativo (será EF-20 em INT-05)
  │
  ├── InvokeLLM()                      ← InvokeLLM #1 (única — intent eliminada)
  │
  └── synthesizeResponse()            ← ainda ativo (será EF-08 em INT-05)

── PATH B (background) ────────────────────────────────
  │
  ├── processConversationBatch()       ← ainda ativo (será EF-10 em INT-06)
  └── bulkCreate direto               ← ainda ativo (será EF-12 em INT-06)

  ↓
Message.create()                       ← Storage (inalterado)
  ↓
RENDER
```

---

## 3. Pipeline Final (Arquitetura Alvo Congelada v2.0)

```
USUÁRIO
  ↓
ChatPage.jsx                           ← UI thin client (inalterado)
  ↓

═══════════════════ PATH A — INTERATIVO ══════════════════════════

ConversationEngine v1.0 (EF-21)        [Reserved — INT-07]
  │  Responsabilidade: orquestração conversacional
  │  Substitui: runReasoningPlan() + getOrCreateActiveSession()
  │
  ├── IntentLayer v1.0 (EF-22)         [Reserved — INT-02]
  │   Responsabilidade: classificação determinística de intent
  │   Substitui: interpretIntent() — elimina InvokeLLM #1
  │   Output: { intent_type, query_types, is_list_query, search_keywords, confidence }
  │
  ├── GoalRuntime v1.0 (EF-24)         [Official/Pending — INT-03]
  │   Responsabilidade: criação e ciclo de vida de Goals
  │   Substitui: detectGoal() (keyword matching)
  │       │
  │       └── GoalRegistry v1.0 (EF-02) [Official/Frozen]
  │           Responsabilidade: persistência de Goals
  │
  ├── DecisionEngine v1.0 (EF-06)      [Official/Frozen — INT-03]
  │   Responsabilidade: decide capabilities + valida suficiência
  │   Substitui: detectCapabilities() + hasEnoughInfo
  │   Output: ExecutionDecision { selectedCandidate, confidence, risk }
  │
  ├── PlanningEngine v1.0 (EF-07)      [Official/Frozen — INT-03]
  │   Responsabilidade: ExecutionPlan imutável a partir de Decision
  │   Substitui: objeto plan analytics (renomeado → executionMetrics via ADR-003)
  │   Output: ExecutionPlan { steps[], complexity, estimatedMs, risk }
  │
  ├── [Specialist Layer] (EF-25)        [Reserved — futuro]
  │   Responsabilidade: seleção de Specialists de conhecimento
  │   Implementação atual: detectSkills() + SpecialistRouter (permanece)
  │
  ├── CapabilityRuntime v2.0 (EF-15)   [Official/Pending Cert — INT-04]
  │   Responsabilidade: execução de capabilities operacionais
  │   Substitui: CapabilityOrchestrator completo
  │       │
  │       └── CapabilityRegistry v1.0 (EF-14) [Official/Frozen]
  │           Responsabilidade: índice central de capabilities
  │           Canonical: src/lib/capability-registry/
  │
  ├── ConnectorRuntime (EF-16+)         [Reserved — futuro]
  │   Responsabilidade: execução de ações em sistemas externos
  │   Implementação atual: detectService() + connectors/registry.js
  │   Canonical temporário: src/lib/connectors/registry.js
  │
  ├── ContextEngine v1.0 (EF-20)        [Reserved — INT-05]
  │   Responsabilidade: recuperação + montagem do contexto cognitivo
  │   Substitui: buildReasoningContext() + queries de runMemoryPipeline()
  │       │
  │       └── RetrievalEngine v1.0 (EF-13) [Official/Frozen]
  │           Responsabilidade: recuperação semântica de memória
  │
  ├── LLMGateway v1.0 (EF-23)           [Reserved — INT-08]
  │   Responsabilidade: proxy isolado para chamadas LLM
  │   Implementação atual: InvokeLLM() direto
  │
  ├── ReflectionEngine v1.0 (EF-08)     [Official/Frozen — INT-05]
  │   Responsabilidade: avaliação estruturada da resposta
  │   Incorpora: synthesizeResponse() como etapa SYNTHESIS
  │       │
  │       └── SelfEvaluationEngine (EF-09) [Official/Frozen]
  │           Responsabilidade: score de qualidade
  │
  └── Message.create()                   ← Storage permanente (inalterado)

═══════════════════ PATH B — BACKGROUND ══════════════════════════

GoalScheduler v1.0 (EF-03)              [Official/Frozen — PATH B ONLY]
  ↓
ExecutionDispatcher v1.0 (EF-05)        [Official/Frozen — PATH B ONLY]
  ↓
GoalExecutionQueue v1.0 (EF-04)         [Official/Frozen — PATH B ONLY]
  ↓
KnowledgeEngine v1.0 (EF-10)           [Official/Frozen — INT-06]
  Substitui: processConversationBatch() como produtor direto
  ↓
LearningEngine v1.0 (EF-11)             [Official/Frozen]
  ↓
MemoryEngine v1.0 (EF-12)              [Official/Frozen — INT-06]
  Substitui: bulkCreate direto em entidades
  Canonical: src/lib/memory-engine-v1/
  ↓
Entidades Base44                        ← Storage permanente (inalterado)
(Message, KnowledgeEntity, Decision, Task, Topic, Keyword)

═══════════════════ NOTA ARQUITETURAL ════════════════════════════

[R] REASONING ENGINE
    Status: Reserved (ADR-007 Proposed)
    A responsabilidade de raciocínio é distribuída por:
    EF-06 (Decision), EF-07 (Planning), EF-08 (Reflection),
    EF-20 (Context), EF-21 (Conversation)
    Módulo separado permanece Reserved até ADR-007 aprovada.

══════════════════════════════════════════════════════════════════
```

---

## 4. Evolução das Chamadas LLM

| Estado | InvokeLLM calls/msg | Finalidade |
|---|---|---|
| **Atual** | 2-4 | intent (LLM), resposta, título (condicional), batch (background) |
| **Após INT-02** | 1-2 | resposta (obrigatória), batch via Knowledge Engine |
| **Após INT-07** | 1 | resposta via LLM Gateway (EF-23) |

---

## 5. Componentes Permanentes (não substituídos)

| Componente | Motivo |
|---|---|
| `useVoicePipeline` | Camada UI — sem equivalente EF |
| `useTextToSpeech` | Camada UI |
| `useHaptics` | Camada UI |
| `ingestKnowledge` | Pipeline de ingestão de documentos |
| `audioTranscription` | Utility de transcrição |
| Entidades Base44 | Storage permanente |
| `detectSkills()` + `SpecialistRouter` | Permanece até EF-25 |
| `detectService()` + `connectors/registry.js` | Permanece até EF-16 |

---

*SPR-FREEZE-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*