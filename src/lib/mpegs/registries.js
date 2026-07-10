/**
 * MPEGS — MemoryOS Platform Evolution Governance Specification
 * Official Registries (Capítulo 10) — RFC, ADR, Releases
 *
 * Fonte de verdade para o estado atual da governança da plataforma.
 */

// ─── RFC Registry ─────────────────────────────────────────────────────────

export const RFC_REGISTRY = [
  {
    id: "RFC-001", title: "Interface-First Architecture para Connectors",
    author: "MemoryOS Core Team", date: "2025-01-10",
    status: "Implemented",
    category: "Architecture",
    motivation: "Eliminar acoplamento direto entre Core e implementações externas.",
    problem: "Core dependia de implementações concretas de Connectors, impedindo extensibilidade.",
    decision: "Todo Connector deve implementar IConnector; Core conhece apenas a interface.",
    adrs: ["ADR-001"],
    components: ["Core", "SDK", "Connector"],
    impact: "HIGH",
  },
  {
    id: "RFC-002", title: "Security Gate obrigatório antes de cada Step",
    author: "MemoryOS Security Team", date: "2025-01-15",
    status: "Implemented",
    category: "Security",
    motivation: "Garantir que toda execução passe por validação de permissão, risco e política.",
    problem: "Steps podiam ser executados sem verificação de segurança centralizada.",
    decision: "SecurityGate.evaluate() chamado antes de cada connector.execute(); nunca bypassável.",
    adrs: ["ADR-002"],
    components: ["ExecutionEngine", "SecurityGate"],
    impact: "CRITICAL",
  },
  {
    id: "RFC-003", title: "Working Memory com TTL e eviction por prioridade",
    author: "MemoryOS Memory Team", date: "2025-02-01",
    status: "Implemented",
    category: "Memory",
    motivation: "Memória de trabalho deve ser efêmera e gerenciada automaticamente.",
    problem: "Sem TTL, registros acumulavam indefinidamente consumindo recursos.",
    decision: "TTL por tipo de registro; eviction por prioridade quando capacidade excedida.",
    adrs: ["ADR-003"],
    components: ["WorkingMemoryEngine", "IMemoryProvider"],
    impact: "MEDIUM",
  },
  {
    id: "RFC-004", title: "Event Bus priority-based com Dead Letter Queue",
    author: "MemoryOS Platform Team", date: "2025-02-15",
    status: "Implemented",
    category: "Infrastructure",
    motivation: "Comunicação entre motores deve ser assíncrona, resiliente e rastreável.",
    problem: "Eventos de alta prioridade podiam ser atrasados por eventos de baixa prioridade.",
    decision: "Priority scheduler (HIGH > NORMAL > LOW > BACKGROUND) + DLQ após max retries.",
    adrs: ["ADR-004"],
    components: ["EventBus", "IEventBus"],
    impact: "HIGH",
  },
  {
    id: "RFC-005", title: "Journey como unidade primária de experiência do usuário",
    author: "MemoryOS Product Team", date: "2025-03-01",
    status: "Implemented",
    category: "Product",
    motivation: "Necessidade de persistir contexto entre sessões e permitir retomada de fluxos.",
    problem: "Sessões isoladas perdiam contexto; usuários precisavam repetir informações.",
    decision: "Journey como entidade central com lifecycle completo e persistência de contexto.",
    adrs: ["ADR-005"],
    components: ["JourneyManager", "ExecutionEngine", "WorkingMemory"],
    impact: "HIGH",
  },
  {
    id: "RFC-006", title: "MQCCS — Quality, Compliance & Certification Framework",
    author: "MemoryOS Quality Team", date: "2026-06-01",
    status: "Implemented",
    category: "Quality",
    motivation: "Plataforma precisa de validação automática antes de aceitar extensões.",
    problem: "Sem framework de compliance, extensões podiam violar contratos de interface.",
    decision: "Pipeline: Contract → Security → Performance → Architecture → Certification.",
    adrs: [],
    components: ["MQCCS", "MRI", "SDK"],
    impact: "HIGH",
  },
  {
    id: "RFC-007", title: "MPEGS — Platform Evolution Governance",
    author: "MemoryOS Governance Team", date: "2026-07-10",
    status: "Implemented",
    category: "Governance",
    motivation: "Plataforma precisa de processo formal para evoluir sem perder identidade.",
    problem: "Mudanças ad-hoc podiam comprometer compatibilidade e arquitetura.",
    decision: "RFC → ADR → Implementation → MQCCS → Release como fluxo obrigatório.",
    adrs: [],
    components: ["Governance", "All"],
    impact: "HIGH",
  },
];

// ─── ADR Registry ─────────────────────────────────────────────────────────

export const ADR_REGISTRY = [
  {
    id: "ADR-001", title: "Interface-First para Connectors",
    author: "MemoryOS Core Team", date: "2025-01-10",
    rfc: "RFC-001", status: "Accepted",
    decision: "Todo Connector implementa IConnector. Core nunca importa implementações concretas.",
    consequences: ["Alta extensibilidade", "Testabilidade via mocks", "Isolamento de domínio"],
    docsAffected: ["MCS", "MDS", "MDPS"],
    componentsAffected: ["Core", "ExecutionEngine", "SDK"],
  },
  {
    id: "ADR-002", title: "Security Gate obrigatório antes de cada Step",
    author: "MemoryOS Security Team", date: "2025-01-15",
    rfc: "RFC-002", status: "Accepted",
    decision: "SecurityGate.evaluate() executado obrigatoriamente antes de todo connector.execute(). Pipeline: Permission → Risk → Policy.",
    consequences: ["Zero execuções não autorizadas", "Human Approval automático para HIGH/CRITICAL", "Audit entry por bloqueio"],
    docsAffected: ["MCS", "MRS", "MDIS"],
    componentsAffected: ["ExecutionEngine", "SecurityGate"],
  },
  {
    id: "ADR-003", title: "Working Memory TTL e eviction por prioridade",
    author: "MemoryOS Memory Team", date: "2025-02-01",
    rfc: "RFC-003", status: "Accepted",
    decision: "TTL default por tipo (CONVERSATION_TURN: 3600s, USER_PREFERENCE: sem TTL). Eviction remove registros de menor prioridade quando capacidade excede MAX_CAPACITY.",
    consequences: ["Consumo de memória previsível", "Dados críticos preservados mais tempo", "Promoção automática de USER_PREFERENCE para long-term"],
    docsAffected: ["MRS", "MDS", "MRI"],
    componentsAffected: ["WorkingMemoryEngine", "IMemoryProvider"],
  },
  {
    id: "ADR-004", title: "Event Bus priority-based com DLQ",
    author: "MemoryOS Platform Team", date: "2025-02-15",
    rfc: "RFC-004", status: "Accepted",
    decision: "EventBus usa priority scheduler (HIGH=0, NORMAL=1, LOW=2, BACKGROUND=3). Retry com exponential backoff (max 3). DLQ para eventos que excedem max retries. Idempotência por eventId.",
    consequences: ["Alta prioridade sempre entregue primeiro", "Nenhum evento perdido silenciosamente", "DLQ permite diagnóstico de falhas"],
    docsAffected: ["MRS", "MCS", "MRI"],
    componentsAffected: ["EventBus", "IEventBus"],
  },
  {
    id: "ADR-005", title: "Journey como unidade primária de experiência",
    author: "MemoryOS Product Team", date: "2025-03-01",
    rfc: "RFC-005", status: "Accepted",
    decision: "Journey possui lifecycle completo (draft → active → paused → blocked → completed → archived). Contexto persiste entre sessões. Events log imutável por Journey.",
    consequences: ["Usuário nunca perde progresso", "Rollback de Journey possível", "Múltiplas Journeys paralelas por usuário"],
    docsAffected: ["MRS", "MPS", "MRI"],
    componentsAffected: ["JourneyManager", "ExecutionEngine"],
  },
  {
    id: "ADR-006", title: "AuditTrail imutável via Object.freeze()",
    author: "MemoryOS Security Team", date: "2025-03-15",
    rfc: "RFC-002", status: "Accepted",
    decision: "Todo AuditEntry é congelado com Object.freeze() imediatamente após criação. Nenhuma modificação posterior é possível.",
    consequences: ["Trilha de auditoria 100% confiável", "Evidências forenses intactas", "Compliance LGPD garantido"],
    docsAffected: ["MCS", "MRS", "MDIS"],
    componentsAffected: ["AuditTrail", "IAuditTrail"],
  },
  {
    id: "ADR-007", title: "Rollback em ordem inversa para steps reversíveis",
    author: "MemoryOS Core Team", date: "2025-04-01",
    rfc: "RFC-001", status: "Accepted",
    decision: "Em caso de falha de step required, ExecutionEngine executa rollback na ordem inversa apenas para steps com isReversible=true e status=success.",
    consequences: ["Estado consistente após falhas", "Rollback parcial explícito", "Connectors com supportsRollback=false não afetados"],
    docsAffected: ["MRS", "MCS", "MRI"],
    componentsAffected: ["ExecutionEngine", "IConnector"],
  },
];

// ─── Release Registry ─────────────────────────────────────────────────────

export const RELEASE_REGISTRY = [
  {
    version: "0.1.0", date: "2025-01-01", stage: "Alpha",
    title: "Core Interfaces",
    highlights: ["IConnector definido", "ISpecialist definido", "IMemoryProvider definido", "IEventBus definido"],
    breaking: [],
    rfcs: ["RFC-001"],
  },
  {
    version: "0.2.0", date: "2025-02-01", stage: "Alpha",
    title: "Working Memory + Event Bus",
    highlights: ["WorkingMemoryEngine com TTL", "EventBus com priority scheduler", "DLQ implementado"],
    breaking: [],
    rfcs: ["RFC-003", "RFC-004"],
  },
  {
    version: "0.3.0", date: "2025-03-01", stage: "Developer Preview",
    title: "Security Gate + Execution Engine",
    highlights: ["SecurityGate com pipeline Permission→Risk→Policy", "ExecutionEngine com rollback", "AuditTrail imutável"],
    breaking: [],
    rfcs: ["RFC-002"],
  },
  {
    version: "0.4.0", date: "2025-04-01", stage: "Developer Preview",
    title: "Journey Manager",
    highlights: ["JourneyManager com lifecycle completo", "Contexto persistente entre sessões", "Events log por Journey"],
    breaking: [],
    rfcs: ["RFC-005"],
  },
  {
    version: "0.9.0", date: "2026-06-01", stage: "Beta",
    title: "MRI Reference Implementation",
    highlights: ["25 testes de referência", "3 Connectors de referência", "2 Specialists de referência", "ConsultaGovJourney end-to-end"],
    breaking: [],
    rfcs: ["RFC-001", "RFC-002", "RFC-003", "RFC-004", "RFC-005"],
  },
  {
    version: "0.10.0", date: "2026-06-15", stage: "Beta",
    title: "MQCCS Certification Pipeline",
    highlights: ["Contract Test Framework", "SDK Compliance Validator", "Performance Benchmarks", "Certification Pipeline com 4 etapas"],
    breaking: [],
    rfcs: ["RFC-006"],
  },
  {
    version: "1.0.0-rc.1", date: "2026-07-10", stage: "Release Candidate",
    title: "MPEGS + Platform Governance",
    highlights: ["RFC Registry oficial", "ADR Registry com 7 ADRs", "Release Lifecycle completo", "Conformance Badge schema", "Deprecation Policy"],
    breaking: [],
    rfcs: ["RFC-007"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

export function getRfcById(id) { return RFC_REGISTRY.find(r => r.id === id); }
export function getAdrById(id) { return ADR_REGISTRY.find(a => a.id === id); }
export function getReleaseByVersion(v) { return RELEASE_REGISTRY.find(r => r.version === v); }

export function getRfcsByStatus(status) { return RFC_REGISTRY.filter(r => r.status === status); }
export function getAdrsByStatus(status) { return ADR_REGISTRY.filter(a => a.status === status); }

export const REGISTRY_STATS = {
  rfcs:      RFC_REGISTRY.length,
  adrs:      ADR_REGISTRY.length,
  releases:  RELEASE_REGISTRY.length,
  implemented: RFC_REGISTRY.filter(r => r.status === "Implemented").length,
  acceptedAdrs: ADR_REGISTRY.filter(a => a.status === "Accepted").length,
};