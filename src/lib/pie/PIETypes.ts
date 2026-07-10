// ─── PIE — Planning Intelligence Engine Types ──────────────────────────────────
// Foundation v1.0 · Multi-plan generation · Evaluation · Comparison · Optimization

import type { ExecutionPlan } from "@/lib/planner-engine/PlannerTypes";

// ── Scores ────────────────────────────────────────────────────────────────────

export interface PlanScores {
  confidenceScore:         number; // 0–100
  riskScore:               number; // 0–100 (higher = less risky)
  costScore:               number; // 0–100 (higher = cheaper)
  timeScore:               number; // 0–100 (higher = faster)
  complexityScore:         number; // 0–100 (higher = simpler)
  dependencyScore:         number; // 0–100 (higher = fewer external deps)
  capabilityAvailability:  number; // 0–100
  overallScore:            number; // weighted composite 0–100
}

export interface ScoreExplanation {
  dimension: keyof PlanScores;
  value: number;
  rationale: string;
}

// ── Candidate Plan ────────────────────────────────────────────────────────────

export type CandidateVariant = "Standard" | "Fast" | "Conservative" | "Minimal" | "Comprehensive";

export interface PlanCandidate {
  id:           string;
  planId:       string;
  variant:      CandidateVariant;
  plan:         ExecutionPlan;
  scores:       PlanScores;
  explanations: ScoreExplanation[];
  benefits:     string[];
  limitations:  string[];
  rankPosition: number; // 1 = best
  selected:     boolean;
}

// ── Optimization ──────────────────────────────────────────────────────────────

export type OptimizationType = "RemoveRedundantStep" | "MergeSteps" | "ReduceDependency" | "ReduceRisk" | "SimplifyFlow";

export interface Optimization {
  id:          string;
  type:        OptimizationType;
  description: string;
  impact:      "Low" | "Medium" | "High";
  applied:     boolean;
}

// ── PIE Session ───────────────────────────────────────────────────────────────

export type PIEStatus = "Running" | "Completed" | "Failed";

export interface PIESession {
  id:               string;
  goalId:           string;
  candidates:       PlanCandidate[];
  selectedPlanId:   string | null;
  decisionRationale: string;
  optimizations:    Optimization[];
  auditLog:         PIEAuditEntry[];
  status:           PIEStatus;
  createdAt:        number;
  updatedAt:        number;
  metadata:         Record<string, unknown>;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface PIEAuditEntry {
  id:        string;
  timestamp: number;
  operation: string;
  detail?:   string;
  success:   boolean;
  error?:    string;
}

// ── Learning Record (prepared, not active) ────────────────────────────────────

export interface LearningRecord {
  sessionId:       string;
  goalId:          string;
  selectedPlanId:  string;
  discardedPlanIds: string[];
  selectionReason: string;
  expectedOutcome: string;
  recordedAt:      number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _c = 0;
export function makePIEId(prefix = "pie"): string {
  return `${prefix}_${Date.now()}_${(++_c).toString(36)}`;
}

export function makePIEAuditEntry(op: string, opts: { detail?: string; success?: boolean; error?: string } = {}): PIEAuditEntry {
  return { id: makePIEId("paud"), timestamp: Date.now(), operation: op, success: opts.success ?? true, detail: opts.detail, error: opts.error };
}