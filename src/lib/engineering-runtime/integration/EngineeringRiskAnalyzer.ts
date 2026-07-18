/**
 * EngineeringRiskAnalyzer.ts
 * Analyzes breaking changes, dependency risks, architecture violations,
 * known bugs, regressions, and technical debt.
 *
 * SRP: Risk analysis only.
 * Sprint: INTEGRATION-05
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { EngineeringKnowledgeContext } from "./EngineeringKnowledgeContext";

export type EngineeringRiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface EngineeringRiskEntry {
  readonly id:           string;
  readonly title:        string;
  readonly description:  string;
  readonly level:        EngineeringRiskLevel;
  readonly category:     "BREAKING_CHANGE" | "DEPENDENCY" | "ARCHITECTURE" | "BUG" | "REGRESSION" | "TECH_DEBT" | "ANTI_PATTERN";
  readonly affectedFiles:string[];
  readonly source:       string;
  readonly evidenceScore:number;
}

export interface EngineeringRiskReport {
  readonly taskId:       string;
  readonly overallLevel: EngineeringRiskLevel;
  readonly risks:        EngineeringRiskEntry[];
  readonly blockers:     EngineeringRiskEntry[];
  readonly warnings:     EngineeringRiskEntry[];
  readonly riskScore:    number;  // 0–100
  readonly breakingChangeRisk: boolean;
  readonly regressionRisk:     boolean;
}

const SCORE_MAP: Record<EngineeringRiskLevel, number> = {
  CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, NONE: 0,
};

function levelFor(item: KnowledgeResultItem, ctx: EngineeringKnowledgeContext): EngineeringRiskLevel {
  if (ctx.priority === "CRITICAL" && item.evidenceScore >= 60) return "CRITICAL";
  if (item.evidenceScore >= 80) return "HIGH";
  if (item.evidenceScore >= 50) return "MEDIUM";
  return "LOW";
}

function categoryFor(item: KnowledgeResultItem): EngineeringRiskEntry["category"] {
  const t = (item.title + item.summary).toLowerCase();
  if (t.includes("breaking") || t.includes("breaking change"))    return "BREAKING_CHANGE";
  if (t.includes("regression") || t.includes("broke"))            return "REGRESSION";
  if (t.includes("architecture") || t.includes("violation"))      return "ARCHITECTURE";
  if (t.includes("dependency") || t.includes("circular"))         return "DEPENDENCY";
  if (t.includes("bug") || t.includes("defect"))                   return "BUG";
  if (t.includes("debt") || t.includes("legacy"))                  return "TECH_DEBT";
  return "ANTI_PATTERN";
}

function overallLevel(risks: EngineeringRiskEntry[]): EngineeringRiskLevel {
  if (risks.some(r => r.level === "CRITICAL")) return "CRITICAL";
  if (risks.some(r => r.level === "HIGH"))     return "HIGH";
  if (risks.some(r => r.level === "MEDIUM"))   return "MEDIUM";
  if (risks.length > 0)                        return "LOW";
  return "NONE";
}

export const EngineeringRiskAnalyzer = Object.freeze({

  analyze(
    ctx:          EngineeringKnowledgeContext,
    knownIssues:  KnowledgeResultItem[],
    antiPatterns: KnowledgeResultItem[],
    governance:   KnowledgeResultItem[],
  ): EngineeringRiskReport {
    const allItems = [...knownIssues, ...antiPatterns,
      ...governance.filter(g => g.priority === "P0" || g.priority === "P1")];

    const risks: EngineeringRiskEntry[] = allItems.map(item => ({
      id:            item.id,
      title:         item.title,
      description:   item.summary,
      level:         levelFor(item, ctx),
      category:      categoryFor(item),
      affectedFiles: [...ctx.files],
      source:        item.source,
      evidenceScore: item.evidenceScore,
    }));

    const blockers = risks.filter(r => r.level === "CRITICAL" || r.level === "HIGH");
    const warnings = risks.filter(r => r.level === "MEDIUM"   || r.level === "LOW");
    const riskScore = risks.length > 0
      ? Math.round(risks.reduce((s, r) => s + SCORE_MAP[r.level], 0) / risks.length)
      : 0;

    return Object.freeze({
      taskId:             ctx.taskId,
      overallLevel:       overallLevel(risks),
      risks, blockers, warnings, riskScore,
      breakingChangeRisk: risks.some(r => r.category === "BREAKING_CHANGE" || r.category === "ARCHITECTURE"),
      regressionRisk:     risks.some(r => r.category === "REGRESSION"      || r.category === "BUG"),
    });
  },
});