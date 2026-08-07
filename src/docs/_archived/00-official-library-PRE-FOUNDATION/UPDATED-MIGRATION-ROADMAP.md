# UPDATED-MIGRATION-ROADMAP.md
# MemoryOS — Roadmap de Migração Revisado v2.0
**Sprint SPR-FREEZE-01 · Engineering First**
Date: 2026-07-11
Version: 2.0
Status: OFFICIAL · FROZEN
Supersede: UPDATED-MIGRATION-ROADMAP.md (SPR-ADR-01)

---

## Visão Geral

```
FASE 0          FASE 1          FASE 2          FASE 3          FASE 4                    FASE 5
Foundation      Arquitetura     Governança      Architecture    Migration                 Expansão
(concluída)     (concluída)     Arquitetural    Freeze v2.0     INT-02 a INT-07           Cognitiva
                                (ADR)           (concluído)
```

---

## Fase 0 — Foundation

**Status: ✅ CONCLUÍDA**

| Sprint | Módulo | Cenários | Status |
|---|---|---|---|
| EF-01 | Goal Runtime v0.1 | 21 | ✅ Certified |
| EF-02 | Goal Registry Service v1.0 | 22 | ✅ Certified |
| EF-03 | Goal Scheduler v1.0 | 22 | ✅ Certified |
| EF-04 | Goal Execution Queue v1.0 | 24 | ✅ Certified |
| EF-05 | Execution Dispatcher v1.0 | 24 | ✅ Certified |
| EF-06 | Decision Engine v1.0 | 24 | ✅ Certified |
| EF-07 | Planning Engine v1.0 | 24 | ✅ Certified |
| EF-08 | Reflection Engine v1.0 | 24 | ✅ Certified |
| EF-09 | Self Evaluation Engine v1.0 | 24 | ✅ Certified |
| EF-10 | Knowledge Engine v1.0 | 28 | ✅ Certified |
| EF-11 | Learning Engine v1.0 | 28 | ✅ Certified |
| EF-12 | Memory Engine v1.0 | 28 | ✅ Certified |
| EF-13 | Retrieval Engine v1.0 | 28 | ✅ Certified |
| EF-14 | Capability Registry v1.0 | 28 | ✅ Certified |
| INT-01 | CognitivePipelineAdapter | scaffold | ✅ Fire-and-forget |

**Total Foundation:** 329 cenários · 14 módulos

---

## Fase 1 — Arquitetura

**Status: ✅ CONCLUÍDA**

| Sprint | Entregáveis |
|---|---|
| ARC-01 | ARCHITECTURE-UNIFICATION-STRATEGY, PIPELINE-CONVERGENCE-MATRIX, TARGET-ARCHITECTURE, MIGRATION-ROADMAP |
| ARC-02 | ARCHITECTURE-VALIDATION-REPORT, ARCHITECTURE-DECISION-LOG (DAPs), ARCHITECTURE-RISK-REGISTER, ARCHITECTURE-FREEZE-CHECKLIST |

---

## Fase 2 — Governança Arquitetural

**Status: ✅ CONCLUÍDA (documentação)**

| Sprint | Entregáveis |
|---|---|
| SPR-ADR-01 | ADR-001 a ADR-007, ADR-MASTER-INDEX, ADR-DEPENDENCY-MATRIX |
| **SPR-ADR-02** | **Aprovação humana das 7 ADRs** ← PENDENTE |

**Bloqueante para Fase 3:** Aprovação humana das ADRs (especialmente ADR-001, ADR-003, ADR-004, ADR-005, ADR-007).

---

## Fase 3 — Architecture Freeze v2.0

**Status: ✅ CONCLUÍDA (documentação) · 🟡 Pendente aprovação humana**

| Sprint | Entregáveis |
|---|---|
| SPR-FREEZE-01 | MEMORYOS-ARCHITECTURE-v2.0, OFFICIAL-COMPONENT-REGISTRY, OFFICIAL-CONTRACTS, ARCHITECTURE-FREEZE-DECLARATION, UPDATED-TARGET-ARCHITECTURE, UPDATED-PIPELINE-CONVERGENCE-MATRIX, ARCHITECTURE-CONSISTENCY-REPORT, ARCHITECTURE-QUALITY-GATE, FREEZE-CHANGELOG |

### Ações editoriais pendentes (pós-aprovação ADRs)

| Ação | ADR | Esforço | Resolve |
|---|---|---|---|
| Update TARGET-ARCHITECTURE (remover Reasoning Engine Reserved) | ADR-007 | < 1h | BLOQ-01 |
| Rename `plan` → `executionMetrics` em memoryReasoningPlanner.js | ADR-003 | < 1h | BLOQ-02 |
| Marcar `capability-runtime/CapabilityRegistry.ts` como `@deprecated` | ADR-004 | < 1h | BLOQ-03 parcial |
| Marcar `capabilities/registry/` como `@deprecated` | ADR-004 | < 1h | BLOQ-03 |
| Adicionar comentário canonical em `connectors/registry.js` | ADR-005 | < 1h | BLOQ-04 |

**Sprint EF-22 (implementação — resolve BLOQ-05):**
- Implementar Intent Layer com estratégia aprovada em ADR-001
- 28 cenários de aceitação
- Esforço: 1 sprint

---

## Fase 4 — Migration

**Status: ❌ BLOQUEADA (aguarda Fase 3 completa)**

### INT-02 — Intent Layer

**Pré-requisito:** EF-22 implementado (ADR-001 aprovada + sprint EF-22)
**O que substitui:** `interpretIntent()` — elimina InvokeLLM #1
**Rollback:** 1 linha
**Risco:** Baixo
**Path:** A

---

### EF-24 — Goal Runtime v0.1 → v1.0

**Pré-requisito:** ADR-002 aprovada
**O que faz:** 7 cenários + GoalRuntimeTypes.ts + renomeação de diretório
**Esforço:** ~1 sprint
**Dependência:** Deve preceder INT-03

---

### INT-03 — Goal Runtime + Decision Engine + Planning Engine

**Pré-requisito:** EF-24 concluído + ADR-003 resolvida (rename plan)
**O que substitui:**
- `detectGoal()` → `GoalRuntime.createFromMessage()`
- `detectCapabilities()` + `hasEnoughInfo` → `DecisionEngine.decide()`
- Objeto `plan` analytics → `executionMetrics`
**Rollback:** 2 arquivos
**Risco:** Médio
**Path:** A

---

### EF-15 — Capability Runtime (certificação ou reimplementação)

**Pré-requisito:** ADR-004 aprovada + auditoria manual de `capabilityRuntimeTests.ts`
**O que faz:** Resolve testCount=0; usa EF-14 como registry oficial
**Esforço:** 0.5-2 sprints (depende da auditoria)
**Dependência:** Deve preceder INT-04

---

### INT-04 — Capability Runtime

**Pré-requisito:** EF-15 certificado + canonical EF-14 ativo
**O que substitui:** `CapabilityOrchestrator` completo
**Rollback:** 1 arquivo
**Risco:** Alto (mitigado por EF-15 certificado)
**Path:** A

---

### EF-20 — Context Engine v1.0

**Pré-requisito:** INT-02 concluída
**O que faz:** Novo módulo consolidando runMemoryPipeline queries + buildReasoningContext
**Esforço:** 1-2 sprints
**Dependência:** Deve preceder INT-05

---

### INT-05 — Context Engine + Reflection Engine

**Pré-requisito:** EF-20 implementado + INT-02 concluída
**O que substitui:**
- `buildReasoningContext()` → `ContextEngine.build()`
- Queries paralelas em `runMemoryPipeline()` → `ContextEngine.query()`
- `synthesizeResponse()` → etapa SYNTHESIS de `ReflectionEngine.evaluate()`
**Rollback:** 2 arquivos
**Risco:** Alto (EF-20 é novo)
**Path:** A

---

### INT-06 — Knowledge Engine + Memory Engine

**Pré-requisito:** INT-05 concluída
**O que substitui:** Produção direta de entidades em `processConversationBatch()`
**Inclui:** Deprecação Fase 2 de `memory-engine/` legado (ADR-006)
**Rollback:** 1 arquivo
**Risco:** Médio
**Path:** B

---

### EF-21 — Conversation Engine v1.0

**Pré-requisito:** INT-02 a INT-06 concluídas
**O que faz:** Formaliza `runReasoningPlan()` como Conversation Engine EF oficial
**Esforço:** ~1 sprint
**Dependência:** Deve preceder INT-07

---

### INT-07 — Conversation Engine (Finalização)

**Pré-requisito:** EF-21 + todas as integrações anteriores
**O que substitui:**
- `runReasoningPlan()` → `ConversationEngine.process()`
- `getOrCreateActiveSession()` → `ConversationEngine.getOrCreateSession()`
- `CognitivePipelineAdapter` removido
**Rollback:** 1 linha em ChatPage
**Risco:** Baixo (todos os módulos já integrados)
**Path:** A

---

## Fase 5 — Expansão Cognitiva

**Status: ❌ FUTURA**

| Módulo | Descrição | Depende de |
|---|---|---|
| EF-23 | LLM Gateway v1.0 | INT-07 concluída |
| EF-25 | Specialist Layer | Definição arquitetural futura |
| EF-16 | Connector Registry v1.0 | ADR-005 canonical temporário → consolidação definitiva |
| Multi-agent | Coordenação multi-agente | EF-21 + EF-23 |
| WhatsApp/Telegram | Channels in-app | EF-21 |

---

## Timeline Visual

```
Agora
  │
  ├── SPR-ADR-02: Aprovação humana das 7 ADRs
  │
  ├── Ações editoriais (< 4h total): BLOQ-01, 02, 03, 04 resolvidos
  │
  ├── EF-22 (1 sprint): BLOQ-05 resolvido → Architecture Freeze v2.0 ATIVO
  │
  ├── INT-02: Intent Layer integrada
  │
  ├── EF-24 (paralelo ou antes): Goal Runtime v1.0
  │
  ├── INT-03: Goal Runtime + Decision Engine + Planning Engine
  │
  ├── EF-15 (auditoria + sprint): Capability Runtime certificado
  │
  ├── INT-04: Capability Runtime
  │
  ├── EF-20 (1-2 sprints): Context Engine
  │
  ├── INT-05: Context Engine + Reflection Engine
  │
  ├── INT-06: Knowledge Engine + Memory Engine
  │
  ├── EF-21 (1 sprint): Conversation Engine
  │
  └── INT-07: Pipeline EF 100% operacional no produto
       │
       └── Fase 5: Expansão Cognitiva
```

---

## Checklist Migration Readiness (atualizado)

| Sprint | Ready? | Bloqueio Principal | Caminho de desbloqueio |
|---|---|---|---|
| INT-02 | 🟡 | ADR-001 + EF-22 | Aprovar ADR-001 → implementar EF-22 |
| INT-03 | 🟡 | ADR-002 + ADR-003 + EF-24 | Aprovar ADRs → sprint EF-24 |
| INT-04 | ❌ | ADR-004 + EF-15 | Aprovar ADR-004 → auditoria EF-15 → sprint se necessário |
| INT-05 | ❌ | INT-02 + EF-20 | INT-02 primeiro → sprint EF-20 |
| INT-06 | 🟡 | Aguarda INT-05 | Módulos prontos (EF-10, EF-12) |
| INT-07 | ❌ | INT-02-06 + EF-21 | Cascata completa → sprint EF-21 |

---

*SPR-FREEZE-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*