/**
 * GovernancePolicyMetrics.ts
 * Generates runtime metrics for the Governance Policy Engine.
 *
 * Authority: ENGINEERING
 * SRP: Metrics aggregation only — read-only.
 * Sprint: KB-05
 */

import { GovernancePolicyRegistry } from "./GovernancePolicyRegistry";
import { GovernancePolicyAudit }    from "./GovernancePolicyAudit";
import type { GovernancePolicyMetrics } from "./GovernancePolicyTypes";

export const GovernancePolicyMetricsEngine = Object.freeze({

  generate(): GovernancePolicyMetrics {
    const counts  = GovernancePolicyRegistry.count();
    const audits  = GovernancePolicyAudit.getAll();
    const total   = audits.length;

    const autoDecisions  = audits.filter(a => a.decision === "APPROVE" || a.decision === "ESCALATE").length;
    const humanDecisions = total - autoDecisions;
    const escalations    = audits.filter(a => a.decision === "ESCALATE" || a.decision === "REQUEST_FINAL").length;
    const approvals      = audits.filter(a => a.decision === "APPROVE").length;
    const rejections     = audits.filter(a => a.decision === "REJECT").length;

    // Top policies
    const policyHits: Record<string, number> = {};
    for (const a of audits) policyHits[a.policyId] = (policyHits[a.policyId] ?? 0) + 1;
    const topPolicies = Object.entries(policyHits)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([policyId, hitCount]) => {
        const p = GovernancePolicyRegistry.getById(policyId);
        return { policyId, name: p?.name ?? policyId, hitCount };
      });

    // Top rules
    const ruleHits: Record<string, { name: string; count: number }> = {};
    for (const a of audits) {
      if (!ruleHits[a.ruleId]) ruleHits[a.ruleId] = { name: a.ruleName, count: 0 };
      ruleHits[a.ruleId].count++;
    }
    const topRules = Object.entries(ruleHits)
      .sort(([,a],[,b]) => b.count - a.count).slice(0, 5)
      .map(([ruleId, v]) => ({ ruleId, name: v.name, hitCount: v.count }));

    return {
      activePolicies:    counts.active,
      inactivePolicies:  counts.inactive,
      totalDecisions:    total,
      autoDecisions,
      humanDecisions,
      escalations,
      avgDecisionTimeMs: 0,
      approvalRate:      total > 0 ? Math.round((approvals  / total) * 100) / 100 : 0,
      rejectionRate:     total > 0 ? Math.round((rejections / total) * 100) / 100 : 0,
      topPolicies,
      topRules,
    };
  },
});