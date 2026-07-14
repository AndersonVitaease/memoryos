/**
 * ReadinessAudit.ts — Sprint 6.3.5
 * Append-only audit trail for all ERC activities.
 */

import type { ReadinessAuditEntry, ReadinessDomain, ValidatorStatus } from "./ReadinessTypes";

let _seq = 0;
function makeId(): string { return `era_${Date.now()}_${++_seq}`; }

export class ReadinessAudit {
  private _entries: ReadinessAuditEntry[] = [];

  record(
    actor: string,
    action: string,
    domain: ReadinessDomain | "SYSTEM",
    result: ValidatorStatus | "INFO",
    detail: string,
  ): ReadinessAuditEntry {
    const entry: ReadinessAuditEntry = {
      id: makeId(),
      timestamp: Date.now(),
      actor, action, domain, result, detail,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): ReadinessAuditEntry[] { return [...this._entries]; }
  count(): number { return this._entries.length; }
  recent(n = 20): ReadinessAuditEntry[] { return this._entries.slice(-n).reverse(); }
}