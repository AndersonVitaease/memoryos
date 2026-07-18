/**
 * EngineeringConfidenceCalculator.ts
 * Calculates engineering confidence for a task.
 *
 * SRP: Confidence calculation only.
 * Sprint: INTEGRATION-05
 *
 * Formula:
 *   35% avg evidence score
 *   25% avg confidence score
 *   20% governance compliance
 *   10% knowledge volume (log-normalized)
 *    5% regression history penalty
 *    5% breaking change penalty
 */

import type { KnowledgeResultItem }           from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { EngineeringGovernanceResult }   from "./EngineeringGovernanceValidator";
import type { EngineeringRiskReport }         from "./EngineeringRiskAnalyzer";

export interface EngineeringConfidence {
  readonly score:     number;  // 0–1
  readonly level:     "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  readonly breakdown: { evidence: number; confidence: number; governance: number; volume: number; regression: number; breaking: number };
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function levelFor(score: number): EngineeringConfidence["level"] {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.70) return "HIGH";
  if (score >= 0.50) return "MEDIUM";
  if (score >= 0.30) return "LOW";
  return "INSUFFICIENT";
}

export const EngineeringConfidenceCalculator = Object.freeze({

  calculate(
    supporting: KnowledgeResultItem[],
    govResult:  EngineeringGovernanceResult,
    risk:       EngineeringRiskReport,
  ): EngineeringConfidence {
    const evidence   = avg(supporting.map(i => i.evidenceScore / 100)) * 0.35;
    const confidence = avg(supporting.map(i => i.confidence))          * 0.25;
    const govScore   = (govResult.compliant ? 1.0 : 0.4)               * 0.20;
    const volume     = Math.min(1, Math.log10(supporting.length + 1) / Math.log10(20)) * 0.10;
    const regression = Math.max(0, 1 - (risk.regressionRisk    ? 0.5 : 0))  * 0.05;
    const breaking   = Math.max(0, 1 - (risk.breakingChangeRisk ? 0.5 : 0)) * 0.05;

    const score = Math.round((evidence + confidence + govScore + volume + regression + breaking) * 1000) / 1000;

    return Object.freeze({
      score,
      level:     levelFor(score),
      breakdown: { evidence, confidence, governance: govScore, volume, regression, breaking },
    });
  },
});