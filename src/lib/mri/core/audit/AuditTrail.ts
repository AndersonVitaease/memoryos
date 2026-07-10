/**
 * MRI — MemoryOS Reference Implementation
 * Audit Trail Engine (MCS + MRS Capítulo 5)
 *
 * Registro imutável de toda ação. Nunca deletado.
 */

import type { AuditEntry, AuditAction, IAuditTrail } from "../interfaces";

export class AuditTrail implements IAuditTrail {
  private entries: AuditEntry[] = [];

  async record(entry: Omit<AuditEntry, "auditId" | "timestamp" | "immutable">): Promise<AuditEntry> {
    const auditEntry: AuditEntry = {
      ...entry,
      auditId:   `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      immutable: true,
    };
    // Object.freeze garante imutabilidade em runtime
    Object.freeze(auditEntry);
    this.entries.push(auditEntry);
    return auditEntry;
  }

  async query(filters: {
    userId?:      string;
    executionId?: string;
    journeyId?:   string;
    action?:      AuditAction;
    from?:        string;
    to?:          string;
    limit?:       number;
  }): Promise<AuditEntry[]> {
    return this.entries
      .filter(e => {
        if (filters.userId      && e.userId      !== filters.userId)      return false;
        if (filters.executionId && e.executionId !== filters.executionId) return false;
        if (filters.journeyId   && e.journeyId   !== filters.journeyId)   return false;
        if (filters.action      && e.action      !== filters.action)      return false;
        if (filters.from        && e.timestamp   < filters.from)          return false;
        if (filters.to          && e.timestamp   > filters.to)            return false;
        return true;
      })
      .slice(-(filters.limit ?? 100));
  }

  get totalEntries(): number { return this.entries.length; }
}