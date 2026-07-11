# PRODUCT-FLOW-MAPPING.md
# MemoryOS — Mapeamento Oficial do Fluxo do Produto
**Sprint INT-00 · Engineering First**
Date: 2026-07-11
Type: Auditoria de Fluxo
Status: OFFICIAL

> Este documento foi gerado exclusivamente a partir da leitura do código-fonte real.
> Nenhuma hipótese foi feita. Nenhum comportamento foi inventado.
> Todos os nomes de funções, arquivos e linhas são verificados.

---

## 1. Diagrama Completo do Fluxo do Produto

```
USUÁRIO
  |
  | [digita mensagem + pressiona Enter ou clica em Enviar]
  v
ChatPage.jsx
  | sendMessage(e) — linha 232
  |   → e.preventDefault()
  |   → text = input.trim()
  |   → setInput("")
  |   → await sendAndReceive(text)
  |
  | sendAndReceive(userMsg, { setPhase }) — linha 56
  |   → guarda: setLoading(true)
  |
  |── PERSISTÊNCIA 1 ─────────────────────────────────────────────
  |   base44.entities.Message.create({ session_id, role:"user", content, memory_tier:"active" })
  |   → setMessages([...prev, savedUserMsg])
  |
  |── COGNITIVE PIPELINE ADAPTER (não-bloqueante, .catch silencioso) ──
  |   pipelineAdapter.execute({ message, sessionId, userId, projectId })
  |   → fire-and-forget — NÃO afeta a resposta ao usuário
  |
  |── MEMORY REASONING PLANNER ────────────────────────────────────
  |   runReasoningPlan({ userMsg, session, historyMessages[-30], setPhase })
  |     |
  |     | ETAPA 1 — MEMORY RETRIEVAL PIPELINE
  |     |   runMemoryPipeline(userMsg, sessionId, projectId)
  |     |     |
  |     |     |── LLM CALL 1 (intent): interpretIntent(question)
  |     |     |     base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: INTENT_SCHEMA })
  |     |     |     → { query_types, is_list_query, search_keywords }
  |     |     |
  |     |     |── QUERIES PARALELAS (base44.entities.*):
  |     |     |     ChatSession.filter({ id: sessionId })
  |     |     |     Project.list()          — se "projects" em query_types
  |     |     |     Document.filter()       — se "documents"
  |     |     |     Decision.list()         — se "decisions"
  |     |     |     Task.list()             — se "tasks"
  |     |     |     Topic.list()            — se "topics"
  |     |     |     KnowledgeEntity.list()  — se "entities"
  |     |     |     ChatSession.list()      — se "sessions"
  |     |     |     Keyword.list()          — se "keywords"
  |     |     |     Message.list()          — se "messages"
  |     |     |
  |     |     └── buildContext(data, intent, sessionId) → { context, sources }
  |     |         → retorna: { context, sources, intent, sessionSummary }
  |     |
  |     | ETAPA 2 — SKILLS ENGINE
  |     |   detectSkills(userMsg, { sessionSummary, context, sources })
  |     |   → src/lib/skills/detector.js
  |     |   → retorna: Array de skills ativas
  |     |
  |     | ETAPA 3 — GOAL DETECTION (sem LLM — keyword matching)
  |     |   detectGoal(userMsg)
  |     |   → src/lib/reasoning/goalDetector.js
  |     |   → retorna: { id, label, strategy, type, priority, metadata }
  |     |
  |     | ETAPA 3.5 — SPECIALIST ROUTING
  |     |   SpecialistRouter.route(goal, { memory, session })
  |     |   → src/lib/routing/specialistRouter.js
  |     |   → consulta: SpecialistRegistry.get(goal.id)
  |     |   → se goal.type === "specialist": retorna { specialist, confidence, reason }
  |     |   → se goal.type === "general":   retorna null → prossegue fluxo normal
  |     |
  |     |   SE SPECIALIST ENCONTRADO:
  |     |     specialist.analyze({ scope, onStage })
  |     |     formatMacrForChat(result.macr, result.metadata)
  |     |     base44.analytics.track("mrp_specialist_routed")
  |     |     → return { response, plan, sources: [] }
  |     |     [FLUXO ENCERRADO — não chama LLM genérico]
  |     |
  |     | ETAPA 4 — CAPABILITY ORCHESTRATOR
  |     |   orchestrateCapabilities({ message, memory, goal, sessionId, projectId })
  |     |   → src/lib/reasoning/capabilityOrchestrator.js
  |     |     detectCapabilities(message, memory, goal)
  |     |     detectService(message)
  |     |     getConnectorsForService(service.id)
  |     |     executeCapabilities(execCapabilities, { message, sessionId, projectId })
  |     |   → retorna: { capabilities, capabilityResults, serviceInfo, needsMoreInfo, missingInfoHint }
  |     |
  |     | ETAPA 5 — CONTEXT BUILDER
  |     |   buildReasoningContext({ userMsg, memory, skills, goal, historyText,
  |     |                          totalMessages, capabilities, capabilityResults,
  |     |                          needsMoreInfo, missingInfoHint, serviceInfo })
  |     |   → src/lib/reasoning/contextBuilder.js
  |     |   → retorna: string (prompt completo)
  |     |
  |     |── LLM CALL 2 (resposta): base44.integrations.Core.InvokeLLM({ prompt })
  |     |
  |     | ETAPA 7 — MEMORY SYNTHESIZER (sem LLM)
  |     |   synthesizeResponse(rawResponse)
  |     |   → src/lib/reasoning/memorySynthesizer.js
  |     |   → deduplicateSentences + deduplicateConsecutiveParagraphs + collapseBlankLines
  |     |
  |     | ETAPA 8 — ANALYTICS (não-bloqueante)
  |     |   base44.analytics.track("mrp_reasoning_executed")
  |     |
  |     └── retorna: { response, plan, sources }
  |
  |── PERSISTÊNCIA 2 ─────────────────────────────────────────────
  |   base44.entities.Message.create({ session_id, role:"assistant", content, sources_used, memory_tier:"active" })
  |   → setMessages([...prev, savedAssistant])
  |   → setLoading(false)
  |
  |── BATCH PROCESSING (condicional, a cada 5 mensagens de usuário) ──
  |   shouldProcessBatch(userMessageCount) — src/lib/conversationEngine.js linha 87
  |     SE session.title === "Nova conversa":
  |       LLM CALL 3 (título): base44.integrations.Core.InvokeLLM({ prompt: "Crie um título..." })
  |       base44.entities.ChatSession.update(session.id, { title })
  |     processConversationBatch(session, allMessages, projectId) — não-bloqueante
  |       LLM CALL 4 (knowledge): base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: CONVERSATION_SCHEMA })
  |       base44.entities.ChatSession.update(session.id, { summary, last_message_at })
  |       base44.entities.Keyword.bulkCreate(...)
  |       base44.entities.KnowledgeEntity.bulkCreate(...)
  |       base44.entities.Decision.create(...)   — por decisão
  |       base44.entities.Task.create(...)        — por tarefa
  |       base44.entities.Topic.create(...)       — por tópico
  |
  v
RENDER
  messages.map(msg → MessageBubble)
  ReactMarkdown para role==="assistant"
```

---

## 2. Diagrama de Chamadas — sendAndReceive()

```
sendAndReceive(userMsg)
  │
  ├─ base44.entities.Message.create()          [SYNC — await]
  │
  ├─ pipelineAdapter.execute()                 [ASYNC fire-and-forget]
  │    └─ CognitivePipelineAdapter.execute()
  │
  ├─ runReasoningPlan()                         [SYNC — await]
  │    ├─ runMemoryPipeline()
  │    │    ├─ base44.integrations.Core.InvokeLLM()  [intent]
  │    │    └─ Promise.all([ base44.entities.* x N ])
  │    │
  │    ├─ detectSkills()                        [sync, no LLM]
  │    ├─ detectGoal()                          [sync, no LLM]
  │    ├─ SpecialistRouter.route()              [sync, no LLM]
  │    │    └─ SpecialistRegistry.get()
  │    │
  │    ├─ orchestrateCapabilities()
  │    │    ├─ detectCapabilities()             [sync]
  │    │    ├─ detectService()                  [sync]
  │    │    ├─ getConnectorsForService()        [sync]
  │    │    └─ executeCapabilities()            [async, optional]
  │    │
  │    ├─ buildReasoningContext()               [sync, no LLM]
  │    │
  │    ├─ base44.integrations.Core.InvokeLLM() [resposta — ÚNICA chamada LLM obrigatória]
  │    │
  │    ├─ synthesizeResponse()                 [sync, no LLM]
  │    └─ base44.analytics.track()             [fire-and-forget]
  │
  ├─ base44.entities.Message.create()          [SYNC — await, role="assistant"]
  │
  └─ processConversationBatch()                [ASYNC fire-and-forget, condicional]
       ├─ base44.integrations.Core.InvokeLLM() [knowledge extraction]
       ├─ base44.entities.ChatSession.update()
       ├─ base44.entities.Keyword.bulkCreate()
       ├─ base44.entities.KnowledgeEntity.bulkCreate()
       ├─ base44.entities.Decision.create()
       ├─ base44.entities.Task.create()
       └─ base44.entities.Topic.create()
```

---

## 3. Grafo de Dependências — ChatPage

```
ChatPage.jsx
  imports:
    @/api/base44Client                        → base44 SDK (entities + integrations + analytics)
    @/lib/conversationEngine                  → getOrCreateActiveSession, shouldProcessBatch, processConversationBatch
    @/hooks/useVoicePipeline                  → useVoicePipeline
    @/lib/knowledgeIngestionPipeline          → ingestKnowledge, ACCEPT_MAP
    @/lib/reasoning/memoryReasoningPlanner    → runReasoningPlan
    @/lib/cognitive-pipeline-adapter/...     → CognitivePipelineAdapter
    @/components/chat/VoiceButton             → VoiceButton
    @/components/chat/VoiceMode              → VoiceMode
    @/components/chat/AttachmentMenu         → AttachmentMenu
    @/components/chat/ProcessingBubble       → ProcessingBubble
    @/components/chat/PasteTextDialog        → PasteTextDialog
    @/components/chat/LinkDialog             → LinkDialog

runReasoningPlan (memoryReasoningPlanner.js)
  imports:
    @/api/base44Client
    @/lib/memoryPipeline                      → runMemoryPipeline
    @/lib/skills/detector                     → detectSkills
    @/lib/reasoning/goalDetector              → detectGoal
    @/lib/reasoning/contextBuilder            → buildReasoningContext
    @/lib/reasoning/memorySynthesizer         → synthesizeResponse
    @/lib/reasoning/capabilityOrchestrator    → orchestrateCapabilities
    @/lib/routing/specialistRouter            → SpecialistRouter
    @/lib/reasoning/macrFormatterV4           → formatMacrForChat

runMemoryPipeline (memoryPipeline.js)
  imports:
    @/api/base44Client
    moment

orchestrateCapabilities (capabilityOrchestrator.js)
  imports:
    @/lib/reasoning/capabilityDetector        → detectCapabilities
    @/lib/reasoning/capabilityExecutor        → executeCapabilities
    @/lib/reasoning/serviceDetector          → detectService
    @/lib/connectors/registry                → getConnectorsForService

SpecialistRouter (specialistRouter.js)
  imports:
    @/lib/specialists/registry               → SpecialistRegistry

contextBuilder.js
  imports:
    @/lib/skills/detector                    → buildSkillsPrompt

useVoicePipeline (hooks/useVoicePipeline.js)
  imports:
    @/hooks/useHaptics
    @/hooks/useTextToSpeech
    @/lib/audioTranscription                 → transcribeAudioBlob, isMediaRecorderSupported

audioTranscription.js
  imports:
    @/api/base44Client

conversationEngine.js
  imports:
    @/api/base44Client

knowledgeIngestionPipeline.js
  imports:
    @/api/base44Client
```

---

## 4. Fluxo de Persistência

### Fluxo texto normal (sendAndReceive):

| # | Quando | Entidade | Operação | Campos |
|---|---|---|---|---|
| 1 | Imediatamente após receber mensagem | Message | create | session_id, role:"user", content, memory_tier:"active" |
| 2 | Após receber resposta LLM | Message | create | session_id, role:"assistant", content, sources_used[], memory_tier:"active" |
| 3 | A cada 5 mensagens de usuário (condicional) | ChatSession | update | summary, last_message_at |
| 4 | A cada 5 mensagens (condicional, title === "Nova conversa") | ChatSession | update | title |
| 5 | A cada 5 mensagens (background) | Keyword | bulkCreate | session_id, message_id, project_id, source_type, keyword |
| 6 | A cada 5 mensagens (background) | KnowledgeEntity | bulkCreate | session_id, message_id, project_id, source_type, type, value, context, memory_tier |
| 7 | A cada 5 mensagens (background) | Decision | create | session_id, project_id, title, description, rationale, decided_date |
| 8 | A cada 5 mensagens (background) | Task | create | session_id, project_id, title, description, status, due_date, assignee |
| 9 | A cada 5 mensagens (background) | Topic | create | session_id, project_id, name, description, status |

### Fluxo de ingestão de conhecimento (runIngestion):

| # | Quando | Entidade | Operação | Campos |
|---|---|---|---|---|
| 1 | Início da ingestão | Message | create | role:"user", content: "📎 nome" |
| 2 | Após extração LLM | Document | create | session_id, project_id, name, file_url, file_type, source_type, extracted_text, summary, processing_status, category |
| 3 | Após Document criado | KnowledgeEntity | bulkCreate | pessoas, empresas, datas, valores, telefones, emails |
| 4 | Após Document criado | Keyword | bulkCreate | keywords extraídas |
| 5 | Após Document criado | Decision | bulkCreate | decisões extraídas |
| 6 | Após Document criado | Task | bulkCreate | tarefas extraídas |
| 7 | Após Document criado | Topic | bulkCreate | tópicos extraídos |
| 8 | Ao final da ingestão | Message | create | role:"assistant", content: resultado formatado |

### Inicialização (init):

| # | Quando | Entidade | Operação |
|---|---|---|---|
| 1 | mount do ChatPage | ChatSession | filter ou create ("Nova conversa") |
| 2 | Após session obtida | Message | filter por session_id, limit 100 |

---

## 5. Fluxo do InvokeLLM

Existem até 4 chamadas ao InvokeLLM por interação completa:

| # | Onde | Arquivo | Função | Propósito | Blocking? |
|---|---|---|---|---|---|
| 1 | memoryPipeline.js:57 | memoryPipeline.js | interpretIntent() | Detectar tipos de memória a consultar | SIM (await) |
| 2 | memoryReasoningPlanner.js:162 | memoryReasoningPlanner.js | runReasoningPlan() | Gerar resposta ao usuário | SIM (await) |
| 3 | ChatPage.jsx:115 | ChatPage.jsx | sendAndReceive() | Gerar título da sessão (condicional) | SIM (await, dentro de processConversationBatch-ish) |
| 4 | conversationEngine.js:108 | conversationEngine.js | processConversationBatch() | Extrair conhecimento estruturado (a cada 5 msgs) | NÃO (fire-and-forget) |

**Chamada extra condicional (knowledgeIngestionPipeline):**
- InvokeLLM para extração de conteúdo de arquivo/link/texto/imagem (apenas no fluxo de ingestão, não no fluxo de texto normal)

---

## 6. Fluxo das Entidades Base44

### Entidades LIDAS pelo produto (queries):

| Entidade | Onde | Query |
|---|---|---|
| ChatSession | conversationEngine.js | filter({ status:"active" }), filter({ id: sessionId }) |
| Message | ChatPage.jsx | filter({ session_id }, "created_date", 100) |
| Project | memoryPipeline.js | list("-created_date", 50) |
| Document | memoryPipeline.js | filter({ project_id, processing_status:"completed" }) |
| Decision | memoryPipeline.js | list("-decided_date", 30) |
| Task | memoryPipeline.js | list("-created_date", 50) |
| Topic | memoryPipeline.js | list("-created_date", 30) |
| KnowledgeEntity | memoryPipeline.js | filter ou list("-created_date", 100) |
| ChatSession (all) | memoryPipeline.js | list("-updated_date", 10) |
| Keyword | memoryPipeline.js | filter ou list("-created_date", 30) |
| Message (cross-session) | memoryPipeline.js | list("-created_date", 50) |

### Entidades ESCRITAS pelo produto (mutations):

| Entidade | Onde | Operação |
|---|---|---|
| ChatSession | conversationEngine.js | create, update (summary, title, last_message_at) |
| Message | ChatPage.jsx | create (user + assistant) |
| Message | ChatPage.jsx (ingestão) | create (notificações) |
| Keyword | conversationEngine.js | bulkCreate |
| Keyword | knowledgeIngestionPipeline.js | bulkCreate |
| KnowledgeEntity | conversationEngine.js | bulkCreate |
| KnowledgeEntity | knowledgeIngestionPipeline.js | bulkCreate |
| Decision | conversationEngine.js | create |
| Decision | knowledgeIngestionPipeline.js | bulkCreate |
| Task | conversationEngine.js | create |
| Task | knowledgeIngestionPipeline.js | bulkCreate |
| Topic | conversationEngine.js | create |
| Topic | knowledgeIngestionPipeline.js | bulkCreate |
| Document | knowledgeIngestionPipeline.js | create |

---

## 7. Pontos de Integração do Pipeline Cognitivo

Os pontos abaixo representam exatamente onde o Pipeline Cognitivo pode ser integrado sem quebrar o produto. Nenhum código é implementado neste documento.

### Ponto A — Entrada da mensagem (antes do processamento)
- **Arquivo:** `src/pages/ChatPage.jsx`
- **Função:** `sendAndReceive(userMsg, { setPhase })`
- **Linha:** 56
- **Momento:** Após `Message.create(role:"user")`, antes de `runReasoningPlan()`
- **Status atual:** `pipelineAdapter.execute()` — chamado aqui como fire-and-forget (Sprint INT-01)
- **Possível upgrade:** tornar bloqueante quando Intent Layer (EF-22) estiver disponível

### Ponto B — Após detecção de intent (dentro do Memory Pipeline)
- **Arquivo:** `src/lib/memoryPipeline.js`
- **Função:** `runMemoryPipeline(question, sessionId, projectId)`
- **Linha:** 343
- **Momento:** Após `interpretIntent()` retornar `{ query_types, search_keywords }`
- **Possível integração:** Intent Layer pode substituir ou enriquecer `interpretIntent()`

### Ponto C — Após Goal Detection (dentro do Planner)
- **Arquivo:** `src/lib/reasoning/memoryReasoningPlanner.js`
- **Função:** `runReasoningPlan()`
- **Linha:** 64 (após `detectGoal()`)
- **Momento:** Goal detectado, antes de Specialist Routing
- **Possível integração:** Goal Runtime pode receber o `goal` aqui e registrá-lo como objeto gerenciado

### Ponto D — Após Context Builder, antes do LLM
- **Arquivo:** `src/lib/reasoning/memoryReasoningPlanner.js`
- **Função:** `runReasoningPlan()`
- **Linha:** 144-162
- **Momento:** `prompt` montado, antes de `base44.integrations.Core.InvokeLLM({ prompt })`
- **Possível integração:** Planning Engine pode enriquecer ou validar o prompt

### Ponto E — Após resposta LLM, antes da persistência
- **Arquivo:** `src/lib/reasoning/memoryReasoningPlanner.js`
- **Função:** `runReasoningPlan()`
- **Linha:** 166 (após `InvokeLLM`, antes de `synthesizeResponse`)
- **Possível integração:** Reflection Engine pode avaliar a resposta bruta

### Ponto F — Após persistência da resposta (batch processing)
- **Arquivo:** `src/pages/ChatPage.jsx`
- **Função:** `sendAndReceive()`
- **Linha:** 123 (`processConversationBatch()`)
- **Momento:** Após salvar a resposta do assistente, no processamento de lote
- **Possível integração:** Knowledge Engine e Memory Engine podem receber os dados estruturados extraídos

---

## 8. Riscos de Integração

| Risco | Descrição | Impacto | Mitigação |
|---|---|---|---|
| R1 — Latência | Tornar CognitivePipelineAdapter bloqueante aumenta o tempo de resposta do usuário | Alto | Manter fire-and-forget até Intent Layer estar pronto |
| R2 — Falha silenciosa | O `.catch(() => {})` no Adapter oculta falhas do pipeline do usuário | Médio | Adicionar logging estruturado no Adapter (sem expor ao usuário) |
| R3 — Duplicação de Goal | detectGoal() (keyword matching) e Goal Runtime podem produzir Goals incompatíveis | Médio | Definir Goal Runtime como produtor canônico quando EF-22 estiver disponível |
| R4 — Double Intent Detection | memoryPipeline.interpretIntent() (LLM) e futura Intent Layer (EF-22) duplicam responsabilidade | Alto | Intent Layer deve substituir, não complementar, interpretIntent() |
| R5 — Context Engine ausente | MemoryEngine e KnowledgeEngine não recebem dados reais — apenas health check | Médio | Aguardar EF-20 (Context Engine) antes de conectar dados reais |
| R6 — Múltiplos chamados LLM | Até 4 chamadas InvokeLLM por mensagem — Planner não sabe sobre a do Memory Pipeline | Médio | Arquitetura atual foi desenhada assim (cada camada tem seu LLM); documentar budget |
| R7 — processConversationBatch independente | Knowledge extraction não está coordenada com o Knowledge Engine EF | Baixo | Knowledge Engine deve ser o destino oficial desta extração em Sprint futura |

---

## 9. Pipeline Cognitivo × Produto — Resposta Objetiva

Verificado diretamente no código de produção:

| Módulo EF | Utilizado no produto? | Evidência |
|---|---|---|
| Goal Runtime v0.1 | **NÃO** | Apenas via CognitivePipelineAdapter (fire-and-forget, INT-01) |
| Decision Engine v1.0 | **NÃO** | Apenas via CognitivePipelineAdapter (fire-and-forget, INT-01) |
| Planning Engine v1.0 | **NÃO** | Apenas via CognitivePipelineAdapter (fire-and-forget, INT-01) |
| Reflection Engine v1.0 | **NÃO** | Apenas via CognitivePipelineAdapter (fire-and-forget, INT-01) |
| Memory Engine v1.0 (EF) | **NÃO** | Apenas health check no Adapter |
| Knowledge Engine v1.0 (EF) | **NÃO** | Apenas health check no Adapter |
| Capability Registry v1.0 (EF) | **NÃO** | Não referenciado no fluxo do produto |
| Capability Runtime v1.0 (EF) | **NÃO** | Não referenciado no fluxo do produto |
| Connector Runtime | **NÃO** | Não referenciado no fluxo do produto |

**O que SIM é utilizado no produto:**
- `SpecialistRouter` + `SpecialistRegistry` (src/lib/routing/ + src/lib/specialists/)
- `detectCapabilities` + `executeCapabilities` (src/lib/reasoning/)
- `detectService` + `getConnectorsForService` (src/lib/reasoning/ + src/lib/connectors/)
- `runMemoryPipeline` (src/lib/memoryPipeline.js)
- `buildReasoningContext` (src/lib/reasoning/contextBuilder.js)
- `synthesizeResponse` (src/lib/reasoning/memorySynthesizer.js)
- `detectGoal` (src/lib/reasoning/goalDetector.js)
- `detectSkills` (src/lib/skills/detector.js)

---

## 10. Hooks Utilizados pelo Chat

| Hook | Arquivo | Responsabilidade |
|---|---|---|
| `useState` | React (built-in) | messages, input, loading, session, etc. |
| `useRef` | React (built-in) | bottomRef, fileInputRef, fileInputTypeRef |
| `useEffect` | React (built-in) | init(), scroll, voice pipeline setup |
| `useMemo` | React (built-in) | CognitivePipelineAdapter (singleton) |
| `useVoicePipeline` | src/hooks/useVoicePipeline.js | Push-to-talk, transcrição, TTS |
| `useHaptics` | src/hooks/useHaptics.js | Feedback háptico (via useVoicePipeline) |
| `useTextToSpeech` | src/hooks/useTextToSpeech.js | TTS (via useVoicePipeline) |

---

## 11. Services Utilizados

| Service | Arquivo | Responsabilidade |
|---|---|---|
| runMemoryPipeline | src/lib/memoryPipeline.js | Recuperação de memória do banco |
| runReasoningPlan | src/lib/reasoning/memoryReasoningPlanner.js | Orquestração central da inteligência |
| getOrCreateActiveSession | src/lib/conversationEngine.js | Gestão de sessão ativa |
| shouldProcessBatch | src/lib/conversationEngine.js | Throttle do batch processing |
| processConversationBatch | src/lib/conversationEngine.js | Extração de conhecimento em background |
| ingestKnowledge | src/lib/knowledgeIngestionPipeline.js | Ingestão de arquivos/links/texto |
| transcribeAudioBlob | src/lib/audioTranscription.js | Transcrição de áudio via Whisper |
| detectGoal | src/lib/reasoning/goalDetector.js | Classificação de objetivo (sem LLM) |
| detectSkills | src/lib/skills/detector.js | Seleção de especialistas |
| buildReasoningContext | src/lib/reasoning/contextBuilder.js | Montagem do prompt final |
| synthesizeResponse | src/lib/reasoning/memorySynthesizer.js | Limpeza determinística da resposta |
| orchestrateCapabilities | src/lib/reasoning/capabilityOrchestrator.js | Decisão e execução de capacidades |
| SpecialistRouter.route | src/lib/routing/specialistRouter.js | Roteamento para Specialists |

---

## 12. Providers Utilizados

| Provider | Arquivo | Responsabilidade |
|---|---|---|
| AuthProvider | src/lib/AuthContext.jsx | Autenticação e contexto de usuário |
| QueryClientProvider | @tanstack/react-query | Cache e estado de queries |
| BrowserRouter | react-router-dom | Roteamento SPA |
| base44 (SDK) | src/api/base44Client.js | BaaS: entities, integrations, analytics, auth |

**Não há Provider específico de Chat ou Memory no fluxo do produto.**

---

## 13. Componentes do Chat

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| ChatPage | src/pages/ChatPage.jsx | Orchestrador principal — state, send, render |
| VoiceButton | src/components/chat/VoiceButton.jsx | Botão push-to-talk |
| VoiceMode | src/components/chat/VoiceMode.jsx | Overlay de conversa contínua por voz |
| AttachmentMenu | src/components/chat/AttachmentMenu.jsx | Menu de tipos de anexo |
| ProcessingBubble | src/components/chat/ProcessingBubble.jsx | Indicador de progresso de ingestão |
| PasteTextDialog | src/components/chat/PasteTextDialog.jsx | Dialog para colar texto |
| LinkDialog | src/components/chat/LinkDialog.jsx | Dialog para inserir links |
| AppLayout | src/components/layout/AppLayout.jsx | Wrapper com sidebar |
| ReactMarkdown | react-markdown (lib) | Renderização de markdown nas respostas |

---

## 14. Fluxo de Voz

```
[usuário pressiona VoiceButton — onPressStart]
  → pipeline.startCapture()
      → startMediaRecorder()          [fallback silencioso]
      → new SpeechRecognition()
      → rec.start()
      → transitionTo("listening")

[usuário solta VoiceButton — onPressEnd]
  → pipeline.stopCapture()
      → transitionTo("transcribing")
      → rec.stop()
      → [rec.onend] ou [safety-net 2s] → processTranscription()
          → stopMediaRecorder()       [await blob]
          → text = SR final || SR interim || Whisper(blob)
          → transitionTo("retrieving")
          → onSendRef.current(text, { setPhase })
              → ChatPage.sendAndReceive(text)
                → [mesmo fluxo do texto acima]
          → transitionTo("speaking")
          → tts.speak(response)
          → transitionTo("idle")
```

---

## 15. Recomendação da Próxima Sprint

Com base no fluxo mapeado, os pontos críticos para integração real do Pipeline Cognitivo são:

### Sprint INT-02 (recomendada): Intent Layer como substituto do interpretIntent()

**Justificativa:**
- `interpretIntent()` em `memoryPipeline.js` faz uma chamada LLM completa apenas para classificar query_types
- É o ponto de entrada real do pipeline de inteligência
- Substituir por uma Intent Layer determinística (EF-22) eliminaria uma chamada LLM e tornaria o processamento mais rápido e previsível
- É o passo lógico para tornar o CognitivePipelineAdapter bloqueante sem penalizar latência

**Ponto de integração:**
- Arquivo: `src/lib/memoryPipeline.js`
- Função: `interpretIntent(question)` — linha 55
- Substituir por: `IntentLayer.detect(message)` retornando o mesmo contrato `{ query_types, is_list_query, search_keywords }`

### Sprint INT-03 (subsequente): Goal Runtime como produtor canônico

**Justificativa:**
- `detectGoal()` em `goalDetector.js` é keyword matching estático
- Goal Runtime (EF-01) tem ciclo de vida completo para Goals
- Ponto de integração: `memoryReasoningPlanner.js:64`

---

*Sprint INT-00 — 2026-07-11 — Engineering First*
*Auditoria exclusiva de fluxo — nenhum código foi criado ou modificado*