# UPDATED-MIGRATION-ROADMAP.md
# MemoryOS — Roadmap de Migração Revisado
**Sprint SPR-ADR-01 · Engineering First**
Date: 2026-07-11
Type: Roadmap Revisado
Status: OFFICIAL
Supersede: MIGRATION-ROADMAP.md (ARC-01)

> Revisado com base em: AUDIT-Sprint0, ARCHITECTURE-VALIDATION-REPORT,
> ARCHITECTURE-DECISION-LOG, ARCHITECTURE-RISK-REGISTER,
> ARCHITECTURE-FREEZE-CHECKLIST, ADR-001 a ADR-007.

---

## Visão Geral do Roadmap

```
FASE 0          FASE 1          FASE 2          FASE 3          FASE 4                    FASE 5
Foundation      Arquitetura     Governança      Architecture    Migration                 Expansão
                (concluída)     Arquitetural    Freeze v2.0     INT-02 a INT-07           Cognitiva
                                (ADR)
```

---

## Fase 0 — Foundation

**Status: ✅ CONCLUÍDA**

| Sprint | Entregável | Status |
|---|---|---|
| Sprint EF-01 | Goal Runtime v0.1 | ✅ 21 cenários |
| Sprint EF-02 | Goal Registry Service v1.0 | ✅ 22 cenários |
| Sprint EF-03 | Goal Scheduler v1.0 | ✅ 22 cenários |
| Sprint EF-04 | Goal Execution Queue v1.0 | ✅ 24 cenários |
| Sprint EF-05 | Execution Dispatcher v1.0 | ✅ 24 cenários |
| Sprint EF-06 | Decision Engine v1.0 | ✅ 24 cenários |
| Sprint EF-07 | Planning Engine v1.0 | ✅ 24 cenários |
| Sprint EF-08 | Reflection Engine v1.0 | ✅ 24 cenários |
| Sprint EF-09 | Self Evaluation Engine v1.0 | ✅ 24 cenários |
| Sprint EF-10 | Knowledge Engine v1.0 | ✅ 28 cenários |
| Sprint EF-11 | Learning Engine v1.0 | ✅ 28 cenários |
| Sprint EF-12 | Memory Engine v1.0 | ✅ 28 cenários |
| Sprint EF-13 | Retrieval Engine v1.0 | ✅ 28 cenários |
| Sprint EF-14 | Capability Registry v1.0 | ✅ 28 cenários |
| Sprint INT-01 | CognitivePipelineAdapter | ✅ Scaffold integrado (fire-and-forget) |

**Total:** 329 cenários certificados | 14 módulos | 1 adapter de integração

---

## Fase 1 — Arquitetura

**Status: ✅ CONCLUÍDA**

| Sprint | Entregável | Status |
|---|---|---|
| Sprint ARC-01 | ARCHITECTURE-UNIFICATION-STRATEGY | ✅ |
| Sprint ARC-01 | PIPELINE-CONVERGENCE-MATRIX | ✅ |
| Sprint ARC-01 | TARGET-ARCHITECTURE | ✅ |
| Sprint ARC-01 | MIGRATION-ROADMAP | ✅ |
| Sprint ARC-02 | ARCHITECTURE-VALIDATION-REPORT | ✅ |
| Sprint ARC-02 | ARCHITECTURE-DECISION-LOG | ✅ |
| Sprint ARC-02 | ARCHITECTURE-RISK-REGISTER | ✅ |
| Sprint ARC-02 | ARCHITECTURE-FREEZE-CHECKLIST | ✅ |

---

## Fase 2 — Governança Arquitetural (ADR)

**Status: 🟡 EM ANDAMENTO**

| Sprint | Entregável | Status |
|---|---|---|
| Sprint SPR-ADR-01 | ADR-001 (Intent Layer) | ✅ Proposed |
| Sprint SPR-ADR-01 | ADR-002 (Goal Runtime v1.0) | ✅ Proposed |
| Sprint SPR-ADR-01 | ADR-003 (Semântica Plano) | ✅ Proposed |
| Sprint SPR-ADR-01 | ADR-004 (Capability Runtime) | ✅ Proposed |
| Sprint SPR-ADR-01 | ADR-005 (Connector Registry) | ✅ Proposed |
| Sprint SPR-ADR-01 | ADR-006 (Memory Engine Legado) | ✅ Proposed |
| Sprint SPR-ADR-01 | ADR-007 (Reasoning Engine) | ✅ Proposed |
| Sprint SPR-ADR-01 | ADR-MASTER-INDEX | ✅ |
| Sprint SPR-ADR-01 | ADR-DEPENDENCY-MATRIX | ✅ |
| Sprint SPR-ADR-01 | UPDATED-MIGRATION-ROADMAP | ✅ (este documento) |
| **SPR-ADR-02** | **Aprovação humana das ADRs** | ❌ Pendente |

**Bloqueante para Fase 3:** Aprovação humana de ADR-001, ADR-003, ADR-004, ADR-005, ADR-007 (5 bloqueantes do freeze).

---

## Fase 3 — Architecture Freeze v2.0

**Status: ❌ BLOQUEADA (aguarda Fase 2)**

### Pré-requisitos para declarar Freeze v2.0

| Item | ADR | Estado | Esforço |
|---|---|---|---|
| BLOQ-01: Reasoning Engine posicionado | ADR-007 | ❌ | < 1h editorial |
| BLOQ-02: Semântica `plan` unificada | ADR-003 | ❌ | < 1h editorial |
| BLOQ-03: Capability Registry canonical | ADR-004 | ❌ | < 1h editorial |
| BLOQ-04: Connector Registry canonical | ADR-005 | ❌ | < 1h editorial |
| BLOQ-05: Intent Layer estratégia definida | ADR-001 | ❌ | 1 sprint (EF-22) |

### Ações editoriais (após aprovação ADRs):
- Atualizar `TARGET-ARCHITECTURE.md` com posição definitiva do Reasoning Engine (ADR-007)
- Rename `plan` → `executionMetrics` em `memoryReasoningPlanner.js` (ADR-003)
- Declarar `src/lib/capability-registry/` como EF-14 canonical; marcar `capability-runtime/CapabilityRegistry.ts` como `@deprecated` (ADR-004)
- Declarar `src/lib/connectors/registry.js` como canonical temporário (ADR-005)
- Implementar EF-22 (Intent Layer) com estratégia aprovada em ADR-001

### Entregável da Fase 3:
`ARCHITECTURE-FREEZE-DECLARATION-v2.0.md` — documento oficial de congelamento.

---

## Fase 4 — Migration

**Status: ❌ BLOQUEADA (aguarda Fase 3)**

As sprints de integração só podem iniciar após Architecture Freeze v2.0. O freeze garante que contratos públicos são estáveis durante as migrações.

### INT-02 — Intent Layer

**Pré-requisito:** EF-22 implementado (desbloqueado por ADR-001)
**O que muda:** `interpretIntent()` → `IntentLayer.detect()` — elimina InvokeLLM #1
**Componente substituído:** `src/lib/memoryPipeline.js:55` — `interpretIntent()`
**Rollback:** 1 linha
**Risco:** Baixo

---

### EF-24 — Goal Runtime v0.1 → v1.0 (pré-requisito de INT-03)

**Pré-requisito:** ADR-002 aprovada
**O que faz:** 7 cenários + `GoalRuntimeTypes.ts` + renomeação de diretório
**Duração:** ~1 sprint

---

### INT-03 — Goal Runtime + Decision Engine

**Pré-requisito:** EF-24 concluído + ADR-003 resolvida
**O que muda:**
- `detectGoal()` → `GoalRuntime.createFromMessage()` (Goal Runtime v1.0)
- `detectCapabilities()` + `hasEnoughInfo` → `DecisionEngine.decide()`
- `plan` → `executionMetrics` (ADR-003)
**Componentes substituídos:** `goalDetector.js` + parte de `capabilityOrchestrator.js`
**Rollback:** 2 arquivos
**Risco:** Médio

---

### EF-15 — Capability Runtime v2.0 (pré-requisito de INT-04)

**Pré-requisito:** ADR-004 resolvida (auditoria + decisão)
**O que faz:** Certificação ou reimplementação de Capability Runtime
**Duração:** 0.5-2 sprints (depende do resultado da auditoria ADR-004)

---

### INT-04 — Capability Runtime

**Pré-requisito:** EF-15 certificado + Capability Registry consolidado (ADR-004)
**O que muda:** `CapabilityOrchestrator` → `CapabilityRuntime.execute(plan)`
**Componente substituído:** `capabilityOrchestrator.js` inteiro
**Rollback:** 1 arquivo
**Risco:** Alto (mitigado por EF-15 certificado)

---

### EF-20 — Context Engine v1.0 (pré-requisito de INT-05)

**Pré-requisito:** INT-02 concluída (Intent Layer disponível)
**O que faz:** Novo módulo EF consolidando runMemoryPipeline queries + buildReasoningContext
**Duração:** 1-2 sprints

---

### INT-05 — Context Engine + Reflection Engine

**Pré-requisito:** EF-20 implementado + INT-02 concluída
**O que muda:**
- `buildReasoningContext()` → `ContextEngine.build()`
- Queries paralelas de `runMemoryPipeline()` → `ContextEngine.query()`
- `synthesizeResponse()` → etapa SYNTHESIS do `ReflectionEngine.evaluate()`
**Componentes substituídos:** `contextBuilder.js` + `memorySynthesizer.js` + parte de `memoryPipeline.js`
**Rollback:** 2 arquivos
**Risco:** Alto (EF-20 é novo)

---

### INT-06 — Knowledge Engine + Memory Engine

**Pré-requisito:** INT-05 concluída
**O que muda:**
- Output de `processConversationBatch()` → validado por `KnowledgeEngine.process()`
- Knowledge aprovado → `MemoryEngine.store()`
- Deprecação Fase 2 de `memory-engine/` legado (ADR-006 Fase 2)
**Componente modificado:** `conversationEngine.js` — destino muda, extração permanece
**Rollback:** 1 arquivo
**Risco:** Médio

---

### EF-21 — Conversation Engine v1.0 (pré-requisito de INT-07)

**Pré-requisito:** INT-02 a INT-06 concluídas
**O que faz:** Formaliza `runReasoningPlan()` como Conversation Engine oficial
**Duração:** 1 sprint (majoritariamente reorganização + testes formais)

---

### INT-07 — Conversation Engine (Finalização)

**Pré-requisito:** EF-21 implementado + todas as integrações anteriores
**O que muda:**
- `runReasoningPlan()` → `ConversationEngine.process()`
- `getOrCreateActiveSession()` → `ConversationEngine.getOrCreateSession()`
- `CognitivePipelineAdapter` removido
**Rollback:** 1 linha em ChatPage
**Risco:** Baixo (todos os módulos já integrados)

---

## Fase 5 — Expansão Cognitiva

**Status: ❌ FUTURA (após Fase 4)**

Módulos planejados mas não iniciados:

| Módulo | Descrição | Dependência |
|---|---|---|
| EF-22 | Intent Layer v1.0 | ADR-001 (antecipada para Fase 3) |
| EF-23 | LLM Gateway v1.0 | INT-07 concluída |
| EF-24 | Goal Runtime v1.0 | ADR-002 (antecipada para Fase 4) |
| EF-25 | Specialist Layer | detectSkills() permanece até esta fase |
| EF-16 | Connector Registry v1.0 | ADR-005 define cronograma |

**Expansões futuras possíveis (sem evidência atual no código):**
- Multi-agent coordination
- Cross-session memory federation
- Proactive memory surfacing
- WhatsApp/Telegram channels (agentes in-app)

---

## Resumo de Timeline

```
AGORA              → SPR-ADR-02: Aprovação humana das 7 ADRs
  ↓
Semana 1-2         → Ações editoriais (BLOQ-01, 02, 03, 04 resolvidos)
  ↓
Semana 2-3         → EF-22 implementado (BLOQ-05 resolvido)
  ↓
FASE 3 COMPLETA    → Architecture Freeze v2.0 declarado
  ↓
INT-02             → Intent Layer integrada (elimina InvokeLLM #1)
  ↓
EF-24              → Goal Runtime v1.0 (promoção)
  ↓
INT-03             → Goal Runtime + Decision Engine integrados
  ↓
EF-15              → Capability Runtime certificado
  ↓
INT-04             → Capability Runtime integrado
  ↓
EF-20              → Context Engine implementado
  ↓
INT-05             → Context Engine + Reflection Engine integrados
  ↓
INT-06             → Knowledge Engine + Memory Engine integrados
  ↓
EF-21              → Conversation Engine implementado
  ↓
INT-07             → Pipeline EF 100% operacional no produto
  ↓
FASE 5             → Expansão Cognitiva
```

---

## Comparação: MIGRATION-ROADMAP (ARC-01) vs. UPDATED (SPR-ADR-01)

| Aspecto | ARC-01 | SPR-ADR-01 |
|---|---|---|
| Fases | 3 (Observação, Substituição, Deprecação) | 5 explícitas (0-Foundation a 5-Expansão) |
| Fase de Governança | Não existia | ✅ Fase 2 (ADR) adicionada |
| Fase de Freeze | Implícita | ✅ Fase 3 explícita com pré-requisitos |
| ADRs como pré-requisito | Não mencionado | ✅ Todos os bloqueantes mapeados |
| EF-24 (promoção v0.1) | Mencionado como "antes de INT-03" | ✅ Sprint explícita entre EF e INT |
| EF-15 (Capability Runtime) | Sprint INT-04 dependia | ✅ Sprint EF-15 adicionada como pré-requisito |
| EF-20 (Context Engine) | Sprint INT-05 dependia | ✅ Sprint EF-20 adicionada como pré-requisito |
| EF-21 (Conversation Engine) | Sprint INT-07 dependia | ✅ Sprint EF-21 adicionada como pré-requisito |

---

*SPR-ADR-01 · 2026-07-11 · Engineering First*
*Nenhum código foi criado ou modificado.*