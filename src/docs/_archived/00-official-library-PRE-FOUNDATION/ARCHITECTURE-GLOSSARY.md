# ARCHITECTURE-GLOSSARY.md
# MemoryOS — Glossário Oficial
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

> Definições canônicas dos termos usados na arquitetura MemoryOS.
> Em caso de conflito entre este glossário e qualquer outro documento,
> este glossário prevalece para definições de termos.

---

## A

### ADR (Architecture Decision Record)
Documento formal que captura uma decisão arquitetural relevante. Inclui contexto, decisão tomada, alternativas consideradas e consequências. Status: Draft → Review → Proposed → Accepted | Rejected → Superseded | Deprecated → Archived. Ver ADR-LIFECYCLE.md.

### Agent (Agente)
Em MemoryOS, agente é sinônimo de Conversation Engine (EF-21) quando operando em modo autônomo. Diferente de "AI agent" genérico — o agente MemoryOS é sempre governado pelo pipeline cognitivo oficial.

### Audit Log
Registro imutável de todas as ações com side effects. Obrigatório por Constituição S-03.

### Architecture Freeze
Estado em que a arquitetura está congelada (frozen). Mudanças requerem ADR aprovada. Estado normal da plataforma.

---

## B

### Backward Compatible
Mudança que não quebra consumidores existentes. Adicionar campo opcional é backward compatible. Remover ou renomear campo não é.

### Breaking Change
Mudança que requer atualização de consumidores. Incrementa MAJOR version.

### Bulk Operation
Operação que processa múltiplos registros em uma única chamada (bulkCreate, bulkUpdate, deleteMany). Preferida para volumes > 10 registros.

---

## C

### Canonical
A implementação ou arquivo oficial e único que deve ser usado para um recurso específico. Quando há múltiplas implementações de algo, o canonical é a fonte de verdade. Ex: `capability-registry/` é o canonical da Capability Registry. Ver OFFICIAL-COMPONENT-REGISTRY.md.

### Capability
Unidade atômica de comportamento que o sistema pode executar. Toda Capability tem um CapabilityManifest registrado no Capability Registry (EF-14) e é executada exclusivamente pelo Capability Runtime (EF-15). Capabilities nunca chamam APIs diretamente.

### Capability Manifest
Especificação completa de uma Capability: input/output schema, permissões, timeout, retry, rollback, cost, latency, health checks e telemetria. Ver CAPABILITY-MANIFEST-SPEC.md.

### Capability Registry (EF-14)
Módulo responsável pelo índice central de todas as Capabilities disponíveis. Canonical: `src/lib/capability-registry/`. Único ponto de discovery de Capabilities após INT-04.

### Capability Runtime (EF-15)
Módulo responsável pela execução de Capabilities. Único módulo autorizado a executar Capabilities. Usa Capability Registry para discovery.

### Circuit Breaker
Padrão de resiliência que "abre" o circuito (para de tentar) quando uma dependência falha repetidamente, prevenindo cascata de falhas.

### Cognitive Pipeline
O pipeline completo de processamento cognitivo do MemoryOS, da mensagem do usuário à resposta refletida. Composto por módulos EF em PATH A (interativo) e PATH B (background).

### Connector
Módulo que estabelece conexão com sistema externo. Todo Connector tem um ConnectorManifest. Connectors são stateless. Acessíveis somente via Connector Runtime.

### Connector Manifest
Especificação completa de um Connector: auth, scopes, rate limits, retry, webhooks, actions, health check e failure modes. Ver CONNECTOR-MANIFEST-SPEC.md.

### Connector Runtime
Módulo responsável pela execução de ações em sistemas externos via Connectors. Único módulo autorizado a estabelecer conexões externas.

### Context (Contexto Cognitivo)
Conjunto de informações relevantes montado pelo Context Engine (EF-20) para alimentar o LLM. Inclui memórias históricas, sessão atual, goal e decisão.

### Context Engine (EF-20)
Módulo Reserved responsável por recuperar e montar o contexto cognitivo. Substitui `buildReasoningContext()` + queries de `runMemoryPipeline()`.

### Contract (Contrato)
Interface TypeScript pública de um módulo EF. Contratos `Official · Frozen` são imutáveis. Ver OFFICIAL-CONTRACTS.md.

### Conversation (Conversa)
Agrupamento de sessões de chat relacionadas. Gerenciada pelo Conversation Engine (EF-21).

### Conversation Engine (EF-21)
Módulo Reserved responsável por orquestrar o pipeline cognitivo a partir de uma mensagem de usuário. Substitui `runReasoningPlan()`. Único ponto de entrada do pipeline cognitivo.

### correlationId
Identificador único que rastreia uma execução end-to-end através de todos os módulos do pipeline. Obrigatório em todos os eventos (EVENT-CATALOG).

---

## D

### DAP (Decisão Arquitetural Pendente)
Questão arquitetural que precisa ser decidida. Transformada em ADR quando formalmente registrada.

### Dead Letter Queue (DLQ)
Fila onde eventos que não puderam ser processados após N tentativas são depositados para análise manual.

### Decision (Decisão de Domínio)
Entidade Base44 registrando uma decisão de negócio detectada em conversas. Diferente de `ExecutionDecision` (EF-06).

### Decision Engine (EF-06)
Módulo Official responsável por avaliar candidatos e selecionar a estratégia de execução para um Goal. Árbitro central de decisão. Produz `ExecutionDecision`.

### Deprecated
Status de componente que não receberá novas funcionalidades. Apenas correções críticas de segurança. Processo de remoção iniciado.

### Determinístico
Propriedade de módulo que produz o mesmo output dado o mesmo input. Módulos determinísticos não usam randomização, I/O ou tempo diretamente.

### Domain Model
Modelo das entidades de domínio do sistema com seus atributos, relacionamentos e lifecycle. Ver DOMAIN-MODEL.md.

---

## E

### EF (Engineering First)
Estratégia arquitetural do MemoryOS que define módulos certificados com contratos públicos, testabilidade máxima e zero side effects nos módulos cognitivos.

### Entity (Entidade Base44)
Tipo de dado persistido no banco do Base44. Definido como JSON Schema em `base44/entities/`.

### Event
Mensagem imutável representando algo que aconteceu no sistema. Versioned, com correlationId, payload estruturado. Ver EVENT-CATALOG.md.

### ExecutionDecision
Output do Decision Engine (EF-06). Representa a decision sobre qual Capability usar e como. Imutável após produção. Diferente de `Decision` (entidade de domínio).

### ExecutionPlan
Output do Planning Engine (EF-07). Plano de execução imutável com steps, complexidade e estimativas. Diferente de objeto `plan` legacy do produto (renomeado para `executionMetrics` via ADR-003).

### Execution Dispatcher (EF-05)
Módulo Official responsável por mover Goals do Scheduler para a Execution Queue. PATH B ONLY.

---

## F

### Fail Safe
Princípio de segurança: em estado desconhecido ou de falha, o sistema nega a operação. Constituição S-02.

### Forward-Compatible
Design que reserva campos para uso futuro (null em v1.0). Memory tem campos forward-compat para Sprint 24+ (embedding, vector, cluster).

### Foundation
Camada de documentação e especificação do MemoryOS. Inclui MV, MPS, MAS, MDS, MEB, RFC, ADR.

### Frozen
Status de contrato ou arquitetura que não pode ser alterado sem ADR aprovada. Estado permanente — contratos frozen nunca fazem downgrade.

---

## G

### Goal
Representação de uma intenção de execução com ciclo de vida rastreável. Criado exclusivamente pelo Goal Runtime (EF-01/EF-24). Ver GOAL-SCHEMA.md.

### Goal Execution Queue (EF-04)
Módulo Official responsável por ordenar Goals por prioridade para execução. PATH B ONLY. Ordering: Priority DESC → enqueueTime ASC.

### Goal Registry Service (EF-02)
Módulo Official responsável por persistir e indexar Goals. Única fonte de verdade de Goals armazenados.

### Goal Runtime (EF-01/EF-24)
Módulo responsável por criar e gerenciar o ciclo de vida de Goals. Único ponto de criação de Goals.

### Goal Scheduler (EF-03)
Módulo Official responsável por agendar Goals para execução futura. PATH B ONLY.

---

## I

### Idempotente
Operação que pode ser executada múltiplas vezes com o mesmo resultado. Importantes para retry seguro.

### INT (Integration Sprint)
Sprint que integra um módulo EF ao fluxo de produto. INT-02 a INT-07 são a sequência aprovada.

### Intent
Classificação da intenção da mensagem do usuário. Detectada pelo Intent Layer (EF-22) de forma determinística, sem LLM. Output: `{ intent_type, query_types, is_list_query, search_keywords, confidence }`.

### Intent Layer (EF-22)
Módulo Reserved responsável por classificar deterministicamente a intenção de uma mensagem. Substitui `interpretIntent()` e elimina uma chamada LLM.

---

## K

### Knowledge
Conhecimento estruturado extraído de execuções avaliadas. Criado exclusivamente pelo Knowledge Engine (EF-10) a partir de SelfEvaluations aprovadas.

### Knowledge Engine (EF-10)
Módulo Official responsável por transformar SelfEvaluations aprovadas em Knowledge estruturado. Quality Gate de Knowledge.

---

## L

### Learning
Padrão aprendido derivado de Knowledge aprovado. Criado exclusivamente pelo Learning Engine (EF-11). Imutável após criação.

### Learning Engine (EF-11)
Módulo Official responsável por transformar Knowledge em Learning imutável.

### Legacy
Status de componente que existia antes da arquitetura EF e será gradualmente substituído. Pode coexistir com módulos EF durante migração. Coexistência é temporária.

### Lifecycle
Conjunto de estados pelos quais uma entidade passa, com transições definidas. Ver STATE-MACHINES.md.

### LLM Gateway (EF-23)
Módulo Reserved responsável por isolar chamadas LLM. Único ponto de acesso ao LLM após INT-08. Elimina dependência direta de `InvokeLLM()`.

---

## M

### Manifest
Especificação declarativa completa de um Capability ou Connector. Define contrato, permissões, limites, health checks e telemetria. Imutável por versão.

### Memory
Memória permanente e imutável do sistema. Criada exclusivamente pelo Memory Engine (EF-12). Object.freeze() aplicado. Sem update endpoint. Ver MEMORY-SCHEMA.md.

### Memory Engine (EF-12)
Módulo Official responsável por transformar Learnings aprovados em Memory imutável. Canonical: `src/lib/memory-engine-v1/`.

### Memory Gate
Regra de admissão: apenas Learnings com `status == "ACTIVE"` e `learningScore >= 70` geram Memory.

### Mirror Principle
Princípio do Memory Engine: scores e tipos são espelhados de Learning sem recalculação. memoryScore = learningScore, memoryType = learningType, etc.

### Module (Módulo EF)
Unidade de código TypeScript com responsabilidade única, zero side effects externos, 28+ cenários, e API de observabilidade (health/metrics/statistics/logs).

---

## P

### PATH A
Fluxo interativo do pipeline cognitivo. Responde mensagens do usuário em tempo real. SLA P50 < 2s, P99 < 5s. Inclui Intent Layer, Goal Runtime, Decision Engine, Planning Engine, Capability Runtime, Context Engine, LLM Gateway, Reflection Engine.

### PATH B
Fluxo background do pipeline cognitivo. Processamento assíncrono sem latência restrita. Inclui Goal Scheduler, Execution Dispatcher, Goal Execution Queue, Knowledge Engine, Learning Engine, Memory Engine. **EF-03, EF-04, EF-05 são PATH B ONLY.**

### PII (Personally Identifiable Information)
Informação que identifica uma pessoa. Nunca armazenada em metadata, tags ou logs (Constituição D-03).

### Pipeline
Sequência ordenada de módulos que processam uma mensagem do usuário até produzir uma resposta. O pipeline oficial é o definido em UPDATED-TARGET-ARCHITECTURE.md.

### Planning Engine (EF-07)
Módulo Official responsável por transformar ExecutionDecision em ExecutionPlan imutável com steps, complexidade e estimativas.

---

## R

### Rate Limit
Limite de frequência de uso de uma API ou Connector. Declarado no ConnectorManifest. Aplicado pelo Connector Runtime.

### Reflection Engine (EF-08)
Módulo Official responsável por avaliar o resultado de uma execução contra o plano. Incorpora a etapa SYNTHESIS (síntese da resposta).

### Registry
Índice central de um tipo de recurso. Ex: Capability Registry, Goal Registry, Connector Registry. Canonical declarations determinam qual implementação é o Registry oficial.

### Reserved
Status de módulo planejado mas não implementado, ou implementado mas não integrado ao pipeline. Não participa do pipeline ativo. Promoção requer ADR aprovada.

### Retrieval Engine (EF-13)
Módulo Official responsável pela recuperação semântica de memórias. Único ponto de acesso a Memory para fins cognitivos.

### Rollback
Capacidade de desfazer os efeitos de uma operação. Declarado no manifest de cada Capability. Obrigatório para Capabilities com side effects reversíveis.

### Runtime
Ambiente de execução de módulos. Ex: Capability Runtime (EF-15), Connector Runtime (EF-16+), Goal Runtime (EF-01). Cada Runtime é responsável por um domínio específico.

---

## S

### Schema
Definição estruturada dos campos, tipos e validações de um objeto de domínio. Versionado com `schemaVersion`. Ver GOAL-SCHEMA.md, MEMORY-SCHEMA.md.

### Self Evaluation Engine (EF-09)
Módulo Official responsável por calcular scores de qualidade, confiabilidade e performance de execuções completadas.

### Session (Sessão)
Sessão individual de chat com histórico de mensagens. Agregada em Conversations.

### Side Effect
Mudança de estado externo ao módulo que ocorre como resultado de uma operação. Declarado explicitamente em sideEffects[]. Exemplos: escrita em banco, chamada API, envio de email.

### Single Responsibility Principle (SRP)
Princípio de que cada módulo deve ter exatamente uma responsabilidade. Artigo I da Constituição.

### Specialist Layer (EF-25)
Módulo Reserved futuro responsável pela seleção de Specialists de conhecimento de domínio. Permanece como `detectSkills()` + `SpecialistRouter` até EF-25.

### State Machine
Modelo formal de estados e transições de uma entidade. Ver STATE-MACHINES.md.

---

## T

### Topic
Assunto ou tema identificado em conversas. Entidade Base44.

### TTL (Time To Live)
Tempo de vida de um objeto. Memory não tem TTL por padrão (Constituição M-08).

---

## V

### Versioning
Identificação de versões de artefatos (módulos, contratos, schemas, eventos, ADRs). Ver VERSIONING-POLICY.md.

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- MEMORYOS-CONSTITUTION.md
- OFFICIAL-CONTRACTS.md
- DOMAIN-MODEL.md
- UPDATED-TARGET-ARCHITECTURE.md
- OFFICIAL-COMPONENT-REGISTRY.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*