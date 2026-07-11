# ADR Index
## MemoryOS Architectural Decision Records

---

## O que é um ADR?

Um **Architectural Decision Record (ADR)** documenta uma decisão arquitetural significativa tomada no contexto do MemoryOS.

Cada ADR registra:
- O contexto que levou à decisão
- A decisão tomada
- As consequências (positivas e negativas)
- A RFC que originou a decisão

---

## Índice

| ID | Título | Status | RFC | Data |
|---|---|---|---|---|
| ADR-001 | Interface-First Architecture para Connectors | Accepted | RFC-001 | 2026-07-08 |
| ADR-002 | EventBus como espinha dorsal de comunicação | Accepted | RFC-002 | 2026-07-08 |
| ADR-003 | SecurityGate obrigatório para toda ação externa | Accepted | RFC-003 | 2026-07-08 |
| ADR-004 | WorkingMemory com TTL e isolamento por contexto | Accepted | RFC-004 | 2026-07-08 |
| ADR-005 | AuditTrail imutável append-only | Accepted | RFC-005 | 2026-07-08 |
| ADR-006 | Journey como unidade primária de experiência | Accepted | RFC-006 | 2026-07-09 |
| ADR-007 | Processo RFC→ADR→Implementação obrigatório | Accepted | RFC-007 | 2026-07-10 |
| ADR-008 | Minimum Sufficient Context como princípio da Foundation | Accepted | RFC-002 | 2026-07-11 |

---

## Como Criar um ADR

Use o template: [../templates/ADR_TEMPLATE.md](../templates/ADR_TEMPLATE.md)

Numeração: ADR-NNN (sequencial, nunca reutilizado)

---

## Status Possíveis

| Status | Significado |
|---|---|
| Proposed | ADR em discussão, não implementado |
| Accepted | ADR aprovado e em implementação |
| Implemented | ADR implementado e validado pelo MRI |
| Deprecated | ADR substituído por outro (com referência) |
| Rejected | ADR rejeitado (com justificativa) |

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*