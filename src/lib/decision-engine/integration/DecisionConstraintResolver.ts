/**
 * DecisionConstraintResolver.ts
 * Resolves decision constraints from governance and known restrictions.
 *
 * SRP: Constraint resolution only.
 * Sprint: INTEGRATION-03
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { DecisionKnowledgeContext } from "./DecisionKnowledgeContext";

export interface DecisionConstraint {
  readonly id:          string;
  readonly type:        "REQUIRED_REVIEW" | "BLOCKED_COMPONENT" | "DEPENDENCY" | "COMPLIANCE" | "RESTRICTION";
  readonly description: string;
  readonly source:      string;
  readonly mandatory:   boolean;
}

export interface ConstraintReport {
  readonly decisionId:  string;
  readonly constraints: DecisionConstraint[];
  readonly mandatory:   DecisionConstraint[];
  readonly optional:    DecisionConstraint[];
  readonly blocked:     boolean;
}

export const DecisionConstraintResolver = Object.freeze({

  resolve(
    ctx:        DecisionKnowledgeContext,
    governance: KnowledgeResultItem[],
    knownIssues:KnowledgeResultItem[],
  ): ConstraintReport {
    const constraints: DecisionConstraint[] = [];

    // Governance → compliance constraints
    for (const g of governance) {
      constraints.push({
        id:          `C-GOV-${g.id}`,
        type:        "COMPLIANCE",
        description: `Governance policy "${g.title}" must be satisfied`,
        source:      g.id,
        mandatory:   g.priority === "P0" || g.priority === "P1",
      });
    }

    // Known issues → required reviews
    for (const k of knownIssues) {
      if (k.evidenceScore >= 50) {
        constraints.push({
          id:          `C-KI-${k.id}`,
          type:        "REQUIRED_REVIEW",
          description: `Known issue "${k.title}" requires engineering review`,
          source:      k.id,
          mandatory:   k.evidenceScore >= 80,
        });
      }
    }

    // Priority-based constraints
    if (ctx.priority === "CRITICAL") {
      constraints.push({
        id:          "C-CRIT-001",
        type:        "REQUIRED_REVIEW",
        description: "Critical priority decisions require final human approval",
        source:      "SYSTEM",
        mandatory:   true,
      });
    }

    const mandatory = constraints.filter(c => c.mandatory);
    const optional  = constraints.filter(c => !c.mandatory);

    return {
      decisionId:  ctx.decisionId,
      constraints,
      mandatory,
      optional,
      blocked:     mandatory.length > 0,
    };
  },
});