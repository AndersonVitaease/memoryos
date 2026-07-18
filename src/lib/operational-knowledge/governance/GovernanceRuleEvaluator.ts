/**
 * GovernanceRuleEvaluator.ts
 * Evaluates individual governance rules against a context.
 *
 * Authority: ENGINEERING
 * SRP: Rule evaluation only — no policy loading, no decision resolution.
 * Sprint: KB-05
 *
 * Deterministic. Zero AI. All operators implemented locally.
 */

import type {
  GovernanceCondition, GovernanceRule, GovernanceEvaluationContext, RuleMatch,
} from "./GovernancePolicyTypes";

function getField(ctx: GovernanceEvaluationContext, field: string): unknown {
  return (ctx as Record<string, unknown>)[field];
}

function evaluate(ctx: GovernanceEvaluationContext, cond: GovernanceCondition): boolean {
  const val = getField(ctx, cond.field);

  switch (cond.operator) {
    case "GTE":       return typeof val === "number" && val >= (cond.value as number);
    case "GT":        return typeof val === "number" && val >  (cond.value as number);
    case "LTE":       return typeof val === "number" && val <= (cond.value as number);
    case "LT":        return typeof val === "number" && val <  (cond.value as number);
    case "EQ":        return val === cond.value;
    case "NEQ":       return val !== cond.value;
    case "IN":        return Array.isArray(cond.value) && cond.value.includes(val as string);
    case "NOT_IN":    return Array.isArray(cond.value) && !cond.value.includes(val as string);
    case "CONTAINS":  return typeof val === "string" && val.toLowerCase().includes(String(cond.value).toLowerCase());
    case "EXISTS":    return val !== undefined && val !== null && val !== "";
    case "NOT_EXISTS":return val === undefined || val === null || val === "";
    default:          return false;
  }
}

export const GovernanceRuleEvaluator = Object.freeze({

  /**
   * Evaluate a single rule against a context.
   * All conditions use AND logic within a rule.
   */
  evaluateRule(rule: GovernanceRule, ctx: GovernanceEvaluationContext): RuleMatch {
    if (!rule.enabled) {
      return { ruleId: rule.id, ruleName: rule.name, decision: rule.decision, priority: rule.priority, reason: "Rule is disabled", matched: false };
    }

    const allPass = rule.conditions.every(cond => evaluate(ctx, cond));

    return {
      ruleId:   rule.id,
      ruleName: rule.name,
      decision: rule.decision,
      priority: rule.priority,
      reason:   rule.reason,
      matched:  allPass,
    };
  },

  /**
   * Evaluate all rules in a list, return matched + rejected separately.
   */
  evaluateAll(rules: readonly GovernanceRule[], ctx: GovernanceEvaluationContext): {
    matched:  RuleMatch[];
    rejected: RuleMatch[];
  } {
    const matched:  RuleMatch[] = [];
    const rejected: RuleMatch[] = [];

    for (const rule of rules) {
      const result = GovernanceRuleEvaluator.evaluateRule(rule, ctx);
      if (result.matched) matched.push(result);
      else                rejected.push(result);
    }

    return { matched, rejected };
  },
});