/**
 * DecisionGovernanceValidator.ts
 * Validates a decision against active governance policies.
 *
 * SRP: Governance validation only.
 * Sprint: INTEGRATION-03
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { DecisionKnowledgeContext } from "./DecisionKnowledgeContext";

export interface GovernanceCheck {
  readonly policyId:   string;
  readonly policyName: string;
  readonly compliant:  boolean;
  readonly reason:     string;
  readonly priority:   string;
}

export interface GovernanceValidationResult {
  readonly decisionId:   string;
  readonly checks:       GovernanceCheck[];
  readonly compliant:    boolean;
  readonly violations:   GovernanceCheck[];
  readonly mandatoryApprovals: string[];
}

export const DecisionGovernanceValidator = Object.freeze({

  validate(ctx: DecisionKnowledgeContext, governance: KnowledgeResultItem[]): GovernanceValidationResult {
    const checks: GovernanceCheck[] = governance.map(g => {
      // P0/P1 governance items always require explicit approval
      const requiresApproval = g.priority === "P0" || g.priority === "P1";
      const compliant = !requiresApproval || ctx.priority !== "CRITICAL";

      return {
        policyId:   g.id,
        policyName: g.title,
        compliant,
        reason:     compliant
          ? `Policy "${g.title}" satisfied`
          : `Policy "${g.title}" requires explicit approval — not yet granted`,
        priority:   g.priority,
      };
    });

    const violations = checks.filter(c => !c.compliant);
    const mandatoryApprovals = governance
      .filter(g => g.priority === "P0" || g.priority === "P1")
      .map(g => g.title);

    return {
      decisionId: ctx.decisionId,
      checks,
      compliant:  violations.length === 0,
      violations,
      mandatoryApprovals,
    };
  },
});