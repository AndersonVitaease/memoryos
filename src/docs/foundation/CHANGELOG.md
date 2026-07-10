# CHANGELOG

Histórico oficial de versões da MemoryOS Foundation.

Formato: [Semver](https://semver.org) — `MAJOR.MINOR.PATCH`

---

## [1.0.0] — 2026-07-10 — Foundation Baseline

**Status:** Frozen Baseline  
**RFC:** RFC-000  
**Fase:** Engineering First

### Adicionado

- ✅ Foundation v1.0.0 declarada oficialmente
- ✅ 13 especificações oficiais publicadas e congeladas (MV, MPS, MAS, MDS, MRS, MCS, MDIS, MIES, MDPS, MGFS, MRI, MQCCS, MPEGS)
- ✅ RFC-000 aprovada — encerramento formal da fase documental
- ✅ Fase Engineering First iniciada
- ✅ Processo RFC→ADR→Implementação→MRI→MQCCS→Release obrigatório
- ✅ Templates oficiais publicados (RFC, ADR, SDK, Connector, Specialist, Policy, Knowledge Package)
- ✅ ADR Index criado
- ✅ Roadmap da fase Engineering First publicado
- ✅ MRI v1.0 implementada com 25 testes de validação
- ✅ MQCCS pipeline com 5 estágios de certificação
- ✅ MPEGS registries com RFCs, ADRs e releases

### Escopo da Foundation v1.0.0

| Documento | Versão | Status |
|---|---|---|
| MV    | 1.0 | Frozen |
| MPS   | 1.0 | Frozen |
| MAS   | 1.0 | Frozen |
| MDS   | 1.6 | Frozen |
| MRS   | 1.0 | Frozen |
| MCS   | 1.0 | Frozen |
| MDIS  | 1.0 | Frozen |
| MIES  | 1.0 | Frozen |
| MDPS  | 1.0 | Frozen |
| MGFS  | 1.0 | Frozen |
| MRI   | 1.0 | Frozen |
| MQCCS | 1.0 | Frozen |
| MPEGS | 1.0 | Frozen |

### Próximas Versões

- `1.0.1` — Correções de documentação (se necessário, via RFC minor)
- `1.1.0` — Primeira evolução pós-Engineering First (via RFC)
- `2.0.0` — Breaking change arquitetural (via RFC crítica + votação)

---

## [0.9.0] — 2026-07-09 — Pre-Foundation RC

**Status:** Release Candidate  
**Fase:** Definição Arquitetural

### Adicionado

- MPEGS completo com registries de governança
- MQCCS pipeline de certificação em 5 estágios
- MRI com 25 testes automatizados de validação
- Connectors de referência: HTTP, MockEmail, MockGov
- Specialists de referência: General, Government
- Journey de referência: ConsultaGovJourney

---

## [0.8.0] — 2026-07-08 — Core Engines

**Status:** Development  
**Fase:** Implementação de Referência

### Adicionado

- WorkingMemoryEngine com TTL e isolamento por contexto
- EventBus com pub/sub, prioridade e retry
- AuditTrail imutável
- SecurityGate com pipeline Permission-Risk-Approval
- ExecutionEngine com rollback e execução paralela
- JourneyManager com ciclo de vida completo

---

## [0.5.0] — 2026-07-05 — Specification Complete

**Status:** Development  
**Fase:** Documentação Arquitetural

### Adicionado

- MCS — Core Specification
- MRS — Runtime Specification
- MDIS — Decision Intelligence
- MIES — Intelligence Evolution
- MDPS — Developer Platform
- MGFS — Governance & Foundation
- MRI — Reference Implementation (spec)
- MQCCS — Quality & Certification (spec)
- MPEGS — Platform Evolution Governance (spec)

---

## [0.1.0] — 2026-07-01 — Initial Vision

**Status:** Development  
**Fase:** Visão e Produto

### Adicionado

- MV — MemoryOS Vision
- MPS — Product Specification
- MAS — Architecture Specification
- MDS — Developer Specification v1.0
- MCF — Connector Framework
- MCIS — Connector Intelligence
- MGIS — Goal Intelligence

---

*Este CHANGELOG é imutável para versões já publicadas. Adições futuras via RFC.*