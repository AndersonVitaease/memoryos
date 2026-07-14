/**
 * MemoryAudit.ts — Sprint 6.2.4
 * Immutable append-only audit trail for all memory operations.
 */
import { makeMemId } from "./MEMTypes";

export interface MemoryAuditEntry {
  readonly id:        string;
  readonly timestamp: number;
  readonly operation: "RECORD" | "SEARCH" | "RANK" | "ARCHIVE" | "LEARN";
  readonly kind:      string;
  readonly entryId:   string;
  readonly summary:   string;
}

export class MemoryAudit {
  private readonly _entries: MemoryAuditEntry[] = [];

  record(op: MemoryAuditEntry["operation"], kind: string, entryId: string, summary: string): MemoryAuditEntry {
    const entry = Object.freeze({ id: makeMemId("maudit"), timestamp: Date.now(), operation: op, kind, entryId, summary });
    this._entries.push(entry);
    return entry;
  }

  all(): readonly MemoryAuditEntry[] { return this._entries; }
  stats() {
    return {
      total:   this._entries.length,
      records: this._entries.filter(e => e.operation === "RECORD").length,
      searches: this._entries.filter(e => e.operation === "SEARCH").length,
    };
  }
}