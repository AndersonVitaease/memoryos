/**
 * CDLTypes.ts — Cognitive Development Loop Types
 * Beta-03.1 · MemoryOS · 2026-07-13
 *
 * All models for the complete assisted software development cycle.
 * Provider-agnostic — no GitHub/Base44 specifics here.
 */

// ── IDs ───────────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeCDLId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Repository Analysis ───────────────────────────────────────────────────────

export interface CommitSummary {
  readonly sha: string;
  readonly shortSha: string;
  readonly message: string;
  readonly author: string;
  readonly date: string | null;
}

export interface BranchSummary {
  readonly name: string;
  readonly isDefault: boolean;
  readonly protected: boolean;
  readonly sha: string | null;
}

export interface RepositoryAnalysis {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  // identity
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly visibility: string;
  readonly language: string | null;
  // branches
  readonly branches: BranchSummary[];
  readonly branchCount: number;
  // commits
  readonly recentCommits: CommitSummary[];
  readonly commitCount: number;
  // files
  readonly totalFiles: number;
  readonly primaryLanguage: string | null;
  readonly languages: Array<{ lang: string; pct: number }>;
  // health
  readonly repoHealth: unknown;
  // state
  readonly projectState: "active" | "idle" | "archived" | "unknown";
  readonly lastActivityAt: string | null;
  readonly errors: string[];
}

// ── Application Analysis ──────────────────────────────────────────────────────

export interface EntityCountSummary {
  readonly entity: string;
  readonly count: number;
}

export interface ApplicationAnalysis {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  // identity
  readonly platform: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly userRole: string;
  // workspace
  readonly projectCount: number;
  readonly projects: Array<{ id: string; name: string; type: string }>;
  readonly sessionCount: number;
  readonly sessions: Array<{ id: string; title: string; status: string }>;
  // entities
  readonly entityCounts: EntityCountSummary[];
  // health
  readonly authStatus: boolean;
  readonly connectorVersion: string;
  readonly errors: string[];
}

// ── Execution Plan ─────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type PlanStepStatus = "pending" | "approved" | "executing" | "complete" | "failed" | "skipped";

export interface PlanStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly connector: "github" | "base44" | "knowledge" | "none";
  readonly operation: string;
  readonly riskLevel: RiskLevel;
  readonly estimatedDurationMs: number;
  readonly requiresApproval: boolean;
  readonly affectedFiles: string[];
  readonly expectedImpact: string;
}

export interface ImprovementOpportunity {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: "architecture" | "performance" | "knowledge" | "security" | "documentation" | "testing";
  readonly riskLevel: RiskLevel;
  readonly effort: "low" | "medium" | "high";
  readonly reasoning: string;
}

export interface RiskAnalysis {
  readonly overall: RiskLevel;
  readonly items: Array<{ description: string; level: RiskLevel; mitigation: string }>;
}

export interface DependencyAnalysis {
  readonly directDependencies: string[];
  readonly knowledgeDependencies: string[];
  readonly connectorDependencies: string[];
}

export interface ExecutionPlan {
  readonly id: string;
  readonly generatedAt: number;
  readonly title: string;
  readonly summary: string;
  readonly steps: PlanStep[];
  readonly opportunities: ImprovementOpportunity[];
  readonly risk: RiskAnalysis;
  readonly dependencies: DependencyAnalysis;
  readonly requiresConnectors: string[];
  readonly estimatedTotalMs: number;
  readonly approved: boolean;
  readonly approvedAt: number | null;
}

// ── Approval ──────────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  readonly id: string;
  readonly requestedAt: number;
  readonly plan: ExecutionPlan;
  readonly presentedSteps: PlanStep[];
  readonly approved: boolean | null;  // null = pending
  readonly decidedAt: number | null;
  readonly userComment: string;
}

// ── Execution Record ──────────────────────────────────────────────────────────

export interface StepExecutionResult {
  readonly stepId: string;
  readonly status: PlanStepStatus;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly output: unknown;
  readonly error: string | null;
  readonly warnings: string[];
}

export interface ExecutionRecord {
  readonly id: string;
  readonly planId: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly durationMs: number;
  readonly stepResults: StepExecutionResult[];
  readonly operationsExecuted: number;
  readonly errors: string[];
  readonly warnings: string[];
  readonly overallSuccess: boolean;
}

// ── Knowledge Update ──────────────────────────────────────────────────────────

export interface KnowledgeUpdateRecord {
  readonly id: string;
  readonly updatedAt: number;
  readonly triggeredBy: string;   // executionId
  readonly itemsAdded: number;
  readonly itemsUpdated: number;
  readonly timelineEventsAdded: number;
  readonly graphNodesAdded: number;
  readonly graphEdgesAdded: number;
  readonly snapshotsGenerated: number;
  readonly provenanceRecords: Array<{ source: string; itemId: string; fetchedAt: number }>;
  readonly errors: string[];
}

// ── Loop Report ───────────────────────────────────────────────────────────────

export type LoopPhase =
  | "repository_analysis"
  | "application_analysis"
  | "cognitive_planning"
  | "user_approval"
  | "assisted_execution"
  | "repository_update"
  | "knowledge_update"
  | "loop_validation";

export interface LoopPhaseResult {
  readonly phase: LoopPhase;
  readonly status: "complete" | "skipped" | "failed" | "pending";
  readonly durationMs: number;
  readonly summary: string;
  readonly errors: string[];
}

export interface CognitiveDevelopmentLoopReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly certified: boolean;
  readonly certificationLevel: "CERTIFIED" | "PARTIAL" | "FAILED";
  readonly phases: LoopPhaseResult[];
  readonly repositoryAnalysis: RepositoryAnalysis | null;
  readonly applicationAnalysis: ApplicationAnalysis | null;
  readonly executionPlan: ExecutionPlan | null;
  readonly executionRecord: ExecutionRecord | null;
  readonly knowledgeUpdate: KnowledgeUpdateRecord | null;
  readonly githubConnectorHealth: unknown;
  readonly base44ConnectorHealth: unknown;
  readonly summary: string;
  readonly recommendations: string[];
}