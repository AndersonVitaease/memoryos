/**
 * SOTypes.ts — Sprint EF-53 · Self Optimization Engine Types
 *
 * Tipos canônicos para o pipeline de auto-otimização.
 * O engine NUNCA modifica outros módulos — apenas observa e recomenda.
 * Toda recomendação é baseada em evidências, auditável e reproduzível.
 */

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeSOId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Optimization Target ───────────────────────────────────────────────────────

export type OptimizationTarget =
  | "planner"
  | "strategy"
  | "capability"
  | "connector"
  | "authority"
  | "confidence"
  | "knowledge"
  | "reasoning"
  | "execution";

// ── Optimization Priority ─────────────────────────────────────────────────────

export type OptimizationPriority = "critical" | "high" | "medium" | "low";

// ── Optimization Risk ─────────────────────────────────────────────────────────

export type OptimizationRisk = "high" | "medium" | "low" | "none";

// ── Optimization Recommendation ───────────────────────────────────────────────

export interface OptimizationRecommendation {
  readonly id: string;
  readonly createdAt: number;
  readonly target: OptimizationTarget;
  readonly title: string;
  readonly description: string;
  readonly justification: string;
  readonly evidence: readonly string[];
  readonly priority: OptimizationPriority;
  readonly risk: OptimizationRisk;
  readonly expectedImpact: number;       // 0–1
  readonly confidence: number;           // 0–1
  readonly affectedComponents: readonly string[];
  readonly estimatedGain: string;        // human-readable
  readonly isAutomatic: false;           // always false — never auto-applied
}

// ── Optimization Finding ──────────────────────────────────────────────────────

export interface OptimizationFinding {
  readonly id: string;
  readonly detectedAt: number;
  readonly target: OptimizationTarget;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly severity: "critical" | "high" | "medium" | "low" | "info";
  readonly metrics: Readonly<Record<string, number>>;
  readonly evidence: readonly string[];
}

// ── Optimization Metrics ──────────────────────────────────────────────────────

export interface OptimizationMetrics {
  readonly optimizationOpportunities: number;
  readonly avgImprovementScore: number;    // 0–1
  readonly executionGain: number;          // 0–1
  readonly plannerGain: number;            // 0–1
  readonly strategyGain: number;           // 0–1
  readonly capabilityGain: number;         // 0–1
  readonly reasoningGain: number;          // 0–1
  readonly knowledgeGain: number;          // 0–1
  readonly connectorGain: number;          // 0–1
  readonly confidenceGain: number;         // 0–1
}

// ── Optimization History Entry ────────────────────────────────────────────────

export interface OptimizationHistoryEntry {
  readonly id: string;
  readonly recommendationId: string;
  readonly target: OptimizationTarget;
  readonly title: string;
  readonly createdAt: number;
  readonly resolvedAt: number | null;
  readonly accepted: boolean | null;       // null = pending
  readonly improved: boolean | null;       // null = unknown
  readonly notes: string;
}

// ── Optimization Report ───────────────────────────────────────────────────────

export interface OptimizationReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly findings: readonly OptimizationFinding[];
  readonly recommendations: readonly OptimizationRecommendation[];
  readonly metrics: OptimizationMetrics;
  readonly summary: string;
  readonly topImprovements: readonly OptimizationRecommendation[];
}

// ── Input snapshot (read from external modules without modifying them) ─────────

export interface OptimizationSnapshot {
  readonly episodeCount: number;
  readonly avgEpisodeSuccess: number;
  readonly avgEpisodeConfidence: number;
  readonly avgEpisodeAuthority: number;
  readonly avgEpisodeDurationMs: number;
  readonly avgEpisodeCost: number;
  readonly strategyDistribution: Readonly<Record<string, number>>;
  readonly capabilityUsage: Readonly<Record<string, number>>;
  readonly connectorUsage: Readonly<Record<string, number>>;
  readonly knowledgeRuleCount: number;
  readonly knowledgeAvgConfidence: number;
  readonly knowledgeAvgSuccessRate: number;
  readonly reasoningAvgDepth: number;
  readonly reasoningAvgConfidence: number;
  readonly reasoningConflictRate: number;
  readonly reasoningAvgDurationMs: number;
}