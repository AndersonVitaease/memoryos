/**
 * AELTypes.ts — Sprint 6.3.3
 * Autonomous Engineering Loop — shared type definitions
 */

export type AELState =
  | "IDLE" | "ANALYZING" | "PLANNING" | "WAITING_APPROVAL"
  | "IMPLEMENTING" | "RECOVERING" | "VALIDATING" | "LEARNING"
  | "READY" | "FAILED";

export type AELStage =
  | "ANALYZE" | "INSPECT_KG" | "INSPECT_MEMORY" | "INSPECT_ARCHITECTURE"
  | "INSPECT_GOVERNANCE" | "GENERATE_PLAN" | "REUSE_ANALYSIS" | "RISK_ANALYSIS"
  | "APPROVAL" | "IMPLEMENTATION" | "SELF_HEALING" | "REGRESSION_SHIELD"
  | "ACCEPTANCE_FRAMEWORK" | "LESSONS_LEARNED" | "UPDATE_MEMORY";

export type StageStatus = "PENDING" | "RUNNING" | "PASS" | "FAIL" | "SKIP" | "BLOCKED";

export interface StageResult {
  stage: AELStage;
  status: StageStatus;
  summary: string;
  durationMs: number;
  data?: unknown;
  rca?: string;
}

export interface AELPlan {
  id: string;
  objective: string;
  components: string[];
  strategy: "CREATE" | "EXTEND" | "REFACTOR" | "FIX";
  complexity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedDurationMs: number;
  reuseOpportunities: string[];
  risks: AELRisk[];
  requiresApproval: boolean;
  implementationSteps: string[];
  validationSteps: string[];
  rollbackStrategy: string;
}

export interface AELRisk {
  id: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  mitigation: string;
  probability: number; // 0-1
}

export interface AELEvidence {
  id: string;
  executionId: string;
  stage: AELStage;
  kind: "LOG" | "SNAPSHOT" | "METRIC" | "DECISION" | "PLAN" | "VALIDATION";
  label: string;
  value: unknown;
  capturedAt: number;
}

export interface AELTimelineEntry {
  id: string;
  executionId: string;
  stage: AELStage;
  state: AELState;
  timestamp: number;
  summary: string;
  durationMs: number;
}

export interface AELAuditEntry {
  id: string;
  executionId: string;
  actor: string;
  action: string;
  stage: AELStage | "SYSTEM";
  result: StageStatus;
  reason: string;
  timestamp: number;
}

export interface AELMetricSnapshot {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  avgStagesCompleted: number;
  reuseRate: number;
  approvalRate: number;
  rollbackCount: number;
  recoveryCount: number;
  acceptanceRate: number;
  lastExecutionAt: number | null;
}

export interface AELReport {
  id: string;
  executionId: string;
  objective: string;
  generatedAt: number;
  finalState: AELState;
  ready: boolean;
  durationMs: number;
  stageResults: StageResult[];
  plan: AELPlan | null;
  regressionScore: number;
  acceptanceScore: number;
  evidenceCount: number;
  lessonsLearned: string[];
  summary: string;
}