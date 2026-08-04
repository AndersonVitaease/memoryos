# MEB — MemoryOS Engineering Backlog
## Official Master Engineering Backlog

**Version:** 1.0  
**Status:** Engineering Reference  
**Foundation:** v1.0.0  
**Date:** 2026-07-10  

> Este documento marca oficialmente o início da fase de engenharia do MemoryOS.  
> Toda evolução ocorre através das Tasks aqui definidas, mantendo a Foundation como referência permanente.  
> Refs: MAS · MRS · MCS · MPAR · MREM · MQCCS · MPEGS

---

## Capítulo 1 — Filosofia

O backlog transforma arquitetura em software executável. Cada item é rastreável à Foundation.

**Hierarquia:** Epic → Feature → Story → Task → Subtask

**Rastreabilidade obrigatória:** Foundation doc · RFC · ADR (quando existir) · MPAR endpoint · MREM etapa · Critério de aceitação

---

## Capítulo 2 — Engineering Tree

```
EPIC (domínio de implementação)
  └─ FEATURE (capacidade entregável)
       └─ STORY (comportamento do usuário/sistema)
            └─ TASK (unidade de trabalho técnico)
                 └─ SUBTASK (detalhe de implementação)
```

**IDs:** EPIC-NNN · FEAT-NNN · STORY-NNN · TASK-NNN

---

## Capítulo 3 — Epics

| ID | Nome | Fonte Foundation | RFC | Sprint |
|---|---|---|---|---|
| EPIC-001 | Core Runtime | MRS, MCS | RFC-001 | 1–3 |
| EPIC-002 | Journey Manager | MRS Cap.4 | RFC-005 | 3 |
| EPIC-003 | Working Memory | MRS Cap.3 | RFC-003 | 1 |
| EPIC-004 | Long Term Memory | MDS-Revision-1.6 | RFC-003 | 5 |
| EPIC-005 | Execution Engine | MCS, MREM | RFC-001 | 5 |
| EPIC-006 | Planner | MDIS, MREM Cap.2 | — | 4 |
| EPIC-007 | Event Bus | MRS Cap.5 | RFC-004 | 2 |
| EPIC-008 | Security | MCS, MDIS | RFC-002 | 6 |
| EPIC-009 | Audit Trail | MCS | RFC-002 | 7 |
| EPIC-010 | Connector SDK | MCF, MDPS | RFC-001 | 9 |
| EPIC-011 | Specialist SDK | MCIS, MDPS | — | 10 |
| EPIC-012 | Knowledge Engine | MGIS, MDS | — | 11 |
| EPIC-013 | Capability Registry | MCIS-Registry | — | 8 |
| EPIC-014 | Marketplace | MDPS Cap.4 | — | 14 |
| EPIC-015 | Developer Portal | MDPS Cap.5 | — | 15 |
| EPIC-016 | Foundation UI | MEB (este doc) | — | 16 |
| EPIC-017 | Watch Engine | MES §21, MES §12 | RFC-005 | WE-01 a WE-04 |
| EPIC-018 | Microsoft Graph Provider Router | MES §16, MCF | RFC-007 / ADR-014 | MS-PR-01 a MS-PR-04 |

---

## Capítulo 4 — Feature Breakdown

### EPIC-001 — Core Runtime

**FEAT-001** IConnector Interface
- Objetivo: Definir contrato base para todos os Connectors
- Escopo: Interface TypeScript + validação + testes
- Dependências: Nenhuma
- Interfaces: IConnector, ConnectorMetadata, ConnectorResult
- Riscos: Mudança de interface impacta todo o ecossistema
- Critério: IConnector compila, mock passa 100% MRI

**FEAT-002** ISpecialist Interface
- Objetivo: Contrato base para Specialists
- Dependências: FEAT-001
- Interfaces: ISpecialist, KnowledgeContext, SpecialistResult
- Critério: canHandle() determinístico, process() tipado

**FEAT-003** IMemoryProvider Interface
- Objetivo: Abstração para providers de memória
- Dependências: Nenhuma
- Interfaces: IMemoryProvider, MemoryRecord
- Critério: Interface compilável, MockProvider passa MRI

**FEAT-004** IEventBus Interface
- Objetivo: Contrato de comunicação entre engines
- Dependências: Nenhuma
- Interfaces: IEventBus, BusEvent, Subscription
- Critério: publish/subscribe/unsubscribe funcionais

**FEAT-005** IAuditTrail Interface
- Objetivo: Contrato de auditoria imutável
- Dependências: Nenhuma
- Interfaces: IAuditTrail, AuditRecord, AuditFilter
- Critério: Object.freeze() em todo record; query funcional

---

### EPIC-003 — Working Memory

**FEAT-010** WorkingMemoryEngine Core
- Objetivo: Implementar memória de trabalho com TTL
- Dependências: FEAT-003
- Interfaces: IWorkingMemoryEngine
- Critério: store/get/remove, TTL por prioridade, isolamento identityContext

**FEAT-011** Memory Eviction por Prioridade
- Objetivo: Eviction automático quando MAX_CAPACITY excedido
- Dependências: FEAT-010
- Critério: Menor prioridade removida primeiro; CRITICAL nunca removido

**FEAT-012** Memory Promotion
- Objetivo: Promover itens relevantes para Long Term Memory
- Dependências: FEAT-010, EPIC-004
- Critério: Evento memory.promoted publicado; item persiste em LTM

---

### EPIC-007 — Event Bus

**FEAT-020** EventBus Priority Scheduler
- Objetivo: Fila de eventos por prioridade CRITICAL>HIGH>NORMAL>LOW
- Dependências: FEAT-004
- Critério: HIGH nunca atrasado por LOW; CRITICAL entregue em <1ms

**FEAT-021** Dead Letter Queue
- Objetivo: Capturar eventos que falharam após maxRetries
- Dependências: FEAT-020
- Critério: getDLQ() retorna eventos falhos; replayDLQ() reprocessa

**FEAT-022** Wildcard Subscriptions
- Objetivo: Suporte a "execution.*" e "*" em subscribe()
- Dependências: FEAT-020
- Critério: Wildcards funcionam; sem falsos positivos

---

### EPIC-002 — Journey Manager

**FEAT-030** Journey Lifecycle Core
- Objetivo: Estados draft/active/paused/blocked/completed/archived
- Dependências: FEAT-004, FEAT-005
- Critério: Todas as transições válidas; transições proibidas lançam erro

**FEAT-031** Journey Context Persistence
- Objetivo: Contexto acumulado entre sessões
- Dependências: FEAT-030
- Critério: journey.context.data persiste após resume()

**FEAT-032** Journey Events Log
- Objetivo: Append-only log de eventos por Journey
- Dependências: FEAT-030
- Critério: addEvent() funciona; events[] é imutável após registro

---

### EPIC-005 — Execution Engine

**FEAT-040** ExecutionEngine Core
- Objetivo: Executar PlanStep[] com ConnectorAdapter
- Dependências: FEAT-001, FEAT-007, FEAT-009
- Critério: execute() retorna ExecutionResult com todos stepResults

**FEAT-041** Retry com Backoff Exponencial
- Objetivo: Re-tentar steps com falha recuperável
- Dependências: FEAT-040
- Critério: backoff 100ms/200ms/400ms; após maxRetries → failure

**FEAT-042** Rollback em Ordem Inversa
- Objetivo: Reverter steps isReversible após falha
- Dependências: FEAT-040
- Critério: Rollback na ordem inversa; non-reversible ignorados

**FEAT-043** Execução Paralela
- Objetivo: Suporte a PlanStep.parallel=true
- Dependências: FEAT-040
- Critério: Promise.all para steps paralelos; resultados agregados

---

### EPIC-008 — Security

**FEAT-050** SecurityGate Pipeline
- Objetivo: Permission → Risk → Policy em sequência
- Dependências: FEAT-005
- Critério: Toda action avaliada; resultado auditado

**FEAT-051** Human Approval Gate
- Objetivo: Pausar Journey para aprovação quando riskLevel=HIGH/CRITICAL
- Dependências: FEAT-050, FEAT-030
- Critério: requiresApproval=true → Journey.pause(); retoma após aprovação

**FEAT-052** IPolicy Interface + Engine
- Objetivo: Políticas customizáveis e composáveis
- Dependências: FEAT-050
- Critério: addPolicy/removePolicy; política bloqueia execução

---

### EPIC-009 — Audit Trail

**FEAT-060** AuditTrail Core Imutável
- Objetivo: Registro append-only com Object.freeze()
- Dependências: Nenhuma
- Critério: record() retorna frozen object; modificação impossível

**FEAT-061** Query com Filtros e Wildcards
- Objetivo: Busca por userId, sessionId, action (wildcard), outcome
- Dependências: FEAT-060
- Critério: "execution.*" retorna todos os eventos de execution

**FEAT-062** Export JSON/CSV
- Objetivo: Exportar AuditTrail para compliance e debugging
- Dependências: FEAT-061
- Critério: export("json") e export("csv") funcionam com filtros

---

### EPIC-010 — Connector SDK

**FEAT-070** BaseConnector Scaffold
- Objetivo: Classe base com validateInput, success, failure, fetchWithTimeout
- Dependências: FEAT-001
- Critério: Extend BaseConnector reduz boilerplate em 60%

**FEAT-071** HttpConnector Reference
- Objetivo: Implementação de referência para HTTP/REST
- Dependências: FEAT-070
- Critério: GET/POST com AbortController; healthCheck funcional; MRI 100%

**FEAT-072** OAuthConnector Reference
- Objetivo: Implementação de referência para OAuth 2.0
- Dependências: FEAT-070
- Critério: Token injection; refresh automático; MRI 100%

**FEAT-073** Connector Versioning
- Objetivo: SemVer para Connectors; compatibilidade backward
- Dependências: FEAT-070
- Critério: version em ConnectorMetadata; registry valida compatibilidade

---

### EPIC-011 — Specialist SDK

**FEAT-080** BaseSpecialist Scaffold
- Objetivo: Classe base com canHandle via keywords, buildResult
- Dependências: FEAT-002
- Critério: Extend BaseSpecialist reduz boilerplate em 50%

**FEAT-081** GeneralSpecialist
- Objetivo: Fallback para queries sem Specialist específico
- Dependências: FEAT-080
- Critério: canHandle() sempre true; confidence baseline 0.60

**FEAT-082** GovernmentSpecialist
- Objetivo: Specialist para serviços governamentais brasileiros
- Dependências: FEAT-080, EPIC-012
- Critério: CPF, CNPJ, gov.br; MRI 100%

---

### EPIC-012 — Knowledge Engine

**FEAT-090** KnowledgeProvider Core
- Objetivo: IKnowledgeProvider com getByDomain, search, rank
- Dependências: Nenhuma
- Critério: search semântico funcional; rank por relevância

**FEAT-091** KnowledgePackage Loader
- Objetivo: Carregar e validar KnowledgePackage em runtime
- Dependências: FEAT-090
- Critério: confidence ≥ 0.8 obrigatório; schema validado

**FEAT-092** Knowledge Evolution
- Objetivo: Atualizar confidence baseado em uso
- Dependências: FEAT-090, EPIC-003
- Critério: accessCount > 3 → confidence+0.05 (max 1.0)

---

### EPIC-013 — Capability Registry

**FEAT-100** ConnectorRegistry Core
- Objetivo: Registro e descoberta de Connectors
- Dependências: FEAT-001
- Critério: register/unregister/find/list funcionais

**FEAT-101** SpecialistRegistry Core
- Objetivo: Registro e descoberta de Specialists
- Dependências: FEAT-002
- Critério: canHandle routing funcional; priority ordering

**FEAT-102** HealthCheck Monitor
- Objetivo: Monitorar saúde de todos os Connectors registrados
- Dependências: FEAT-100
- Critério: Status atualizado a cada 30s; degraded/down detectados

---

## Capítulo 5 — Implementation Stories

### EPIC-003 FEAT-010 — Working Memory

**STORY-001**  
Como ExecutionEngine, quero armazenar resultados intermediários em WorkingMemory com TTL para que dados não persitam indefinidamente.  
_AC: store() aceita WorkingMemoryItem; get() retorna null após TTL_

**STORY-002**  
Como qualquer engine, quero que WorkingMemory isole dados por identityContext para que usuários nunca vejam dados de outros usuários.  
_AC: getByContext(ctx1) nunca retorna items de ctx2_

**STORY-003**  
Como WorkingMemory, quero fazer eviction de itens LOW priority quando MAX_CAPACITY atingido para que memória seja gerenciada automaticamente.  
_AC: após MAX_CAPACITY, novo store remove item de menor prioridade_

---

### EPIC-007 FEAT-020 — Event Bus

**STORY-010**  
Como ExecutionEngine, quero publicar eventos com prioridade para que componentes críticos sejam notificados antes de componentes de background.  
_AC: CRITICAL entregue antes de NORMAL no mesmo ciclo_

**STORY-011**  
Como qualquer componente, quero subscrever com wildcard "execution.*" para monitorar todos os eventos de um domínio.  
_AC: subscribe("execution.*") recebe execution.started E execution.completed_

**STORY-012**  
Como operador, quero inspecionar DLQ e reprocessar eventos falhados para garantir que nenhum evento se perca permanentemente.  
_AC: getDLQ() retorna eventos com ≥3 falhas; replayDLQ() re-entrega_

---

### EPIC-008 FEAT-050 — Security

**STORY-020**  
Como ExecutionEngine, quero que SecurityGate avalie toda ação antes de executar para que nenhuma ação não autorizada ocorra.  
_AC: sem security.evaluate() → step não executa_

**STORY-021**  
Como SecurityGate, quero pausar Journey automaticamente quando riskLevel=HIGH para garantir aprovação humana antes de ações irreversíveis.  
_AC: riskLevel=HIGH + isReversible=false → Journey.pause("awaiting_approval")_

---

## Capítulo 6 — Task Breakdown

### STORY-001 → Tasks

| ID | Descrição | Estimativa | Prioridade | Complexidade | Depende |
|---|---|---|---|---|---|
| TASK-001 | Criar interface WorkingMemoryItem com todos os campos | 1h | P0 | Baixa | — |
| TASK-002 | Implementar Map interno com isolamento por identityContext | 2h | P0 | Média | TASK-001 |
| TASK-003 | Implementar TTL via setTimeout + cleanup automático | 2h | P0 | Média | TASK-002 |
| TASK-004 | Implementar store() com validação de campos obrigatórios | 1h | P0 | Baixa | TASK-003 |
| TASK-005 | Implementar get() com verificação de TTL e expiração | 1h | P0 | Baixa | TASK-004 |
| TASK-006 | Escrever 3 testes unitários no MRI | 2h | P0 | Baixa | TASK-005 |
| TASK-007 | Validar MQCCS score ≥ 85% | 1h | P0 | Baixa | TASK-006 |

### STORY-010 → Tasks

| ID | Descrição | Estimativa | Prioridade | Complexidade | Depende |
|---|---|---|---|---|---|
| TASK-020 | Definir BusEvent interface com eventId, type, priority | 1h | P0 | Baixa | — |
| TASK-021 | Implementar priority queue (4 filas separadas) | 3h | P0 | Alta | TASK-020 |
| TASK-022 | Implementar scheduler que drena CRITICAL primeiro | 2h | P0 | Alta | TASK-021 |
| TASK-023 | Implementar retry com backoff exponencial (max 3) | 2h | P0 | Média | TASK-022 |
| TASK-024 | Implementar Dead Letter Queue após maxRetries | 2h | P0 | Média | TASK-023 |
| TASK-025 | Implementar idempotência via eventId (Set de IDs) | 1h | P1 | Baixa | TASK-024 |
| TASK-026 | Escrever 5 testes MRI | 3h | P0 | Média | TASK-025 |

---

## Capítulo 7 — Traceability

### Matriz de Rastreabilidade

| Task | Foundation | RFC | ADR | MPAR | MREM | MQCCS |
|---|---|---|---|---|---|---|
| TASK-001..007 | MRS Cap.3 | RFC-003 | ADR-003 | IWorkingMemoryEngine | Etapa 10 | Contract+Perf |
| TASK-020..026 | MRS Cap.5 | RFC-004 | ADR-004 | IEventBus | Etapa 9 | Contract+Perf |
| TASK-030..036 | MRS Cap.4 | RFC-005 | ADR-005 | IJourneyManager | Etapas 4,13 | Contract |
| TASK-040..046 | MCS | RFC-001 | ADR-001 | IExecutionEngine | Etapas 7,8 | All |
| TASK-050..056 | MCS | RFC-002 | ADR-002 | ISecurityGate | Etapa 7 | Security |
| TASK-060..066 | MCS | RFC-002 | ADR-006 | IAuditTrail | Etapa 11 | Contract |
| TASK-070..076 | MCF | RFC-001 | ADR-001 | IConnector | Etapas 6,8 | All |

---

## Capítulo 8 — Implementation Order

### Dependency Graph

```
Sprint 1 ─ Working Memory (EPIC-003)
    └─ sem dependências — base de todos

Sprint 2 ─ Event Bus (EPIC-007)
    └─ sem dependências — base de comunicação

Sprint 3 ─ Audit Trail (EPIC-009) + Journey Manager (EPIC-002)
    ├─ Audit: sem dependências externas
    └─ Journey: depende de EventBus + AuditTrail

Sprint 4 ─ Planner (EPIC-006)
    └─ depende de Journey

Sprint 5 ─ Execution Engine (EPIC-005) + Long Term Memory (EPIC-004)
    ├─ Execution: depende de Journey + Planner + Security
    └─ LTM: depende de Working Memory

Sprint 6 ─ Security (EPIC-008)
    └─ depende de AuditTrail + Journey

Sprint 7 ─ Core Runtime Integrado (EPIC-001)
    └─ integra todos os Sprint 1-6

Sprint 8 ─ Capability Registry (EPIC-013)
    └─ depende de Core Runtime

Sprint 9 ─ Connector SDK (EPIC-010)
    └─ depende de Capability Registry

Sprint 10 ─ Specialist SDK (EPIC-011)
    └─ depende de Capability Registry

Sprint 11 ─ Knowledge Engine (EPIC-012)
    └─ depende de Specialist SDK + LTM

Sprint 12 ─ Connectors Oficiais
    └─ HTTP, OAuth, Email, Government

Sprint 13 ─ Specialists Oficiais
    └─ General, Government, Financial, Legal

Sprint 14 ─ Marketplace (EPIC-014)
    └─ depende de Connector SDK + Specialist SDK

Sprint 15 ─ Developer Portal (EPIC-015)
    └─ depende de Marketplace

Sprint 16 ─ Foundation UI (EPIC-016)
    └─ dashboard de todas as ferramentas
```

---

## Capítulo 9 — Test Strategy

### Por Feature

| Feature | Unitário | Integração | Performance | Segurança | MQCCS |
|---|---|---|---|---|---|
| WorkingMemory | store/get/remove/ttl | + EventBus | p95 <10ms | identityContext isolation | Contract + Perf |
| EventBus | publish/subscribe/dlq | + WorkingMemory | p95 <5ms | event idempotency | Contract + Perf |
| JourneyManager | lifecycle/transitions | + EventBus + Audit | p95 <50ms | context isolation | Contract |
| ExecutionEngine | steps/retry/rollback | full pipeline | p95 <500ms | SecurityGate mandatory | All |
| SecurityGate | evaluate/policies | + AuditTrail | p95 <5ms | bypass attempts blocked | Security |
| AuditTrail | record/query/export | + all engines | p95 <20ms | immutability enforced | Contract |
| ConnectorSDK | IConnector compliance | + ExecutionEngine | p95 <300ms | healthCheck + timeout | All |

### Cobertura Mínima

- MRI: 100% pass (todos os componentes)
- MQCCS: ≥ 85% score (release), ≥ 95% (Official)
- Unitário: ≥ 3 testes por componente
- Performance: p95 dentro dos targets do MPAR Cap.6

---

## Capítulo 10 — Definition of Done

Toda Task somente é concluída quando **todos** os critérios são satisfeitos:

```
□ Código implementado e compilável (TypeScript strict mode)
□ Nenhum `any` sem justificativa documentada
□ Testes unitários escritos (mínimo 3 por componente)
□ MRI suite: 100% pass
□ MQCCS score: ≥ 85%
□ Documentação inline (JSDoc nos métodos públicos)
□ README do componente atualizado
□ CHANGELOG.md com entrada da versão
□ AuditTrail implementado (se componente muta estado)
□ EventBus events publicados (conforme catálogo MREM Cap.4)
□ SecurityGate invocado (se ação externa)
□ HealthCheck implementado (se Connector)
□ Identity Context respeitado (se acessa memória)
□ Timeout configurado (se chamada externa)
□ Rollback implementado (se isReversible=true)
□ PR revisado por pelo menos 1 Core Team member
□ Branch deletada após merge
```

---

## Capítulo 11 — Engineering Dashboard

> A página `/engineering-backlog` apresenta o dashboard interativo com Epics, progresso, dependências, riscos e burndown.

---

## Capítulo 12 — Implementation Principles

Toda implementação **deve**:
1. Ser rastreável até um documento da Foundation
2. Ter RFC aprovada se alterar interface pública
3. Passar pelo MQCCS antes de release
4. Não violar MPAR (APIs públicas documentadas)
5. Não violar MREM (pipeline de execução)
6. Não violar MCS (core boundaries)

Toda implementação **não pode**:
- Aumentar acoplamento Core ↔ domínio externo
- Remover ou contornar AuditTrail
- Remover Human Approval Gate
- Violar isolamento de Identity Context

---

---

### EPIC-017 — Watch Engine

**RFC-005 | ADR-012 | Sprints WE-01 a WE-04**

**FEAT-110** WatchTypes + WatchRegistry Foundation (Sprint WE-01)
- Objetivo: Definir todos os tipos TypeScript imutáveis + CRUD de Watches com validação e Dry Run
- Escopo: `WatchTypes.ts`, `WatchRegistry.ts`, entidades `Watch`, `WatchExecution`, `PendingWatchAction`
- Dependências: KnowledgeEntity, CognitiveEventBus
- Critério: `create()` valida e persiste Watch simples e complexo (AND/OR/NOT); status `invalid` em falha de compilação

**FEAT-111** WatchEvaluator + Compilador de Lógica (Sprint WE-02)
- Objetivo: Compilar `ConditionTree` para função JS pura (sem `eval()`); executar pipeline de avaliação
- Escopo: `WatchEvaluator.ts`, `CompiledWatch` interface
- Dependências: FEAT-110, ConnectorGateway
- Critério: `compile()` retorna `CompiledWatch`; `evaluate()` retorna boolean correto para todos os operadores (AND/OR/NOT aninhados); sem `eval()`

**FEAT-112** WatchScheduler + ConnectorGateway (Sprint WE-02)
- Objetivo: Coordenar execução por prioridade e frequência; abstrair providers com Token Bucket
- Escopo: `WatchScheduler.ts`, `ConnectorGateway.ts`
- Dependências: FEAT-111
- Critério: Priority Queue funcional (critical primeiro); Token Bucket por provider; timeout de 10s por execução

**FEAT-113** WatchOutbox + WatchStateTracker (Sprint WE-03)
- Objetivo: Garantir entrega de eventos (Durable Outbox); detectar transição `false → true`
- Escopo: `WatchOutbox.ts`, `WatchStateTracker.ts`, entidade `PendingWatchAction`
- Dependências: FEAT-112
- Critério: Evento `WatchTriggered` só disparado na transição; `PendingWatchAction` persiste antes do dispatch; Worker re-tenta até ACK

**FEAT-114** Circuit Breaker por Provider (Sprint WE-03)
- Objetivo: Isolar falhas de provider para não contaminar outros Watches
- Escopo: `ConnectorGateway.ts` (extensão)
- Dependências: FEAT-112
- Critério: 3 falhas consecutivas → OPEN; 5 min → HALF-OPEN; sucesso → CLOSED

**FEAT-115** Deduplicação via KnowledgeGraph + Dashboard (Sprint WE-04)
- Objetivo: Evitar criação de Watches redundantes; dashboard de auditoria e monitoramento
- Escopo: Extensão de `WatchRegistry.ts` + página `src/pages/SprintWE04Page.jsx`
- Dependências: FEAT-110, KnowledgeGraphEngine
- Critério: Query de grafo detecta condição duplicada; dashboard mostra status/execuções/circuit breakers

---

### EPIC-017 — Stories e Tasks

**STORY-030** — Criação de Watch com Condição Simples
Como Planner, quero criar um Watch com uma condição leaf (provider + comparator + value) para que o sistema monitore uma métrica específica.
_AC: Watch persiste com status `active`; `compile()` retorna CompiledWatch; Dry Run valida provider_

**STORY-031** — Avaliação com Lógica Booleana Complexa
Como WatchEvaluator, quero avaliar uma ConditionTree com AND/OR/NOT aninhados para suportar condições compostas.
_AC: AND([true, false]) → false; OR([true, false]) → true; NOT(true) → false; aninhamento de 5 níveis funciona_

**STORY-032** — Disparo na Transição de Estado
Como WatchStateTracker, quero disparar `WatchTriggered` apenas quando a condição muda de false para true para evitar spam de notificações.
_AC: condição true consecutiva → sem novo evento; transição false→true → 1 evento; transição true→false → sem evento_

**STORY-033** — Recuperação de Falha via Outbox
Como WatchOutbox, quero garantir que se o sistema reiniciar após a avaliação mas antes do dispatch, o evento seja re-tentado.
_AC: Watch dispara, `PendingWatchAction` persiste, sistema reinicia, Worker re-lê e despacha corretamente_

| Task | Descrição | Sprint | Prioridade |
|---|---|---|---|
| TASK-110 | Criar WatchTypes.ts com todos os tipos imutáveis | WE-01 | P0 |
| TASK-111 | Criar entidades Watch, WatchExecution, PendingWatchAction | WE-01 | P0 |
| TASK-112 | Implementar WatchRegistry.create() com validação e Dry Run | WE-01 | P0 |
| TASK-113 | Implementar WatchRegistry.list(), get(), pause(), resume(), delete() | WE-01 | P0 |
| TASK-114 | Implementar WatchEvaluator.compile() — compilador de ConditionTree | WE-02 | P0 |
| TASK-115 | Implementar WatchEvaluator.evaluate() — executor do pipeline compilado | WE-02 | P0 |
| TASK-116 | Implementar ConnectorGateway com Token Bucket por provider | WE-02 | P0 |
| TASK-117 | Implementar WatchScheduler com Priority Queue | WE-02 | P0 |
| TASK-118 | Implementar WatchStateTracker (last_result + detecção de transição) | WE-03 | P0 |
| TASK-119 | Implementar WatchOutbox (persistência antes do dispatch + Worker re-try) | WE-03 | P0 |
| TASK-120 | Implementar Circuit Breaker por provider em ConnectorGateway | WE-03 | P0 |
| TASK-121 | Escrever watchEngineTests.ts (mínimo 10 cenários MDS §2.16) | WE-03 | P0 |
| TASK-122 | Deduplicação via KnowledgeGraph em WatchRegistry.create() | WE-04 | P1 |
| TASK-123 | Dashboard SprintWE04Page.jsx (status, execuções, circuit breakers) | WE-04 | P1 |
| TASK-124 | Lazy Hydration + Performance hardening | WE-04 | P1 |

---

*MEB — MemoryOS Engineering Backlog v1.0 — Engineering Reference — 2026-07-10*
*Atualizado em 2026-08-02 — EPIC-017 Watch Engine adicionado*