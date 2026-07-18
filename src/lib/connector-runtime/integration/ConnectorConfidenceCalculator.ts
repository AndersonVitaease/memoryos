/**
 * ConnectorConfidenceCalculator.ts
 * Calculates execution confidence for a connector operation.
 *
 * SRP: Confidence calculation only.
 * Sprint: INTEGRATION-04
 *
 * Formula:
 *   35% avg evidence score of supporting items
 *   25% avg confidence score
 *   20% governance compliance
 *   10% knowledge volume (log-normalized)
 *    5% incident/failure penalty
 *    5% conflict penalty
 */

import type { KnowledgeResultItem }        from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { ConnectorGovernanceResult }  from "./ConnectorGovernanceValidator";
import type { ConnectorRiskReport }        from "./ConnectorRiskAnalyzer";

export interface ConnectorExecutionConfidence {
  readonly score:     number;  // 0–1
  readonly level:     "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  readonly breakdown: { evidence: number; confidence: number; governance: number; volume: number; incidents: number; conflicts: number };
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function levelFor(score: number): ConnectorExecutionConfidence["level"] {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.70) return "HIGH";
  if (score >= 0.50) return "MEDIUM";
  if (score >= 0.30) return "LOW";
  return "INSUFFICIENT";
}

export const ConnectorConfidenceCalculator = Object.freeze({

  calculate(
    supporting: KnowledgeResultItem[],
    govResult:  ConnectorGovernanceResult,
    risk:       ConnectorRiskReport,
    conflicts:  number,
  ): ConnectorExecutionConfidence {
    const evidence   = avg(supporting.map(i => i.evidenceScore / 100)) * 0.35;
    const confidence = avg(supporting.map(i => i.confidence))          * 0.25;
    const govScore   = (govResult.compliant ? 1.0 : 0.4)               * 0.20;
    const volume     = Math.min(1, Math.log10(supporting.length + 1) / Math.log10(20)) * 0.10;
    const incidents  = Math.max(0, 1 - risk.blockers.length * 0.1)     * 0.05;
    const conflictP  = Math.max(0, 1 - conflicts * 0.05)               * 0.05;

    const score = Math.round((evidence + confidence + govScore + volume + incidents + conflictP) * 1000) / 1000;

    return Object.freeze({
      score,
      level:     levelFor(score),
      breakdown: { evidence, confidence, governance: govScore, volume, incidents, conflicts: conflictP },
    });
  },
});