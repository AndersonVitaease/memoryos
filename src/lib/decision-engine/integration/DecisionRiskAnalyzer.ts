/**
 * DecisionRiskAnalyzer.ts
 * Analyzes known issues, anti-patterns, and incidents to produce a risk report.
 *
 * SRP: Risk analysis only.
 * Sprint: INTEGRATION-03
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { DecisionKnowledgeContext } from "./DecisionKnowledgeContext";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface RiskEntry {
  readonly id:          string;
  readonly title:       string;
  readonly description: string;
  readonly level:       RiskLevel;
  readonly source:      string;
  readonly confidence:  number;
}

export interface RiskReport {
  readonly decisionId:   string;
  readonly overallLevel: RiskLevel;
  readonly risks:        RiskEntry[];
  readonly blockers:     RiskEntry[];
  readonly warnings:     RiskEntry[];
  readonly riskScore:    number;   // 0–100
}

function levelFrom(item: KnowledgeResultItem, ctx: DecisionKnowledgeContext): RiskLevel {
  if (item.priority === "CRITICAL" || ctx.priority === "CRITICAL") return "CRITICAL";
  if (item.evidenceScore >= 80)  return "HIGH";
  if (item.evidenceScore >= 50)  return "MEDIUM";
  return "LOW";
}

function toRiskEntry(item: KnowledgeResultItem, ctx: DecisionKnowledgeContext): RiskEntry {
  return {
    id:          item.id,
    title:       item.title,
    description: item.summary,
    level:       levelFrom(item, ctx),
    source:      item.source,
    confidence:  item.confidence,
  };
}

function overallLevel(risks: RiskEntry[]): RiskLevel {
  if (risks.some(r => r.level === "CRITICAL")) return "CRITICAL";
  if (risks.some(r => r.level === "HIGH"))     return "HIGH";
  if (risks.some(r => r.level === "MEDIUM"))   return "MEDIUM";
  if (risks.length > 0)                        return "LOW";
  return "NONE";
}

const LEVEL_SCORE: Record<RiskLevel, number> = { CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, NONE: 0 };

export const DecisionRiskAnalyzer = Object.freeze({

  analyze(
    ctx:          DecisionKnowledgeContext,
    knownIssues:  KnowledgeResultItem[],
    antiPatterns: KnowledgeResultItem[],
    governance:   KnowledgeResultItem[],
  ): RiskReport {
    const issueRisks = knownIssues.map(i => toRiskEntry(i, ctx));
    const patternRisks = antiPatterns.map(i => toRiskEntry(i, ctx));
    const govRisks = governance
      .filter(g => g.tags.includes("HIGH") || g.priority === "P0" || g.priority === "P1")
      .map(i => toRiskEntry(i, ctx));

    const risks    = [...issueRisks, ...patternRisks, ...govRisks];
    const blockers = risks.filter(r => r.level === "CRITICAL" || r.level === "HIGH");
    const warnings = risks.filter(r => r.level === "MEDIUM"   || r.level === "LOW");

    const riskScore = risks.length > 0
      ? Math.round(risks.reduce((s, r) => s + LEVEL_SCORE[r.level], 0) / risks.length)
      : 0;

    return {
      decisionId:   ctx.decisionId,
      overallLevel: overallLevel(risks),
      risks,
      blockers,
      warnings,
      riskScore,
    };
  },
});