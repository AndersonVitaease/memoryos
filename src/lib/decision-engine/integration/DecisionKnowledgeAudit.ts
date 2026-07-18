/**
 * DecisionKnowledgeAudit.ts
 * Append-only audit log for decision knowledge pipeline runs.
 *
 * SRP: Audit only.
 * Sprint: INTEGRATION-03
 */

import type { DecisionType } from "./DecisionKnowledgeContext";

export interface DecisionKnowledgeAuditEntry {
  readonly id:               string;   // DKA-NNN
  readonly decisionId:       string;
  readonly timestamp:        string;
  readonly intent:           string;
  readonly knowledgeUsed:    string[];
  readonly governanceUsed:   string[];
  readonly risksFound:       number;
  readonly blockers:         number;
  readonly constraintsTotal: number;
  readonly confidence:       number;
  readonly recommendedDecision: DecisionType;
  readonly durationMs:       number;
}

let _counter = 0;
const _entries: DecisionKnowledgeAuditEntry[] = [];

export const DecisionKnowledgeAudit = Object.freeze({

  log(e: Omit<DecisionKnowledgeAuditEntry, "id">): DecisionKnowledgeAuditEntry {
    _counter++;
    const full = { ...e, id: `DKA-${String(_counter).padStart(3, "0")}` };
    _entries.push(full);
    return full;
  },

  getAll(): DecisionKnowledgeAuditEntry[] {
    return [..._entries].reverse();
  },

  getTimeline() {
    return [..._entries].reverse().map(e => ({
      id:          e.id,
      decisionId:  e.decisionId,
      intent:      e.intent,
      recommended: e.recommendedDecision,
      confidence:  e.confidence,
      risks:       e.risksFound,
      durationMs:  e.durationMs,
      timestamp:   e.timestamp,
    }));
  },

  reset(): void { _entries.length = 0; _counter = 0; },
});