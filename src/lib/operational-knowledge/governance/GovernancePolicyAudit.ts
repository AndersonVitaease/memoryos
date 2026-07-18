/**
 * GovernancePolicyAudit.ts
 * Append-only audit log for all governance decisions.
 *
 * Authority: ENGINEERING
 * SRP: Audit logging only — append-only, no reads modify state.
 * Sprint: KB-05
 */

import type { GovernanceAuditEntry, GovernanceResult } from "./GovernancePolicyTypes";
import { GovernancePolicyRegistry } from "./GovernancePolicyRegistry";

let _counter = 0;
const _entries: GovernanceAuditEntry[] = [];

function nextId(): string {
  _counter++;
  return `GAU-${String(_counter).padStart(3, "0")}`;
}

export const GovernancePolicyAudit = Object.freeze({

  log(result: GovernanceResult, reviewer = "SYSTEM"): GovernanceAuditEntry {
    const winnerRule  = result.matchedRules[0];
    const policy      = GovernancePolicyRegistry.getById(result.appliedPolicyId);

    const entry: GovernanceAuditEntry = {
      id:            nextId(),
      timestamp:     result.timestamp,
      captureId:     result.captureId,
      reviewId:      result.reviewId,
      policyId:      result.appliedPolicyId,
      policyVersion: policy?.version ?? "unknown",
      ruleId:        winnerRule?.ruleId  ?? "none",
      ruleName:      winnerRule?.ruleName ?? "none",
      decision:      result.finalDecision,
      reason:        result.reason,
      reviewer,
      evidenceScore: 0,
      confidence:    result.confidence,
    };

    _entries.push(entry);
    return entry;
  },

  getAll(): GovernanceAuditEntry[] {
    return [..._entries].reverse();
  },

  getTimeline(): Array<{ id: string; timestamp: string; event: string; reviewer: string; result: string }> {
    return [..._entries].reverse().map(e => ({
      id:        e.id,
      timestamp: e.timestamp,
      event:     `${e.decision} · ${e.captureId} via ${e.policyId}/${e.ruleId}`,
      reviewer:  e.reviewer,
      result:    e.reason,
    }));
  },

  reset(): void {
    _entries.length = 0;
    _counter = 0;
  },
});