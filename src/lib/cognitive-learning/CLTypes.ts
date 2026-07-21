/**
 * CLTypes.ts — Sprint EF-51 · Cognitive Learning Engine Types
 *
 * Tipos canônicos para o pipeline:
 *   EpisodeStore → EpisodeAnalyzer → PatternMiner → KnowledgeExtractor
 *   → KnowledgeValidator → KnowledgeStore
 *
 * Imutável. Append-only. Sem dependências de runtime externas.
 */

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeCLId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Episode (consumed read-only from EF-50 output) ────────────────────────────

export interface Episode {
  readonly id: string;
  readonly createdAt: number;
  readonly goal: string;
  readonly intent: string;
  readonly context: string;
  readonly strategy: string;
  readonly capabilities: readonly string[];
  readonly connectorChain: readonly string[];
  readonly result: string;
  readonly success: boolean;
  readonly failure: boolean;
  readonly confidence: number;       // 0–1
  readonly authority: number;        // 0–1
  readonly cost: number;             // 0–10
  readonly durationMs: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ── Analyzed Episode ──────────────────────────────────────────────────────────

export interface AnalyzedEpisode {
  readonly id: string;
  readonly episodeId: string;
  readonly analyzedAt: number;
  readonly goal: string;
  readonly intent: string;
  readonly strategy: string;
  readonly capabilitySignature: string;   // sorted capabilities joined
  readonly connectorSignature: string;    // sorted connectors joined
  readonly outcomeLabel: "success" | "partial" | "failure";
  readonly confidence: number;
  readonly authority: number;
  readonly cost: number;
  readonly durationMs: number;
  readonly tags: readonly string[];
}

// ── Candidate Pattern ─────────────────────────────────────────────────────────

export type PatternKind =
  | "capability_sequence"
  | "goal_type"
  | "execution_flow"
  | "success_pattern"
  | "failure_pattern"
  | "error_pattern"
  | "connector_chain";

export interface CandidatePattern {
  readonly id: string;
  readonly discoveredAt: number;
  readonly kind: PatternKind;
  readonly signature: string;         // canonical key for deduplication
  readonly description: string;
  readonly frequency: number;         // number of episodes matching
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;       // 0–1
  readonly avgConfidence: number;
  readonly avgAuthority: number;
  readonly avgCost: number;
  readonly avgDurationMs: number;
  readonly supportingEpisodeIds: readonly string[];
  readonly generalizationScore: number; // 0–1
}

// ── Knowledge Rule ────────────────────────────────────────────────────────────

export type KnowledgeStatus = "candidate" | "validated" | "promoted" | "deprecated";

export interface KnowledgeCondition {
  readonly field: string;
  readonly operator: "equals" | "contains" | "gte" | "lte" | "in";
  readonly value: unknown;
}

export interface KnowledgeConsequence {
  readonly action: string;
  readonly target: string;
  readonly weight: number;    // 0–1
  readonly explanation: string;
}

export interface KnowledgeRule {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly patternId: string;
  readonly title: string;
  readonly description: string;
  readonly conditions: readonly KnowledgeCondition[];
  readonly consequences: readonly KnowledgeConsequence[];
  readonly confidence: number;       // 0–1
  readonly authority: number;        // 0–1
  readonly successRate: number;      // 0–1
  readonly frequency: number;
  readonly generalizationScore: number;
  readonly originEpisodeIds: readonly string[];
  readonly status: KnowledgeStatus;
  readonly revision: number;
  readonly promotedAt: number | null;
  readonly deprecatedAt: number | null;
  readonly deprecationReason: string | null;
  readonly evidence: readonly string[];
}

// ── Knowledge Graph ───────────────────────────────────────────────────────────

export interface KnowledgeNode {
  readonly id: string;
  readonly ruleId: string;
  readonly label: string;
  readonly kind: "goal" | "strategy" | "capability" | "connector" | "pattern" | "anti_pattern";
  readonly weight: number;
}

export interface KnowledgeEdge {
  readonly from: string;    // nodeId
  readonly to: string;      // nodeId
  readonly relation: "leads_to" | "requires" | "conflicts_with" | "reinforces" | "derives_from";
  readonly weight: number;
}

export interface KnowledgeGraph {
  readonly id: string;
  readonly builtAt: number;
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
}

// ── Capability Reinforcement ──────────────────────────────────────────────────

export interface CapabilityLearningRecord {
  readonly capability: string;
  readonly score: number;         // 0–100
  readonly confidence: number;    // 0–1
  readonly successRate: number;   // 0–1
  readonly learningWeight: number;// 0–1
  readonly occurrences: number;
  readonly lastSeenAt: number;
}

// ── Strategy Reinforcement ────────────────────────────────────────────────────

export interface StrategyLearningRecord {
  readonly strategy: string;
  readonly learningScore: number;   // 0–100
  readonly executionSuccess: number;
  readonly executionFailure: number;
  readonly avgCost: number;
  readonly avgDurationMs: number;
  readonly weight: number;          // 0–1
  readonly lastSeenAt: number;
}

// ── Anti-Pattern ──────────────────────────────────────────────────────────────

export interface AntiPattern {
  readonly id: string;
  readonly detectedAt: number;
  readonly patternId: string;
  readonly title: string;
  readonly description: string;
  readonly consecutiveFailures: number;
  readonly totalFailures: number;
  readonly strategy: string;
  readonly capabilities: readonly string[];
  readonly recommendation: string;
  readonly severity: "low" | "medium" | "high" | "critical";
}

// ── Learning Policy ───────────────────────────────────────────────────────────

export interface LearningPolicy {
  readonly minimumEpisodes: number;
  readonly minimumConfidence: number;    // 0–1
  readonly minimumSuccessRate: number;   // 0–1
  readonly minimumAuthority: number;     // 0–1
  readonly minimumPatternFrequency: number;
  readonly minimumGeneralizationScore: number; // 0–1
  readonly learningEnabled: boolean;
  readonly automaticPromotion: boolean;
}

export const DEFAULT_LEARNING_POLICY: LearningPolicy = Object.freeze({
  minimumEpisodes:              3,
  minimumConfidence:            0.65,
  minimumSuccessRate:           0.70,
  minimumAuthority:             0.50,
  minimumPatternFrequency:      2,
  minimumGeneralizationScore:   0.40,
  learningEnabled:              true,
  automaticPromotion:           false,
});

// ── Validation Result ─────────────────────────────────────────────────────────

export interface ValidationResult {
  readonly patternId: string;
  readonly approved: boolean;
  readonly rejectionReasons: readonly string[];
  readonly episodesChecked: number;
  readonly confidenceScore: number;
  readonly successRateScore: number;
  readonly frequencyScore: number;
  readonly authorityScore: number;
  readonly generalizationScore: number;
  readonly overallScore: number;   // 0–100
}

// ── Learning Metrics ──────────────────────────────────────────────────────────

export interface LearningMetrics {
  readonly episodesProcessed: number;
  readonly patternsFound: number;
  readonly patternsApproved: number;
  readonly patternsRejected: number;
  readonly knowledgeCreated: number;
  readonly knowledgeUpdated: number;
  readonly knowledgeDeprecated: number;
  readonly knowledgeAccuracy: number;     // 0–1
  readonly patternCoverage: number;       // 0–1
  readonly learningConfidence: number;    // 0–1
  readonly knowledgeGrowth: number;       // delta from last run
  readonly avgLearningTimeMs: number;
  readonly optimizationGain: number;      // 0–1
}

// ── Learning Report ───────────────────────────────────────────────────────────

export interface LearningReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly episodesAnalyzed: number;
  readonly patternsFound: number;
  readonly patternsApproved: number;
  readonly patternsRejected: number;
  readonly knowledgeCreated: number;
  readonly knowledgeUpdated: number;
  readonly knowledgeDeprecated: number;
  readonly metrics: LearningMetrics;
  readonly optimizationSuggestions: readonly string[];
  readonly topPatterns: readonly CandidatePattern[];
  readonly promotedRules: readonly KnowledgeRule[];
  readonly antiPatternsDetected: readonly AntiPattern[];
  readonly capabilityReinforcements: readonly CapabilityLearningRecord[];
  readonly strategyReinforcements: readonly StrategyLearningRecord[];
  readonly knowledgeGraph: KnowledgeGraph;
  readonly summary: string;
}