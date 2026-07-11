# ARCHITECTURE-VALIDATION-REPORT.md
# MemoryOS — Relatório de Validação Arquitetural
**Sprint ARC-02 · Engineering First**
Date: 2026-07-11
Type: Validação Arquitetural
Status: OFFICIAL

> Baseado exclusivamente em: código-fonte real, AUDIT-Sprint0, PRODUCT-FLOW-MAPPING,
> ARCHITECTURE-UNIFICATION-STRATEGY, PIPELINE-CONVERGENCE-MATRIX, TARGET-ARCHITECTURE,
> MIGRATION-ROADMAP. Nenhuma hipótese especulativa.

---

## 1. Resumo Executivo

| Dimensão | Estado |
|---|---|
| Módulos EF certificados | 14 de ~22 planejados |
| Módulos EF no produto (operacional) | 0 de 14 |
| Pipeline produto operacional | SIM (paralelo ao EF) |
| Estratégia de convergência documentada | SIM (ARC-01) |
| Congelamento v2.0 possível | CONDICIONAL (ver Seção 9) |
| Decisões arquiteturais pendentes | 7 |
| Riscos críticos | 3 |

---

## 2. Validação por Camada Arquitetural

### 2.1 Intent Layer

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** Parcialmente. `interpretIntent()` em `memoryPipeline.js` faz a mesma coisa via LLM (1 chamada InvokeLLM). Não existe um módulo `intent-layer/` no codebase.

**Ainda faz sentido?** SIM. É o ponto de entrada da arquitetura — sem ela o pipeline EF não tem como receber mensagens do produto.

**Conflito com outro componente?** SIM. `interpretIntent()` cobre o mesmo domínio. Dois produtores de intent sem definição de qual é canônico.

**Pode ser reutilizada?** NÃO. `interpretIntent()` é LLM-based; Intent Layer deve ser determinística (classificação por regras/padrões). Semântica diferente.

**Precisa apenas de integração?** NÃO. Precisa ser implementada (EF-22) antes de integrar.

**Exige alteração arquitetural?** NÃO. O ponto de integração está identificado (PRODUCT-FLOW-MAPPING Ponto B).

**SRP:** PENDENTE DE IMPLEMENTAÇÃO — não avaliável.

**Contrato público esperado:** `IntentLayer.detect(message: string) → { intent_type, query_types, is_list_query, search_keywords, confidence }`

**Decisão pendente:** DAP-01 — Estratégia de classificação (determinística vs híbrida).

---

### 2.2 Goal Runtime

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** Parcialmente. `detectGoal()` em `goalDetector.js` (keyword matching, sem ciclo de vida). Goal Runtime v0.1 existe em `src/lib/goal-runtime-v01/` certificado com 21 cenários.

**Ainda faz sentido?** SIM. Ciclo de vida formal de Goals é necessário para rastreabilidade e tracking.

**Conflito?** SIM. `detectGoal()` no produto cria Goals ad-hoc. Goal Runtime cria Goals com registro formal. Dois produtores de Goal sem ponto de convergência definido.

**Pode ser reutilizada?** SIM — Goal Runtime v0.1 está certificado. Precisa de upgrade para v1.0 (EF-24) com `GoalRuntimeTypes.ts` separado e 28 cenários.

**SRP:** ✅ CUMPRE no módulo EF — cria e gerencia o ciclo de vida de Goals. Uma responsabilidade.

**Contrato público verificado (GoalRuntime.ts):**
- `GoalRuntime.createGoal(input)` → `Goal`
- `GoalRuntime.getGoal(id)` → `Goal | null`
- `GoalRuntime.updateStatus(id, status)` → `Goal`
- `GoalRuntime.health()`, `GoalRuntime.metrics()`, `GoalRuntime.statistics()`

**Incompatibilidade identificada:** v0.1 tem 21 cenários; padrão EF é 28. Promoção para v1.0 requerida antes da integração.

**Decisão pendente:** DAP-02 — Goal Runtime v0.1 promovido antes ou depois de INT-03?

---

### 2.3 Goal Registry Service

**Status: ✅ Validada**

**Equivalente na implementação?** SIM. `src/lib/goal-registry-service/` certificado, 22 cenários.

**Conflito?** NÃO. Não existe equivalente no produto atual. Aditivo puro.

**SRP:** ✅ CUMPRE — indexação e persistência de Goals. Não executa, não agenda, não despacha.

**Contrato público:** `GoalRegistryService.register()`, `.get()`, `.list()`, `.update()`, `.delete()`, `.statistics()`, `.health()`

**Pendência editorial:** `GoalRegistryServiceTypes.ts` ausente (tipos inline). Não bloqueia integração, mas viola padrão EF.

---

### 2.4 Goal Scheduler

**Status: ✅ Validada**

**Equivalente na implementação?** NÃO existe no produto. Módulo EF certificado em `src/lib/goal-scheduler/`, 22 cenários.

**Conflito?** NÃO. Aditivo puro — produto não tem scheduling de Goals.

**Restrição identificada:** Scheduler é adequado apenas para goals de background. Goals interativos (resposta ao usuário em tempo real) devem bypassar o Scheduler para preservar latência. Esta restrição não está documentada no contrato público do módulo.

**SRP:** ✅ CUMPRE — agenda Goals para execução temporal. Não executa, não registra, não despacha.

**Contrato público:** `GoalScheduler.schedule()`, `.cancel()`, `.getScheduled()`, `.health()`

---

### 2.5 Execution Dispatcher

**Status: ✅ Validada**

**Equivalente na implementação?** NÃO existe no produto. Módulo EF certificado em `src/lib/execution-dispatcher/`, 24 cenários.

**Conflito?** NÃO. Aditivo puro.

**SRP:** ✅ CUMPRE — move Goals do Scheduler para a Queue. Não executa, não avalia, não agenda.

**Contrato público:** `ExecutionDispatcher.dispatch()`, `.dispatchReadyGoals()`, `.cancelDispatch()`, `.health()`

---

### 2.6 Goal Execution Queue

**Status: ✅ Validada**

**Equivalente na implementação?** NÃO existe no produto. Módulo EF certificado em `src/lib/goal-execution-queue/`, 24 cenários.

**Conflito?** NÃO. Aditivo puro.

**Restrição:** mesma do Scheduler — adequado apenas para background. Goals interativos devem ter path direto sem Queue.

**SRP:** ✅ CUMPRE — ordena Goals por prioridade para execução. Priority DESC → FIFO tiebreak.

**Contrato público:** `GoalExecutionQueue.enqueue()`, `.dequeue()`, `.peek()`, `.remove()`, `.health()`

---

### 2.7 Decision Engine

**Status: ✅ Validada (com sobreposição documentada)**

**Equivalente na implementação?** SIM — sobreposição parcial. `detectCapabilities()` + lógica `hasEnoughInfo` em `capabilityOrchestrator.js` cobre decisões sobre capabilities. Decision Engine EF certificado em `src/lib/decision-engine/`, 24 cenários.

**Conflito?** SIM — sobreposição de responsabilidade com `detectCapabilities()`. Dois tomadores de decisão sobre capabilities.

**SRP:** ✅ CUMPRE no módulo EF — avalia candidatos, seleciona com scoring, produz ExecutionDecision. Uma responsabilidade.

**Sobreposição identificada:** `capabilityOrchestrator.detectCapabilities()` decide quais capabilities ativar. Decision Engine faz o mesmo com estrutura formal. Após migração (Fase 3), apenas Decision Engine deve existir.

**Contrato público:** `DecisionEngine.decide()`, `.evaluate()`, `.selectCandidate()`, `.health()`

---

### 2.8 Planning Engine

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** Parcialmente. O objeto `plan` ad-hoc em `runReasoningPlan()` (linhas 178-191 de memoryReasoningPlanner.js) é um objeto informativo de analytics, não um ExecutionPlan formal. Planning Engine EF certificado em `src/lib/planning-engine/`, 24 cenários.

**Conflito?** SIM — divergência semântica. O `plan` do produto é: `{ goal, skills, sourcesCount, capabilities, responseTimeMs }` — metadados de analytics. O `ExecutionPlan` do Planning Engine é: `{ steps[], complexity, estimatedMs, risk }` — plano de execução formal. São semanticamente diferentes.

**SRP:** ✅ CUMPRE no módulo EF — transforma decisão em plano de execução imutável.

**Decisão pendente:** DAP-03 — Redefinição de semântica de "plano" no produto (analytics vs. executável).

**Contrato público:** `PlanningEngine.plan()`, `.createPlan()`, `.health()`

---

### 2.9 Reflection Engine

**Status: ✅ Validada (com incorporação definida)**

**Equivalente na implementação?** Parcialmente. `synthesizeResponse()` em `memorySynthesizer.js` faz limpeza determinística básica (deduplicação, normalização). Reflection Engine EF certificado em `src/lib/reflection-engine/`, 24 cenários. Reflection Engine é semanticamente superior: avalia qualidade, confidence, risk, verdict.

**Conflito?** NÃO — complementar. `synthesizeResponse()` torna-se etapa interna do Reflection Engine (etapa SYNTHESIS).

**SRP:** ✅ CUMPRE no módulo EF — avalia resultado de execução contra o plano. Uma responsabilidade.

**SRP de synthesizeResponse():** ✅ CUMPRE — limpeza determinística de string. Pode ser reutilizado internamente.

**Contrato público:** `ReflectionEngine.evaluate()`, `.reflect()`, `.health()`

---

### 2.10 Capability Registry

**Status: ❌ Incompatível (triplicação)**

**Equivalente na implementação?** SIM — triplicado.

| Implementação | Localização | Tipo |
|---|---|---|
| Oficial EF-14 | `src/lib/capability-registry/` | TypeScript, certificado (28 cenários) |
| Duplicata no Runtime | `src/lib/capability-runtime/CapabilityRegistry.ts` | TypeScript, embutido |
| Legado | `src/lib/capabilities/registry/` | JavaScript, pré-EF |

**Conflito?** SIM — crítico. Três implementações paralelas com nomes idênticos. Qualquer referência a "CapabilityRegistry" é ambígua.

**SRP:** ✅ CUMPRE no módulo oficial EF-14 — índice central de capabilities disponíveis.

**Incompatível porque:** Capability Runtime (EF-15) referencia seu próprio CapabilityRegistry interno em vez do oficial EF-14. Isto viola o princípio de registro central único.

**Ação obrigatória antes de qualquer integração:** Consolidação dos 3 registries. Sem consolidação, EF-15 não pode ser integrado corretamente.

---

### 2.11 Capability Runtime

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** SIM — parcialmente. `CapabilityOrchestrator` no produto (`capabilityOrchestrator.js`) cobre o mesmo domínio. Capability Runtime EF existe em `src/lib/capability-runtime/` mas com `testCount=0` (estrutura de teste diferente — não contabilizada pelo auditor padrão).

**Conflito?** SIM — `CapabilityOrchestrator` e Capability Runtime são substitutos diretos. Dois executores de capabilities.

**SRP:** ✅ CUMPRE a intenção — executa capabilities via Executor. Porém sem cenários formais contáveis, certificação não confirmada pelo padrão EF.

**Decisão pendente:** DAP-04 — Capability Runtime deve ser certificado antes de INT-04.

---

### 2.12 Connector Registry

**Status: ❌ Incompatível (quadruplicação)**

**Equivalente na implementação?** SIM — quadruplicado.

| Implementação | Localização | Tipo |
|---|---|---|
| Primário (legado) | `src/lib/connector-registry/` | JavaScript, 11 arquivos |
| Embutido no Runtime | `src/lib/connector-runtime/ConnectorRegistry.ts` | TypeScript |
| Enterprise Integration | `src/lib/enterprise-integration/connectorRegistry.js` | JavaScript |
| SDK | `src/lib/connector-sdk/` | JavaScript, 12 arquivos |

**Conflito?** SIM — crítico. Quatro implementações sem definição de qual é canônico. O produto usa `getConnectorsForService()` de `src/lib/connectors/registry.js` — um quinto arquivo não contabilizado nas 4 acima.

**SRP:** INDETERMINATE — sem definição de qual é o canonical, SRP não pode ser avaliado.

**Ação obrigatória:** EF-16 (Connector Registry v1.0) deve consolidar todas as implementações antes de qualquer integração de Connector Runtime.

---

### 2.13 Connector Runtime

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** Parcialmente. `src/lib/connector-runtime/` existe com Types, Connectors (Base44, GitHub), testes separados. `detectService()` + `getConnectorsForService()` no produto cobre o domínio de serviços/conectores de forma simplificada.

**Conflito?** Médio. `detectService()` identifica serviços semanticamente (sem conectar). Connector Runtime executa. São complementares mas operam em layers diferentes.

**SRP:** ✅ CUMPRE a intenção — executa ações em sistemas externos via Connectors. Não decide, não planeja.

**Decisão pendente:** DAP-05 — Connector Runtime precisa de EF-16 (Connector Registry consolidado) antes de ser integrado.

---

### 2.14 Memory Engine

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** SIM — duplicado.

| Implementação | Localização | Tipo |
|---|---|---|
| Oficial EF-12 | `src/lib/memory-engine-v1/` | TypeScript, certificado (28 cenários) |
| Legado | `src/lib/memory-engine/` | JavaScript, 47 arquivos |

**Conflito?** SIM — dois Memory Engines sem definição de qual está ativo no produto. O produto usa persistência direta nas entidades Base44 (não usa nenhum dos dois).

**SRP de EF-12:** ✅ CUMPRE — transforma Learning em Memory imutável. Uma responsabilidade.

**SRP do legado:** ❌ NÃO CUMPRE — 47 arquivos JS cobrindo retrieval, consolidation, lifecycle, embedding, vector index, relationships, versioning. Responsabilidades múltiplas sem separação EF.

**Decisão pendente:** DAP-06 — Cronograma de deprecação do legado `memory-engine/` (47 arquivos).

---

### 2.15 Knowledge Engine

**Status: ✅ Validada**

**Equivalente na implementação?** Parcialmente. `processConversationBatch()` faz extração de conhecimento via LLM e persiste diretamente. Knowledge Engine EF certificado em `src/lib/knowledge-engine/`, 28 cenários. A diferença é que o produto persiste sem validação; Knowledge Engine valida antes de persistir.

**Conflito?** NÃO — complementar. processConversationBatch faz extração; Knowledge Engine faz validação/qualificação. Camadas diferentes.

**SRP:** ✅ CUMPRE — filtra SelfEvaluations em Knowledge estruturado. Uma responsabilidade.

**Contrato público:** `KnowledgeEngine.process()`, `.filter()`, `.health()`

---

### 2.16 Context Engine

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** SIM — implementado de forma distribuída em 2 funções sem módulo dedicado:
- `interpretIntent()` → classificação de contexto necessário
- `buildContext()` interno ao `runMemoryPipeline()` → construção do contexto estruturado
- `buildReasoningContext()` em `contextBuilder.js` → montagem do prompt

Context Engine EF não existe (`context-engine/` ausente no codebase).

**Ainda faz sentido?** SIM. As 3 funções acima provam que a responsabilidade existe e é necessária. Apenas não está formalizada como módulo EF.

**SRP das implementações atuais:**
- `interpretIntent()`: ❌ Não cumpre SRP individualmente — está embutida em `runMemoryPipeline()` que faz 3 coisas
- `buildReasoningContext()`: ✅ Cumpre — monta prompt. Uma responsabilidade.

**Decisão pendente:** EF-20 deve ser implementado antes de INT-05.

---

### 2.17 Conversation Engine

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** SIM — `runReasoningPlan()` em `memoryReasoningPlanner.js` É o Conversation Engine de fato. Orquestra todo o pipeline de resposta. Conversation Engine EF não existe (`conversation-engine/` ausente).

**Ainda faz sentido?** SIM. É a camada de interface entre a UI e o pipeline cognitivo.

**SRP de runReasoningPlan():** ❌ NÃO CUMPRE — faz 8 coisas: retrieval, skill detection, goal detection, specialist routing, capability orchestration, context building, LLM call, synthesis. Múltiplas responsabilidades. Por design — é o orquestrador. Isso é válido para um Conversation Engine, mas violaria SRP se fosse um módulo EF simples.

**Conflito?** NÃO com outros módulos. Conflito interno com SRP.

**Resolução:** Conversation Engine é um orquestrador por natureza — SRP aplica-se como "coordenar a conversa" (responsabilidade única de coordenação). Cada etapa que ele chama é responsabilidade de outro módulo.

**Decisão pendente:** EF-21 deve ser implementado antes de INT-07.

---

### 2.18 Reasoning Engine

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** Parcialmente. `src/lib/reasoning/` existe com 11 arquivos JS sem Types TS nem index EF. Contém: memoryReasoningPlanner, contextBuilder, goalDetector, capabilityOrchestrator, memorySynthesizer, etc. É uma pasta de utilitários, não um módulo EF formal.

**Ainda faz sentido como módulo separado?** INCERTO. A responsabilidade de "raciocínio" está distribuída pelo Conversation Engine + Context Engine + Planning Engine + Reflection Engine. Um Reasoning Engine separado pode criar sobreposição com todos eles.

**Decisão pendente:** DAP-07 — Reasoning Engine como módulo EF separado ou responsabilidade distribuída entre EF-20/21?

---

### 2.19 LLM Gateway

**Status: 🟡 Requer decisão**

**Equivalente na implementação?** NÃO. `base44.integrations.Core.InvokeLLM()` é chamado diretamente em 4 lugares sem abstração. LLM Gateway EF não existe (`llm-gateway/` ausente).

**Ainda faz sentido?** SIM. Gateway isola dependência de provider, adiciona circuit breaker e logging centralizado.

**SRP esperado:** ✅ Uma responsabilidade — proxy isolado para LLM calls.

**Impacto se não implementado:** O produto continua funcionando, mas com dependência direta não isolada. Risco de vendor lock-in.

**Decisão pendente:** EF-23 é obrigatório ou opcional para v2.0?

---

## 3. Validação SRP Consolidada

| Módulo | SRP | Observação |
|---|---|---|
| Goal Runtime v0.1 | ✅ | Cria e gerencia Goals |
| Goal Registry | ✅ | Registra e indexa Goals |
| Goal Scheduler | ✅ | Agenda Goals temporalmente |
| Execution Dispatcher | ✅ | Move Goals do Scheduler para Queue |
| Goal Execution Queue | ✅ | Ordena Goals para execução |
| Decision Engine | ✅ | Avalia e seleciona candidatos |
| Planning Engine | ✅ | Transforma decisão em plano |
| Reflection Engine | ✅ | Avalia resultado contra plano |
| Self Evaluation Engine | ✅ | Score de qualidade |
| Knowledge Engine | ✅ | Filtra execuções em Knowledge |
| Learning Engine | ✅ | Transforma Knowledge em Learning |
| Memory Engine (EF-12) | ✅ | Transforma Learning em Memory |
| Retrieval Engine | ✅ | Recuperação semântica |
| Capability Registry (EF-14) | ✅ | Índice central de capabilities |
| `runReasoningPlan()` | ⚠️ | Orquestrador legítimo — SRP como "coordenar conversa" |
| `runMemoryPipeline()` | ❌ | 3 responsabilidades: intent + query + context build |
| `interpretIntent()` | ❌ | Embutida em runMemoryPipeline — não isolada |
| Memory Engine (legado) | ❌ | 47 arquivos, múltiplas responsabilidades |
| `CapabilityOrchestrator` | ❌ | Detecta + executa + verifica serviço + verifica conector — 4 responsabilidades |

---

## 4. Fluxo Cognitivo — Validação

**O pipeline oficial continua adequado?** SIM com dois pontos de divergência identificados.

**Divergência 1 — Path interativo vs. assíncrono não especificado:**
A arquitetura oficial descreve um único pipeline linear (Intent → Goal → Scheduler → Queue → ...). O produto precisa de dois paths distintos:
- **Path interativo** (< 2s): Intent → Goal → Decision → Planning → Context → LLM → Reflection
- **Path background** (assíncrono): Goal → Scheduler → Dispatcher → Queue → Capability → Knowledge → Memory

O pipeline oficial atual não distingue esses dois paths. Goals interativos que passam pelo Scheduler/Queue adicionariam latência inaceitável.

**Divergência 2 — Posição do Reasoning Engine:**
A arquitetura oficial posiciona Reasoning Engine entre Reflection Engine e LLM Gateway. No produto, "raciocínio" é distribuído por múltiplas camadas. Não existe um ponto único onde inserir um Reasoning Engine sem duplicar responsabilidades de outros módulos.

---

## 5. Contratos Públicos — Incompatibilidades Identificadas

| Módulo | Contrato Atual | Incompatibilidade | Ação |
|---|---|---|---|
| Goal Runtime | `GoalRuntime.createGoal()` → `Goal` | `detectGoal()` retorna `{ id, label, strategy, type }` — formato diferente | Congelar contrato Goal antes de INT-03 |
| Planning Engine | `PlanningEngine.plan()` → `ExecutionPlan` | `plan` ad-hoc em produto é analytics, não ExecutionPlan | Congelar semântica antes de INT-03 |
| Capability Registry | `CapabilityRegistry.register()` | 3 implementações com APIs diferentes | Consolidar antes de INT-04 |
| Context Engine | Não existe | `buildReasoningContext()` retorna string | Definir contrato antes de EF-20 |
| Conversation Engine | Não existe | `runReasoningPlan()` retorna `{ response, plan, sources }` | Congelar como contrato de Conversation Engine |

**Contratos que devem ser congelados imediatamente:**
1. `runReasoningPlan()` → `{ response, plan, sources }` — é o contrato do futuro Conversation Engine
2. `Goal` object type — unificar `detectGoal()` output com GoalTypes EF-01
3. `ExecutionPlan` semantics — distinguir plan-analytics de plan-executável

---

## 6. Dependências — Acoplamentos e Violações

### Acoplamentos excessivos identificados:

**A1 — `memoryReasoningPlanner.js` acopla 7 módulos:**
Imports diretos: memoryPipeline, skills/detector, goalDetector, contextBuilder, memorySynthesizer, capabilityOrchestrator, specialistRouter, macrFormatterV4. Acoplamento alto mas justificado para um orquestrador.

**A2 — `capabilityOrchestrator.js` acopla Connector Registry:**
Import direto de `@/lib/connectors/registry` — connector lookup acoplado ao capability orchestration. Violação: orchestrator não deveria conhecer conectores diretamente.

**A3 — `processConversationBatch()` acessa 5 entidades Base44 diretamente:**
Sem camada de abstração entre extraction logic e persistence. Correto para o produto atual; violação quando Knowledge Engine assumir.

### Dependências circulares:
Nenhuma dependência circular identificada nos módulos EF certificados.

### Violações arquiteturais identificadas:

**V1 — Capability Runtime (EF-15) usa Capability Registry interno:**
`src/lib/capability-runtime/CapabilityRegistry.ts` em vez de `src/lib/capability-registry/` (EF-14 oficial). Viola o princípio de registry central único.

**V2 — `interpretIntent()` acessa InvokeLLM diretamente:**
Intent classification via LLM sem passar por LLM Gateway. Aceitável no estado atual (Gateway não existe); violação quando EF-23 for implementado.

**V3 — `runMemoryPipeline()` mistura Intent detection com Context building:**
Duas responsabilidades arquiteturalmente distintas no mesmo arquivo. Identificado em AUDIT-Sprint0, confirmado aqui.

---

*Sprint ARC-02 — 2026-07-11 — Engineering First*
*Nenhuma alteração foi realizada.*