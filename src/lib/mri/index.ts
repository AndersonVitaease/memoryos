/**
 * MRI — MemoryOS Reference Implementation
 * Ponto de entrada público
 *
 * Exporta apenas o que é necessário para uso externo.
 * Core nunca expõe implementações concretas — apenas Interfaces e Engine.
 */

// Interfaces públicas do Core (use estas para criar extensões)
export * from "./core/interfaces";

// Motores do Core
export { WorkingMemoryEngine }  from "./core/memory/WorkingMemoryEngine";
export { EventBus }              from "./core/event-bus/EventBus";
export { AuditTrail }            from "./core/audit/AuditTrail";
export { SecurityGate }          from "./core/security/SecurityGate";
export { JourneyManager }        from "./core/journey/JourneyManager";
export { ExecutionEngine }       from "./core/execution/ExecutionEngine";

// Connectors de referência
export { HttpConnector }         from "./connectors/HttpConnector";
export { MockEmailConnector }    from "./connectors/MockEmailConnector";
export { MockGovConnector }      from "./connectors/MockGovConnector";

// Specialists de referência
export { GeneralSpecialist }     from "./specialists/GeneralSpecialist";
export { GovernmentSpecialist }  from "./specialists/GovernmentSpecialist";

// Journeys de referência
export { runConsultaGovJourney } from "./journeys/ConsultaGovJourney";

// Test Suite oficial
export { runMriTests }           from "./tests/mri.test";