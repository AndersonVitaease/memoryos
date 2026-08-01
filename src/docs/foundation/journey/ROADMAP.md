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
- [x] FinancialSpecialist — src/lib/specialists/FinancialSpecialist.ts (MDS v2.0)
- [x] LegalSpecialist — src/lib/specialists/LegalSpecialist.ts (MDS v2.0)
- [x] MedicalSpecialist — src/lib/specialists/MedicalSpecialist.ts (MDS v2.0)
- [x] TechSpecialist — src/lib/specialists/TechSpecialist.ts (MDS v2.0)
- [x] SpecialistTypes.ts — tipos imutaveis separados
- [x] specialistTests.ts — suite de testes MDS §2.16
- [x] index.ts — exports oficiais
- [x] Dashboard — src/pages/SprintP5Page.jsx (MDS §2.17)

### P6 — Knowledge Packages
- [x] FinancialPackage — src/lib/knowledge-packages/FinancialPackage.ts (MDS v2.0)
- [x] LegalPackage — src/lib/knowledge-packages/LegalPackage.ts (MDS v2.0)
- [x] BrazilianGovernmentPackage — src/lib/knowledge-packages/BrazilianGovernmentPackage.ts (MDS v2.0)
- [x] KnowledgePackageTypes.ts — tipos imutaveis separados
- [x] knowledgePackageTests.ts — suite de testes MDS §2.16
- [x] index.ts — exports oficiais
- [x] Dashboard — src/pages/SprintP6Page.jsx (MDS §2.17)

### P7 — Marketplace
- [x] CapabilityRegistry (singleton HMR-safe, publish, query, checkCompatibility, updateHealth)
- [x] CapabilityBootstrap (carga automatica de todos os oficiais P5+P6)
- [x] MarketplaceTypes.ts — tipos imutaveis separados
- [x] marketplaceTests.ts — suite de testes MDS §2.16 (10 cenarios)
- [x] index.ts — exports oficiais
- [x] Dashboard — src/pages/SprintP7Page.jsx (MDS §2.17)
- [ ] Portal de publicacao externo (P7.1)
- [ ] Versionamento de capabilities (P7.2)
- [ ] Matriz de compatibilidade avancada (P7.3)

### P8 — Developer Portal
- [x] Documentacao interativa (6 docs: getting-started, sdk, specialists, knowledge-packages, marketplace, architecture)
- [x] Playground de Capabilities (Specialists P5 + Knowledge Packages P6)
- [x] DeveloperPortalTypes.ts — tipos imutaveis separados
- [x] developerPortalTests.ts — suite de testes MDS §2.16 (8 cenarios)
- [x] index.ts — exports oficiais
- [x] Dashboard — src/pages/SprintP8Page.jsx (MDS §2.17)
- [ ] CLI do MemoryOS (P8.1)
- [ ] Documentacao de Connectors (P8.2)

### P9 — Capability Registry
- [x] CapabilityDiscoveryEngine — discovery automatico de P5+P6+P4+P7 (singleton HMR-safe)
- [x] CapabilityVersioning — historico, changelog, deprecation, seed automatico
- [x] CompatibilityMatrix — regras explicitas + inferencia, generate() para todos os pares
- [x] CapabilityRegistryTypes.ts — tipos imutaveis separados
- [x] capabilityRegistryTests.ts — suite de testes MDS §2.16 (10 cenarios)
- [x] index.ts — exports oficiais
- [x] Dashboard — src/pages/SprintP9Page.jsx (MDS §2.17)

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