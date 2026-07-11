// Self Evaluation Engine v1.0 — Types
// Foundation v1.0 · Engineering First · Sprint 20

export type EvaluationStatus = "EVALUATED" | "INVALIDATED" | "ARCHIVED";

export type EvaluationClassification =
  | "EXCELLENT"
  | "GOOD"
  | "ACCEPTABLE"
  | "POOR"
  | "FAILED";

export interface SelfEvaluation {
  // Core identity
  evaluationId:  string;
  goalId:        string;
  executionId:   string;
  reflectionId:  string;
  status:        EvaluationStatus;

  // Summary
  summary:       string;
  classification: EvaluationClassification;

  // Scores (0–100)
  overallScore:      number;
  performanceScore:  number;
  qualityScore:      number;
  reliabilityScore:  number;
  consistencyScore:  number;
  confidenceScore:   number;
  riskScore:         number;

  // Evidence-based analysis
  strengths:         ReadonlyArray<string>;
  weaknesses:        ReadonlyArray<string>;
  recommendations:   ReadonlyArray<string>;
  improvementActions: ReadonlyArray<string>;

  // Flags
  requiresHumanReview: boolean;
  readyForLearning:    boolean;

  // Timing
  createdAt: number;

  // Forward-compatibility (empty in v1.0)
  evaluationFingerprint: string;
  learningCandidates:    ReadonlyArray<string>;
  knowledgeCandidates:   ReadonlyArray<string>;
  optimizationCandidates: ReadonlyArray<string>;
  automationCandidates:  ReadonlyArray<string>;
  futureCapabilities:    ReadonlyArray<string>;
  futureConnectors:      ReadonlyArray<string>;
  executionSignature:    string;
  evaluationVersion:     string;
  architectureVersion:   string;
  foundationVersion:     string;
}

export interface EvaluationLog {
  executionId:  string;
  evaluationId: string;
  goalId:       string;
  operation:    string;
  status:       "SUCCESS" | "FAILED";
  timestamp:    number;
  duration:     number;
  error?:       string;
}

export interface EvaluationStatistics {
  totalEvaluated:    number;
  totalInvalidated:  number;
  totalArchived:     number;
  avgOverallScore:   number;
  classificationBreakdown: Readonly<Record<EvaluationClassification, number>>;
  requiresHumanReviewCount: number;
  readyForLearningCount:    number;
}

export interface EvaluationMetrics {
  evaluateTotal:   number;
  invalidateTotal: number;
  archiveTotal:    number;
  avgDurationMs:   number;
}

export interface EvaluationHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    evaluationIntegrity: boolean;
    scoreIntegrity:      boolean;
    immutabilityCheck:   boolean;
    consistencyCheck:    boolean;
  };
  details: string;
}

// Classification thresholds (overallScore 0..100)
export const CLASSIFICATION_THRESHOLDS = Object.freeze({
  EXCELLENT:  90,
  GOOD:       75,
  ACCEPTABLE: 55,
  POOR:       35,
  // < 35 → FAILED
} as const);