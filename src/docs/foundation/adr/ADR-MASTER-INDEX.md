# ADR-MASTER-INDEX.md
# MemoryOS — Índice Mestre de Architecture Decision Records
**Sprint SPR-ADR-01 · Engineering First**
Date: 2026-07-11
Type: Master Index
Status: OFFICIAL

---

## Sumário Executivo

| Métrica | Valor |
|---|---|
| Total de ADRs | 8 |
| Status Proposed | 7 |
| Status Accepted | 0 |
| Status Rejected | 0 |
| Status Deferred | 0 |
| ADRs bloqueantes para freeze | 5 (ADR-001, ADR-002, ADR-003, ADR-004, ADR-007) |
| ADRs não-bloqueantes | 2 (ADR-005, ADR-006) |

---

## Registro Completo

### ADR-001 — Intent Layer: Estratégia de Classificação

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-001 |
| **Status** | Proposed |
| **DAP Origem** | DAP-01 |
| **Bloqueante Freeze** | BLOQ-05 |
| **Prioridade** | CRÍTICA |
| **Sprint afetada** | EF-22, INT-02 |
| **Dependentes** | Context Engine (EF-20), Conversation Engine (EF-21) |
| **Recomendação técnica** | Alternativa A — Determinística Pura |
| **Esforço mínimo** | 1 sprint (EF-22 + 28 cenários) |
| **Arquivo** | `src/docs/foundation/adr/ADR-001.md` |

**Resumo:** Define se a Intent Layer (EF-22) será determinística, híbrida ou LLM+cache. Bloqueia toda implementação de EF-22 e integração INT-02.

---

### ADR-002 — Goal Runtime: Promoção v0.1 → v1.0

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-002 |
| **Status** | Proposed |
| **DAP Origem** | DAP-02 |
| **Bloqueante Freeze** | NB-02 (não-bloqueante, recomendado) |
| **Prioridade** | ALTA |
| **Sprint afetada** | EF-24, INT-03 |
| **Dependentes** | Goal Registry (EF-02), Scheduler (EF-03), Queue (EF-04), Dispatcher (EF-05) |
| **Recomendação técnica** | Alternativa A — Promover antes de INT-03 |
| **Esforço mínimo** | 1 sprint (EF-24: 7 cenários + Types + renomeação) |
| **Arquivo** | `src/docs/foundation/adr/ADR-002.md` |

**Resumo:** Define se Goal Runtime é promovido para v1.0 antes ou em paralelo a INT-03. Afeta certificação de 4 módulos downstream.

---

### ADR-003 — Semântica de "Plano": analytics vs. ExecutionPlan

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-003 |
| **Status** | Proposed |
| **DAP Origem** | DAP-03 |
| **Bloqueante Freeze** | BLOQ-02 |
| **Prioridade** | CRÍTICA |
| **Sprint afetada** | INT-03 (Planning Engine) |
| **Dependentes** | Planning Engine (EF-07), Reflection Engine (EF-08), `base44.analytics.track()` |
| **Recomendação técnica** | Alternativa A — Renomear `plan` para `executionMetrics` |
| **Esforço mínimo** | < 1 hora (rename + analytics) |
| **Arquivo** | `src/docs/foundation/adr/ADR-003.md` |

**Resumo:** Resolve conflito de nomenclatura entre objeto `plan` analytics (produto) e `ExecutionPlan` (Planning Engine EF-07). Menor esforço, maior impacto no congelamento.

---

### ADR-004 — Capability Runtime: Certificação e Consolidação

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-004 |
| **Status** | Proposed |
| **DAP Origem** | DAP-04 |
| **Bloqueante Freeze** | BLOQ-03 (parcial) |
| **Prioridade** | CRÍTICA |
| **Sprint afetada** | EF-15, INT-04 |
| **Dependentes** | Capability Runtime (EF-15), INT-04 a INT-07 |
| **Recomendação técnica** | Alternativa A — Auditar manualmente antes de decidir |
| **Esforço mínimo** | Auditoria: horas; Ação mínima: declarar EF-14 como canonical (< 1 hora) |
| **Arquivo** | `src/docs/foundation/adr/ADR-004.md` |

**Resumo:** Resolve triplicação de Capability Registry e ambiguidade de certificação de Capability Runtime (testCount=0). Bloqueia INT-04.

---

### ADR-005 — Connector Registry: Consolidação

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-005 |
| **Status** | Proposed |
| **DAP Origem** | DAP-05 |
| **Bloqueante Freeze** | BLOQ-04 |
| **Prioridade** | ALTA |
| **Sprint afetada** | EF-16, INT-04+ |
| **Dependentes** | Connector Runtime (EF-16+) |
| **Recomendação técnica** | Alternativa D — canonical temporário agora, EF-16 depois |
| **Esforço mínimo** | < 1 hora (documentação editorial) |
| **Arquivo** | `src/docs/foundation/adr/ADR-005.md` |

**Resumo:** Declara canonical temporário do Connector Registry entre 5 implementações. Resolve BLOQ-04 com ação editorial mínima.

---

### ADR-006 — Memory Engine Legado: Deprecação

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-006 |
| **Status** | Proposed |
| **DAP Origem** | DAP-06 |
| **Bloqueante Freeze** | NB-02 (não-bloqueante) |
| **Prioridade** | MÉDIA |
| **Sprint afetada** | INT-06 (inclusão natural) |
| **Dependentes** | Páginas de validação, TestRunners em `components/memory-engine/` |
| **Recomendação técnica** | Alternativa A — Deprecar Fase 1 imediatamente |
| **Esforço mínimo** | < 1 hora (DEPRECATED.md + JSDoc) |
| **Arquivo** | `src/docs/foundation/adr/ADR-006.md` |

**Resumo:** Define estratégia de deprecação dos 47 arquivos JS do Memory Engine legado que coexiste com EF-12 oficial.

---

### ADR-007 — Reasoning Engine: Módulo Separado vs. Distribuído

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-007 |
| **Status** | Proposed |
| **DAP Origem** | DAP-07 |
| **Bloqueante Freeze** | BLOQ-01 |
| **Prioridade** | CRÍTICA |
| **Sprint afetada** | TARGET-ARCHITECTURE.md |
| **Dependentes** | Pipeline oficial (TARGET-ARCHITECTURE), LLM Gateway (EF-23) |
| **Recomendação técnica** | Alternativa A — Remover Reasoning Engine do pipeline |
| **Esforço mínimo** | < 1 hora (update TARGET-ARCHITECTURE.md) |
| **Arquivo** | `src/docs/foundation/adr/ADR-007.md` |

**Resumo:** Define se Reasoning Engine existe como módulo EF separado ou se a responsabilidade é distribuída pelos módulos existentes (EF-06, EF-07, EF-08, EF-20, EF-21).

---

## Matriz de Prioridade

| ADR | Prioridade | Impacto | Dependências | Bloqueia Freeze? |
|---|---|---|---|---|
| ADR-001 | CRÍTICA | Bloqueia EF-22 e INT-02 inteiros | EF-20, EF-21 dependem de EF-22 | ✅ BLOQ-05 |
| ADR-003 | CRÍTICA | Contrato de Planning Engine não pode ser congelado | EF-07, EF-08, analytics | ✅ BLOQ-02 |
| ADR-004 | CRÍTICA | Triplicação bloqueia INT-04 | EF-15, INT-04 a INT-07 | ✅ BLOQ-03 |
| ADR-007 | CRÍTICA | Pipeline oficial indefinido | TARGET-ARCHITECTURE | ✅ BLOQ-01 |
| ADR-005 | ALTA | Connector Registry fragmentado | EF-16, Connector Runtime | ✅ BLOQ-04 |
| ADR-002 | ALTA | Goal Runtime sub-certificado | EF-02, EF-03, EF-04, EF-05 | 🟡 NB-02 |
| ADR-006 | MÉDIA | 47 arquivos legados sem destino | Páginas de validação | 🟡 NB-02 |

---

## Dependências entre ADRs

```
ADR-001 (Intent Layer)
  → Resolução desbloqueia: EF-22 → INT-02 → INT-05 → INT-07

ADR-002 (Goal Runtime v1.0)
  → Resolução desbloqueia: EF-24 → INT-03 → INT-04

ADR-003 (Semântica Plano)
  → Resolução desbloqueia: Contrato EF-07 → INT-03 (Planning Engine)
  → Dependência de ADR-002 (INT-03 usa ambos)

ADR-004 (Capability Runtime)
  → Resolução desbloqueia: EF-15 → INT-04 → INT-05 → INT-06 → INT-07
  → Parcialmente dependente de ADR-005 (Connector Registry dentro do EF-15)

ADR-005 (Connector Registry)
  → Resolução desbloqueia: BLOQ-04 → congelamento parcial
  → Alimenta ADR-004 (EF-15 usa Connector Registry)

ADR-006 (Memory Engine Legado)
  → Resolução desbloqueia: limpeza antes de INT-06
  → Independente de outros ADRs

ADR-007 (Reasoning Engine)
  → Resolução desbloqueia: BLOQ-01 → pipeline oficial congelado
  → Independente de outros ADRs (ação editorial)
```

---

## Status de Resolução de Bloqueantes

| Bloqueante | ADR | Ação mínima | Esforço |
|---|---|---|---|
| BLOQ-01 | ADR-007 | Atualizar TARGET-ARCHITECTURE.md | < 1 hora |
| BLOQ-02 | ADR-003 | Rename `plan` → `executionMetrics` | < 1 hora |
| BLOQ-03 | ADR-004 | Declarar EF-14 canonical + marcar duplicatas deprecated | < 1 hora |
| BLOQ-04 | ADR-005 | Declarar `connectors/registry.js` canonical temporário | < 1 hora |
| BLOQ-05 | ADR-001 | Decisão de estratégia + implementação EF-22 | 1 sprint |

**4 de 5 bloqueantes** podem ser resolvidos com ações editoriais (< 1 hora cada) após aprovação humana das ADRs correspondentes.

**1 bloqueante** (BLOQ-05 via ADR-001) requer uma sprint completa de implementação (EF-22).

---

---

### ADR-012 — Watch Engine: Arquitetura e Decisões de Implementação

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-012 |
| **Status** | Accepted |
| **RFC Origem** | RFC-005 |
| **EPIC** | EPIC-017 |
| **Prioridade** | ALTA |
| **Sprints afetadas** | WE-01, WE-02, WE-03, WE-04 |
| **Arquivo** | `src/docs/foundation/adr/ADR-012.md` |

**Resumo:** Define 7 decisões arquiteturais para o Watch Engine: localização em módulo isolado, compilação de lógica booleana para função JS pura (sem eval), Durable Outbox para entrega garantida, Token Bucket por provider, Circuit Breaker por provider, controle de transição de estado, e deduplicação via KnowledgeGraph no Sprint 4.

---

---

### ADR-013 — Microsoft Graph Connector: Capability Executors Pattern

| Campo | Valor |
|---|---|
| **ADR-ID** | ADR-013 |
| **Status** | Accepted |
| **RFC Origem** | RFC-006 |
| **Prioridade** | ALTA |
| **Sprints afetadas** | MS-EXP-01, MS-EXP-02, MS-EXP-03, MS-EXP-04 |
| **Arquivo** | `src/docs/foundation/adr/ADR-013.md` |

**Resumo:** Define a expansao do conector Microsoft Graph para 11 servicos do Microsoft 365 usando o padrao Capability Executors (shell fino + 1 executor por servico em arquivo isolado), alinhando com o padrao ja vivo dos conectores Google. Rejeita replicar a arquitetura 5-camadas do WhatsApp — o Graph e provedor unico oficial, nao ha concorrentes a abstrair.

---

*SPR-ADR-01 · 2026-07-11 · Engineering First*
*Atualizado em 2026-08-02 — ADR-012 Watch Engine adicionado*
*Atualizado em 2026-08-03 — ADR-013 Microsoft Graph Expansion adicionado*