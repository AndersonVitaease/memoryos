/**
 * GovernanceDecisionEngine.ts
 * Applies all active policies and resolves the final governance decision.
 *
 * Authority: ENGINEERING
 * SRP: Decision resolution only — no storage, no audit.
 * Sprint: KB-05
 *
 * Conflict resolution: highest-priority matched rule wins.
 * Deterministic. Reproducible. Zero AI.
 */

import { GovernancePolicyRegistry } from "./GovernancePolicyRegistry";
import { GovernanceRuleEvaluator }  from "./GovernanceRuleEvaluator";
import type {
  GovernanceEvaluationContext, GovernanceResult, GovernanceDecisionType,
  RuleMatch, PolicyPriority,
} from "./GovernancePolicyTypes";

// Priority order — P0 wins over P1, etc.
const PRIORITY_ORDER: Record<PolicyPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

function reviewerLevel(decision: GovernanceDecisionType): "AUTO" | "ENGINEERING" | "SPECIALIST" | "FINAL" {
  switch (decision) {
    case "APPROVE":   return "AUTO";
    case "ESCALATE":  return "AUTO";
    case "MERGE":     return "ENGINEERING";
    case "REQUEST_ENGINEERING": return "ENGINEERING";
    case "REQUEST_SPECIALIST":  return "SPECIALIST";
    case "REQUEST_FINAL":       return "FINAL";
    case "REJECT":    return "ENGINEERING";
    case "ARCHIVE":   return "ENGINEERING";
    default:          return "ENGINEERING";
  }
}

export const GovernanceDecisionEngine = Object.freeze({

  /**
   * Evaluate all active policies against a context and return a GovernanceResult.
   */
  decide(ctx: GovernanceEvaluationContext): GovernanceResult {
    const policies    = GovernancePolicyRegistry.getActive();
    const allRules    = policies.flatMap(p => p.rules);

    const { matched, rejected } = GovernanceRuleEvaluator.evaluateAll(allRules, ctx);

    // Resolve conflict: pick matched rule with highest priority (lowest P-number)
    let winner: RuleMatch | null = null;
    let appliedPolicyId          = "GP-NONE";

    if (matched.length > 0) {
      winner = matched.reduce((best, curr) =>
        PRIORITY_ORDER[curr.priority] < PRIORITY_ORDER[best.priority] ? curr : best
      );
      // Find which policy owns the winning rule
      for (const policy of policies) {
        if (policy.rules.some(r => r.id === winner!.ruleId)) {
          appliedPolicyId = policy.id;
          break;
        }
      }
    }

    const finalDecision: GovernanceDecisionType = winner ? winner.decision : "REQUEST_ENGINEERING";
    const reason = winner
      ? winner.reason
      : "No governance rule matched — defaulting to engineering review";

    // Confidence: ratio of matched rules to total enabled rules
    const enabledCount = allRules.filter(r => r.enabled).length;
    const confidence   = enabledCount > 0
      ? Math.round((matched.length / enabledCount) * 100) / 100
      : 0;

    return {
      captureId:       ctx.captureId,
      reviewId:        ctx.reviewId,
      finalDecision,
      reviewerLevel:   reviewerLevel(finalDecision),
      reason,
      confidence,
      matchedRules:    matched,
      rejectedRules:   rejected,
      appliedPolicyId,
      timestamp:       new Date().toISOString(),
    };
  },
});