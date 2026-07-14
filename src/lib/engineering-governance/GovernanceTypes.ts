/**
 * GovernanceTypes.ts — Sprint 6.2.2
 * Shared types for the Engineering Governance Layer.
 */

export type PermissionLevel = "READ" | "PLAN" | "SIMULATE" | "IMPLEMENT" | "DEPLOY";
export type RiskLevel       = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type GovernanceStatus = "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED";
export type PolicyViolation = string;

// ── Protected component list ──────────────────────────────────────────────────

export const PROTECTED_COMPONENTS: readonly string[] = [
  "ConversationCognitiveGateway",
  "LiveCognitivePipeline",
  "KnowledgeGraphStore",
  "RepositoryKnowledgeBuilder",
  "SourceCodeParser",
  "EngineeringWorkflow",
  "EngineeringOrchestrator",
  "EngineeringIntelligence",
  "RegressionShield",
  "ApprovalGate",
  "GitHubConnector",
  "Base44Connector",
  "ConnectorInvocationService",
] as const;

// ── Immutable policies ─────────────────────────────────────────────────────────

export const ENGINEERING_POLICIES: readonly string[] = [
  "Never duplicate an existing implementation",
  "Never bypass the Approval Gate",
  "Never modify Core components automatically",
  "Never disable the Regression Shield",
  "Never disable Governance",
  "Never write outside project scope",
  "Never execute destructive actions automatically",
] as const;

// ── Impact Analysis ───────────────────────────────────────────────────────────

export interface ChangeImpact {
  filesModified:         string[];
  protectedFilesHit:     string[];
  modulesModified:       string[];
  connectorsModified:    string[];
  singletonsTouched:     string[];
  pipelinesTouched:      string[];
  kgImpact:              string;
  engineeringMemoryImpact: string;
  riskScore:             number; // 0–100
  riskLevel:             RiskLevel;
}

// ── Governance Proposal ───────────────────────────────────────────────────────

export interface GovernanceProposal {
  id:                  string;
  objective:           string;
  requestedPermission: PermissionLevel;
  impact:              ChangeImpact;
  protectedComponents: string[];
  whyNecessary:        string;
  architecturalImpact: string;
  riskLevel:           RiskLevel;
  regressionProbability: string;
  rollbackPlan:        string;
  policyViolations:    PolicyViolation[];
  requiresApproval:    boolean;
  status:              GovernanceStatus;
  createdAt:           number;
  approvedAt:          number | null;
  rejectedAt:          number | null;
  rejectionReason:     string | null;
}

// ── Rollback Plan ─────────────────────────────────────────────────────────────

export interface RollbackEntry {
  filePath:      string;
  originalHash:  string;   // simple length-based fingerprint
  module:        string;
  connector:     string | null;
  instructions:  string;
}

export interface RollbackPlan {
  id:           string;
  proposalId:   string;
  entries:      RollbackEntry[];
  affectedModules:    string[];
  affectedConnectors: string[];
  instructions: string;
  createdAt:    number;
  executed:     boolean;
  executedAt:   number | null;
}

// ── Sandbox Result ────────────────────────────────────────────────────────────

export interface SandboxResult {
  proposalId:        string;
  patch:             string;
  simulationOk:      boolean;
  regressionOk:      boolean;
  governanceOk:      boolean;
  approvalRequired:  boolean;
  readyToApply:      boolean;
  blockers:          string[];
  durationMs:        number;
}

// ── Audit Entry (immutable) ───────────────────────────────────────────────────

export interface AuditEntry {
  readonly id:          string;
  readonly timestamp:   number;
  readonly objective:   string;
  readonly planId:      string;
  readonly files:       readonly string[];
  readonly decision:    string;
  readonly approval:    "HUMAN_APPROVED" | "HUMAN_REJECTED" | "AUTO_BLOCKED" | "PENDING";
  readonly regression:  string;
  readonly rollback:    string;
  readonly outcome:     "PASS" | "FAIL" | "BLOCKED" | "PENDING";
  readonly engineer:    "MemoryOS";
  readonly approver:    string;
  readonly policyViolations: readonly string[];
}

// ── Security Check ────────────────────────────────────────────────────────────

export interface SecurityCheckResult {
  passed:          boolean;
  connectorPerms:  boolean;
  repoPerms:       boolean;
  protectedFiles:  boolean;
  secretsExposure: boolean;
  credentialLeak:  boolean;
  unsafeFs:        boolean;
  unsafeConnector: boolean;
  unsafeDeletion:  boolean;
  unsafeOverwrite: boolean;
  findings:        string[];
}

// ── Governance Report ─────────────────────────────────────────────────────────

export interface GovernanceReport {
  proposalId:      string;
  governanceOk:    boolean;
  riskReport:      { level: RiskLevel; score: number; explanation: string };
  impactReport:    ChangeImpact;
  rollbackReport:  { available: boolean; entries: number };
  auditEntry:      AuditEntry;
  approvalReport:  { required: boolean; status: GovernanceStatus; reason: string };
  regressionReport: { required: boolean; passed: boolean | null };
  securityReport:  SecurityCheckResult;
  policyReport:    { violations: string[]; allPoliciesOk: boolean };
  generatedAt:     number;
}