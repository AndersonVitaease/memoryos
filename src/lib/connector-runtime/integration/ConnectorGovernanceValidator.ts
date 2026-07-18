/**
 * ConnectorGovernanceValidator.ts
 * Validates a connector operation against active governance, security,
 * privacy and compliance policies.
 *
 * SRP: Governance validation only.
 * Sprint: INTEGRATION-04
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { ConnectorKnowledgeContext } from "./ConnectorKnowledgeContext";

export interface GovernanceCheckEntry {
  readonly policyId:   string;
  readonly policyName: string;
  readonly category:   "SECURITY" | "PRIVACY" | "COMPLIANCE" | "CONNECTOR" | "APPROVAL";
  readonly compliant:  boolean;
  readonly reason:     string;
  readonly mandatory:  boolean;
}

export interface ConnectorGovernanceResult {
  readonly requestId:          string;
  readonly checks:             GovernanceCheckEntry[];
  readonly compliant:          boolean;
  readonly violations:         GovernanceCheckEntry[];
  readonly mandatoryApprovals: string[];
  readonly blocked:            boolean;
}

function categoryFor(item: KnowledgeResultItem): GovernanceCheckEntry["category"] {
  const t = (item.title + item.summary).toLowerCase();
  if (t.includes("privacy") || t.includes("gdpr") || t.includes("lgpd")) return "PRIVACY";
  if (t.includes("security") || t.includes("auth"))                       return "SECURITY";
  if (t.includes("approval") || t.includes("review"))                     return "APPROVAL";
  if (t.includes("connector") || t.includes("provider"))                  return "CONNECTOR";
  return "COMPLIANCE";
}

export const ConnectorGovernanceValidator = Object.freeze({

  validate(ctx: ConnectorKnowledgeContext, governance: KnowledgeResultItem[]): ConnectorGovernanceResult {
    const checks: GovernanceCheckEntry[] = governance.map(g => {
      const mandatory = g.priority === "P0" || g.priority === "P1";
      const compliant = !(mandatory && ctx.priority === "CRITICAL");

      return Object.freeze({
        policyId:   g.id,
        policyName: g.title,
        category:   categoryFor(g),
        compliant,
        reason:     compliant
          ? `Policy "${g.title}" satisfied`
          : `Policy "${g.title}" requires explicit approval`,
        mandatory,
      });
    });

    const violations         = checks.filter(c => !c.compliant);
    const mandatoryApprovals = governance
      .filter(g => g.priority === "P0" || g.priority === "P1")
      .map(g => g.title);

    return Object.freeze({
      requestId: ctx.requestId,
      checks,
      compliant:  violations.length === 0,
      violations,
      mandatoryApprovals,
      blocked:    violations.length > 0,
    });
  },
});