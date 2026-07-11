// Planning Engine v1.0 — Types
// Foundation v1.0 · Engineering First

import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";

export type PlanStatus = "DRAFT" | "READY" | "INVALIDATED" | "CANCELLED";

export type StepType =
  | "CAPABILITY"
  | "VALIDATION"
  | "DECISION"
  | "NOTIFICATION"
  | "CONDITION"
  | "FALLBACK";

export interface PlanStep {
  stepId:      string;
  sequence:    number;
  type:        StepType;
  description: string;
  required:    boolean;
  metadata:    Readonly<Record<string, unknown>>;
}

export interface ExecutionPlan {
  planId:      string;
  goalId:      string;
  status:      PlanStatus;
  priority:    GoalPriority;
  steps:       ReadonlyArray<Readonly<PlanStep>>;
  estimatedMs: number;
  complexity:  "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason:      string;
  createdAt:   number;
}

export interface PlanLog {
  executionId: string;
  planId:      string;
  goalId:      string;
  operation:   string;
  status:      "SUCCESS" | "FAILED";
  timestamp:   number;
  duration:    number;
  error?:      string;
}

export interface PlanStatistics {
  totalPlanned:     number;
  totalInvalidated: number;
  totalCancelled:   number;
  averageSteps:     number;
  averageEstimatedMs: number;
  complexityBreakdown: Readonly<Record<string, number>>;
  planRate:         number;
}

export interface PlanMetrics {
  planTotal:        number;
  invalidateTotal:  number;
  cancelTotal:      number;
  validateTotal:    number;
  avgDurationMs:    number;
}

export interface PlanHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    planIntegrity:    boolean;
    stepIntegrity:    boolean;
    sequenceIntegrity: boolean;
    consistencyCheck: boolean;
  };
  details: string;
}

// Complexity thresholds by step count
export const COMPLEXITY_THRESHOLDS = Object.freeze({
  LOW:      2,
  MEDIUM:   5,
  HIGH:     8,
  CRITICAL: Infinity,
} as const);