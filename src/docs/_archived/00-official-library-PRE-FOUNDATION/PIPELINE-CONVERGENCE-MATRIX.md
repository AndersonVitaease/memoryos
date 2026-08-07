# PIPELINE-CONVERGENCE-MATRIX.md
# MemoryOS — Matriz de Convergência de Pipelines
**Sprint ARC-01 · Engineering First**
Date: 2026-07-11
Type: Matriz Arquitetural
Status: OFFICIAL

---

## 1. Matriz Principal de Convergência

| Pipeline Atual | Arquivo | Pipeline EF | Módulo EF | Estratégia | Sprint Alvo |
|---|---|---|---|---|---|
| `interpretIntent()` | memoryPipeline.js:55 | Intent Layer | EF-22 | **SUBSTITUIR** — Intent Layer substitui a chamada LLM por detecção determinística | INT-02 |
| `runMemoryPipeline()` (queries paralelas) | memoryPipeline.js:108 | Context Engine | EF-20 | **INCORPORAR** — Context Engine engloba queries + buildContext interno | INT-05 |
| `detectGoal()` | reasoning/goalDetector.js | Goal Runtime | EF-01 | **INCORPORAR** — detectGoal() torna-se criador de Goal dentro de Goal Runtime | INT-03 |
| `detectSkills()` | skills/detector.js | (sem equivalente EF) | EF-25 (planejado) | **PERMANECE** — sem substituto EF disponível; candidato a EF-25 Specialist Layer | — |
| `SpecialistRouter.route()` | routing/specialistRouter.js | Capability Runtime | EF-15 | **COMPLEMENTAR** — Specialists de conhecimento permanecem; goals operacionais delegam ao Capability Runtime | INT-04 |
| `CapabilityOrchestrator` | reasoning/capabilityOrchestrator.js | Capability Runtime | EF-15 | **SUBSTITUIR** — Capability Runtime substitui CapabilityOrchestrator após EF-15 completo | INT-04 |
| `executeCapabilities()` | reasoning/capabilityExecutor.js | Capability Runtime | EF-15 | **SUBSTITUIR** — execução de capabilities migra para Capability Runtime | INT-04 |
| `detectCapabilities()` | reasoning/capabilityDetector.js | Decision Engine | EF-06 | **SUBSTITUIR** — Decision Engine assume decisão sobre quais capabilities executar | INT-03 |
| `detectService()` | reasoning/serviceDetector.js | Connector Runtime | (EF-16+) | **PERMANECE** — aguarda Connector Registry EF-16 para migração formal | — |
| `getConnectorsForService()` | connectors/registry.js | Connector Runtime | (EF-16+) | **PERMANECE** — connector lookup migra quando EF-16 consolidar os 4 registries | — |
| `buildReasoningContext()` | reasoning/contextBuilder.js | Context Engine | EF-20 | **INCORPORAR** — Context Engine engloba buildReasoningContext como seu output principal | INT-05 |
| `runReasoningPlan()` (orquestrador) | reasoning/memoryReasoningPlanner.js | Conversation Engine | EF-21 | **TRANSFORMAR** — runReasoningPlan evolui para Conversation Engine incrementalmente | INT-07 |
| `synthesizeResponse()` | reasoning/memorySynthesizer.js | Reflection Engine | EF-08 | **INCORPORAR** — Reflection Engine adiciona avaliação estruturada; synthesizeResponse torna-se etapa interna | INT-05 |
| `processConversationBatch()` | conversationEngine.js | Knowledge Engine + Memory Engine | EF-10 + EF-12 | **INCORPORAR** — extração permanece; Knowledge Engine valida; Memory Engine persiste formalmente | INT-06 |
| `getOrCreateActiveSession()` | conversationEngine.js | Conversation Engine | EF-21 | **INCORPORAR** — gestão de sessão é responsabilidade do Conversation Engine | INT-07 |
| `base44.integrations.Core.InvokeLLM()` (resposta) | memoryReasoningPlanner.js:162 | LLM Gateway | EF-23 | **ENCAPSULAR** — chamada direta migra para LLM Gateway quando EF-23 disponível | INT-08 |
| `base44.integrations.Core.InvokeLLM()` (intent) | memoryPipeline.js:57 | Intent Layer | EF-22 | **ELIMINAR** — Intent Layer determinística elimina esta chamada LLM | INT-02 |
| `base44.integrations.Core.InvokeLLM()` (batch) | conversationEngine.js:108 | Knowledge Engine | EF-10 | **ENCAPSULAR** — Knowledge Engine gerencia a extração via LLM internamente | INT-06 |
| `CognitivePipelineAdapter.execute()` | cognitive-pipeline-adapter/ | Conversation Engine | EF-21 | **TEMPORÁRIO** — scaffold de integração; substituído pelo Conversation Engine | INT-07 |

---

## 2. Matriz por Módulo EF — Onde Entra no Produto

| Módulo EF | Sprint | Ponto de Entrada no Produto | Componente Substituído | Componente Complementado | Conflito |
|---|---|---|---|---|---|
| Goal Runtime v0.1 → v1.0 | EF-01/EF-24 | `runReasoningPlan()` após detectGoal() | `detectGoal()` (keyword matching) | SpecialistRouter (recebe Goal estruturado) | Médio — detectGoal produz Goal ad-hoc incompatível |
| Goal Registry Service v1.0 | EF-02 | Interno ao Goal Runtime | Nenhum | Goal Runtime (persistence) | Nenhum |
| Goal Scheduler v1.0 | EF-03 | Apenas fluxos background | Nenhum no path crítico | Goal Runtime + Dispatcher | Médio — risco de latência se mal posicionado |
| Goal Execution Queue v1.0 | EF-04 | Apenas fluxos background | Execução síncrona de ConversationBatch | Dispatcher + Capability Runtime | Baixo — path interativo deve bypassar |
| Execution Dispatcher v1.0 | EF-05 | Apenas fluxos background | Nenhum no path crítico | Scheduler + Queue | Nenhum no path crítico |
| Decision Engine v1.0 | EF-06 | `runReasoningPlan()` — após `buildReasoningContext()` | `detectCapabilities()` + lógica `hasEnoughInfo` | Planning Engine (input) | Médio — conflito com decisão implícita no CapabilityOrchestrator |
| Planning Engine v1.0 | EF-07 | `runReasoningPlan()` — após Decision Engine | Objeto `plan` ad-hoc (analytics) em runReasoningPlan | Decision Engine (input) + Reflection Engine (baseline) | Alto — semântica de "plano" diferente |
| Reflection Engine v1.0 | EF-08 | `runReasoningPlan()` — após InvokeLLM | `synthesizeResponse()` | Planning Engine (avalia contra plano) | Baixo — aditivo |
| Self Evaluation Engine v1.0 | EF-09 | Background — após resposta persistida | Nenhum | Reflection Engine (avalia qualidade) | Nenhum |
| Knowledge Engine v1.0 | EF-10 | `processConversationBatch()` — como validador | Criação direta de entidades em ConversationBatch | Memory Engine (output) | Baixo — aditivo |
| Learning Engine v1.0 | EF-11 | Background — após Knowledge Engine | Nenhum | Knowledge Engine (input) + Memory Engine (output) | Nenhum |
| Memory Engine v1.0 | EF-12 | `processConversationBatch()` — como storage formal | Persistência direta ad-hoc (bulkCreate) | Knowledge Engine (input) | Médio — entidades Base44 são o storage real |
| Retrieval Engine v1.0 | EF-13 | `runMemoryPipeline()` — como alternativa às queries paralelas | Queries diretas às entidades Base44 | Context Engine (input) | Médio — queries paralelas são simples e eficientes |
| Capability Registry v1.0 | EF-14 | Interno ao Capability Runtime | 3 registries paralelos (consolidação) | Capability Runtime (lookup) | Alto — triplicação deve ser resolvida antes |
| Capability Runtime (EF-15) | EF-15 | `runReasoningPlan()` — onde hoje é orchestrateCapabilities() | CapabilityOrchestrator completo | Capability Registry (EF-14) + Decision Engine | Alto — EF-15 parcial, Registry triplicado |

---

## 3. Matriz de Decisão — Permanece / Substitui / Incorpora / Divide / Depreca

| Componente | Decisão | Justificativa |
|---|---|---|
| `runReasoningPlan()` | **TRANSFORMA** em Conversation Engine | É o orquestrador central — evolui, não é substituído |
| `interpretIntent()` | **SUBSTITUI** → Intent Layer (EF-22) | LLM call desnecessária; Intent Layer é determinística |
| `runMemoryPipeline()` | **DIVIDE** → Intent Layer + Context Engine | Duas responsabilidades distintas no mesmo arquivo |
| `detectGoal()` | **INCORPORA** → Goal Runtime | detectGoal é stub do ciclo de vida Goal |
| `detectSkills()` | **PERMANECE** | Sem equivalente EF; candidato a EF-25 |
| `SpecialistRouter` | **PERMANECE** + integração Capability Runtime | Specialists de conhecimento != Capabilities operacionais |
| `CapabilityOrchestrator` | **SUBSTITUI** → Capability Runtime (EF-15) | Duplicata direta do EF |
| `executeCapabilities()` | **SUBSTITUI** → Capability Runtime | Execução de capability é responsabilidade EF-15 |
| `detectCapabilities()` | **SUBSTITUI** → Decision Engine (EF-06) | Decision Engine é o árbitro formal de decisões |
| `detectService()` | **PERMANECE** | Aguarda EF-16 Connector Registry |
| `buildReasoningContext()` | **INCORPORA** → Context Engine (EF-20) | buildReasoningContext é a implementação atual do Context Engine |
| `synthesizeResponse()` | **INCORPORA** → Reflection Engine (EF-08) | Síntese é etapa de Reflection |
| `processConversationBatch()` | **INCORPORA** → Knowledge Engine + Memory Engine | Extração permanece; destino muda para ciclo de vida EF |
| `InvokeLLM (intent)` | **ELIMINA** via Intent Layer (EF-22) | Intent Layer determinística elimina esta chamada |
| `InvokeLLM (resposta)` | **ENCAPSULA** → LLM Gateway (EF-23) | Gateway isola dependência de provider |
| `InvokeLLM (batch)` | **ENCAPSULA** → Knowledge Engine (EF-10) | Knowledge Engine gerencia seu próprio LLM |
| `CognitivePipelineAdapter` | **TEMPORÁRIO** → Conversation Engine (EF-21) | Scaffold de integração INT-01; removido quando EF-21 pronto |

---

## 4. Matriz de Risco por Integração

| Integração | Risco | Motivo | Mitigação |
|---|---|---|---|
| Goal Runtime substituindo detectGoal | Alto | Incompatibilidade semântica de Goal objects | Manter detectGoal como factory interno |
| Capability Runtime substituindo CapabilityOrchestrator | Alto | EF-15 parcial + 3 Registries paralelos | EF-16 consolidação antes de INT-04 |
| Decision Engine substituindo detectCapabilities | Médio | Logic de hasEnoughInfo está acoplada ao CapabilityOrchestrator | Extrair hasEnoughInfo antes da migração |
| Planning Engine | Alto | Semântica diferente de "plano" | Redefinir contrato de plan no produto |
| Intent Layer eliminando InvokeLLM intent | Baixo | Fallback existe em interpretIntent() | Manter fallback durante transição |
| Memory Engine substituindo bulkCreate direto | Médio | Entidades Base44 são o storage real | Memory Engine como produtor, entidades como destino |

---

*Sprint ARC-01 — 2026-07-11 — Engineering First*
*Nenhum código foi criado ou modificado.*