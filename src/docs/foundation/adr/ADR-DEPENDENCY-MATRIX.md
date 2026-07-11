# ADR-DEPENDENCY-MATRIX.md
# MemoryOS — Matriz de Dependências e Grafo de Impacto
**Sprint SPR-ADR-01 · Engineering First**
Date: 2026-07-11
Type: Dependency Matrix
Status: OFFICIAL

---

## 1. Grafo de Dependências

```
ADR-001 (Intent Layer — EF-22)
  │
  ├── Módulos afetados
  │   ├── EF-22 (Intent Layer) — não existe; precisa ser implementado
  │   ├── memoryPipeline.js — substituição de interpretIntent()
  │   └── memoryReasoningPlanner.js — usa output da Intent Layer
  │
  ├── Sprints afetadas
  │   ├── EF-22 — implementação da Intent Layer (BLOQUEADA por ADR-001)
  │   └── INT-02 — integração Intent Layer no produto (BLOQUEADA por EF-22)
  │
  └── Roadmap
      INT-02 → INT-05 (Context Engine depende de Intent Layer)
               → INT-07 (Conversation Engine engloba tudo)


ADR-002 (Goal Runtime v1.0 — EF-24)
  │
  ├── Módulos afetados
  │   ├── goal-runtime-v01/ — promoção para goal-runtime/
  │   ├── GoalRegistryService (EF-02) — imports apontam para v0.1
  │   ├── GoalScheduler (EF-03) — idem
  │   ├── GoalExecutionQueue (EF-04) — idem
  │   └── ExecutionDispatcher (EF-05) — idem
  │
  ├── Sprints afetadas
  │   ├── EF-24 — promoção v0.1 → v1.0
  │   └── INT-03 — integração Goal Runtime (SEQUENCIADA após EF-24)
  │
  └── Roadmap
      EF-24 → INT-03 → INT-04 → INT-05 → INT-06 → INT-07
      (Goal Runtime é fundação de toda a cadeia de integração)


ADR-003 (Semântica do Plano)
  │
  ├── Módulos afetados
  │   ├── memoryReasoningPlanner.js — rename plan → executionMetrics
  │   ├── PlanningEngine (EF-07) — contrato congelável após decisão
  │   ├── ReflectionEngine (EF-08) — recebe ExecutionPlan como baseline
  │   └── base44.analytics.track() — usa propriedades do objeto plan
  │
  ├── Sprints afetadas
  │   └── INT-03 — integração Planning Engine (BLOQUEADA por ADR-003)
  │
  └── Roadmap
      ADR-003 resolvida → contrato EF-07 congelado → INT-03 desbloqueada
      (Dependência cruzada com ADR-002: INT-03 usa Goal Runtime + Planning Engine)


ADR-004 (Capability Runtime EF-15)
  │
  ├── Módulos afetados
  │   ├── capability-runtime/ — certificação ou reimplementação
  │   ├── capability-registry/ (EF-14) — declarado canonical
  │   ├── capability-runtime/CapabilityRegistry.ts — deprecated
  │   ├── capabilities/registry/ — deprecated
  │   └── capabilityOrchestrator.js — substituído quando EF-15 pronto
  │
  ├── Sprints afetadas
  │   ├── EF-15 — certificação/reimplementação (variável, depende da auditoria manual)
  │   └── INT-04 — integração Capability Runtime (BLOQUEADA por EF-15 + ADR-004)
  │
  └── Roadmap
      ADR-004 → auditoria EF-15 → (EF-15 sprint se necessário) → INT-04
      INT-04 → INT-05 → INT-06 → INT-07
      (Capability Runtime é central para toda a cadeia de capability execution)


ADR-005 (Connector Registry)
  │
  ├── Módulos afetados
  │   ├── connectors/registry.js — declarado canonical temporário
  │   ├── connector-registry/ — congelado (não cresce)
  │   ├── connector-runtime/ConnectorRegistry.ts — congelado
  │   ├── enterprise-integration/connectorRegistry.js — congelado
  │   └── connector-sdk/ — congelado
  │
  ├── Sprints afetadas
  │   └── EF-16 — Connector Registry v1.0 (postergada, não urgente)
  │
  └── Roadmap
      ADR-005 (editorial) → BLOQ-04 resolvido → congelamento parcial
      EF-16 (futuro, não urgente) → consolidação definitiva


ADR-006 (Memory Engine Legado)
  │
  ├── Módulos afetados
  │   ├── memory-engine/ — 47 arquivos a deprecar
  │   ├── memory-engine-v1/ (EF-12) — declarado canonical
  │   ├── components/memory-engine/ — 9 TestRunners (imports a verificar)
  │   └── pages/MemoryEngine.jsx, pages/MemoryEnginePage.jsx — verificar imports
  │
  ├── Sprints afetadas
  │   └── INT-06 — remoção Fase 2 incluída naturalmente
  │
  └── Roadmap
      ADR-006 Fase 1 (editorial, imediata) → NB-02 endereçado
      INT-06 → remoção Fase 2


ADR-007 (Reasoning Engine)
  │
  ├── Módulos afetados
  │   ├── TARGET-ARCHITECTURE.md — pipeline atualizado (remove Reasoning Engine)
  │   ├── reasoning/ — 11 arquivos (distribuídos pelos módulos EF no roadmap de migração)
  │   └── LLM Gateway (EF-23) — posição no pipeline confirmada
  │
  ├── Sprints afetadas
  │   └── Nenhuma sprint de implementação (ação editorial)
  │
  └── Roadmap
      ADR-007 resolvida → BLOQ-01 resolvido → pipeline oficial congelável
      (Independente de outras ADRs)
```

---

## 2. Matriz de Dependências ADR × ADR

| | ADR-001 | ADR-002 | ADR-003 | ADR-004 | ADR-005 | ADR-006 | ADR-007 |
|---|---|---|---|---|---|---|---|
| **ADR-001** | — | Independente | Independente | Independente | Independente | Independente | Independente |
| **ADR-002** | Independente | — | **Dependência cruzada** (INT-03 usa ambos) | Independente | Independente | Independente | Independente |
| **ADR-003** | Independente | **Cruzada** (INT-03) | — | Independente | Independente | Independente | Independente |
| **ADR-004** | Independente | Independente | Independente | — | **Alimenta** (EF-15 usa Connector Registry) | Independente | Independente |
| **ADR-005** | Independente | Independente | Independente | **Alimentado por** | — | Independente | Independente |
| **ADR-006** | Independente | Independente | Independente | Independente | Independente | — | Independente |
| **ADR-007** | Independente | Independente | Independente | Independente | Independente | Independente | — |

**Dependências identificadas:**
- ADR-003 × ADR-002: INT-03 (Planning Engine + Goal Runtime) usa ambos — devem ser resolvidos antes da mesma sprint
- ADR-004 × ADR-005: EF-15 (Capability Runtime) usa Connector Registry — ADR-005 deve ser resolvida antes ou junto com ADR-004

---

## 3. Matriz ADR × Módulos EF

| ADR | EF-01 | EF-02 | EF-03 | EF-04 | EF-05 | EF-06 | EF-07 | EF-08 | EF-10 | EF-12 | EF-14 | EF-15 | EF-20 | EF-21 | EF-22 | EF-23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADR-001 | | | | | | | | | | | | | 🔵 | 🔵 | 🎯 | |
| ADR-002 | 🎯 | 🔵 | 🔵 | 🔵 | 🔵 | | | | | | | | | | | |
| ADR-003 | | | | | | 🔵 | 🎯 | 🔵 | | | | | | | | |
| ADR-004 | | | | | | 🔵 | | | | | 🎯 | 🎯 | | | | |
| ADR-005 | | | | | | | | | | | | 🔵 | | | | |
| ADR-006 | | | | | | | | | | 🎯 | | | | | | |
| ADR-007 | | | | | | 🔵 | 🔵 | 🔵 | | | | | 🔵 | 🔵 | | 🔵 |

**Legenda:** 🎯 = módulo alvo desta ADR | 🔵 = módulo dependente/afetado

---

## 4. Matriz ADR × Sprints de Migração

| ADR | INT-02 | INT-03 | INT-04 | INT-05 | INT-06 | INT-07 |
|---|---|---|---|---|---|---|
| ADR-001 | 🚫 BLOQUEIA | Indireto | — | Indireto | — | Indireto |
| ADR-002 | — | 🚫 BLOQUEIA | Cascata | Cascata | Cascata | Cascata |
| ADR-003 | — | 🚫 BLOQUEIA | — | — | — | — |
| ADR-004 | — | — | 🚫 BLOQUEIA | Cascata | Cascata | Cascata |
| ADR-005 | — | — | 🟡 Alimenta INT-04 | — | — | — |
| ADR-006 | — | — | — | — | 🟡 Inclui remoção | — |
| ADR-007 | — | — | — | — | — | — |

---

## 5. Checklist de Congelamento — Status por ADR

| ADR | Bloqueante | Status | Ação mínima | Aprovação humana? |
|---|---|---|---|---|
| ADR-001 | BLOQ-05 | ❌ Pendente | Decidir estratégia Intent Layer | ✅ Requerida |
| ADR-002 | NB-02 | 🟡 Pendente | Decidir sequência EF-24 | ✅ Requerida |
| ADR-003 | BLOQ-02 | ❌ Pendente | Decidir renomeação `plan` | ✅ Requerida |
| ADR-004 | BLOQ-03 | ❌ Pendente | Auditar EF-15 + declarar EF-14 canonical | ✅ Requerida (+ auditoria técnica) |
| ADR-005 | BLOQ-04 | ❌ Pendente | Declarar canonical temporário | ✅ Requerida |
| ADR-006 | NB-02 | 🟡 Pendente | Deprecar Fase 1 | ✅ Requerida |
| ADR-007 | BLOQ-01 | ❌ Pendente | Decidir destino Reasoning Engine | ✅ Requerida |

---

## 6. Sequência Recomendada de Resolução

A sequência abaixo é baseada em: esforço mínimo primeiro, desbloqueios em cadeia.

```
Semana 1 (Ações editoriais — < 4 horas total):
  ADR-007 → Aprovar Alternativa A → Update TARGET-ARCHITECTURE.md → BLOQ-01 ✅
  ADR-003 → Aprovar Alternativa A → rename plan → executionMetrics → BLOQ-02 ✅
  ADR-004 (parcial) → Declarar EF-14 canonical → BLOQ-03 parcial ✅
  ADR-005 → Aprovar Alternativa D → declarar connectors/registry.js canonical → BLOQ-04 ✅

Semana 2 (Auditoria técnica):
  ADR-004 (completo) → Auditar capabilityRuntimeTests.ts manualmente → decisão EF-15

Semana 2-3 (Implementação):
  ADR-001 → Aprovar estratégia → implementar EF-22 → BLOQ-05 ✅

Após BLOQ-01 a BLOQ-05 resolvidos:
  → Architecture Freeze v2.0 pode ser declarado
  → ADR-002 e ADR-006 resolvidos em paralelo (não bloqueiam freeze)
```

---

*SPR-ADR-01 · 2026-07-11 · Engineering First*
*Nenhuma decisão tomada. Todas as ADRs em status Proposed.*