# TARGET-ARCHITECTURE.md
# MemoryOS — Arquitetura Alvo
**Sprint ARC-01 · Engineering First**
Date: 2026-07-11
Type: Arquitetura Alvo
Status: OFFICIAL

---

## 1. Pipeline Atual (Estado Real — 2026-07-11)

```
USUÁRIO
  ↓
ChatPage.jsx → sendAndReceive()
  ↓
[fire-and-forget] CognitivePipelineAdapter.execute()   ← INT-01 (não-bloqueante)
  ↓ (paralelo, não afeta resposta)
runReasoningPlan()
  ↓
runMemoryPipeline()
  ├── interpretIntent()    ← InvokeLLM #1
  └── queries paralelas    ← base44.entities.*
  ↓
detectSkills()             ← keyword matching
detectGoal()               ← keyword matching
SpecialistRouter.route()   ← registry lookup
  ↓ (se goal.type === "general")
CapabilityOrchestrator()
  ├── detectCapabilities()
  ├── detectService()
  ├── getConnectorsForService()
  └── executeCapabilities()
  ↓
buildReasoningContext()    ← monta prompt
  ↓
InvokeLLM()                ← InvokeLLM #2 (obrigatória)
  ↓
synthesizeResponse()       ← limpeza determinística
  ↓
Message.create()           ← persistência
  ↓ [a cada 5 msgs, background]
processConversationBatch() ← InvokeLLM #3 + bulkCreate direto
  ↓
RENDER
```

**Características do pipeline atual:**
- 2-4 chamadas LLM por mensagem
- Sem ciclo de vida formal de Goals
- Sem avaliação estruturada de qualidade
- Sem routing formal de Capabilities
- Knowledge extraction sem validação
- Modules EF certificados existem mas são desconectados

---

## 2. Pipeline Intermediário (Estado Alvo — Fases 1-3)

```
USUÁRIO
  ↓
ChatPage.jsx → sendAndReceive()
  ↓
GoalRuntime.createFromMessage()    ← [INT-03] substitui detectGoal()
  ↓
ConversationEngine.process()       ← [INT-07] orquestrador emergente
  ↓
IntentLayer.detect()               ← [INT-02] substitui interpretIntent() — elimina InvokeLLM #1
  ↓
ContextEngine.query()              ← [INT-05] substitui runMemoryPipeline() queries
  ↓
detectSkills()                     ← permanece (sem substituto EF)
DecisionEngine.decide()            ← [INT-03] substitui detectCapabilities()
  ↓
SpecialistRouter.route()           ← permanece (Specialists de conhecimento)
CapabilityRuntime.execute(plan)    ← [INT-04] substitui CapabilityOrchestrator
  ↓
ContextEngine.build()              ← [INT-05] substitui buildReasoningContext()
  ↓
InvokeLLM()                        ← InvokeLLM #1 (única — intent foi eliminada)
  ↓
ReflectionEngine.evaluate()        ← [INT-05] substitui synthesizeResponse() + avaliação
  ↓
Message.create()                   ← persistência (inalterada)
  ↓ [background]
KnowledgeEngine.process()          ← [INT-06] substitui processConversationBatch()
MemoryEngine.store()               ← [INT-06] destino formal de memórias aprovadas
  ↓
RENDER
```

**Características do pipeline intermediário:**
- 1-2 chamadas LLM por mensagem (Intent eliminada)
- Goal com ciclo de vida formal
- Avaliação estruturada via Reflection Engine
- Capability Runtime como executor formal
- Knowledge Engine com validação antes de persistência
- CognitivePipelineAdapter removido (substituído por ConversationEngine)

---

## 3. Pipeline Final (Arquitetura Alvo Completa — EF-22+)

```
USUÁRIO
  ↓
ChatPage.jsx → UI layer (thin client)
  ↓
ConversationEngine v1.0              [EF-21]
  │   Responsabilidade: orquestração completa da conversa
  │   Substitui: runReasoningPlan() + getOrCreateActiveSession()
  │
  ├── IntentLayer v1.0               [EF-22]
  │   Responsabilidade: classificação determinística de intent
  │   Substitui: interpretIntent() + InvokeLLM #1
  │   Output: { intent_type, query_types, search_keywords, confidence }
  │
  ├── GoalRuntime v1.0               [EF-24]
  │   Responsabilidade: criação e ciclo de vida de Goals
  │   Substitui: detectGoal() (keyword matching)
  │   Output: Goal { id, type, priority, lifecycle }
  │       │
  │       ├── GoalRegistry v1.0      [EF-02]
  │       ├── GoalScheduler v1.0     [EF-03] (background goals only)
  │       ├── ExecutionDispatcher    [EF-05] (background goals only)
  │       └── GoalExecutionQueue     [EF-04] (background goals only)
  │
  ├── DecisionEngine v1.0            [EF-06]
  │   Responsabilidade: decide capabilities + valida hasEnoughInfo
  │   Substitui: detectCapabilities() + hasEnoughInfo logic
  │   Input: Goal + Context
  │   Output: ExecutionDecision { capabilities[], risk, confidence }
  │
  ├── PlanningEngine v1.0            [EF-07]
  │   Responsabilidade: produz ExecutionPlan a partir da decisão
  │   Substitui: objeto plan ad-hoc em runReasoningPlan
  │   Input: ExecutionDecision
  │   Output: ExecutionPlan { steps[], complexity, estimatedMs }
  │
  ├── ContextEngine v1.0             [EF-20]
  │   Responsabilidade: recupera + monta contexto cognitivo completo
  │   Substitui: runMemoryPipeline() queries + buildReasoningContext()
  │   Input: Intent + Goal + ExecutionPlan
  │   Output: CognitiveContext { memory, prompt }
  │       │
  │       └── RetrievalEngine v1.0  [EF-13]
  │           Responsabilidade: recuperação semântica de memória
  │
  ├── detectSkills()                 [permanece — candidato EF-25]
  │   Responsabilidade: seleção de Specialists de conhecimento
  │
  ├── SpecialistRouter               [permanece para knowledge specialists]
  │   Responsabilidade: routing para Specialists de conhecimento
  │
  ├── CapabilityRuntime v2.0         [EF-15]
  │   Responsabilidade: execução de capabilities operacionais
  │   Substitui: CapabilityOrchestrator + executeCapabilities()
  │       │
  │       └── CapabilityRegistry v1.0 [EF-14]
  │           (consolidated — substitui 3 registries paralelos)
  │
  ├── ConnectorRuntime               [EF-16+]
  │   Responsabilidade: execução de conectores externos
  │   Substitui: detectService() + getConnectorsForService()
  │
  ├── LLMGateway v1.0               [EF-23]
  │   Responsabilidade: proxy isolado para chamadas LLM
  │   Substitui: base44.integrations.Core.InvokeLLM() direto
  │   Garante: único provider, circuit breaker, logging
  │
  ├── ReflectionEngine v1.0          [EF-08]
  │   Responsabilidade: avaliação estruturada da resposta
  │   Incorpora: synthesizeResponse() como etapa SYNTHESIS
  │   Input: rawResponse + ExecutionPlan
  │   Output: ReflectionResult { verdict, confidence, cleaned }
  │       │
  │       └── SelfEvaluationEngine  [EF-09]
  │           Responsabilidade: scoring de qualidade
  │
  └── Message.create()               [persistência — inalterada]

  ↓ [background — assíncrono]

KnowledgeEngine v1.0                 [EF-10]
  Responsabilidade: transforma mensagens em Knowledge estruturado
  Substitui: processConversationBatch() como produtor
  Input: mensagens + ReflectionResult
      │
      └── LearningEngine v1.0       [EF-11]
          Responsabilidade: padrões de aprendizado

MemoryEngine v1.0                    [EF-12]
  Responsabilidade: storage formal de memórias aprovadas
  Substitui: bulkCreate direto em entidades Base44
  Destino: entidades Base44 continuam como storage (Message, KnowledgeEntity, Decision, Task, Topic)

  ↓
RENDER (ChatPage — thin UI layer)
```

**Características do pipeline final:**
- **1 chamada LLM** por mensagem (Intent determinística, LLM via Gateway)
- **Zero duplicação** de responsabilidade entre módulos
- **Ciclo de vida formal** para cada objeto cognitivo (Goal, Plan, Memory, Knowledge)
- **Avaliação estruturada** de cada resposta (Reflection + Self-Evaluation)
- **Storage imutável** — entidades Base44 continuam o destino, EF é o produtor
- **Latência preservada** — path crítico síncrono; background via Queue
- **Backwards compatible** — ChatPage permanece como UI thin client

---

## 4. Evolução das Chamadas LLM

| Estado | InvokeLLM calls/msg | Finalidade |
|---|---|---|
| **Atual** | 2-4 | intent (LLM), resposta, título (condicional), batch (background) |
| **Intermediário** | 1-2 | resposta (obrigatória), batch via Knowledge Engine |
| **Final** | 1 | resposta via LLM Gateway |

---

## 5. Módulos que Não Mudam

Os seguintes componentes permanecem inalterados na arquitetura final:

| Componente | Motivo |
|---|---|
| `useVoicePipeline` | Camada de UI — sem equivalente EF |
| `useTextToSpeech` | Camada de UI |
| `useHaptics` | Camada de UI |
| `ingestKnowledge` | Pipeline de ingestão de documentos — sem equivalente EF |
| `audioTranscription` | Utility de transcrição |
| Entidades Base44 | Storage permanente — EF produz, Base44 armazena |
| `formatMacrForChat` | Formatter de output para UI |
| `VoiceButton`, `VoiceMode`, `AttachmentMenu` | Componentes de UI |

---

## 6. Módulos que Serão Removidos (Deprecados)

| Módulo | Removido em | Substituto |
|---|---|---|
| `interpretIntent()` em memoryPipeline.js | Fase 1 (INT-02) | Intent Layer (EF-22) |
| `detectGoal()` em goalDetector.js | Fase 2 (INT-03) | Goal Runtime (EF-24) |
| `CapabilityOrchestrator` | Fase 3 (INT-04) | Capability Runtime (EF-15) |
| `detectCapabilities()` | Fase 3 (INT-04) | Decision Engine (EF-06) |
| `executeCapabilities()` | Fase 3 (INT-04) | Capability Runtime (EF-15) |
| `buildReasoningContext()` | Fase 4 (INT-05) | Context Engine (EF-20) |
| `synthesizeResponse()` | Fase 4 (INT-05) | Reflection Engine (EF-08) |
| `processConversationBatch()` (produtor direto) | Fase 5 (INT-06) | Knowledge Engine (EF-10) |
| `runReasoningPlan()` | Fase 6 (INT-07) | Conversation Engine (EF-21) |
| `CognitivePipelineAdapter` | Fase 6 (INT-07) | Conversation Engine (EF-21) |
| `memory-engine/` legado (47 arquivos JS) | Fase 5 | memory-engine-v1 (EF-12) |
| `cognitive-engine/` legado (17 arquivos JS) | Fase 6 | Módulos EF individuais |
| `capability-runtime/CapabilityRegistry.ts` (duplicata) | Fase 3 | capability-registry (EF-14) |
| `capabilities/registry/` legado (JS) | Fase 3 | capability-registry (EF-14) |

---

*Sprint ARC-01 — 2026-07-11 — Engineering First*
*Nenhum código foi criado ou modificado.*