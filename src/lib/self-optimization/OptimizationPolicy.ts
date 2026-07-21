/**
 * OptimizationPolicy.ts — Sprint EF-53
 *
 * SRP: definir thresholds e regras de política para recomendações.
 * Imutável. Sem efeitos colaterais.
 */

export interface OptimizationPolicyConfig {
  readonly minSuccessRateWarning: number;     // below this → warning
  readonly minSuccessRateCritical: number;    // below this → critical
  readonly maxAvgDurationMs: number;          // above this → slow
  readonly maxPlanDepth: number;              // above this → too complex
  readonly minKnowledgeConfidence: number;    // below this → stale/low quality
  readonly minReasoningConfidence: number;    // below this → reasoning degraded
  readonly maxConflictRate: number;           // above this → too many conflicts
  readonly maxCost: number;                   // above this → expensive
  readonly minCapabilityUsageRate: number;    // below this → unused capability
  readonly minConnectorSuccessRate: number;   // below this → degraded connector
}

export const DEFAULT_OPTIMIZATION_POLICY: OptimizationPolicyConfig = Object.freeze({
  minSuccessRateWarning:    0.70,
  minSuccessRateCritical:   0.50,
  maxAvgDurationMs:         5000,
  maxPlanDepth:             8,
  minKnowledgeConfidence:   0.55,
  minReasoningConfidence:   0.60,
  maxConflictRate:          0.30,
  maxCost:                  7,
  minCapabilityUsageRate:   0.05,
  minConnectorSuccessRate:  0.75,
});