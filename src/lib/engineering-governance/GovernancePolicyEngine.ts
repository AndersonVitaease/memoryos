/**
 * GovernancePolicyEngine.ts — Sprint 6.2.2
 * Immutable engineering policies. Cannot be changed at runtime.
 * Every proposal is validated against all policies before governance approval.
 */

import { ENGINEERING_POLICIES, PROTECTED_COMPONENTS } from "./GovernanceTypes";
import type { GovernanceProposal } from "./GovernanceTypes";

const PROTECTED_SET = new Set(PROTECTED_COMPONENTS);

export class GovernancePolicyEngine {
  // Policies are read-only — never expose a setter
  get policies(): readonly string[] { return ENGINEERING_POLICIES; }

  validate(proposal: GovernanceProposal): string[] {
    const violations: string[] = [];

    // 1. Never modify Core automatically
    if (proposal.impact.protectedFilesHit.length > 0 && proposal.status !== "APPROVED") {
      violations.push(`Policy violated: "Never modify Core automatically" — protected: ${proposal.impact.protectedFilesHit.join(", ")}`);
    }

    // 2. Never bypass Approval Gate
    if (proposal.requestedPermission === "IMPLEMENT" && proposal.requiresApproval && !proposal.approvedAt) {
      violations.push(`Policy violated: "Never bypass the Approval Gate" — IMPLEMENT on protected components requires human approval`);
    }

    // 3. Never disable Regression Shield
    if (/disable.*regression|remove.*regression|bypass.*regression/i.test(proposal.objective)) {
      violations.push(`Policy violated: "Never disable the Regression Shield"`);
    }

    // 4. Never disable Governance
    if (/disable.*governance|bypass.*governance|remove.*governance/i.test(proposal.objective)) {
      violations.push(`Policy violated: "Never disable Governance"`);
    }

    // 5. Never execute destructive actions automatically
    if (/delete all|wipe|drop table|truncate|rm -rf/i.test(proposal.objective) && proposal.status !== "APPROVED") {
      violations.push(`Policy violated: "Never execute destructive actions automatically"`);
    }

    return violations;
  }

  isDestructive(objective: string): boolean {
    return /delete all|wipe|drop|truncate|rm -rf|destroy/i.test(objective);
  }

  touchesCore(components: string[]): boolean {
    return components.some(c => PROTECTED_SET.has(c));
  }
}