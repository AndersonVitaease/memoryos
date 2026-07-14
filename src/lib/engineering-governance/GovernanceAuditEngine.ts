/**
 * GovernanceAuditEngine.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: registrar todas as decisões e alterações de governança.
 * Trilha de auditoria imutável (append-only). Não modifica outros componentes.
 */

import type { AuditRecord, AuditEventType, OperationType } from './GovernanceTypes';

let auditCounter = 0;
function makeAuditId(): string {
  return `audit-${Date.now()}-${++auditCounter}`;
}

export class GovernanceAuditEngine {
  private static records: AuditRecord[] = [];

  /**
   * Records an audit event. All parameters are required for traceability.
   */
  static record(
    eventType: AuditEventType,
    principalId: string,
    targetPath: string,
    operation: OperationType,
    outcome: 'allowed' | 'denied' | 'pending',
    details: Record<string, unknown> = {}
  ): AuditRecord {
    const record: AuditRecord = {
      id: makeAuditId(),
      eventType,
      timestamp: new Date().toISOString(),
      principalId,
      targetPath,
      operation,
      outcome,
      details,
    };
    this.records.push(record);
    console.info(
      `[GovernanceAuditEngine] [${record.id}] ${eventType} | ${outcome.toUpperCase()} | ${principalId} → ${operation} on ${targetPath}`
    );
    return { ...record };
  }

  /** Returns all audit records (read-only). */
  static trail(): AuditRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  /** Filters audit records by event type. */
  static filterByEvent(eventType: AuditEventType): AuditRecord[] {
    return this.records.filter((r) => r.eventType === eventType).map((r) => ({ ...r }));
  }

  /** Filters audit records by principal. */
  static filterByPrincipal(principalId: string): AuditRecord[] {
    return this.records.filter((r) => r.principalId === principalId).map((r) => ({ ...r }));
  }

  /** Filters audit records by outcome. */
  static filterByOutcome(outcome: 'allowed' | 'denied' | 'pending'): AuditRecord[] {
    return this.records.filter((r) => r.outcome === outcome).map((r) => ({ ...r }));
  }

  /** Returns a summary of audit activity. */
  static summary(): {
    total: number;
    allowed: number;
    denied: number;
    pending: number;
    byEventType: Record<string, number>;
  } {
    const byEventType: Record<string, number> = {};
    let allowed = 0, denied = 0, pending = 0;
    for (const r of this.records) {
      if (r.outcome === 'allowed') allowed++;
      else if (r.outcome === 'denied') denied++;
      else pending++;
      byEventType[r.eventType] = (byEventType[r.eventType] ?? 0) + 1;
    }
    return { total: this.records.length, allowed, denied, pending, byEventType };
  }

  /** Returns the last N records. */
  static recent(n = 20): AuditRecord[] {
    return this.records.slice(-n).map((r) => ({ ...r }));
  }

  static health(): { status: 'ok'; totalRecords: number } {
    return { status: 'ok', totalRecords: this.records.length };
  }
}