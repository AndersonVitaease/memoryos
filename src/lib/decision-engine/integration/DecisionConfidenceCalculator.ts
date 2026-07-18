/**
 * DecisionConfidenceCalculator.ts
 * Calculates overall decision confidence from knowledge signals.
 *
 * SRP: Confidence calculation only.
 * Sprint: INTEGRATION-03
 *
 * Formula:
 *   40% avg evidence score of supporting items
 *   30% avg confidence of supporting items
 *   15% governance compliance (1.0 = fully compliant)
 *   10% knowledge volume (log-normalized)
 *    5% conflict penalty
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { GovernanceValidationResult } from "./DecisionGovernanceValidator";

export interface DecisionConfidence {
  readonly score:       number;   // 0–1
  readonly level:       "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  readonly breakdown:   { evidence: number; confidence: number; governance: number; volume: number; conflicts: number };
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function level(score: number): DecisionConfidence["level"] {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.70) return "HIGH";
  if (score >= 0.50) return "MEDIUM";
  if (score >= 0.30) return "LOW";
  return "INSUFFICIENT";
}

export const DecisionConfidenceCalculator = Object.freeze({

  calculate(
    supporting:   KnowledgeResultItem[],
    governance:   GovernanceValidationResult,
    conflictCount:number,
  ): DecisionConfidence {
    const evidence   = avg(supporting.map(i => i.evidenceScore / 100)) * 0.40;
    const confidence = avg(supporting.map(i => i.confidence))          * 0.30;
    const govScore   = (governance.compliant ? 1.0 : 0.5)              * 0.15;
    const volume     = Math.min(1, Math.log10(supporting.length + 1) / Math.log10(20)) * 0.10;
    const penalty    = Math.max(0, 1 - conflictCount * 0.05)           * 0.05;

    const score = Math.round((evidence + confidence + govScore + volume + penalty) * 1000) / 1000;

    return {
      score,
      level:     level(score),
      breakdown: { evidence, confidence, governance: govScore, volume, conflicts: penalty },
    };
  },
});