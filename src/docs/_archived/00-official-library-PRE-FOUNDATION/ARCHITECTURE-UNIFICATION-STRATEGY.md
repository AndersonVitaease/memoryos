# ARCHITECTURE-UNIFICATION-STRATEGY.md
# MemoryOS — Estratégia Oficial de Unificação Arquitetural
**Sprint ARC-01 · Engineering First**
Date: 2026-07-11
Type: Estratégia Arquitetural
Status: OFFICIAL

> Fontes: AUDIT-Sprint0-2026-07-11.md · PRODUCT-FLOW-MAPPING.md · código-fonte real
> Nenhum código foi criado ou modificado neste documento.

---

## 1. Diagnóstico da Situação Atual

O MemoryOS possui duas arquiteturas operando em paralelo sem ponto de convergência definido:

**Pipeline A — Produto (operacional, em produção):**
```
ChatPage → sendAndReceive() → runReasoningPlan()
  → runMemoryPipeline() → detectGoal() → SpecialistRouter
  → CapabilityOrchestrator → ContextBuilder
  → InvokeLLM() → MemorySynthesizer() → ConversationBatch()
```

**Pipeline B — Engineering First (certificado, não operacional no produto):**
```
Intent Layer → Goal Runtime → Goal Registry → Goal Scheduler
  → Execution Dispatcher → Goal Execution Queue
  → Decision Engine → Planning Engine → Reflection Engine
  → Capability Registry → Capability Runtime
  → Memory Engine → Knowledge Engine
```

**Estado atual:** Pipeline B existe apenas como unidade de teste certificada. Nenhuma rota de produto utiliza Goal Runtime, Decision Engine, Planning Engine ou qualquer outro módulo EF diretamente. A conexão existente (CognitivePipelineAdapter, Sprint INT-01) é fire-and-forget e não afeta a resposta ao usuário.

---

## 2. Análise de Cada Componente do Pipeline Atual

### 2.1 runReasoningPlan (memoryReasoningPlanner.js)

**Função atual:** Orquestrador central. Chama todos os outros componentes em sequência. Único ponto de entrada para geração de resposta.

**Destino:** **PERMANECE — com extensões incrementais.**

**Justificativa técnica:** É a cola que une todos os componentes. Sua responsabilidade de orquestração é legítima e equivalente ao papel que Conversation Engine (EF-21) terá. A migração correta é transformá-lo progressivamente em Conversation Engine, não substituí-lo abruptamente. Cada integração EF entrará como chamada dentro do Planner, sem alterar o contrato externo (`{ response, plan, sources }`).

**Trajetória:** runReasoningPlan → Conversation Engine v1.0 (EF-21)

---

### 2.2 runMemoryPipeline (memoryPipeline.js)

**Função atual:** Recuperação de memória em duas fases: (1) InvokeLLM para classificar intent, (2) queries paralelas ao banco.

**Destino:** **SERÁ DIVIDIDO em duas responsabilidades separadas.**

**Justificativa técnica:** A função `interpretIntent()` dentro de `runMemoryPipeline` faz uma chamada LLM completa para classificar query_types. Isso é exatamente a responsabilidade da Intent Layer (EF-22). A segunda fase (queries paralelas + buildContext) pertence ao Context Engine (EF-20). O arquivo atual faz duas coisas distintas que devem ser módulos EF separados.

**Trajetória:**
- `interpretIntent()` → Intent Layer v1.0 (EF-22)
- Queries paralelas + buildContext → Context Engine v1.0 (EF-20)

---

### 2.3 detectGoal (goalDetector.js)

**Função atual:** Keyword matching estático. Classifica o objetivo da mensagem em ~12 categorias. Sem LLM. Resultado: `{ id, label, strategy, type, priority }`.

**Destino:** **SERÁ INCORPORADO pelo Goal Runtime v1.0.**

**Justificativa técnica:** `detectGoal()` é uma implementação simplificada de criação de Goal. O Goal Runtime (EF-01) possui o ciclo de vida completo de um Goal (create, register, schedule, dispatch, queue). `detectGoal()` deve tornar-se o stub interno que o Goal Runtime usa para criar o objeto Goal inicial. O contrato de saída de `detectGoal()` é compatível com GoalTypes do EF-01.

**Trajetória:** detectGoal() incorporado como `GoalRuntime.createFromMessage(message)` — Sprint INT-03.

---

### 2.4 detectSkills (skills/detector.js)

**Função atual:** Seleciona especialistas de domínio com base na mensagem + contexto. Array de skills ativas que guiam o prompt do ContextBuilder.

**Destino:** **PERMANECE — sem substituto EF equivalente definido.**

**Justificativa técnica:** Nenhum módulo EF certificado (EF-01 a EF-14) possui a responsabilidade de detectar e selecionar Specialists de domínio semântico (financeiro, jurídico, marketing, etc.). A arquitetura EF prevê Capability Runtime (EF-15) para capacidades operacionais, não para Specialists de conhecimento. `detectSkills()` + `SpecialistRegistry` representam uma camada de conhecimento sem equivalente EF — deve permanecer até que EF-22+ defina o modelo oficial de Specialists.

**Trajetória:** Permanece. Candidato a ser formalizado como EF-25 (Specialist Layer).

---

### 2.5 SpecialistRouter (routing/specialistRouter.js)

**Função atual:** Recebe um Goal, consulta SpecialistRegistry, retorna o Specialist se houver. Curto-circuita o fluxo LLM quando um Specialist assume.

**Destino:** **PERMANECE — integração com Capability Runtime como próxima etapa.**

**Justificativa técnica:** SpecialistRouter faz roteamento baseado em `goal.type === "specialist"`. Quando Capability Runtime (EF-15) estiver disponível, o roteamento de capacidades operacionais deve passar por ele. Porém Specialists de conhecimento (ArchitectureAuditor, etc.) não são Capabilities operacionais — têm pipeline próprio. Manter SpecialistRouter para Specialists de conhecimento; adicionar rota para Capability Runtime nos demais casos.

**Trajetória:** Permanece + delegate para Capability Runtime (EF-15) para goals operacionais.

---

### 2.6 CapabilityOrchestrator (reasoning/capabilityOrchestrator.js)

**Função atual:** Decide e executa capacidades (web_search, calculation, documents, official_library). Detecta serviços e conectores. Retorna resultados para o ContextBuilder.

**Destino:** **SERÁ SUBSTITUÍDO pelo Capability Runtime (EF-15) + Connector Runtime.**

**Justificativa técnica:** `CapabilityOrchestrator` é uma implementação JavaScript pré-EF das responsabilidades que pertencem ao Capability Runtime (EF-15). Capability Runtime tem Types certificados, ciclo de vida formal e integração com Capability Registry (EF-14). A duplicação de responsabilidade é direta: `executeCapabilities()` ≡ `CapabilityRuntime.execute(plan)`.

**Trajetória:** Substituído por Capability Runtime v2.0 (EF-15) — Sprint INT-04.

---

### 2.7 ContextBuilder (reasoning/contextBuilder.js)

**Função atual:** Monta o prompt final do LLM. Injeta memória, skills, goal, histórico, resultados de capacidades, informações de serviço. Produz string de ~3000 tokens.

**Destino:** **SERÁ INCORPORADO pelo Context Engine (EF-20).**

**Justificativa técnica:** `buildReasoningContext()` é a implementação atual do Context Engine. Monta o contexto cognitivo completo para o LLM. Context Engine (EF-20) deve assumir essa responsabilidade com estrutura EF formal. A migração é direta: `buildReasoningContext(params)` → `ContextEngine.build(params)` com mesmo contrato de entrada e saída.

**Trajetória:** buildReasoningContext() → Context Engine v1.0 (EF-20) — Sprint INT-05.

---

### 2.8 MemorySynthesizer (reasoning/memorySynthesizer.js)

**Função atual:** Limpeza determinística pós-LLM. Remove duplicatas, colapsa linhas em branco, trim. Sem chamada LLM.

**Destino:** **SERÁ INCORPORADO pela Reflection Engine (EF-08).**

**Justificativa técnica:** `synthesizeResponse()` é uma forma simplificada de pós-processamento de resposta — exatamente a responsabilidade do Reflection Engine (EF-08). Reflection Engine avalia resultado de execução, e síntese determinística é uma etapa de avaliação. A incorporação é natural e não quebra nenhum contrato existente.

**Trajetória:** synthesizeResponse() → Reflection Engine v1.0 (EF-08) como etapa `SYNTHESIS` — Sprint INT-05.

---

### 2.9 ConversationBatch (conversationEngine.js → processConversationBatch)

**Função atual:** A cada 5 mensagens, extrai conhecimento estruturado via LLM (summary, topics, entities, decisions, tasks, keywords) e persiste nas entidades Base44.

**Destino:** **SERÁ INCORPORADO pelo Knowledge Engine (EF-10) + Memory Engine (EF-12).**

**Justificativa técnica:** `processConversationBatch()` faz exatamente o que Knowledge Engine (EF-10) deve fazer: transformar conversas em Knowledge estruturado. A diferença é que atualmente é LLM-driven sem ciclo de vida EF. Knowledge Engine deve ser o destino oficial destes dados; Memory Engine deve receber os Knowledge aprovados. A migração é de destino de dados, não de substituição de lógica.

**Trajetória:** processConversationBatch() → Knowledge Engine (EF-10) → Memory Engine (EF-12) — Sprint INT-06.

---

## 3. Análise de Cada Módulo Engineering First

### 3.1 Goal Runtime v0.1 (EF-01)

**Onde entra no produto:** Ponto C do PRODUCT-FLOW-MAPPING — após `detectGoal()` em `runReasoningPlan()` linha 64.

**Ponto de chamada:** `runReasoningPlan()` → após detectGoal(), antes de SpecialistRouter.

**Substitui:** `detectGoal()` (keyword matching estático).

**Complementa:** SpecialistRouter (recebe Goal estruturado como input).

**Conflito de responsabilidade:** Sim. `detectGoal()` cria um objeto Goal ad-hoc sem ciclo de vida. Goal Runtime cria Goal com registro, agendamento e despacho. Quando integrado, `detectGoal()` deve tornar-se apenas o inicializador de intenção dentro de Goal Runtime, não um produtor independente.

---

### 3.2 Goal Registry Service v1.0 (EF-02)

**Onde entra:** Invisível para o produto — gerenciamento interno do Goal Runtime.

**Ponto de chamada:** Interno ao Goal Runtime após criação do Goal.

**Substitui:** Nenhum componente atual — não existe Registry de Goals no produto.

**Complementa:** Goal Runtime (persistence layer do ciclo de vida do Goal).

**Conflito:** Nenhum. Aditivo puro.

---

### 3.3 Goal Scheduler v1.0 (EF-03)

**Onde entra:** Interno ao ciclo de vida do Goal — após registro, antes do despacho.

**Ponto de chamada:** Interno entre Goal Registry e Execution Dispatcher.

**Substitui:** Nenhum — não existe scheduling no produto atual.

**Complementa:** Goal Runtime + Goal Registry como terceiro anel do ciclo de vida.

**Conflito:** Potencial de latência. No produto atual, tudo é síncrono e em tempo real. Goal Scheduler é assíncrono por natureza. A integração deve garantir que o path de resposta ao usuário não passe pelo Scheduler — apenas goals de background podem usar scheduling completo.

---

### 3.4 Execution Dispatcher v1.0 (EF-05)

**Onde entra:** Entre Scheduler e Execution Queue — invisível para o usuário.

**Ponto de chamada:** Interno entre Scheduler e Queue.

**Substitui:** Nenhum — não existe dispatch layer no produto.

**Complementa:** Scheduler + Queue como camada de roteamento.

**Conflito:** Nenhum. Aditivo puro no pipeline EF.

---

### 3.5 Goal Execution Queue v1.0 (EF-04)

**Onde entra:** Fila de execução — relevante para goals em background (ConversationBatch, ingestão).

**Ponto de chamada:** Pós-despacho, pré-execução de capability.

**Substitui:** Execução imediata síncrona atual de ConversationBatch e ingestão.

**Complementa:** Dispatcher como destino da fila.

**Conflito:** Baixo. Goals interativos (resposta ao usuário) devem bypassar a Queue para manter latência baixa. A Queue é adequada apenas para goals de background.

---

### 3.6 Decision Engine v1.0 (EF-06)

**Onde entra:** Ponto D do PRODUCT-FLOW-MAPPING — após ContextBuilder, antes do LLM.

**Ponto de chamada:** Em `runReasoningPlan()` após `buildReasoningContext()`, para validar/enriquecer o plano antes do LLM.

**Substitui:** Lógica de decisão implícita dentro do CapabilityOrchestrator (detectCapabilities + hasEnoughInfo).

**Complementa:** Planning Engine (input para o plano de execução).

**Conflito:** Médio. `detectCapabilities()` e `hasEnoughInfo` fazem decisões sobre o que executar. Decision Engine deve ser o árbitro formal dessas decisões. A migração exige que `CapabilityOrchestrator` delegue a decisão ao Decision Engine sem duplicar a lógica.

---

### 3.7 Planning Engine v1.0 (EF-07)

**Onde entra:** Ponto D — junto ao Decision Engine, antes da chamada LLM.

**Ponto de chamada:** Após Decision Engine, produz ExecutionPlan com steps e estimativas.

**Substitui:** O objeto `plan` ad-hoc montado em `runReasoningPlan()` (linhas 178-191) — estrutura informal sem ciclo de vida.

**Complementa:** Decision Engine (recebe decisão, produz plano) e Reflection Engine (plano é o baseline para avaliação).

**Conflito:** Alto. O `plan` atual em `runReasoningPlan()` é um objeto informativo (analytics), não um plano executável. Planning Engine produz um ExecutionPlan imutável com steps, complexity e estimativas — semanticamente diferente. A migração exige redefinir o que é um "plano" no produto.

---

### 3.8 Reflection Engine v1.0 (EF-08)

**Onde entra:** Ponto E do PRODUCT-FLOW-MAPPING — após InvokeLLM, antes de synthesizeResponse.

**Ponto de chamada:** `runReasoningPlan()` linha 166 — entre InvokeLLM e synthesizeResponse.

**Substitui:** `synthesizeResponse()` (MemorySynthesizer) — que é limpeza determinística básica.

**Complementa:** Planning Engine (avalia resultado contra o plano).

**Conflito:** Baixo. `synthesizeResponse()` é uma operação conservadora (sem LLM, sem decisão). Reflection Engine adiciona avaliação estruturada (confidence, risk, verdict). A integração é aditiva: Reflection Engine chama synthesizeResponse internamente como uma de suas etapas.

---

### 3.9 Capability Registry v1.0 (EF-14)

**Onde entra:** Como lookup para Capability Runtime — não tem ponto de entrada direto no produto atual.

**Ponto de chamada:** Dentro de Capability Runtime (EF-15), que substituirá CapabilityOrchestrator.

**Substitui:** Os 3 Capability Registries paralelos identificados no AUDIT-Sprint0 (capability-registry oficial, capability-runtime/CapabilityRegistry, capabilities/registry legado).

**Complementa:** Capability Runtime como source-of-truth de capacidades disponíveis.

**Conflito:** Alto — triplicação. A consolidação deve ocorrer antes da integração do Capability Runtime no produto.

---

### 3.10 Capability Runtime (EF-15 — parcial)

**Onde entra:** Substituto direto do CapabilityOrchestrator no produto.

**Ponto de chamada:** `runReasoningPlan()` → onde hoje é `orchestrateCapabilities()`.

**Substitui:** `CapabilityOrchestrator` + `detectCapabilities()` + `executeCapabilities()`.

**Complementa:** Decision Engine (recebe decisão sobre quais capabilities executar).

**Conflito:** Alto. Capability Runtime atual é parcial (testCount=0). Precisa de EF-15 completo + consolidação dos 3 Registries antes de entrar no produto.

---

### 3.11 Memory Engine v1.0 (EF-12)

**Onde entra:** Ponto F — destino final dos dados estruturados do ConversationBatch.

**Ponto de chamada:** Após Knowledge Engine processar o batch — como repositório de memórias aprovadas.

**Substitui:** Persistência direta ad-hoc de `processConversationBatch()` (bulkCreate direto nas entidades).

**Complementa:** Knowledge Engine (recebe Knowledge aprovado e o transforma em Memory).

**Conflito:** Médio. Persistência atual vai direto para entidades Base44 sem ciclo de vida formal. Memory Engine adiciona lifecycle (PENDING → APPROVED → STORED). A migração exige que as entidades Base44 (KnowledgeEntity, Decision, Task, Topic) continuem como storage, mas com Memory Engine como produtor canônico.

---

### 3.12 Knowledge Engine v1.0 (EF-10)

**Onde entra:** Ponto F — processamento do batch de conversação.

**Ponto de chamada:** Após `processConversationBatch()` extrair conhecimento via LLM, Knowledge Engine valida e aprova os itens.

**Substitui:** Lógica de criação direta de entidades em `processConversationBatch()`.

**Complementa:** Memory Engine (produz Knowledge que Memory Engine armazena).

**Conflito:** Baixo. ConversationBatch faz extração; Knowledge Engine faz aprovação/qualificação. São camadas complementares, não conflitantes.

---

## 4. Princípios da Convergência

### P1 — Substituição por camadas, não por cirurgia

Nenhum componente do produto será removido antes que seu substituto EF esteja integrado e validado. A ordem é: integrar → validar → substituir → remover.

### P2 — Contrato de interface imutável durante migração

Cada substituição deve manter o mesmo contrato de entrada e saída do componente substituído. Nenhuma camada dependente deve precisar ser modificada durante a substituição.

### P3 — Caminho crítico preservado

O caminho crítico de latência (usuário → resposta) nunca deve ser bloqueado por módulos EF que não estejam prontos. Goal Scheduler, Execution Queue e Dispatcher são adequados apenas para fluxos assíncronos de background.

### P4 — Entidades Base44 como storage permanente

As entidades Base44 (Message, ChatSession, Document, KnowledgeEntity, Decision, Task, Topic, Keyword) continuam como camada de storage. Os módulos EF tornam-se produtores e consumidores dessas entidades, não as substituem.

### P5 — Nenhuma duplicação de responsabilidade após migração

Para cada responsabilidade existe exatamente um módulo oficial. Durante a migração há coexistência temporária documentada. Após a migração, o módulo legado é removido.

---

*Sprint ARC-01 — 2026-07-11 — Engineering First*
*Nenhum código foi criado ou modificado.*