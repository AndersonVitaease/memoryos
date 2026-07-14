/**
 * AcceptanceAudit.ts — Sprint 6.3.2
 * Append-only audit trail for all acceptance operations
 */

import type { AcceptanceAuditEntry, AcceptanceStatus } from "./EAFTypes";

let _seq = 0;
function makeId(): string { return `aaud_${Date.now()}_${++_seq}`; }

export class AcceptanceAudit {
  private _entries: AcceptanceAuditEntry[] = [];

  record(
    sprintId: string,
    runId: string,
    actor: string,
    action: AcceptanceAuditEntry["action"],
    result: AcceptanceStatus,
    reason: string
  ): AcceptanceAuditEntry {
    const e: AcceptanceAuditEntry = {
      id: makeId(), sprintId, runId, actor, action, result, reason,
      timestamp: Date.now(),
    };
    this._entries.push(e);
    return e;
  }

  forSprint(sprintId: string): AcceptanceAuditEntry[] {
    return this._entries.filter(e => e.sprintId === sprintId);
  }

  all(): AcceptanceAuditEntry[] { return [...this._entries]; }
  count(): number { return this._entries.length; }
}