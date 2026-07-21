/**
 * KnowledgeExtractor.ts — Sprint EF-51
 *
 * SRP: converter CandidatePatterns em KnowledgeRules (status = "candidate").
 *
 * NÃO valida.
 * NÃO promove.
 * NÃO acessa KnowledgeStore.
 */

import type { CandidatePattern, KnowledgeRule, KnowledgeCondition, KnowledgeConsequence } from "./CLTypes";
import { makeCLId } from "./CLTypes";

function buildConditions(pattern: CandidatePattern): KnowledgeCondition[] {
  const parts = pattern.signature.split("::");
  const conditions: KnowledgeCondition[] = [];

  if (pattern.kind === "capability_sequence") {
    conditions.push({ field: "capabilities", operator: "equals", value: pattern.signature.replace("cap:", "") });
  } else if (pattern.kind === "goal_type") {
    conditions.push({ field: "goal", operator: "equals", value: pattern.signature.replace("goal:", "") });
  } else if (pattern.kind === "execution_flow") {
    if (parts.length >= 2) {
      conditions.push({ field: "strategy",     operator: "equals", value: parts[0].replace("flow:", "") });
      conditions.push({ field: "capabilities", operator: "equals", value: parts[1] });
    }
  } else if (pattern.kind === "success_pattern" || pattern.kind === "failure_pattern") {
    if (parts.length >= 2) {
      conditions.push({ field: "strategy", operator: "equals", value: parts[0].replace(/(success|failure):/, "") });
      conditions.push({ field: "intent",   operator: "equals", value: parts[1] });
    }
  } else if (pattern.kind === "connector_chain") {
    conditions.push({ field: "connectors", operator: "equals", value: pattern.signature.replace("conn:", "") });
  }

  // Confidence gate condition
  conditions.push({ field: "confidence", operator: "gte", value: pattern.avgConfidence });

  return conditions;
}

function buildConsequences(pattern: CandidatePattern): KnowledgeConsequence[] {
  const consequences: KnowledgeConsequence[] = [];

  if (pattern.kind === "success_pattern") {
    consequences.push({
      action:      "prioritize",
      target:      pattern.signature,
      weight:      pattern.successRate,
      explanation: `Pattern succeeds ${(pattern.successRate * 100).toFixed(1)}% of the time — prioritize.`,
    });
  } else if (pattern.kind === "failure_pattern" || pattern.kind === "error_pattern") {
    consequences.push({
      action:      "deprioritize",
      target:      pattern.signature,
      weight:      1 - pattern.successRate,
      explanation: `Pattern fails ${((1 - pattern.successRate) * 100).toFixed(1)}% of the time — deprioritize.`,
    });
  } else if (pattern.kind === "capability_sequence") {
    consequences.push({
      action:      "use_capability_sequence",
      target:      pattern.signature.replace("cap:", ""),
      weight:      pattern.avgConfidence,
      explanation: `Capability sequence seen ${pattern.frequency} times with ${(pattern.successRate * 100).toFixed(1)}% success.`,
    });
  } else if (pattern.kind === "execution_flow") {
    consequences.push({
      action:      "prefer_flow",
      target:      pattern.signature,
      weight:      pattern.avgConfidence * pattern.successRate,
      explanation: `Execution flow recurring with avg confidence ${(pattern.avgConfidence * 100).toFixed(1)}%.`,
    });
  } else {
    consequences.push({
      action:      "record_pattern",
      target:      pattern.signature,
      weight:      pattern.generalizationScore,
      explanation: pattern.description,
    });
  }

  return consequences;
}

export class KnowledgeExtractor {
  /**
   * Convert a list of CandidatePatterns into KnowledgeRules (status=candidate).
   * One rule per pattern.
   */
  extract(patterns: readonly CandidatePattern[]): readonly KnowledgeRule[] {
    return patterns.map(pattern => {
      const now = Date.now();
      const rule: KnowledgeRule = Object.freeze({
        id:                   makeCLId("kr"),
        createdAt:            now,
        updatedAt:            now,
        patternId:            pattern.id,
        title:                pattern.description,
        description:          `Extracted from ${pattern.frequency} episodes · successRate=${(pattern.successRate * 100).toFixed(1)}%`,
        conditions:           Object.freeze(buildConditions(pattern)),
        consequences:         Object.freeze(buildConsequences(pattern)),
        confidence:           pattern.avgConfidence,
        authority:            pattern.avgAuthority,
        successRate:          pattern.successRate,
        frequency:            pattern.frequency,
        generalizationScore:  pattern.generalizationScore,
        originEpisodeIds:     Object.freeze([...pattern.supportingEpisodeIds]),
        status:               "candidate",
        revision:             1,
        promotedAt:           null,
        deprecatedAt:         null,
        deprecationReason:    null,
        evidence:             Object.freeze([pattern.description]),
      });
      return rule;
    });
  }
}