// ─── Goal Engine — Types ───────────────────────────────────────────────────────
// Foundation v1.0 · Intent → Goal → Journey

export type GoalStatus =
  | "Draft" | "Analyzing" | "PendingInfo" | "Validated" | "Rejected"
  | "ConvertedToJourney" | "Archived";

export type GoalComplexity = "Simple" | "Moderate" | "Complex" | "Critical";
export type GoalPriority   = "Critical" | "High" | "Normal" | "Low";

export interface Goal {
  id: string;
  title: string;
  description: string;
  userIntent: string;
  primaryObjective: string;
  secondaryObjectives: string[];
  constraints: string[];
  assumptions: string[];
  requiredInformation: string[];
  requiredDocuments: string[];
  acceptanceCriteria: string[];
  priority: GoalPriority;
  estimatedComplexity: GoalComplexity;
  estimatedDuration: string;       // e.g. "2-3 dias"
  confidenceScore: number;         // 0–1
  status: GoalStatus;
  journeyId: string | null;
  auditLog: GoalAuditEntry[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface GoalAuditEntry {
  id: string;
  timestamp: number;
  operation: string;
  detail?: string;
  success: boolean;
  error?: string;
}

export interface AnalysisResult {
  primaryObjective: string;
  secondaryObjectives: string[];
  constraints: string[];
  assumptions: string[];
  requiredInformation: string[];
  requiredDocuments: string[];
  acceptanceCriteria: string[];
  estimatedComplexity: GoalComplexity;
  estimatedDuration: string;
  confidenceScore: number;
  suggestedTitle: string;
  needsClarification: boolean;
  clarificationQuestions: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _c = 0;
export function makeGoalId(prefix = "goal"): string {
  return `${prefix}_${Date.now()}_${(++_c).toString(36)}`;
}

export function makeAuditEntry(operation: string, opts: { detail?: string; success?: boolean; error?: string } = {}): GoalAuditEntry {
  return {
    id:        makeGoalId("gaud"),
    timestamp: Date.now(),
    operation,
    detail:    opts.detail,
    success:   opts.success ?? true,
    error:     opts.error,
  };
}