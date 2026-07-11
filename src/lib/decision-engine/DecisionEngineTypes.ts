// Decision Engine v1.0 — Types
// Foundation v1.0 · Engineering First

import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";

export type DecisionStatus = "PENDING" | "DECIDED" | "FAILED" | "CANCELLED";

export interface DecisionCandidate {
  candidateId: string;
  goalId:      string;
  source:      string;
  score:       number;       // 0..1
  confidence:  number;       // 0..1
  priority:    GoalPriority;
  reason:      string;
  metadata:    Readonly<Record<string, unknown>>;
  createdAt:   number;
}

export interface DecisionResult {
  decisionId:          string;
  goalId:              string;
  selectedCandidateId: string;
  score:               number;
  confidence:          number;
  decisionReason:      string;
  timestamp:           number;
}

export interface DecisionLog {
  executionId: string;
  decisionId:  string;
  goalId:      string;
  operation:   string;
  status:      "SUCCESS" | "FAILED";
  timestamp:   number;
  duration:    number;
  error?:      string;
}

export interface DecisionStatistics {
  totalEvaluated:    number;
  totalSelected:     number;
  averageScore:      number;
  averageConfidence: number;
  highestScore:      number;
  lowestScore:       number;
  decisionRate:      number;
}

export interface DecisionMetrics {
  evaluationTotal:  number;
  selectionTotal:   number;
  comparisonTotal:  number;
  rankingTotal:     number;
  avgDurationMs:    number;
}

export interface DecisionHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    candidateIntegrity: boolean;
    scoreIntegrity:     boolean;
    rankingIntegrity:   boolean;
    consistencyCheck:   boolean;
  };
  details: string;
}

export interface ScoreWeights {
  priority:   number;  // weight for priority factor
  confidence: number;  // weight for confidence factor
  score:      number;  // weight for raw score factor
}

export const DEFAULT_WEIGHTS: Readonly<ScoreWeights> = Object.freeze({
  priority:   0.30,
  confidence: 0.35,
  score:      0.35,
});

export const PRIORITY_SCORE: Readonly<Record<GoalPriority, number>> = Object.freeze({
  LOW:      0.25,
  MEDIUM:   0.50,
  HIGH:     0.75,
  CRITICAL: 1.00,
});