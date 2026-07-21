/**
 * KnowledgeRetriever.ts — Sprint EF-52
 *
 * SRP: recuperar KnowledgeRules relevantes do KnowledgeStore (read-only).
 *
 * Critérios: goal, intent, capabilities, context, authority, confidence,
 * recência e similaridade.
 *
 * NÃO modifica o KnowledgeStore.
 * NÃO descarta regras sem critério explícito.
 */

import type { KnowledgeRule } from "@/lib/cognitive-learning/CLTypes";
import { KnowledgeStore }     from "@/lib/cognitive-learning/KnowledgeStore";
import type { ReasoningContext, RetrievedRule } from "./KRTypes";

const MIN_RELEVANCE = 0.10;

function computeRelevance(rule: KnowledgeRule, ctx: ReasoningContext): number {
  let score = 0;

  // Goal match (title or evidence contains goal tokens)
  const goalTokens = ctx.goal.toLowerCase().split(/[\s_]/);
  const titleLower = rule.title.toLowerCase();
  const matchedGoal = goalTokens.filter(t => t.length > 2 && titleLower.includes(t)).length;
  score += matchedGoal * 0.20;

  // Intent match
  if (rule.evidence.some(e => e.toLowerCase().includes(ctx.intent.toLowerCase()))) {
    score += 0.15;
  }

  // Capability overlap
  const caps = ctx.capabilities.map(c => c.toLowerCase());
  const conditionValues = rule.conditions.map(c => String(c.value).toLowerCase());
  const capMatches = caps.filter(c => conditionValues.some(v => v.includes(c))).length;
  score += Math.min(capMatches * 0.10, 0.20);

  // Confidence weight
  score += rule.confidence * 0.15;

  // Authority weight
  score += rule.authority * 0.15;

  // Success rate weight
  score += rule.successRate * 0.10;

  // Recency (last updated in last 24h gets bonus)
  const ageMs = Date.now() - rule.updatedAt;
  const recency = Math.max(0, 1 - ageMs / (7 * 24 * 3600 * 1000));
  score += recency * 0.05;

  return Math.min(score, 1);
}

function computeRecency(rule: KnowledgeRule): number {
  const ageMs = Date.now() - rule.updatedAt;
  return Math.max(0, 1 - ageMs / (30 * 24 * 3600 * 1000));
}

function matchedFields(rule: KnowledgeRule, ctx: ReasoningContext): string[] {
  const fields: string[] = [];
  const goalTokens = ctx.goal.toLowerCase().split(/[\s_]/);
  if (goalTokens.some(t => t.length > 2 && rule.title.toLowerCase().includes(t))) fields.push("goal");
  if (rule.evidence.some(e => e.toLowerCase().includes(ctx.intent.toLowerCase()))) fields.push("intent");
  const caps = ctx.capabilities.map(c => c.toLowerCase());
  const condVals = rule.conditions.map(c => String(c.value).toLowerCase());
  if (caps.some(c => condVals.some(v => v.includes(c)))) fields.push("capabilities");
  if (rule.confidence > 0.7) fields.push("confidence");
  if (rule.authority > 0.6)  fields.push("authority");
  return fields;
}

export class KnowledgeRetriever {
  /**
   * Retrieve relevant rules from the KnowledgeStore for a given ReasoningContext.
   * Returns rules sorted by relevance (descending), filtered by MIN_RELEVANCE.
   */
  retrieve(ctx: ReasoningContext, maxRules = 20): readonly RetrievedRule[] {
    const allRules = KnowledgeStore.getAll();

    return allRules
      .map(rule => {
        const relevanceScore = computeRelevance(rule, ctx);
        const recencyScore   = computeRecency(rule);
        return { rule, relevanceScore, recencyScore };
      })
      .filter(({ relevanceScore }) => relevanceScore >= MIN_RELEVANCE)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxRules)
      .map(({ rule, relevanceScore, recencyScore }) => Object.freeze({
        ruleId:        rule.id,
        title:         rule.title,
        description:   rule.description,
        confidence:    rule.confidence,
        authority:     rule.authority,
        successRate:   rule.successRate,
        frequency:     rule.frequency,
        relevanceScore,
        recencyScore,
        matchedFields: Object.freeze(matchedFields(rule, ctx)),
        evidence:      rule.evidence,
        conditions:    rule.conditions,
        consequences:  rule.consequences,
      }));
  }
}