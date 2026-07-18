/**
 * ConnectorRiskAnalyzer.ts
 * Analyzes known issues, incidents, rate-limits, timeouts and anti-patterns
 * to produce a connector-specific risk report.
 *
 * SRP: Risk analysis only.
 * Sprint: INTEGRATION-04
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { ConnectorKnowledgeContext } from "./ConnectorKnowledgeContext";

export type ConnectorRiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface ConnectorRiskEntry {
  readonly id:          string;
  readonly title:       string;
  readonly description: string;
  readonly level:       ConnectorRiskLevel;
  readonly category:    "FAILURE" | "RATE_LIMIT" | "TIMEOUT" | "INCIDENT" | "POLICY" | "ANTI_PATTERN";
  readonly source:      string;
  readonly evidenceScore: number;
}

export interface ConnectorRiskReport {
  readonly requestId:    string;
  readonly connector:    string;
  readonly overallLevel: ConnectorRiskLevel;
  readonly risks:        ConnectorRiskEntry[];
  readonly blockers:     ConnectorRiskEntry[];
  readonly warnings:     ConnectorRiskEntry[];
  readonly riskScore:    number;  // 0–100
  readonly retryRisk:    boolean;
  readonly timeoutRisk:  boolean;
}

const SCORE_MAP: Record<ConnectorRiskLevel, number> = {
  CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, NONE: 0,
};

function levelFor(item: KnowledgeResultItem, ctx: ConnectorKnowledgeContext): ConnectorRiskLevel {
  if (ctx.priority === "CRITICAL" && item.evidenceScore >= 60) return "CRITICAL";
  if (item.evidenceScore >= 80) return "HIGH";
  if (item.evidenceScore >= 50) return "MEDIUM";
  return "LOW";
}

function categoryFor(item: KnowledgeResultItem): ConnectorRiskEntry["category"] {
  const t = (item.title + item.summary).toLowerCase();
  if (t.includes("rate limit") || t.includes("quota"))   return "RATE_LIMIT";
  if (t.includes("timeout") || t.includes("latency"))    return "TIMEOUT";
  if (t.includes("incident") || t.includes("outage"))    return "INCIDENT";
  if (t.includes("policy") || t.includes("compliance"))  return "POLICY";
  if (t.includes("anti") || t.includes("pattern"))       return "ANTI_PATTERN";
  return "FAILURE";
}

function overallLevel(risks: ConnectorRiskEntry[]): ConnectorRiskLevel {
  if (risks.some(r => r.level === "CRITICAL")) return "CRITICAL";
  if (risks.some(r => r.level === "HIGH"))     return "HIGH";
  if (risks.some(r => r.level === "MEDIUM"))   return "MEDIUM";
  if (risks.length > 0)                        return "LOW";
  return "NONE";
}

export const ConnectorRiskAnalyzer = Object.freeze({

  analyze(
    ctx:          ConnectorKnowledgeContext,
    knownIssues:  KnowledgeResultItem[],
    antiPatterns: KnowledgeResultItem[],
    governance:   KnowledgeResultItem[],
  ): ConnectorRiskReport {
    const allItems = [...knownIssues, ...antiPatterns,
      ...governance.filter(g => g.priority === "P0" || g.priority === "P1")];

    const risks: ConnectorRiskEntry[] = allItems.map(item => ({
      id:            item.id,
      title:         item.title,
      description:   item.summary,
      level:         levelFor(item, ctx),
      category:      categoryFor(item),
      source:        item.source,
      evidenceScore: item.evidenceScore,
    }));

    const blockers = risks.filter(r => r.level === "CRITICAL" || r.level === "HIGH");
    const warnings = risks.filter(r => r.level === "MEDIUM"   || r.level === "LOW");

    const riskScore = risks.length > 0
      ? Math.round(risks.reduce((s, r) => s + SCORE_MAP[r.level], 0) / risks.length)
      : 0;

    return Object.freeze({
      requestId:   ctx.requestId,
      connector:   ctx.connector,
      overallLevel: overallLevel(risks),
      risks, blockers, warnings, riskScore,
      retryRisk:   risks.some(r => r.category === "TIMEOUT" || r.category === "RATE_LIMIT"),
      timeoutRisk: risks.some(r => r.category === "TIMEOUT"),
    });
  },
});