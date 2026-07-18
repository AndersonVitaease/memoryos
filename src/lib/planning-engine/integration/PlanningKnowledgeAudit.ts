/**
 * PlanningKnowledgeAudit.ts
 * Append-only audit log for planning knowledge decisions.
 *
 * SRP: Audit only — no evaluation, no ranking.
 * Sprint: INTEGRATION-01
 */

export interface PlanningKnowledgeAuditEntry {
  readonly id:             string;         // PKA-NNN
  readonly goalId:         string;
  readonly timestamp:      string;
  readonly knowledgeUsed:  string[];       // item ids
  readonly knowledgeDropped: Array<{ id: string; reason: string }>;
  readonly conflicts:      number;
  readonly recommendations:number;
  readonly governanceUsed: string[];       // policy ids
  readonly evidenceScores: number[];
  readonly durationMs:     number;
}

let _counter = 0;
const _entries: PlanningKnowledgeAuditEntry[] = [];

export const PlanningKnowledgeAudit = Object.freeze({

  log(entry: Omit<PlanningKnowledgeAuditEntry, "id">): PlanningKnowledgeAuditEntry {
    _counter++;
    const full = { ...entry, id: `PKA-${String(_counter).padStart(3, "0")}` };
    _entries.push(full);
    return full;
  },

  getAll(): PlanningKnowledgeAuditEntry[] {
    return [..._entries].reverse();
  },

  getTimeline(): Array<{ id: string; goalId: string; timestamp: string; used: number; dropped: number; conflicts: number }> {
    return [..._entries].reverse().map(e => ({
      id:        e.id,
      goalId:    e.goalId,
      timestamp: e.timestamp,
      used:      e.knowledgeUsed.length,
      dropped:   e.knowledgeDropped.length,
      conflicts: e.conflicts,
    }));
  },

  reset(): void { _entries.length = 0; _counter = 0; },
});