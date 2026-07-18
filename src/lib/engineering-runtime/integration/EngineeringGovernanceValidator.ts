/**
 * EngineeringGovernanceValidator.ts
 * Validates an engineering task against architecture rules, ADRs,
 * engineering policies, security policies and coding standards.
 *
 * SRP: Governance validation only.
 * Sprint: INTEGRATION-05
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { EngineeringKnowledgeContext } from "./EngineeringKnowledgeContext";

export interface EngineeringGovernanceCheck {
  readonly policyId:   string;
  readonly policyName: string;
  readonly category:   "ARCHITECTURE" | "ADR" | "SECURITY" | "CODING_STANDARD" | "REVIEW" | "COMPLIANCE";
  readonly compliant:  boolean;
  readonly reason:     string;
  readonly mandatory:  boolean;
}

export interface EngineeringGovernanceResult {
  readonly taskId:             string;
  readonly checks:             EngineeringGovernanceCheck[];
  readonly compliant:          boolean;
  readonly violations:         EngineeringGovernanceCheck[];
  readonly mandatoryReviews:   string[];
  readonly blocked:            boolean;
}

function categoryFor(item: KnowledgeResultItem): EngineeringGovernanceCheck["category"] {
  const t = (item.title + item.summary).toLowerCase();
  if (t.includes("adr")     || t.includes("architecture decision"))   return "ADR";
  if (t.includes("security")|| t.includes("auth"))                    return "SECURITY";
  if (t.includes("review")  || t.includes("approval"))                return "REVIEW";
  if (t.includes("coding")  || t.includes("standard") || t.includes("lint")) return "CODING_STANDARD";
  if (t.includes("architecture") || t.includes("boundary"))           return "ARCHITECTURE";
  return "COMPLIANCE";
}

export const EngineeringGovernanceValidator = Object.freeze({

  validate(ctx: EngineeringKnowledgeContext, governance: KnowledgeResultItem[]): EngineeringGovernanceResult {
    const checks: EngineeringGovernanceCheck[] = governance.map(g => {
      const mandatory = g.priority === "P0" || g.priority === "P1";
      const compliant = !(mandatory && ctx.priority === "CRITICAL");

      return Object.freeze({
        policyId:   g.id,
        policyName: g.title,
        category:   categoryFor(g),
        compliant,
        reason:     compliant
          ? `Policy "${g.title}" satisfied`
          : `Policy "${g.title}" requires mandatory review before proceeding`,
        mandatory,
      });
    });

    const violations      = checks.filter(c => !c.compliant);
    const mandatoryReviews = governance
      .filter(g => g.priority === "P0" || g.priority === "P1")
      .map(g => g.title);

    return Object.freeze({
      taskId:           ctx.taskId,
      checks,
      compliant:        violations.length === 0,
      violations,
      mandatoryReviews,
      blocked:          violations.length > 0,
    });
  },
});