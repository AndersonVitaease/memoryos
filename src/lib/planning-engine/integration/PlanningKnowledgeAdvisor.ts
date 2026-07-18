/**
 * PlanningKnowledgeAdvisor.ts
 * Generates structured planning recommendations from resolved knowledge.
 *
 * SRP: Recommendation generation only.
 * Sprint: INTEGRATION-01
 */

import type { RankedItem } from "./PlanningKnowledgeRanking";
import type { PlanningKnowledgeContext } from "./PlanningKnowledgeContext";

export interface PlanningAdvisory {
  readonly goalId:               string;
  readonly recommendedPractices: RecommendationEntry[];
  readonly knownRisks:           RecommendationEntry[];
  readonly avoidPatterns:        RecommendationEntry[];
  readonly importantLessons:     RecommendationEntry[];
  readonly suggestedComponents:  string[];
  readonly requiredReviews:      string[];
  readonly governanceRequirements: GovernanceRequirement[];
  readonly generatedAt:          string;
}

export interface RecommendationEntry {
  readonly id:           string;
  readonly title:        string;
  readonly summary:      string;
  readonly evidenceScore:number;
  readonly confidence:   number;
  readonly kind:         string;
}

export interface GovernanceRequirement {
  readonly policyId:  string;
  readonly name:      string;
  readonly decision:  string;
  readonly priority:  string;
}

function toEntry(r: RankedItem): RecommendationEntry {
  return {
    id:            r.item.id,
    title:         r.item.title,
    summary:       r.item.summary,
    evidenceScore: r.item.evidenceScore,
    confidence:    r.item.confidence,
    kind:          r.item.kind,
  };
}

export const PlanningKnowledgeAdvisor = Object.freeze({

  advise(resolved: RankedItem[], ctx: PlanningKnowledgeContext): PlanningAdvisory {
    const lessons       = resolved.filter(r => r.item.kind === "LESSON");
    const bestPractices = resolved.filter(r => r.item.kind === "BEST_PRACTICE");
    const knownIssues   = resolved.filter(r => r.item.kind === "KNOWN_ISSUE");
    const antiPatterns  = resolved.filter(r => r.item.kind === "ANTI_PATTERN");
    const governance    = resolved.filter(r => r.item.kind === "GOVERNANCE");

    // Suggested components: union of all component lists in top-5 items
    const suggestedComponents = [...new Set(
      resolved.slice(0, 5).flatMap(r => r.item.components)
    )];

    // Required reviews based on known issues + anti-patterns
    const requiredReviews: string[] = [];
    if (knownIssues.length > 0)  requiredReviews.push("Engineering Review — Known Issues detected");
    if (antiPatterns.length > 0) requiredReviews.push("Specialist Review — Anti Patterns detected");
    if (ctx.priority === "CRITICAL") requiredReviews.push("Final Review — Critical priority goal");

    const governanceRequirements: GovernanceRequirement[] = governance.map(g => ({
      policyId: g.item.id,
      name:     g.item.title,
      decision: g.item.tags[0] ?? "REVIEW",
      priority: g.item.priority,
    }));

    return {
      goalId:               ctx.goalId,
      recommendedPractices: bestPractices.slice(0, 5).map(toEntry),
      knownRisks:           knownIssues.slice(0, 5).map(toEntry),
      avoidPatterns:        antiPatterns.slice(0, 5).map(toEntry),
      importantLessons:     lessons.slice(0, 5).map(toEntry),
      suggestedComponents,
      requiredReviews,
      governanceRequirements,
      generatedAt:          new Date().toISOString(),
    };
  },
});