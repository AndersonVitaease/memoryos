# MEMORYOS-ARCHITECTURE-v2.0.md
# MemoryOS — Arquitetura Oficial v2.0
**Sprint SPR-FREEZE-01 · Engineering First**
Date: 2026-07-11
Version: 2.0
Status: OFFICIAL · FROZEN

---

## 1. Declaração de Versão

Esta é a versão oficial e congelada da arquitetura MemoryOS v2.0.

Todos os documentos produzidos nas Sprints ARC-01, ARC-02, SPR-ADR-01 e SPR-FREEZE-01 convergem nesta versão.

**Nenhuma alteração estrutural é permitida sem ADR aprovada por humano.**

---

## 2. Escopo da Arquitetura v2.0

### Inclui

- Pipeline cognitivo oficial com 19 posições de módulo
- 14 módulos EF certificados (329 cenários)
- Contratos públicos congelados de todos os módulos certificados
- Canonical declarations para Registry, Memory Engine, Goal Runtime
- Roadmap de migração INT-02 a INT-07
- Estratégia de deprecação de componentes legados

### Não inclui

- Implementações de EF-20, EF-21, EF-22, EF-23 (Reserved for Future Evolution)
- Código de produto (ChatPage, componentes React)
- Entidades Base44 (storage permanente, fora do escopo EF)
- Estratégias de prompt LLM

---

## 3. Pipeline Cognitivo Oficial v2.0

### 3.1 Visão Geral

O pipeline cognitivo MemoryOS v2.0 opera em dois paths distintos:

**Path A — Interativo (tempo real, < 2s):**
```
Mensagem → Intent Layer → Goal Runtime → Decision Engine
  → Planning Engine → Context Engine → LLM Gateway
  → Reflection Engine → Resposta
```

**Path B — Background (assíncrono):**
```
Goal (background) → Goal Scheduler → Execution Dispatcher
  → Goal Execution Queue → Capability Runtime
  → Knowledge Engine → Learning Engine → Memory Engine
```

### 3.2 Pipeline Completo — Módulos e Status

```
┌─────────────────────────────────────────────────────────────────┐
│ PATH A — INTERATIVO (tempo real)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [1] CONVERSATION ENGINE (EF-21)                                │
│      Status: Reserved for Future Evolution                      │
│      Responsabilidade: Orquestração do fluxo conversacional     │
│      Implementação atual: runReasoningPlan() [legado]           │
│                                                                 │
│  [2] INTENT LAYER (EF-22)                                       │
│      Status: Reserved for Future Evolution                      │
│      Responsabilidade: Classificação determinística de intent   │
│      Implementação atual: interpretIntent() [legado, LLM-based] │
│      Estratégia: Determinística Pura (ADR-001 Proposed)         │
│                                                                 │
│  [3] GOAL RUNTIME (EF-01/EF-24)                                 │
│      Status: Official · Certified (21 cenários → v1.0 pending) │
│      Responsabilidade: Criação e ciclo de vida de Goals         │
│      Implementação atual: detectGoal() [legado]                 │
│      Promoção: EF-24 (ADR-002 Proposed)                        │
│                                                                 │
│  [4] DECISION ENGINE (EF-06)                                    │
│      Status: Official · Frozen · Certified (24 cenários)        │
│      Responsabilidade: Avaliação e seleção de candidates        │
│      Implementação atual: detectCapabilities() [legado]         │
│                                                                 │
│  [5] PLANNING ENGINE (EF-07)                                    │
│      Status: Official · Frozen · Certified (24 cenários)        │
│      Responsabilidade: ExecutionPlan imutável a partir de Goal  │
│      Contrato congelado: PlanningEngine.plan() → ExecutionPlan  │
│                                                                 │
│  [6] CONTEXT ENGINE (EF-20)                                     │
│      Status: Reserved for Future Evolution                      │
│      Responsabilidade: Montagem do contexto cognitivo           │
│      Implementação atual: buildReasoningContext() [legado]      │
│                                                                 │
│  [7] [SPECIALIST LAYER] (EF-25)                                 │
│      Status: Reserved — candidato futuro                        │
│      Responsabilidade: Seleção de Specialists de domínio        │
│      Implementação atual: detectSkills() + SpecialistRouter     │
│      Nota: Permanece no produto até EF-25 definido             │
│                                                                 │
│  [8] CAPABILITY RUNTIME (EF-15)                                 │
│      Status: Official · Pending Certification                   │
│      Responsabilidade: Execução de capabilities operacionais    │
│      Implementação atual: CapabilityOrchestrator [legado]       │
│      Pré-requisito: ADR-004 auditoria manual                    │
│                                                                 │
│  [9] CONNECTOR RUNTIME (EF-16+)                                 │
│      Status: Reserved for Future Evolution                      │
│      Responsabilidade: Execução de ações em sistemas externos   │
│      Implementação atual: detectService() + connectors/registry │
│                                                                 │
│ [10] LLM GATEWAY (EF-23)                                        │
│      Status: Reserved for Future Evolution                      │
│      Responsabilidade: Proxy isolado para chamadas LLM          │
│      Implementação atual: InvokeLLM() direto [sem abstração]    │
│                                                                 │
│ [11] REFLECTION ENGINE (EF-08)                                  │
│      Status: Official · Frozen · Certified (24 cenários)        │
│      Responsabilidade: Avaliação estruturada de resultado       │
│      Incorpora: synthesizeResponse() como etapa SYNTHESIS       │
│                                                                 │
│ [12] SELF EVALUATION ENGINE (EF-09)                             │
│      Status: Official · Frozen · Certified (24 cenários)        │
│      Responsabilidade: Score de qualidade, confiabilidade       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PATH B — BACKGROUND (assíncrono)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [13] GOAL SCHEDULER (EF-03)                                     │
│      Status: Official · Frozen · Certified (22 cenários)        │
│      Responsabilidade: Agendamento temporal de Goals            │
│      RESTRIÇÃO: PATH B ONLY — não entra no path interativo      │
│                                                                 │
│ [14] EXECUTION DISPATCHER (EF-05)                               │
│      Status: Official · Frozen · Certified (24 cenários)        │
│      Responsabilidade: Movimentação Goal → Queue                │
│      RESTRIÇÃO: PATH B ONLY                                     │
│                                                                 │
│ [15] GOAL EXECUTION QUEUE (EF-04)                               │
│      Status: Official · Frozen · Certified (24 cenários)        │
│      Responsabilidade: Ordenação por prioridade (Priority DESC) │
│      RESTRIÇÃO: PATH B ONLY                                     │
│                                                                 │
│ [16] KNOWLEDGE ENGINE (EF-10)                                   │
│      Status: Official · Frozen · Certified (28 cenários)        │
│      Responsabilidade: SelfEvaluations → Knowledge estruturado  │
│                                                                 │
│ [17] LEARNING ENGINE (EF-11)                                    │
│      Status: Official · Frozen · Certified (28 cenários)        │
│      Responsabilidade: Knowledge → Learning imutável            │
│                                                                 │
│ [18] MEMORY ENGINE (EF-12)                                      │
│      Status: Official · Frozen · Certified (28 cenários)        │
│      Responsabilidade: Learning → Memory imutável               │
│      Canonical: src/lib/memory-engine-v1/                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ INFRA (suporte a ambos os paths)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [19] GOAL REGISTRY SERVICE (EF-02)                              │
│      Status: Official · Frozen · Certified (22 cenários)        │
│      Responsabilidade: Persistência e indexação de Goals        │
│                                                                 │
│ [20] CAPABILITY REGISTRY (EF-14)                                │
│      Status: Official · Frozen · Certified (28 cenários)        │
│      Responsabilidade: Índice central de capabilities           │
│      Canonical: src/lib/capability-registry/                    │
│                                                                 │
│ [21] RETRIEVAL ENGINE (EF-13)                                   │
│      Status: Official · Frozen · Certified (28 cenários)        │
│      Responsabilidade: Recuperação semântica de memória         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ NOTA SOBRE REASONING ENGINE                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ADR-007 (Proposed): A responsabilidade de "raciocínio" é        │
│ distribuída pelos módulos EF-06, EF-07, EF-08, EF-20 e EF-21.  │
│ Reasoning Engine como módulo separado permanece Reserved        │
│ até aprovação humana de ADR-007.                                │
│                                                                 │
│ [R] REASONING ENGINE                                            │
│     Status: Reserved — aguarda ADR-007                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Princípios Arquiteturais Congelados

### P1 — Single Responsibility per Module
Cada módulo EF tem exatamente uma responsabilidade documentada. Violações são bloqueantes para certificação.

### P2 — Dois Paths Distintos (Interativo vs. Background)
Goal Scheduler, Execution Dispatcher e Goal Execution Queue são restritos ao Path B. Goals interativos acessam Decision Engine → Planning Engine diretamente.

### P3 — Entidades Base44 como Storage Permanente
As entidades Base44 (Message, ChatSession, Document, KnowledgeEntity, Decision, Task, Topic, Keyword) são o storage permanente. Módulos EF são produtores e consumidores — não substituem o storage.

### P4 — Contratos Públicos Imutáveis
Após congelamento, assinaturas de métodos públicos dos módulos EF não mudam sem versão major e ADR aprovada.

### P5 — Canonical Registry Único
Para cada tipo de Registry existe um único canonical oficial declarado. Duplicatas são marcadas Deprecated ou Legacy.

### P6 — Migrações por Substituição Incremental
Nenhum componente do produto é removido antes que seu substituto EF esteja integrado e validado no produto.

### P7 — Nenhuma Decisão Automática
Qualquer mudança estrutural na arquitetura requer ADR com aprovação humana explícita.

---

## 5. Storage Layer

| Entidade | Tipo | Produtor EF | Status |
|---|---|---|---|
| Message | Base44 Entity | Conversation Engine (EF-21) | Active |
| ChatSession | Base44 Entity | Conversation Engine (EF-21) | Active |
| Document | Base44 Entity | ingestKnowledge pipeline | Active |
| KnowledgeEntity | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Decision | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Task | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Topic | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Keyword | Base44 Entity | Knowledge Engine (EF-10) | Active |
| ChatMessage | Base44 Entity | Nenhum (possivelmente legacy) | Pending Deprecation |
| Conversation | Base44 Entity | Nenhum (possivelmente legacy) | Pending Deprecation |

---

## 6. Histórico de Versões

| Versão | Sprint | Data | Descrição |
|---|---|---|---|
| 0.1 | EF-01 a EF-14 | 2026-07-09 | Foundation: 14 módulos certificados |
| 1.0 | INT-01 | 2026-07-10 | CognitivePipelineAdapter (scaffold) |
| 1.5 | ARC-01 | 2026-07-11 | Estratégia de unificação documentada |
| 1.8 | ARC-02 | 2026-07-11 | Validação arquitetural + risk register |
| 1.9 | SPR-ADR-01 | 2026-07-11 | 7 ADRs formais produzidas |
| **2.0** | **SPR-FREEZE-01** | **2026-07-11** | **Architecture Freeze v2.0** |

---

*SPR-FREEZE-01 · 2026-07-11 · Status: OFFICIAL · FROZEN*