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
- [x] KnowledgeGraphEngine
- [x] DecisionEngine (produção) — ResponseArbiter + ConversationCognitiveGateway
- [x] PlanningEngine (produção) — ConversationPlanningEngine (Sprint E-02.2A)
- [x] ReasoningEngine (produção) — memoryReasoningPlanner (8 etapas)

### P2 — Runtime
Implementação completa do Runtime conforme MRS.

- [x] Session Lifecycle
- [x] Journey Lifecycle
- [x] Context Persistence entre sessões
- [x] Memory Tiering (active → historical → archived)
- [x] Graceful shutdown

### P3 — SDKs
SDKs oficiais conforme MDPS.

- [x] Core SDK (TypeScript) — src/sdk/core/ (WorkingMemory, EventBus, AuditTrail, CoreContext)
- [x] Connector SDK (TypeScript) — src/sdk/connector/ (BaseConnector, ConnectorBuilder, index)
- [x] Specialist SDK (TypeScript) — src/sdk/specialist/ (BaseSpecialist, SpecialistBuilder, index)
- [x] Knowledge Package SDK — src/sdk/knowledge/ (BaseKnowledgePackage, KnowledgePackageBuilder, index)

### P4 — Connectors Oficiais
- [x] HttpConnector (referência)
- [x] MockEmailConnector (referência)
- [x] MockGovConnector (referência)
- [x] EmailConnector (produção) — src/lib/connector-runtime/connectors/EmailConnector.ts
- [x] CalendarConnector — GoogleCalendarConnector já existente
- [x] FileSystemConnector (produção) — src/lib/connector-runtime/connectors/FileSystemConnector.ts
- [x] DatabaseConnector (produção) — src/lib/connector-runtime/connectors/DatabaseConnector.ts

### P5 — Specialists Oficiais
- [x] GeneralSpecialist (referência)
- [x] GovernmentSpecialist (referência)
- [x] FinancialSpecialist — src/sdk/specialists/FinancialSpecialist.ts
- [x] LegalSpecialist — src/sdk/specialists/LegalSpecialist.ts
- [x] MedicalSpecialist — src/sdk/specialists/MedicalSpecialist.ts
- [x] TechSpecialist — src/sdk/specialists/TechSpecialist.ts

### P6 — Knowledge Packages
- [x] Brazilian Government Package — src/sdk/knowledge-packages/BrazilianGovernmentPackage.ts
- [x] Financial Package — src/sdk/knowledge-packages/FinancialPackage.ts
- [x] Legal Package — src/sdk/knowledge-packages/LegalPackage.ts

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