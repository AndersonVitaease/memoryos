/**
 * RuntimeAudit.ts — Sprint 6.3.1
 * Permanent, append-only audit log for all SHR actions.
 */

import type { AuditEntry, WatchTrigger } from "./SHRTypes";

let _seq = 0;
function makeId(): string { return `audit_${Date.now()}_${++_seq}`; }

export class RuntimeAudit {
  private _entries: AuditEntry[] = [];
  private readonly _maxEntries = 500;

  record(params: {
    actor: string;
    action: string;
    trigger: WatchTrigger;
    modules: string[];
    durationMs: number;
    result: "SUCCESS" | "PARTIAL" | "FAILED";
    rca?: string;
    snapshotId?: string;
  }): AuditEntry {
    const entry: AuditEntry = {
      id: makeId(),
      timestamp: Date.now(),
      ...params,
    };
    this._entries.unshift(entry);
    if (this._entries.length > this._maxEntries) this._entries.splice(this._maxEntries);
    return entry;
  }

  all(): AuditEntry[] { return [...this._entries]; }

  count(): number { return this._entries.length; }

  failures(): AuditEntry[] { return this._entries.filter(e => e.result === "FAILED"); }

  byModule(moduleId: string): AuditEntry[] {
    return this._entries.filter(e => e.modules.includes(moduleId));
  }

  since(timestamp: number): AuditEntry[] {
    return this._entries.filter(e => e.timestamp >= timestamp);
  }
}