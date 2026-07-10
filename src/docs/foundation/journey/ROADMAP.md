# ROADMAP.md
## MemoryOS — Engineering First Roadmap

---

## Fase Atual: Engineering First

**Início:** 2026-07-10  
**Objetivo:** Transformar a Foundation v1.0 em implementação real e funcional.

---

## Prioridades

### P1 — Core Complete
Implementação completa de todos os engines do Core.

- [x] WorkingMemoryEngine
- [x] EventBus
- [x] AuditTrail
- [x] SecurityGate
- [x] ExecutionEngine
- [x] JourneyManager
- [ ] KnowledgeGraphEngine
- [ ] DecisionEngine (produção)
- [ ] PlanningEngine (produção)
- [ ] ReasoningEngine (produção)

### P2 — Runtime
Implementação completa do Runtime conforme MRS.

- [x] Session Lifecycle
- [x] Journey Lifecycle
- [ ] Context Persistence entre sessões
- [ ] Memory Tiering (active → historical → archived)
- [ ] Graceful shutdown

### P3 — SDKs
SDKs oficiais conforme MDPS.

- [ ] Core SDK (TypeScript)
- [ ] Connector SDK (TypeScript)
- [ ] Specialist SDK (TypeScript)
- [ ] Knowledge Package SDK

### P4 — Connectors Oficiais
- [x] HttpConnector (referência)
- [x] MockEmailConnector (referência)
- [x] MockGovConnector (referência)
- [ ] EmailConnector (produção)
- [ ] CalendarConnector
- [ ] FileSystemConnector
- [ ] DatabaseConnector

### P5 — Specialists Oficiais
- [x] GeneralSpecialist (referência)
- [x] GovernmentSpecialist (referência)
- [ ] FinancialSpecialist
- [ ] LegalSpecialist
- [ ] MedicalSpecialist
- [ ] TechSpecialist

### P6 — Knowledge Packages
- [ ] Brazilian Government Package
- [ ] Financial Package
- [ ] Legal Package

### P7 — Marketplace
- [ ] Registry de Connectors
- [ ] Registry de Specialists
- [ ] Registry de Knowledge Packages
- [ ] Portal de publicação

### P8 — Developer Portal
- [ ] Documentação interativa
- [ ] Playground de Connectors
- [ ] CLI do MemoryOS

### P9 — Capability Registry
- [ ] Discovery automático
- [ ] Versioning de capabilities
- [ ] Compatibility matrix

### P10 — Beta
- [ ] Ambiente de staging
- [ ] Beta users (100 convidados)
- [ ] Feedback loop formal
- [ ] RFC de estabilização

---

## Princípios do Roadmap

1. Nenhum item avança sem RFC aprovada (exceto P1-P3 cobertos pela Foundation)
2. Cada item requer validação MRI antes de ser marcado como concluído
3. Cada release requer certificação MQCCS ≥ 85%
4. O processo de feedback de Beta alimenta novas RFCs

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*