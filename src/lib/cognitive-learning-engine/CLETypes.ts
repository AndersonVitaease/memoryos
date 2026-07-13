/**
 * CLETypes.ts — Cognitive Learning Engine Types
 * Beta-03.2 · MemoryOS · 2026-07-13
 *
 * All models for the Cognitive Learning Engine.
 * Immutable records — append-only, no history mutation.
 * Provider-agnostic — no GitHub/Base44 specifics.
 */

// ── IDs ───────────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeCLEId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Outcome Comparison ───────────────────────────────────────────────────────

export type OutcomeStatus =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILURE"
  | "UNEXPECTED_EFFECT"
  | "MISSING_EFFECT"
  | "NOT_EVALUATED";

export type DeviationType =
  | "none"
  | "duration_over"
  | "duration_under"
  | "step_failed"
  | "step_skipped"
  | "unexpected_warning"
  | "unexpected_error"
  | "missing_output"
  | "connector_degraded";

export interface StepComparison {
  readonly stepId: string;
  readonly stepTitle: string;
  readonly expectedConnector: string;
  readonly expectedDurationMs: number;
  readonly expectedImpact: string;
  readonly observedStatus: string;
  readonly observedDurationMs: number;
  readonly observedError: string | null;
  readonly observedWarnings: string[];
  readonly deviation: DeviationType;
  readonly deviationMagnitude: number; // 0.0 – 1.0
  readonly met: boolean;
}

export interface OutcomeComparison {
  readonly id: string;
  readonly comparedAt: number;
  readonly executionId: string;
  readonly planId: string;
  readonly overallOutcome: OutcomeStatus;
  readonly stepsCompared: number;
  readonly stepsMet: number;
  readonly stepsFailed: number;
  readonly stepsSkipped: number;
  readonly stepComparisons: readonly StepComparison[];
  readonly totalExpectedMs: number;
  readonly totalObservedMs: number;
  readonly durationDeviation: number; // ratio: observed/expected
  readonly unexpectedEffects: string[];
  readonly missingEffects: string[];
  readonly successRate: number; // 0.0 – 1.0
}

// ── Learning Record ───────────────────────────────────────────────────────────

export type LearningType =
  | "success_pattern"
  | "failure_pattern"
  | "performance_insight"
  | "connector_reliability"
  | "planning_accuracy"
  | "risk_calibration"
  | "knowledge_gap"
  | "opportunity_validation";

export type LearningImportance = "low" | "medium" | "high" | "critical";

export interface LearningEvidence {
  readonly source: string;           // e.g. "execution_record", "step_comparison"
  readonly referenceId: string;
  readonly observedValue: unknown;
  readonly expectedValue: unknown;
  readonly explanation: string;
}

export interface LearningRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly executionId: string;
  readonly planId: string;
  readonly learningType: LearningType;
  readonly importance: LearningImportance;
  readonly title: string;
  readonly description: string;
  readonly expectedResult: string;
  readonly observedResult: string;
  readonly deviation: string;
  readonly rootCause: string;
  readonly confidenceDelta: number;   // -1.0 to +1.0
  readonly riskDelta: number;         // -1.0 to +1.0
  readonly recommendation: string;
  readonly evidence: readonly LearningEvidence[];
  readonly provenance: LearningProvenance;
  readonly tags: readonly string[];
}

export interface LearningProvenance {
  readonly engineVersion: string;
  readonly generatedBy: "CognitiveLearningEngine";
  readonly cdlReportId: string | null;
  readonly generatedAt: number;
}

// ── Confidence State ──────────────────────────────────────────────────────────

export interface ConfidenceAdjustment {
  readonly id: string;
  readonly adjustedAt: number;
  readonly triggeredBy: string;       // learningRecordId
  readonly dimension: string;         // e.g. "github_connector", "planning", "knowledge_reconstruction"
  readonly previousConfidence: number; // 0.0 – 1.0
  readonly delta: number;             // applied change
  readonly newConfidence: number;
  readonly evidence: string;
  readonly direction: "increase" | "decrease" | "unchanged";
}

export interface ConfidenceState {
  readonly lastUpdatedAt: number;
  readonly dimensions: Readonly<Record<string, number>>;
  readonly adjustments: readonly ConfidenceAdjustment[];
}

// ── Risk Adjustment ────────────────────────────────────────────────────────────

export interface RiskAdjustment {
  readonly id: string;
  readonly adjustedAt: number;
  readonly triggeredBy: string;
  readonly area: string;
  readonly previousRisk: number;
  readonly delta: number;
  readonly newRisk: number;
  readonly evidence: string;
}

// ── Recommendation ────────────────────────────────────────────────────────────

export type RecommendationCategory =
  | "improve_planning"
  | "increase_validation"
  | "reduce_risk"
  | "reuse_solution"
  | "avoid_mistake"
  | "improve_knowledge"
  | "improve_connector"
  | "improve_execution";

export interface CLERecommendation {
  readonly id: string;
  readonly generatedAt: number;
  readonly category: RecommendationCategory;
  readonly title: string;
  readonly reasoning: string;
  readonly priority: "low" | "medium" | "high";
  readonly evidence: readonly LearningEvidence[];
  readonly actionableSteps: readonly string[];
  readonly linkedLearningId: string;
}

// ── Knowledge Integration ─────────────────────────────────────────────────────

export interface CLEKnowledgeEntry {
  readonly id: string;
  readonly registeredAt: number;
  readonly learningRecordId: string;
  readonly knowledgeType: "lesson" | "pattern" | "risk" | "recommendation" | "insight";
  readonly title: string;
  readonly content: string;
  readonly graphNodeAdded: boolean;
  readonly timelineEventAdded: boolean;
  readonly snapshotUpdated: boolean;
  readonly provenanceRecords: Array<{ source: string; refId: string }>;
}

// ── Learning Session ──────────────────────────────────────────────────────────

export interface LearningSession {
  readonly id: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly durationMs: number;
  readonly executionId: string;
  readonly outcome: OutcomeComparison;
  readonly learningRecords: readonly LearningRecord[];
  readonly confidenceAdjustments: readonly ConfidenceAdjustment[];
  readonly riskAdjustments: readonly RiskAdjustment[];
  readonly recommendations: readonly CLERecommendation[];
  readonly knowledgeEntries: readonly CLEKnowledgeEntry[];
  readonly overallLearningScore: number;  // 0–100
  readonly errors: string[];
}

// ── CLE Report ────────────────────────────────────────────────────────────────

export interface CLEReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly certified: boolean;
  readonly certificationLevel: "CERTIFIED" | "PARTIAL" | "FAILED";
  // aggregate stats across all sessions
  readonly totalSessions: number;
  readonly totalLearningRecords: number;
  readonly totalConfidenceAdjustments: number;
  readonly totalRiskAdjustments: number;
  readonly totalRecommendations: number;
  readonly totalKnowledgeEntries: number;
  readonly overallSuccessRate: number;
  // evolution
  readonly confidenceState: ConfidenceState;
  readonly sessions: readonly LearningSession[];
  readonly topLessons: readonly LearningRecord[];
  readonly topRecommendations: readonly CLERecommendation[];
  readonly summary: string;
}