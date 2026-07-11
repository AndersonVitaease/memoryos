# FREEZE-CHANGELOG.md
# MemoryOS — Changelog do Congelamento Arquitetural
**Sprint SPR-FREEZE-01 · Engineering First**
Date: 2026-07-11
Version: 2.0
Status: OFFICIAL

---

## v2.0 — 2026-07-11 (SPR-FREEZE-01)

### Status: OFFICIAL · FROZEN

#### Novos documentos gerados

| Documento | Descrição |
|---|---|
| MEMORYOS-ARCHITECTURE-v2.0.md | Documento mestre da arquitetura congelada |
| OFFICIAL-COMPONENT-REGISTRY.md | Inventário completo de todos os componentes |
| OFFICIAL-CONTRACTS.md | Contratos públicos congelados de 14 módulos EF |
| ARCHITECTURE-FREEZE-DECLARATION.md | Declaração oficial de congelamento |
| UPDATED-TARGET-ARCHITECTURE.md | Pipeline alvo atualizado com Path A/B e ADRs |
| UPDATED-PIPELINE-CONVERGENCE-MATRIX.md | Matriz de convergência atualizada v2.0 |
| ARCHITECTURE-CONSISTENCY-REPORT.md | Relatório de consistência cross-document |
| ARCHITECTURE-QUALITY-GATE.md | Quality gate SRP, acoplamento, coesão |
| FREEZE-CHANGELOG.md | Este documento |

#### Mudanças arquiteturais aplicadas nesta Sprint

**1. Reasoning Engine → Reserved (ADR-007 Proposed)**
- Status anterior: módulo no pipeline entre Reflection Engine e LLM Gateway
- Status v2.0: Reserved — responsabilidade distribuída por EF-06, EF-07, EF-08, EF-20, EF-21
- Impacto: pipeline oficial não lista Reasoning Engine como módulo ativo
- ADR: ADR-007 Proposed — aguarda aprovação humana para tornar-se Accepted

**2. Separação PATH A / PATH B documentada**
- Adicionada restrição explícita: EF-03 (Goal Scheduler), EF-04 (Goal Execution Queue), EF-05 (Execution Dispatcher) são PATH B ONLY
- Motivo: Goals interativos não devem passar por Scheduler/Queue para preservar latência < 2s
- Documentado em: MEMORYOS-ARCHITECTURE-v2.0.md, UPDATED-TARGET-ARCHITECTURE.md, OFFICIAL-CONTRACTS.md

**3. Canonical Declarations formalizadas**
- Capability Registry: `src/lib/capability-registry/` (EF-14) declarado canonical oficial
- Memory Engine: `src/lib/memory-engine-v1/` (EF-12) declarado canonical oficial
- Connector Registry: `src/lib/connectors/registry.js` declarado canonical temporário (até EF-16)
- `capability-runtime/CapabilityRegistry.ts` e `capabilities/registry/` declarados Deprecated
- `memory-engine/` (47 arquivos) declarado Deprecated/Legacy (ADR-006 Fase 1)

**4. Semântica de "Plano" documentada (ADR-003 Proposed)**
- `ExecutionPlan` congelado como output exclusivo de EF-07
- `plan` analytics em produto será renomeado `executionMetrics` após ADR-003 aprovada
- Ambos documentados nos contratos com distinção clara

**5. Status dos módulos EF consolidado**
- 14 módulos EF com status Official · Frozen
- EF-15 com status Official · Pending Certification
- EF-20, EF-21, EF-22, EF-23 com status Reserved for Future Evolution
- EF-25 com status Reserved — candidato futuro

**6. Goal Runtime v0.1 status clarificado**
- Status: Official · Pending (promoção v1.0 via EF-24)
- ADR-002 Proposed documenta a estratégia de promoção
- Não bloqueia freeze mas bloqueia INT-03

---

## v1.9 — 2026-07-11 (SPR-ADR-01)

### Status: SUPERSEDED by v2.0

#### Entregáveis

- ADR-001 a ADR-007 (7 Architecture Decision Records)
- ADR-MASTER-INDEX.md
- ADR-DEPENDENCY-MATRIX.md
- UPDATED-MIGRATION-ROADMAP.md (supersedido por versão SPR-FREEZE-01)

#### Mudanças

- 7 DAPs transformadas em ADRs formais
- Status de todos os ADRs: Proposed (aguardam aprovação humana)
- Roadmap revisado com 5 fases explícitas

---

## v1.8 — 2026-07-11 (ARC-02)

### Status: SUPERSEDED by v2.0

#### Entregáveis

- ARCHITECTURE-VALIDATION-REPORT.md
- ARCHITECTURE-DECISION-LOG.md (7 DAPs)
- ARCHITECTURE-RISK-REGISTER.md (15 riscos)
- ARCHITECTURE-FREEZE-CHECKLIST.md

#### Mudanças

- 19 camadas arquiteturais validadas
- 5 bloqueantes de congelamento identificados
- 15 riscos priorizados

---

## v1.5 — 2026-07-11 (ARC-01)

### Status: SUPERSEDED by v2.0

#### Entregáveis

- ARCHITECTURE-UNIFICATION-STRATEGY.md
- PIPELINE-CONVERGENCE-MATRIX.md (supersedido por UPDATED-PIPELINE-CONVERGENCE-MATRIX.md)
- TARGET-ARCHITECTURE.md (supersedido por UPDATED-TARGET-ARCHITECTURE.md)
- MIGRATION-ROADMAP.md (supersedido por UPDATED-MIGRATION-ROADMAP.md)

#### Mudanças

- Estratégia de convergência documentada para 9 componentes do produto
- 17 módulos EF analisados para integração
- 5 princípios arquiteturais definidos

---

## v1.0 — 2026-07-10 (INT-01)

### Status: SUPERSEDED by v2.0

#### Entregáveis

- CognitivePipelineAdapter (scaffold fire-and-forget)
- Sprint INT-01 concluída

#### Mudanças

- Primeiro ponto de contato entre produto e pipeline EF (não-bloqueante)

---

## v0.1 — 2026-07-09 (EF-01 a EF-14)

### Status: Foundation — base para v2.0

#### Entregáveis

- 14 módulos EF certificados
- 329 cenários de aceitação
- Estrutura de módulo EF padronizada (Types + Engine + Tests + index)

#### Módulos certificados

EF-01 (21) · EF-02 (22) · EF-03 (22) · EF-04 (24) · EF-05 (24) · EF-06 (24) · EF-07 (24) · EF-08 (24) · EF-09 (24) · EF-10 (28) · EF-11 (28) · EF-12 (28) · EF-13 (28) · EF-14 (28)

---

## Documentos Supersedidos

| Documento antigo | Supersedido por | Sprint |
|---|---|---|
| TARGET-ARCHITECTURE.md (ARC-01) | UPDATED-TARGET-ARCHITECTURE.md | SPR-FREEZE-01 |
| PIPELINE-CONVERGENCE-MATRIX.md (ARC-01) | UPDATED-PIPELINE-CONVERGENCE-MATRIX.md | SPR-FREEZE-01 |
| MIGRATION-ROADMAP.md (ARC-01) | UPDATED-MIGRATION-ROADMAP.md (SPR-ADR-01) | SPR-ADR-01 |
| ARCHITECTURE-DECISION-LOG.md (ARC-02 DAPs) | ADR-001 a ADR-007 | SPR-ADR-01 |
| ARCHITECTURE-FREEZE-CHECKLIST.md (ARC-02) | ARCHITECTURE-FREEZE-DECLARATION.md | SPR-FREEZE-01 |

---

## Próxima versão prevista

**v2.1** — após aprovação humana das ADRs e ações editoriais:
- ADR-007 Accepted → remove Reasoning Engine Reserved do pipeline
- ADR-003 Accepted → rename `plan` → `executionMetrics` no produto
- ADR-004 Accepted → EF-14 canonical declarado operacionalmente
- ADR-005 Accepted → `connectors/registry.js` canonical formalmente registrado

**v3.0** — após INT-07 concluída (pipeline EF 100% operacional no produto)

---

*SPR-FREEZE-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*