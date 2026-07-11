# ADR-LIFECYCLE.md
# MemoryOS — Ciclo de Vida Oficial das ADRs
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## Diagrama do Ciclo de Vida

```
                    ┌──────────┐
                    │  DRAFT   │◄──── Criação inicial por qualquer dev
                    └────┬─────┘
                         │ submit_for_review()
                         │ (Tech Lead / Arquiteto)
                         ▼
                    ┌──────────┐
                    │  REVIEW  │◄──── Revisão técnica, verificação de completude
                    └────┬─────┘
                    ┌────┴────┐
                    │         │
                    ▼         ▼
             ┌──────────┐  [volta para Draft se precisa revisão]
             │ PROPOSED │◄──── Pronta para decisão humana
             └────┬─────┘
             ┌────┴────┐
             │         │
             ▼         ▼
         ┌────────┐ ┌──────────┐
         │ACCEPTED│ │ REJECTED │
         └────┬───┘ └──────────┘
              │
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
┌──────────┐       ┌──────────────┐
│SUPERSEDED│       │  DEPRECATED  │
└──────────┘       └──────┬───────┘
                          │
                          ▼
                    ┌──────────┐
                    │ ARCHIVED │
                    └──────────┘
```

---

## Estados

### DRAFT

**Descrição:** ADR em construção. Não está pronta para decisão.

**Critérios de entrada:**
- Criada por qualquer desenvolvedor
- Arquivo criado em `src/docs/foundation/adr/`
- Header com `Status: Draft`

**Critérios de saída:**
- Campos obrigatórios preenchidos: Contexto, Decisão, Consequências, Alternativas
- Ao menos 2 alternativas consideradas documentadas
- Dependências com outras ADRs identificadas
- Revisão técnica inicial feita pelo autor

**Ações proibidas em Draft:**
- Implementar código baseado na decisão
- Comunicar a decisão como tomada

---

### REVIEW

**Descrição:** ADR em revisão técnica por Tech Lead ou Arquiteto.

**Critérios de entrada:**
- ADR em Draft com campos obrigatórios completos
- Autor submeteu para review explicitamente
- Tech Lead/Arquiteto atribuído como revisor

**Durante Review, verificar:**
- A decisão é necessária? (DAP real)
- Alternativas são genuínas?
- Consequências são honestas?
- Não viola a Constituição?
- É consistente com ADRs existentes?
- Dependências estão corretas?

**Critérios de saída:**
- Revisão técnica aprovada → PROPOSED
- Revisão técnica reprovada → DRAFT (com feedback)

**SLA:** Revisão deve ocorrer em no máximo 3 dias úteis após submissão.

---

### PROPOSED

**Descrição:** ADR tecnicamente revisada e pronta para decisão humana final.

**Critérios de entrada:**
- Tech Lead/Arquiteto aprovou a ADR tecnicamente
- Status alterado para `Proposed`
- ADR registrada no ADR-MASTER-INDEX.md

**O que significa Proposed:**
- A decisão está tecnicamente bem fundamentada
- A ADR está pronta para aprovação humana
- **Código NÃO pode ser implementado com base em ADR Proposed** (Constituição G-07)

**Critérios de saída:**
- Aprovação humana explícita → ACCEPTED
- Rejeição humana explícita → REJECTED
- Supersedição por nova ADR → SUPERSEDED

**SLA:** Aprovador humano deve decidir em no máximo 10 dias úteis.

---

### ACCEPTED

**Descrição:** Decisão tomada. Implementação autorizada.

**Critérios de entrada:**
- Aprovação humana explícita e documentada
- Data de aprovação registrada no header da ADR
- Aprovador identificado

**O que significa Accepted:**
- Implementação pode começar
- Todos os documentos afetados devem ser atualizados
- OFFICIAL-COMPONENT-REGISTRY, OFFICIAL-CONTRACTS, UPDATED-TARGET-ARCHITECTURE, etc.

**Ações obrigatórias pós-Accept:**
1. Atualizar ADR-MASTER-INDEX.md com data de aceite
2. Criar sprint de implementação se necessário
3. Atualizar documentos afetados
4. Comunicar stakeholders

**Critérios de saída:**
- Supersedida por nova ADR → SUPERSEDED
- Nunca volta para estado anterior

---

### REJECTED

**Descrição:** Decisão explicitamente rejeitada.

**Critérios de entrada:**
- Rejeição humana explícita e documentada
- Razão da rejeição documentada na ADR
- Data de rejeição registrada

**O que significa Rejected:**
- Decisão não será implementada
- O problema pode ser abordado por uma nova ADR com abordagem diferente
- ADR rejeitada é mantida para histórico — não deletada

**Estado terminal:** ADRs rejeitadas não podem ser "desrejeitadas". Nova abordagem requer nova ADR.

---

### SUPERSEDED

**Descrição:** ADR foi substituída por uma ADR mais recente.

**Critérios de entrada:**
- Nova ADR com `Supersedes: ADR-{NNN}` foi Accepted
- ADR original atualizada com `Status: Superseded by ADR-{NNN}`
- Data de supersedição registrada

**Estado terminal:** ADR supersedida é mantida para histórico.

---

### DEPRECATED

**Descrição:** Decisão foi implementada e a ADR não é mais relevante para operações correntes, mas não foi supersedida por outra decisão.

**Critérios de entrada:**
- Decisão foi completamente implementada
- Módulo/feature que a ADR descreve foi removido ou obsoletado
- Não existe nova ADR que a substitui

**Estado terminal:** Após período de arquivo (2 sprints), pode ser movida para ARCHIVED.

---

### ARCHIVED

**Descrição:** ADR histórica sem relevância operacional. Mantida apenas para auditoria.

**Critérios de entrada:**
- DEPRECATED por pelo menos 2 sprints
- Conteúdo capturado em documentação principal (FREEZE-CHANGELOG, etc.)

**Estado terminal:** ADRs archived são read-only. Nenhuma ação pode ser tomada.

---

## Tabela de Transições

| De | Para | Quem | Condição |
|---|---|---|---|
| DRAFT | REVIEW | Autor | Campos completos |
| REVIEW | PROPOSED | Tech Lead | Revisão técnica OK |
| REVIEW | DRAFT | Tech Lead | Precisa revisão |
| PROPOSED | ACCEPTED | Aprovador Humano | Decisão positiva explícita |
| PROPOSED | REJECTED | Aprovador Humano | Decisão negativa explícita |
| PROPOSED | SUPERSEDED | Autor de nova ADR | Nova ADR aceita a supersede |
| ACCEPTED | SUPERSEDED | Autor de nova ADR | Nova ADR aceita a supersede |
| ACCEPTED | DEPRECATED | Arquiteto | Decisão obsoleta |
| DEPRECATED | ARCHIVED | Arquiteto | Após 2 sprints |

---

## ADRs Existentes — Status Atual (2026-07-11)

| ADR | Título | Status | Próximo Passo |
|---|---|---|---|
| ADR-001 | Intent Layer Strategy (EF-22) | Proposed | Aprovação humana |
| ADR-002 | Goal Runtime Promotion (EF-24) | Proposed | Aprovação humana |
| ADR-003 | Plan Semantics (plan→executionMetrics) | Proposed | Aprovação humana |
| ADR-004 | Capability Runtime Certification (EF-15) | Proposed | Aprovação humana |
| ADR-005 | Connector Registry Canonical | Proposed | Aprovação humana |
| ADR-006 | Memory Engine Legacy Deprecation | Proposed | Aprovação humana |
| ADR-007 | Reasoning Engine (Reserved) | Proposed | Aprovação humana |

**Ação requerida:** SPR-ADR-02 — aprovação humana das 7 ADRs.

---

## Numeração

- Sequência global: ADR-001, ADR-002, ..., ADR-NNN
- Sem gaps na sequência
- Próxima ADR disponível: ADR-008
- Arquivo de controle: ADR-MASTER-INDEX.md

---

## Template de Header de ADR

```markdown
# ADR-{NNN} — {Título Descritivo}
Date: YYYY-MM-DD
Status: Draft | Review | Proposed | Accepted | Rejected | Superseded | Deprecated | Archived
Supersedes: ADR-{NNN} (se aplicável)
Superseded by: ADR-{NNN} (se aplicável)
Author: {nome ou papel}
Reviewer: {nome ou papel}
Approved by: {nome} on {data} (quando Accepted)
Rejected by: {nome} on {data} (quando Rejected)
```

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- ARCHITECTURE-GOVERNANCE.md
- src/docs/foundation/adr/ADR-MASTER-INDEX.md
- src/docs/foundation/templates/ADR_TEMPLATE.md
- MEMORYOS-CONSTITUTION.md — Artigo VII, G-01 a G-08

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*