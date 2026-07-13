/**
 * AuditTypes.ts — EF-36I Architecture Audit Types
 * EF-36I · Cognitive Architecture Audit · Foundation v1.0
 * 2026-07-13
 */

// ── Component inventory ───────────────────────────────────────────────────────

export type ComponentLayer =
  | "connector_runtime"
  | "knowledge_reconstruction"
  | "knowledge_fusion"
  | "identity_resolution"
  | "project_reconstruction"
  | "validation"
  | "support";

export type ComponentStatus = "implemented" | "partial" | "stub" | "missing";

export interface ArchitectureComponent {
  id: string;
  name: string;
  layer: ComponentLayer;
  filePath: string;
  status: ComponentStatus;
  description: string;
  exposedInterfaces: string[];
  dependencies: string[];       // component IDs this depends on
  sprint: string;
}

// ── Dependency graph ──────────────────────────────────────────────────────────

export type DependencyIssueType =
  | "circular"
  | "hidden"
  | "provider_specific"
  | "layer_violation"
  | "duplicated_path"
  | "invalid_import"
  | "coupling_hotspot";

export interface DependencyIssue {
  type: DependencyIssueType;
  description: string;
  components: string[];
  severity: "critical" | "high" | "medium" | "low";
}

// ── SOLID ─────────────────────────────────────────────────────────────────────

export interface SOLIDScore {
  componentId: string;
  S: number;   // Single Responsibility  0–1
  O: number;   // Open/Closed
  L: number;   // Liskov Substitution
  I: number;   // Interface Segregation
  D: number;   // Dependency Inversion
  overall: number;
  notes: string[];
}

// ── Principles ────────────────────────────────────────────────────────────────

export interface PrincipleCheck {
  principle: string;
  compliant: boolean;
  score: number;   // 0–1
  evidence: string[];
  violations: string[];
}

// ── Duplication ────────────────────────────────────────────────────────────────

export type DuplicationArea =
  | "http_logic"
  | "graph_logic"
  | "reconstruction_logic"
  | "timeline_logic"
  | "validation_logic"
  | "provider_logic"
  | "id_generation";

export interface DuplicationFinding {
  area: DuplicationArea;
  description: string;
  locations: string[];
  recommendation: string;
  severity: "high" | "medium" | "low";
}

// ── Performance ───────────────────────────────────────────────────────────────

export type PerfRisk = "LOW" | "MEDIUM" | "HIGH";

export interface PerformanceFinding {
  area: string;
  risk: PerfRisk;
  description: string;
  estimate: string;
  recommendation: string;
}

// ── Test coverage ──────────────────────────────────────────────────────────────

export interface TestCoverageFinding {
  component: string;
  hasTests: boolean;
  testFile: string | null;
  issues: string[];
  missingScenarios: string[];
}

// ── Pipeline stage ─────────────────────────────────────────────────────────────

export interface PipelineStageAudit {
  stage: string;
  component: string;
  inputContract: string;
  outputContract: string;
  immutable: boolean;
  traceable: boolean;
  provenanced: boolean;
  issues: string[];
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export type RiskCategory =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "technical_debt"
  | "architectural_opportunity";

export interface RiskFinding {
  category: RiskCategory;
  title: string;
  description: string;
  evidence: string[];
  impact: string;
  recommendation: string;
}

// ── Beta readiness ─────────────────────────────────────────────────────────────

export type BetaVerdict = "READY" | "READY_WITH_RECOMMENDATIONS" | "NOT_READY";

export interface BetaReadinessDimension {
  name: string;
  score: number;   // 0–1
  verdict: "PASS" | "WARNING" | "FAIL";
  notes: string[];
}

export interface BetaReadiness {
  verdict: BetaVerdict;
  overallScore: number;
  dimensions: BetaReadinessDimension[];
  blockers: string[];
  recommendations: string[];
}

// ── Architecture Certificate ───────────────────────────────────────────────────

export interface ArchitectureCertificationReport {
  id: string;
  generatedAt: number;
  durationMs: number;

  // Inventory
  components: ArchitectureComponent[];
  totalComponents: number;
  implementedComponents: number;

  // Dependencies
  dependencyIssues: DependencyIssue[];

  // SOLID
  solidScores: SOLIDScore[];
  avgSolidScore: number;

  // Principles
  principleChecks: PrincipleCheck[];
  avgPrincipleScore: number;

  // Duplication
  duplicationFindings: DuplicationFinding[];

  // Performance
  performanceFindings: PerformanceFinding[];

  // Test coverage
  testCoverageFindings: TestCoverageFinding[];
  testedComponents: number;

  // Pipeline
  pipelineStages: PipelineStageAudit[];
  pipelineHealth: number;   // 0–1

  // Risks
  risks: RiskFinding[];

  // Beta readiness
  betaReadiness: BetaReadiness;

  // Overall
  overallArchitectureScore: number;   // 0–1
  overallVerdict: "CERTIFIED" | "CERTIFIED_WITH_WARNINGS" | "REQUIRES_REMEDIATION";

  // Executive summary
  executiveSummary: string;
}

// ── ID helper ──────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeAuditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}