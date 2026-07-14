/**
 * AATypes.ts — Sprint 6.2.3
 * Shared types for the Architecture Authority layer.
 */

export type BreakingChangeLevel = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AAApprovalStatus    = "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED" | "AUTO_APPROVED";
export type CompatibilityStatus = "COMPATIBLE" | "INCOMPATIBLE" | "DEGRADED" | "UNKNOWN";

// ── Core Immutable set ────────────────────────────────────────────────────────

export const CORE_IMMUTABLE: readonly string[] = [
  "RepositoryKnowledgeBuilder",
  "SourceCodeParser",
  "KnowledgeGraphStore",
  "LiveCognitivePipeline",
  "ConversationCognitiveGateway",
  "GitHubQueryRouter",
  "CognitiveAnswerComposer",
  "ConnectorInvocationService",
  "GitHubConnector",
  "Base44Connector",
  "EngineeringWorkflow",
  "EngineeringIntelligence",
  "EngineeringGovernance",
] as const;

// ── Contract ──────────────────────────────────────────────────────────────────

export interface PublicContract {
  id:           string;
  name:         string;
  version:      string;         // semver-style: "1.0.0"
  signature:    string;         // hash of public API surface
  methods:      string[];
  exports:      string[];
  dependencies: string[];
  compatibility: CompatibilityStatus;
  lockedAt:     number;
}

// ── Diff ──────────────────────────────────────────────────────────────────────

export interface ContractDiff {
  contractId:     string;
  contractName:   string;
  before:         Partial<PublicContract>;
  after:          Partial<PublicContract>;
  removedMethods: string[];
  addedMethods:   string[];
  removedExports: string[];
  changedSignature: boolean;
  breakingLevel:  BreakingChangeLevel;
  details:        string[];
}

// ── Breaking Change ───────────────────────────────────────────────────────────

export interface BreakingChange {
  id:          string;
  component:   string;
  level:       BreakingChangeLevel;
  description: string;
  autoBlocked: boolean;
  diffs:       ContractDiff[];
}

// ── Architecture Proposal ─────────────────────────────────────────────────────

export interface ArchitectureProposal {
  id:                  string;
  objective:           string;
  problem:             string;
  currentArchitecture: string;
  proposedArchitecture: string;
  advantages:          string[];
  risks:               string[];
  alternatives:        string[];
  migration:           string;
  rollback:            string;
  affectedComponents:  string[];
  coreComponentsHit:   string[];
  estimatedComplexity: BreakingChangeLevel;
  confidenceScore:     number;   // 0–100
  breakingChanges:     BreakingChange[];
  requiresApproval:    boolean;
  status:              AAApprovalStatus;
  createdAt:           number;
  approvedAt:          number | null;
  rejectedAt:          number | null;
  rejectionReason:     string | null;
}

// ── Migration Plan ────────────────────────────────────────────────────────────

export interface MigrationPlan {
  id:                string;
  proposalId:        string;
  steps:             string[];
  rollbackSteps:     string[];
  compatibilityLayer: string;
  deprecationPlan:   string;
  riskReport:        string;
  createdAt:         number;
}

// ── Feature Flag ─────────────────────────────────────────────────────────────

export interface FeatureFlag {
  key:         string;   // e.g. "architecture.newRouting"
  enabled:     boolean;
  description: string;
  proposalId:  string;
  createdAt:   number;
  enabledAt:   number | null;
}

// ── Architecture Audit Entry (immutable) ──────────────────────────────────────

export interface ArchitectureAuditEntry {
  readonly id:                string;
  readonly timestamp:         number;
  readonly proposalId:        string;
  readonly objective:         string;
  readonly decision:          string;
  readonly approval:          AAApprovalStatus;
  readonly breakingLevel:     BreakingChangeLevel;
  readonly rollbackAvailable: boolean;
  readonly migrationAvailable: boolean;
  readonly affectedComponents: readonly string[];
  readonly riskSummary:        string;
  readonly engineer:           "MemoryOS";
  readonly approver:           string;
}

// ── Architecture Inspection ───────────────────────────────────────────────────

export interface ArchitectureSnapshot {
  modules:       string[];
  pipelines:     string[];
  singletons:    string[];
  connectors:    string[];
  publicAPIs:    string[];
  contracts:     string[];
  routes:        string[];
  cycles:        string[][];
  duplicates:    string[];
  imports:       Record<string, string[]>;
  exports:       Record<string, string[]>;
  kgEntityCount: number;
  kgReady:       boolean;
  snapshotAt:    number;
}

// ── Full AA Result ────────────────────────────────────────────────────────────

export interface ArchitectureAuthorityResult {
  proposalId:      string;
  proposal:        ArchitectureProposal;
  snapshot:        ArchitectureSnapshot;
  breakingChanges: BreakingChange[];
  migrationPlan:   MigrationPlan | null;
  featureFlags:    FeatureFlag[];
  compatibility:   Record<string, CompatibilityStatus>;
  auditEntry:      ArchitectureAuditEntry;
  authorized:      boolean;
  stage:           string;
  log:             string[];
}