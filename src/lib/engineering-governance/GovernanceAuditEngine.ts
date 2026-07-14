/**
 * GovernanceAuditEngine.ts — Sprint 6.2.2
 * Immutable audit log. Entries cannot be modified or deleted after creation.
 */

import type { AuditEntry } from "./GovernanceTypes";

let _seq = 0;
function makeAuditId(): string { return `audit_${Date.now()}_${++_seq}`; }

export class GovernanceAuditEngine {
  // Object.freeze prevents mutation after creation
  private readonly _entries: AuditEntry[] = [];

  record(entry: Omit<AuditEntry, "id" | "engineer">): AuditEntry {
    const full = Object.freeze({
      ...entry,
      id:       makeAuditId(),
      engineer: "MemoryOS" as const,
    });
    this._entries.push(full);
    return full;
  }

  all(): readonly AuditEntry[] { return this._entries; }

  latest(): AuditEntry | null { return this._entries[this._entries.length - 1] ?? null; }

  find(id: string): AuditEntry | undefined { return this._entries.find(e => e.id === id); }

  stats() {
    const total   = this._entries.length;
    const passed  = this._entries.filter(e => e.outcome === "PASS").length;
    const blocked = this._entries.filter(e => e.outcome === "BLOCKED").length;
    const failed  = this._entries.filter(e => e.outcome === "FAIL").length;
    return { total, passed, blocked, failed };
  }
}