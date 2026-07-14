/**
 * RuntimePersistenceAudit.ts — Sprint 6.3.4
 * Immutable audit trail for all persistence operations.
 */

import type { PersistenceAuditEntry } from "./RuntimePersistenceTypes";

let _seq = 0;
function makeId(): string { return `paud_${Date.now()}_${++_seq}`; }

export class RuntimePersistenceAudit {
  private _entries: PersistenceAuditEntry[] = [];

  record(actor: string, action: string, target: string, result: string, detail: string): PersistenceAuditEntry {
    const entry: PersistenceAuditEntry = {
      id: makeId(), actor, action, target, result, detail, timestamp: Date.now(),
    };
    this._entries.unshift(entry);
    if (this._entries.length > 500) this._entries.splice(500);
    return entry;
  }

  all(): PersistenceAuditEntry[] { return [...this._entries]; }
  count(): number { return this._entries.length; }
  recent(n = 20): PersistenceAuditEntry[] { return this._entries.slice(0, n); }
}