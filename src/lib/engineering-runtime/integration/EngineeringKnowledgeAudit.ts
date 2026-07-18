/**
 * EngineeringKnowledgeAudit.ts
 * Append-only audit log for engineering knowledge pipeline runs.
 *
 * SRP: Audit only.
 * Sprint: INTEGRATION-05
 */

import type { EngineeringResult } from "./EngineeringExecutionReport";

export interface EngineeringKnowledgeAuditEntry {
  readonly id:               string;   // EKA-NNN
  readonly taskId:           string;
  readonly task:             string;
  readonly module:           string;
  readonly timestamp:        string;
  readonly knowledgeUsed:    string[];
  readonly governanceUsed:   string[];
  readonly risksFound:       number;
  readonly blockers:         number;
  readonly mandatoryReviews: number;
  readonly requiredTests:    number;
  readonly confidence:       number;
  readonly strategy:         string;
  readonly result:           EngineeringResult;
  readonly durationMs:       number;
}

let _counter = 0;
const _entries: EngineeringKnowledgeAuditEntry[] = [];

export const EngineeringKnowledgeAudit = Object.freeze({

  log(e: Omit<EngineeringKnowledgeAuditEntry, "id">): EngineeringKnowledgeAuditEntry {
    _counter++;
    const full = Object.freeze({ ...e, id: `EKA-${String(_counter).padStart(3, "0")}` });
    _entries.push(full);
    return full;
  },

  getAll(): EngineeringKnowledgeAuditEntry[] {
    return [..._entries].reverse();
  },

  getTimeline() {
    return [..._entries].reverse().map(e => ({
      id:         e.id,
      taskId:     e.taskId,
      task:       e.task,
      module:     e.module,
      result:     e.result,
      confidence: e.confidence,
      risks:      e.risksFound,
      reviews:    e.mandatoryReviews,
      durationMs: e.durationMs,
      timestamp:  e.timestamp,
    }));
  },

  reset(): void { _entries.length = 0; _counter = 0; },
});