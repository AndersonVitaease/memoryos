/**
 * KRTypes.ts — Sprint EF-52 · Knowledge Reasoning Engine Types
 *
 * Imutável. Toda inferência é temporária — NÃO entra no KnowledgeStore.
 */

import type { KnowledgeCondition, KnowledgeConsequence } from "@/lib/cognitive-learning/CLTypes";

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeKRId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Reasoning Context ─────────────────────────────────────────────────────────

export interface ReasoningContext {
  readonly id: string;
  readonly createdAt: number;
  readonly goal: string;
  readonly intent: string;
  readonly capabilities: readonly string[];
  readonly strategy: string;
  readonly projectSize: "small" | "medium" | "large" | "enterprise";
  readonly domain: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ── Retrieved Knowledge ───────────────────────────────────────────────────────

export interface RetrievedRule {
  readonly ruleId: string;
  readonly title: string;
  readonly description: string;
  readonly confidence: number;
  readonly authority: number;
  readonly successRate: number;
  readonly frequency: number;
  readonly relevanceScore: number;
  readonly recencyScore: number;
  readonly matchedFields: readonly string[];
  readonly evidence: readonly string[];
  readonly conditions: readonly KnowledgeCondition[];
  readonly consequences: readonly KnowledgeConsequence[];
}

// ── Match Result ──────────────────────────────────────────────────────────────

export type MatchRelation =
  | "supports"
  | "contradicts"
  | "requires"
  | "derived_from"
  | "related_to"
  | "reinforces"
  | "weakens";

export interface RuleMatch {
  readonly id: string;
  readonly ruleAId: string;
  readonly ruleBId: string;
  readonly relation: MatchRelation;
  readonly strength: number;
  readonly explanation: string;
  readonly sharedEvidence: readonly string[];
}

// ── Inference ─────────────────────────────────────────────────────────────────

export type InferenceType =
  | "deduction"
  | "induction"
  | "abduction"
  | "chain"
  | "multi_hop"
  | "composition"
  | "reduction";

export interface InferenceStep {
  readonly id: string;
  readonly stepIndex: number;
  readonly type: InferenceType;
  readonly premiseRuleIds: readonly string[];
  readonly conclusion: string;
  readonly confidence: number;
  readonly authority: number;
  readonly evidence: readonly string[];
  readonly isTemporary: true;
  readonly derivedAt: number;
}

export interface InferenceChain {
  readonly id: string;
  readonly goal: string;
  readonly steps: readonly InferenceStep[];
  readonly finalConclusion: string;
  readonly overallConfidence: number;
  readonly overallAuthority: number;
  readonly depth: number;
  readonly isTemporary: true;
}

// ── Conflict ──────────────────────────────────────────────────────────────────

export interface Conflict {
  readonly id: string;
  readonly detectedAt: number;
  readonly ruleAId: string;
  readonly ruleBId: string;
  readonly ruleATitle: string;
  readonly ruleBTitle: string;
  readonly conflictType: "goal_conflict" | "strategy_conflict" | "capability_conflict" | "authority_conflict" | "context_conflict";
  readonly description: string;
  readonly severity: "low" | "medium" | "high" | "critical";
}

export interface ConflictResolution {
  readonly conflictId: string;
  readonly resolvedAt: number;
  readonly winnerId: string;
  readonly loserId: string;
  readonly method: "authority" | "confidence" | "recency" | "success_rate" | "context" | "evidence";
  readonly rationale: string;
  readonly winnerScore: number;
  readonly loserScore: number;
  readonly durationMs: number;
}

// ── Decision ──────────────────────────────────────────────────────────────────

export interface DiscardedAlternative {
  readonly ruleId: string;
  readonly title: string;
  readonly discardReason: string;
  readonly score: number;
}

export interface ReasoningDecision {
  readonly id: string;
  readonly createdAt: number;
  readonly goal: string;
  readonly conclusion: string;
  readonly justification: string;
  readonly inferenceChain: InferenceChain;
  readonly rulesUsed: readonly string[];
  readonly confidence: number;
  readonly authority: number;
  readonly conflicts: readonly Conflict[];
  readonly conflictResolutions: readonly ConflictResolution[];
  readonly discardedAlternatives: readonly DiscardedAlternative[];
  readonly isTemporary: true;
  readonly explainability: ExplainabilityReport;
}

// ── Explainability ────────────────────────────────────────────────────────────

export interface ExplainabilityReport {
  readonly conclusion: string;
  readonly justification: string;
  readonly rulesApplied: readonly { ruleId: string; title: string; contribution: number }[];
  readonly inferenceTrace: readonly string[];
  readonly confidence: number;
  readonly authority: number;
}

// ── Reasoning Graph ───────────────────────────────────────────────────────────

export type ReasoningNodeKind = "knowledge" | "inference" | "decision" | "conflict" | "context";
export type ReasoningEdgeRelation = "supports" | "contradicts" | "requires" | "derived_from" | "related_to";

export interface ReasoningNode {
  readonly id: string;
  readonly kind: ReasoningNodeKind;
  readonly label: string;
  readonly confidence: number;
  readonly isTemporary: boolean;
}

export interface ReasoningEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: ReasoningEdgeRelation;
  readonly weight: number;
}

export interface ReasoningGraph {
  readonly id: string;
  readonly builtAt: number;
  readonly contextId: string;
  readonly nodes: readonly ReasoningNode[];
  readonly edges: readonly ReasoningEdge[];
  readonly isTemporary: true;
}

// ── Reasoning Metrics ─────────────────────────────────────────────────────────

export interface ReasoningMetrics {
  readonly knowledgeRetrieved: number;
  readonly knowledgeMatched: number;
  readonly inferenceCount: number;
  readonly inferenceDepth: number;
  readonly conflictCount: number;
  readonly conflictResolutionTimeMs: number;
  readonly decisionConfidence: number;
  readonly decisionAuthority: number;
  readonly avgReasoningTimeMs: number;
  readonly reasoningAccuracy: number;
}

// ── Reasoning Report ──────────────────────────────────────────────────────────

export interface ReasoningReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly contextId: string;
  readonly goal: string;
  readonly knowledgeRetrieved: readonly RetrievedRule[];
  readonly rulesUsed: readonly string[];
  readonly inferenceChain: InferenceChain;
  readonly conflicts: readonly Conflict[];
  readonly conflictResolutions: readonly ConflictResolution[];
  readonly decision: ReasoningDecision;
  readonly metrics: ReasoningMetrics;
  readonly reasoningGraph: ReasoningGraph;
  readonly summary: string;
}