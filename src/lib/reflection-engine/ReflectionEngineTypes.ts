// Reflection Engine v1.0 — Types
// Foundation v1.0 · Engineering First · Sprint Reflection Engine v1.0

import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";

// ── Input types (readonly mirrors — engine never mutates originals) ─────────

export interface ExecutionResult {
  executionId:  string;
  goalId:       string;
  planId:       string;
  status:       "SUCCESS" | "PARTIAL" | "FAILED" | "TIMEOUT" | "CANCELLED";
  stepsExecuted: number;
  stepsSkipped:  number;
  stepsTotal:    number;
  fallbacksUsed: number;
  errorMessages: ReadonlyArray<string>;
  warningMessages: ReadonlyArray<string>;
  durationMs:    number;
  startedAt:     number;
  completedAt:   number;
}

export interface ExecutionMetrics {
  executionId:       string;
  cpuScore:          number;   // 0..1
  memoryScore:       number;   // 0..1
  latencyMs:         number;
  throughput:        number;   // steps/sec
  errorRate:         number;   // 0..1
  successRate:       number;   // 0..1
}

// ── Output types ──────────────────────────────────────────────────────────

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type RiskLevel       = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ReflectionStatus = "GENERATED" | "INVALIDATED" | "ARCHIVED";
export type ImprovementPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Reflection {
  // Core identity
  reflectionId:   string;
  goalId:         string;
  executionId:    string;
  planId:         string;
  status:         ReflectionStatus;

  // Analysis output
  summary:        string;
  successes:      ReadonlyArray<string>;
  failures:       ReadonlyArray<string>;
  warnings:       ReadonlyArray<string>;
  recommendations: ReadonlyArray<string>;
  lessonsLearned: ReadonlyArray<string>;
  improvementCandidates: ReadonlyArray<string>;

  // Scores
  confidence:   ConfidenceLevel;
  confidenceScore: number;        // 0..1
  riskLevel:    RiskLevel;
  riskScore:    number;           // 0..1

  // Timing
  executionDuration: number;      // ms
  createdAt:    number;

  // MDS v1.7 forward-compatibility fields (empty in v1.0)
  requiredCapabilities:    ReadonlyArray<string>;
  usedCapabilities:        ReadonlyArray<string>;
  usedConnectors:          ReadonlyArray<string>;
  dependencyGraph:         Readonly<Record<string, ReadonlyArray<string>>>;
  preconditionsSatisfied:  boolean;
  postconditionsSatisfied: boolean;
  retryCount:              number;
  rollbackExecuted:        boolean;
  performanceScore:        number; // 0..1
  qualityScore:            number; // 0..1
  reliabilityScore:        number; // 0..1
  improvementPriority:     ImprovementPriority;
}

// ── Log & observability ────────────────────────────────────────────────────

export interface ReflectionLog {
  executionId:  string;
  reflectionId: string;
  goalId:       string;
  operation:    string;
  status:       "SUCCESS" | "FAILED";
  timestamp:    number;
  duration:     number;
  error?:       string;
}

export interface ReflectionStatistics {
  totalGenerated:   number;
  totalInvalidated: number;
  totalArchived:    number;
  avgConfidenceScore: number;
  avgRiskScore:     number;
  confidenceBreakdown: Readonly<Record<ConfidenceLevel, number>>;
  riskBreakdown:    Readonly<Record<RiskLevel, number>>;
  avgExecutionDuration: number;
}

export interface ReflectionMetrics {
  generateTotal:    number;
  invalidateTotal:  number;
  archiveTotal:     number;
  avgDurationMs:    number;
}

export interface ReflectionHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    reflectionIntegrity: boolean;
    scoreIntegrity:      boolean;
    immutabilityCheck:   boolean;
    consistencyCheck:    boolean;
  };
  details: string;
}