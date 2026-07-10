// ─── Planner Engine — Types ────────────────────────────────────────────────────
// Foundation v1.0 · Goal → ExecutionPlan → Journey

export type PlanStatus    = "Draft" | "Validated" | "Rejected" | "ConvertedToJourney" | "Archived";
export type StepStatus    = "Pending" | "Ready" | "Blocked" | "Skipped";
export type ExecStrategy  = "Sequential" | "Parallel" | "Conditional" | "Approval" | "Manual" | "Automatic";
export type PlanPriority  = "Critical" | "High" | "Normal" | "Low";

// ── RetryPolicy ───────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
  backoff: "none" | "linear" | "exponential";
}

// ── PlanStep ──────────────────────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  objective: string;
  requiredCapabilities: string[];
  requiredKnowledge: string[];
  requiredConnectors: string[];
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  dependencies: string[];           // other step ids
  estimatedDuration: string;
  retryPolicy: RetryPolicy;
  timeout: number;                  // ms; 0 = no timeout
  approvalRequired: boolean;
  executionStrategy: ExecStrategy;
  status: StepStatus;
  metadata: Record<string, unknown>;
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface PlanRisk {
  id: string;
  description: string;
  level: RiskLevel;
  dependency?: string;
  mitigation: string;
  alternative?: string;
}

// ── ExecutionPlan ─────────────────────────────────────────────────────────────

export interface ExecutionPlan {
  id: string;
  goalId: string;
  title: string;
  description: string;
  objective: string;
  assumptions: string[];
  constraints: string[];
  expectedOutcome: string;
  estimatedDuration: string;
  estimatedCost: string;            // qualitative: "Baixo" | "Médio" | "Alto"
  confidenceScore: number;          // 0–1
  executionStrategy: ExecStrategy;
  priority: PlanPriority;
  steps: PlanStep[];
  risks: PlanRisk[];
  status: PlanStatus;
  journeyId: string | null;
  auditLog: PlanAuditEntry[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface PlanAuditEntry {
  id: string;
  timestamp: number;
  operation: string;
  detail?: string;
  success: boolean;
  error?: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _c = 0;
export function makePlanId(prefix = "plan"): string {
  return `${prefix}_${Date.now()}_${(++_c).toString(36)}`;
}

export function makeStepId(): string { return makePlanId("step"); }

export function makeAuditEntry(op: string, opts: { detail?: string; success?: boolean; error?: string } = {}): PlanAuditEntry {
  return { id: makePlanId("paud"), timestamp: Date.now(), operation: op, success: opts.success ?? true, detail: opts.detail, error: opts.error };
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, delayMs: 1000, backoff: "exponential" };