/**
 * OLMasterIndex.ts — Sprint OL-01
 *
 * Single source of truth for every official document in the MemoryOS library.
 * Zero dependency on execution chain. Read-only data.
 */

export type DocCategory =
  | "VISION" | "PRODUCT" | "ARCHITECTURE" | "ENGINEERING" | "OPERATIONS" | "DEVELOPMENT";

export type DocStatus = "ACTIVE" | "DEPRECATED" | "DRAFT" | "FROZEN";
export type DocAuthority = "OFFICIAL" | "VERIFIED" | "LEARNED" | "USER" | "EXTERNAL";

export interface OLDocument {
  readonly id:           string;
  readonly name:         string;
  readonly version:      string;
  readonly status:       DocStatus;
  readonly authority:    DocAuthority;
  readonly category:     DocCategory;
  readonly path:         string;
  readonly updatedAt:    string;
  readonly dependencies: readonly string[];   // IDs of docs this one depends on
  readonly relatedDocs:  readonly string[];
  readonly adrs:         readonly string[];
  readonly rfcs:         readonly string[];
  readonly components:   readonly string[];
  readonly description:  string;
}

export const OL_MASTER_INDEX: readonly OLDocument[] = Object.freeze([
  // ── VISION ──────────────────────────────────────────────────────────────────
  {
    id: "MV-001", name: "MemoryOS Vision", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "VISION",
    path: "src/docs/00-official-library/MV-MemoryOS-Vision.md",
    updatedAt: "2026-07-01",
    dependencies: [],
    relatedDocs: ["MPS-001","MAS-001"],
    adrs: [], rfcs: ["RFC-000","RFC-001"],
    components: ["MemoryOS Core"],
    description: "Defines the long-term vision and north star for the MemoryOS platform.",
  },
  {
    id: "MPS-001", name: "Product Specification", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "VISION",
    path: "src/docs/00-official-library/MPS-MemoryOS-Product-Specification.md",
    updatedAt: "2026-07-01",
    dependencies: ["MV-001"],
    relatedDocs: ["MAS-001","MDS-001"],
    adrs: ["ADR-001"], rfcs: ["RFC-001"],
    components: ["MemoryOS Core", "Product Layer"],
    description: "Complete product specification covering features, flows, and acceptance criteria.",
  },

  // ── PRODUCT ──────────────────────────────────────────────────────────────────
  {
    id: "MPS-UX-001", name: "UX Principles", version: "1.0", status: "ACTIVE",
    authority: "OFFICIAL", category: "PRODUCT",
    path: "src/docs/04-ux/UX-Principles.md",
    updatedAt: "2026-07-01",
    dependencies: ["MPS-001"],
    relatedDocs: ["MPS-001"],
    adrs: [], rfcs: [],
    components: ["UI Layer"],
    description: "Defines UX design principles for all MemoryOS interfaces.",
  },

  // ── ARCHITECTURE ─────────────────────────────────────────────────────────────
  {
    id: "MAS-001", name: "Architecture Specification", version: "2.0", status: "FROZEN",
    authority: "OFFICIAL", category: "ARCHITECTURE",
    path: "src/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md",
    updatedAt: "2026-07-10",
    dependencies: ["MV-001","MPS-001"],
    relatedDocs: ["MCS-001","MRS-001","MDS-001"],
    adrs: ["ADR-001","ADR-002","ADR-003","ADR-004","ADR-005","ADR-006","ADR-007"],
    rfcs: ["RFC-001","RFC-002","RFC-003","RFC-004"],
    components: ["ExecutionChain","ExecutionPipeline","ExecutionState","OfficialLibrary"],
    description: "Core architecture specification — all layers, boundaries, and contracts.",
  },
  {
    id: "MRS-001", name: "Runtime Specification", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "ARCHITECTURE",
    path: "src/docs/00-official-library/MRS-MemoryOS-Runtime-Specification.md",
    updatedAt: "2026-07-10",
    dependencies: ["MAS-001"],
    relatedDocs: ["MCS-001","MCF-001"],
    adrs: ["ADR-003"], rfcs: ["RFC-002"],
    components: ["RuntimeRegistry","RuntimeResolver","OfficialLibraryRuntimeProvider"],
    description: "Runtime layer: provider selection, scoring, registry, and telemetry.",
  },
  {
    id: "MCS-001", name: "Core Specification", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "ARCHITECTURE",
    path: "src/docs/00-official-library/MCS-MemoryOS-Core-Specification.md",
    updatedAt: "2026-07-10",
    dependencies: ["MAS-001","MRS-001"],
    relatedDocs: ["MDS-001","MREM-001"],
    adrs: ["ADR-001","ADR-002"], rfcs: ["RFC-001"],
    components: ["ExecutionChain","ExecutionPipeline","ExecutionState","ExecutionReportAssembler"],
    description: "Core execution chain, state management, and pipeline contracts.",
  },
  {
    id: "MCF-001", name: "Connector Framework", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "ARCHITECTURE",
    path: "src/docs/00-official-library/MCF-MemoryOS-Connector-Framework.md",
    updatedAt: "2026-07-12",
    dependencies: ["MAS-001","MRS-001"],
    relatedDocs: ["MCIS-001","MGIS-001"],
    adrs: ["ADR-006"], rfcs: ["RFC-003"],
    components: ["ConnectorRuntime","UCR","ConnectorRegistry","GmailConnector","DriveConnector","CalendarConnector"],
    description: "Official connector framework — lifecycle, manifest, capabilities, security.",
  },
  {
    id: "MEM-SCHEMA-001", name: "Memory Schema", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "ARCHITECTURE",
    path: "src/docs/00-official-library/MEMORY-SCHEMA.md",
    updatedAt: "2026-07-08",
    dependencies: ["MAS-001","MCS-001"],
    relatedDocs: ["MCS-001","UCME-001"],
    adrs: ["ADR-002"], rfcs: [],
    components: ["UnifiedMemoryEngine","MemoryProviderRegistry","WorkingMemoryEngine"],
    description: "Canonical memory schema for all memory tiers and providers.",
  },

  // ── ENGINEERING ──────────────────────────────────────────────────────────────
  {
    id: "MDS-001", name: "Developer Specification", version: "2.0", status: "FROZEN",
    authority: "OFFICIAL", category: "ENGINEERING",
    path: "src/docs/00-official-library/MDS-MemoryOS-Developer-Specification.md",
    updatedAt: "2026-07-10",
    dependencies: ["MAS-001","MCS-001"],
    relatedDocs: ["MES-001","MDH-001"],
    adrs: ["ADR-001","ADR-004","ADR-007"], rfcs: ["RFC-001","RFC-004"],
    components: ["All"],
    description: "Developer specification: coding contracts, interfaces, and integration patterns.",
  },
  {
    id: "MES-001", name: "Engineering Specification", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "ENGINEERING",
    path: "src/docs/00-official-library/MES-MemoryOS-Engineering-Specification.md",
    updatedAt: "2026-07-10",
    dependencies: ["MAS-001","MDS-001"],
    relatedDocs: ["MDS-001","MEOM-001","MERS-001"],
    adrs: ["ADR-001","ADR-002","ADR-003"],
    rfcs: ["RFC-001","RFC-002"],
    components: ["Engineering Workflow","Governance","Certification"],
    description: "Engineering standards, SDLC, testing policy, and quality gates.",
  },
  {
    id: "ADR-001", name: "ADR-001 Core Architecture", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/adr/ADR-001.md",
    updatedAt: "2026-07-01",
    dependencies: [], relatedDocs: ["MAS-001"], adrs: [], rfcs: ["RFC-001"],
    components: ["ExecutionChain"],
    description: "Core architectural decision — ExecutionChain as the single execution path.",
  },
  {
    id: "ADR-002", name: "ADR-002 Memory Architecture", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/adr/ADR-002.md",
    updatedAt: "2026-07-01",
    dependencies: ["ADR-001"], relatedDocs: ["MAS-001","MCS-001"], adrs: [], rfcs: [],
    components: ["UnifiedMemoryEngine"],
    description: "Memory architecture decision — tiered memory with unified access layer.",
  },
  {
    id: "ADR-003", name: "ADR-003 Runtime Independence", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/adr/ADR-003.md",
    updatedAt: "2026-07-01",
    dependencies: ["ADR-001"], relatedDocs: ["MRS-001"], adrs: [], rfcs: ["RFC-002"],
    components: ["RuntimeRegistry","OfficialLibraryRuntimeProvider"],
    description: "Runtime independence — no build-time coupling, provider-agnostic design.",
  },
  {
    id: "ADR-004", name: "ADR-004 Connector Standards", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/adr/ADR-004.md",
    updatedAt: "2026-07-01",
    dependencies: ["ADR-001","ADR-003"], relatedDocs: ["MCF-001"], adrs: [], rfcs: ["RFC-003"],
    components: ["ConnectorRuntime"],
    description: "Connector interface standards and manifest specification.",
  },
  {
    id: "ADR-005", name: "ADR-005 Immutability", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/adr/ADR-005.md",
    updatedAt: "2026-07-01",
    dependencies: ["ADR-001"], relatedDocs: ["MCS-001"], adrs: [], rfcs: [],
    components: ["ExecutionState"],
    description: "Immutability-first design for ExecutionState and value objects.",
  },
  {
    id: "ADR-006", name: "ADR-006 OAuth & Identity", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/adr/ADR-006.md",
    updatedAt: "2026-07-01",
    dependencies: ["ADR-004"], relatedDocs: ["MCF-001"], adrs: [], rfcs: ["RFC-003"],
    components: ["GoogleAuthSession","UniversalOAuthPlatform"],
    description: "OAuth and identity management standards for all connectors.",
  },
  {
    id: "ADR-007", name: "ADR-007 Explainability", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/adr/ADR-007.md",
    updatedAt: "2026-07-01",
    dependencies: ["ADR-001","ADR-005"], relatedDocs: ["MCS-001"], adrs: [], rfcs: [],
    components: ["ExplanationNode","ExplainabilityStage","ExecutionReportAssembler"],
    description: "Explainability mandate — every decision must produce an ExplanationNode.",
  },
  {
    id: "RFC-001", name: "RFC-001 Foundation Baseline", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/00-official-library/RFC-001-Foundation-v1.0-Baseline-Declaration.md",
    updatedAt: "2026-07-01",
    dependencies: [], relatedDocs: ["MAS-001","MDS-001"], adrs: [], rfcs: [],
    components: ["All"],
    description: "Foundation baseline declaration — v1.0 reference freeze.",
  },
  {
    id: "RFC-002", name: "RFC-002 Runtime Contract", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/rfc/RFC-002.md",
    updatedAt: "2026-07-01",
    dependencies: ["RFC-001"], relatedDocs: ["MRS-001"], adrs: ["ADR-003"], rfcs: [],
    components: ["IRuntimeProvider","IRuntimeResolver"],
    description: "Runtime provider and resolver contract specification.",
  },
  {
    id: "RFC-003", name: "RFC-003 Connector Contract", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/rfc/RFC-003.md",
    updatedAt: "2026-07-01",
    dependencies: ["RFC-001","RFC-002"], relatedDocs: ["MCF-001"], adrs: ["ADR-004"], rfcs: [],
    components: ["IConnector","ConnectorManifest"],
    description: "Connector interface and manifest contract.",
  },
  {
    id: "RFC-004", name: "RFC-004 Validation Contract", version: "1.0", status: "ACTIVE",
    authority: "VERIFIED", category: "ENGINEERING",
    path: "src/docs/foundation/rfc/RFC-004.md",
    updatedAt: "2026-07-01",
    dependencies: ["RFC-001","RFC-002","RFC-003"], relatedDocs: ["MQCCS-001"], adrs: [], rfcs: [],
    components: ["ValidationFramework","ValidationRunner"],
    description: "Validation framework contract and scenario specification.",
  },

  // ── OPERATIONS ───────────────────────────────────────────────────────────────
  {
    id: "MREM-001", name: "Reference Execution Model", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "OPERATIONS",
    path: "src/docs/foundation/MREM-MemoryOS-Reference-Execution-Model.md",
    updatedAt: "2026-07-10",
    dependencies: ["MCS-001","MRS-001"],
    relatedDocs: ["MCS-001","MES-001"],
    adrs: ["ADR-001","ADR-003","ADR-005"], rfcs: ["RFC-001","RFC-002"],
    components: ["ExecutionChain","ExecutionPipeline","ValidationFramework"],
    description: "Reference execution model — canonical pipeline stages and state transitions.",
  },
  {
    id: "MQCCS-001", name: "Quality & Compliance Certification", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "OPERATIONS",
    path: "src/docs/00-official-library/MQCCS-MemoryOS-Quality-Compliance-Certification-Specification.md",
    updatedAt: "2026-07-12",
    dependencies: ["MES-001","RFC-004"],
    relatedDocs: ["MES-001","MERS-001","MADS-001"],
    adrs: [], rfcs: ["RFC-004"],
    components: ["ValidationFramework","CertificationReportBuilder","RegressionStore"],
    description: "Quality, compliance, and certification standards for all MemoryOS releases.",
  },
  {
    id: "MERS-001", name: "Engineering Review System", version: "1.0", status: "ACTIVE",
    authority: "OFFICIAL", category: "OPERATIONS",
    path: "src/docs/00-official-library/MERS-MemoryOS-Engineering-Review-System.md",
    updatedAt: "2026-07-08",
    dependencies: ["MES-001"],
    relatedDocs: ["MES-001","MQCCS-001"],
    adrs: [], rfcs: [],
    components: ["ReviewEngineRegistry"],
    description: "Engineering review system — review gates, checklists, and audit trails.",
  },
  {
    id: "MADS-001", name: "Architecture Drift & Sustainability", version: "1.0", status: "ACTIVE",
    authority: "OFFICIAL", category: "OPERATIONS",
    path: "src/docs/00-official-library/MADS-MemoryOS-Architecture-Drift-Sustainability.md",
    updatedAt: "2026-07-08",
    dependencies: ["MAS-001","MES-001"],
    relatedDocs: ["MAS-001","ABE-001"],
    adrs: [], rfcs: [],
    components: ["ArchitectureBaselineEngine","ABVPage"],
    description: "Architecture drift detection and long-term sustainability model.",
  },
  {
    id: "MPEGS-001", name: "Platform Evolution Governance", version: "1.0", status: "ACTIVE",
    authority: "OFFICIAL", category: "OPERATIONS",
    path: "src/docs/00-official-library/MPEGS-MemoryOS-Platform-Evolution-Governance-Specification.md",
    updatedAt: "2026-07-08",
    dependencies: ["MAS-001","MES-001"],
    relatedDocs: ["MADS-001","MQCCS-001"],
    adrs: [], rfcs: [],
    components: ["ArchitectureGovernanceEngine"],
    description: "Platform evolution governance — change management and approval flows.",
  },

  // ── DEVELOPMENT ──────────────────────────────────────────────────────────────
  {
    id: "MDH-001", name: "Developer Handbook", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "DEVELOPMENT",
    path: "src/docs/foundation/MDH-MemoryOS-Developer-Handbook.md",
    updatedAt: "2026-07-10",
    dependencies: ["MDS-001","MES-001"],
    relatedDocs: ["MDS-001","MDOK-001"],
    adrs: [], rfcs: [],
    components: ["All"],
    description: "Definitive developer handbook — onboarding, workflows, and best practices.",
  },
  {
    id: "MDOK-001", name: "Developer Onboarding Kit", version: "1.0", status: "ACTIVE",
    authority: "OFFICIAL", category: "DEVELOPMENT",
    path: "src/docs/00-official-library/MDOK-MemoryOS-Developer-Onboarding-Kit.md",
    updatedAt: "2026-07-08",
    dependencies: ["MDH-001","MDS-001"],
    relatedDocs: ["MDH-001","MDS-001"],
    adrs: [], rfcs: [],
    components: ["All"],
    description: "Step-by-step onboarding kit for new MemoryOS developers.",
  },
  {
    id: "MEOM-001", name: "Engineering Operations Manual", version: "1.0", status: "ACTIVE",
    authority: "OFFICIAL", category: "DEVELOPMENT",
    path: "src/docs/00-official-library/MEOM-MemoryOS-Engineering-Operations-Manual.md",
    updatedAt: "2026-07-08",
    dependencies: ["MES-001","MDH-001"],
    relatedDocs: ["MES-001","MQCCS-001"],
    adrs: [], rfcs: [],
    components: ["EngineeringWorkflow","OperationalAuditEngine"],
    description: "Day-to-day engineering operations, runbooks, and incident management.",
  },
  {
    id: "MIP-001", name: "Master Implementation Plan", version: "1.0", status: "ACTIVE",
    authority: "OFFICIAL", category: "DEVELOPMENT",
    path: "src/docs/00-official-library/MIP-MemoryOS-Master-Implementation-Plan.md",
    updatedAt: "2026-07-08",
    dependencies: ["MAS-001","MES-001"],
    relatedDocs: ["MES-001","MQCCS-001"],
    adrs: [], rfcs: [],
    components: ["All"],
    description: "Master implementation plan covering all sprints and delivery milestones.",
  },

  // ── OL-02 — OPERATIONAL STANDARDS ────────────────────────────────────────────
  {
    id: "CDG-001", name: "Connector Development Guide", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "DEVELOPMENT",
    path: "src/docs/00-official-library/CONNECTOR-DEVELOPMENT-GUIDE.md",
    updatedAt: "2026-07-18",
    dependencies: ["MCF-001","MDS-001"],
    relatedDocs: ["CCS-001","MCF-001","RFC-003"],
    adrs: ["ADR-004","ADR-006"], rfcs: ["RFC-003"],
    components: ["ConnectorRuntime","IConnector","ConnectorManifest","ConnectorMetricsStore","GoogleAuthSession"],
    description: "Official guide for developing, testing, and certifying MemoryOS connectors.",
  },
  {
    id: "CCS-001", name: "Connector Certification Standard", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "OPERATIONS",
    path: "src/docs/00-official-library/CONNECTOR-CERTIFICATION-STANDARD.md",
    updatedAt: "2026-07-18",
    dependencies: ["CDG-001","MQCCS-001"],
    relatedDocs: ["CDG-001","MCF-001","TST-001","RFC-004"],
    adrs: ["ADR-004","ADR-006"], rfcs: ["RFC-003","RFC-004"],
    components: ["ConnectorCertificationLifecycle","ConnectorCertificationEvidenceStore","ConnectorCertificationStateMachine"],
    description: "Minimum certification requirements, test coverage, security, and performance thresholds for all connectors.",
  },
  {
    id: "RVP-001", name: "Release & Versioning Policy", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "DEVELOPMENT",
    path: "src/docs/00-official-library/RELEASE-VERSIONING-POLICY.md",
    updatedAt: "2026-07-18",
    dependencies: ["MES-001","MAS-001"],
    relatedDocs: ["MES-001","MQCCS-001","MDH-001"],
    adrs: ["ADR-001","ADR-003"], rfcs: ["RFC-001"],
    components: ["RollbackEngine","ValidationFramework","BetaCertification"],
    description: "Semantic versioning, Core and Connector version tracks, deprecation, rollback, and release process.",
  },
  {
    id: "ORB-001", name: "Operational Runbook", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "OPERATIONS",
    path: "src/docs/00-official-library/OPERATIONAL-RUNBOOK.md",
    updatedAt: "2026-07-18",
    dependencies: ["MEOM-001","MES-001"],
    relatedDocs: ["MEOM-001","MERS-001","MQCCS-001","TST-001"],
    adrs: ["ADR-001","ADR-003"], rfcs: ["RFC-001","RFC-002"],
    components: ["OperationalAuditEngine","ValidationFramework","ConnectorRuntime","RuntimeHealth","BetaRuntime"],
    description: "Daily operations, monitoring thresholds, incident response, recovery procedures, and observability checklist.",
  },
  {
    id: "TST-001", name: "Testing Standard", version: "1.0", status: "FROZEN",
    authority: "OFFICIAL", category: "DEVELOPMENT",
    path: "src/docs/00-official-library/TESTING-STANDARD.md",
    updatedAt: "2026-07-18",
    dependencies: ["MES-001","MQCCS-001"],
    relatedDocs: ["MQCCS-001","CCS-001","RVP-001","MES-001"],
    adrs: ["ADR-001","ADR-005"], rfcs: ["RFC-004"],
    components: ["ValidationFramework","RegressionStore","ArchitectureCertificationSuite","BetaCertification"],
    description: "Official testing standard — unit, integration, regression, performance, security, and certification requirements.",
  },
]);

export function getByCategory(cat: DocCategory): readonly OLDocument[] {
  return OL_MASTER_INDEX.filter(d => d.category === cat);
}

export function getById(id: string): OLDocument | undefined {
  return OL_MASTER_INDEX.find(d => d.id === id);
}

export function getByAuthority(auth: DocAuthority): readonly OLDocument[] {
  return OL_MASTER_INDEX.filter(d => d.authority === auth);
}