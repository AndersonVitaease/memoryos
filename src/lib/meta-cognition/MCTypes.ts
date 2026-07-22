/**
 * MCTypes.ts — Sprint EF-54 · Meta-Cognitive Engine Types
 *
 * Tipos canônicos para o pipeline meta-cognitivo.
 * O engine NUNCA modifica módulos anteriores — apenas observa e analisa.
 * Toda análise é reproduzível. Toda reflexão possui evidências.
 */

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeMCId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Cognitive Flow Step ───────────────────────────────────────────────────────

export type CognitiveStage =
  | "goal"
  | "planner"
  | "strategy"
  | "capability"
  | "knowledge"
  | "inference"
  | "decision"
  | "execution"
  | "optimization";

export interface CognitiveFlowStep {
  readonly stage: CognitiveStage;
  readonly label: string;
  readonly description: string;
  readonly confidence: number;       // 0–1
  readonly authority: number;        // 0–1
  readonly durationMs: number;
  readonly evidenceCount: number;
  readonly issues: readonly string[];
}

export interface CognitiveFlow {
  readonly id: string;
  readonly builtAt: number;
  readonly goal: string;
  readonly steps: readonly CognitiveFlowStep[];
  readonly overallQuality: number;   // 0–1
}

// ── Bias ──────────────────────────────────────────────────────────────────────

export type BiasType =
  | "overconfidence"
  | "confirmation_bias"
  | "authority_bias"
  | "recency_bias"
  | "connector_bias"
  | "strategy_bias"
  | "capability_bias"
  | "knowledge_bias";

export interface DetectedBias {
  readonly id: string;
  readonly detectedAt: number;
  readonly type: BiasType;
  readonly title: string;
  readonly description: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly evidence: readonly string[];
  readonly affectedStages: readonly CognitiveStage[];
  readonly magnitude: number;        // 0–1
}

// ── Alternative ───────────────────────────────────────────────────────────────

export type AlternativeKind = "strategy" | "capability" | "connector" | "knowledge_rule" | "inference_path";

export interface Alternative {
  readonly id: string;
  readonly kind: AlternativeKind;
  readonly label: string;
  readonly description: string;
  readonly estimatedConfidence: number;  // 0–1
  readonly estimatedCost: number;        // 0–10
  readonly discardReason: string;
  readonly couldImprove: boolean;
}

// ── Evidence Evaluation ───────────────────────────────────────────────────────

export interface EvidenceEvaluation {
  readonly totalCount: number;
  readonly qualityScore: number;       // 0–1
  readonly diversityScore: number;     // 0–1
  readonly authorityScore: number;     // 0–1
  readonly contradictionCount: number;
  readonly coverageScore: number;      // 0–1
  readonly overallScore: number;       // 0–1
  readonly weaknesses: readonly string[];
}

// ── Consistency Issue ─────────────────────────────────────────────────────────

export type ConsistencyIssueKind =
  | "contradictory_decision"
  | "unjustified_strategy_change"
  | "authority_inconsistency"
  | "knowledge_conflict"
  | "reasoning_inconsistency";

export interface ConsistencyIssue {
  readonly id: string;
  readonly kind: ConsistencyIssueKind;
  readonly description: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly evidence: readonly string[];
  readonly stageA: CognitiveStage;
  readonly stageB: CognitiveStage;
}

// ── Confidence Review ─────────────────────────────────────────────────────────

export interface ConfidenceReview {
  readonly predictedConfidence: number;   // 0–1 — what the system predicted
  readonly usedConfidence: number;        // 0–1 — what it used in decision
  readonly realizedSuccess: number;       // 0–1 — actual outcome
  readonly calibrationError: number;      // |predicted - realized|
  readonly confidenceDrift: number;       // |predicted - used|
  readonly isOverconfident: boolean;
  readonly isUnderconfident: boolean;
  readonly assessment: string;
}

// ── Reasoning Review ──────────────────────────────────────────────────────────

export interface ReasoningReview {
  readonly depth: number;
  readonly completeness: number;           // 0–1
  readonly consistency: number;            // 0–1
  readonly logicalLeaps: number;           // count of unjustified steps
  readonly circularities: number;
  readonly repetitions: number;
  readonly overallQuality: number;         // 0–1
  readonly issues: readonly string[];
}

// ── Reflection ────────────────────────────────────────────────────────────────

export interface ReflectionItem {
  readonly category: "strength" | "weakness" | "improvement" | "retain";
  readonly description: string;
  readonly evidence: readonly string[];
  readonly priority: "critical" | "high" | "medium" | "low";
}

export interface Reflection {
  readonly id: string;
  readonly generatedAt: number;
  readonly goal: string;
  readonly strengths: readonly ReflectionItem[];
  readonly weaknesses: readonly ReflectionItem[];
  readonly improvements: readonly ReflectionItem[];
  readonly retentions: readonly ReflectionItem[];
  readonly summary: string;
}

// ── Meta Metrics ──────────────────────────────────────────────────────────────

export interface MetaMetrics {
  readonly reasoningQuality: number;         // 0–1
  readonly reflectionQuality: number;        // 0–1
  readonly biasCount: number;
  readonly alternativeCoverage: number;      // 0–1
  readonly evidenceCoverage: number;         // 0–1
  readonly consistencyScore: number;         // 0–1
  readonly confidenceCalibration: number;    // 0–1 (1 = perfectly calibrated)
  readonly metaConfidence: number;           // 0–1 overall meta-cognitive confidence
}

// ── Meta History Entry ────────────────────────────────────────────────────────

export interface MetaHistoryEntry {
  readonly id: string;
  readonly recordedAt: number;
  readonly goal: string;
  readonly biasCount: number;
  readonly consistencyIssues: number;
  readonly alternativesConsidered: number;
  readonly reasoningQuality: number;
  readonly metaConfidence: number;
  readonly reportId: string;
}

// ── Meta Report ───────────────────────────────────────────────────────────────

export interface MetaReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly goal: string;
  readonly cognitiveFlow: CognitiveFlow;
  readonly biases: readonly DetectedBias[];
  readonly alternatives: readonly Alternative[];
  readonly evidenceEvaluation: EvidenceEvaluation;
  readonly consistencyIssues: readonly ConsistencyIssue[];
  readonly confidenceReview: ConfidenceReview;
  readonly reasoningReview: ReasoningReview;
  readonly reflection: Reflection;
  readonly metrics: MetaMetrics;
  readonly summary: string;
}