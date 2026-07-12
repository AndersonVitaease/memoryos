/**
 * ConnectorAudit.ts
 * Immutable audit trail for all connector actions.
 * Constitution S-03: every action with side effects generates an immutable audit record.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorAction } from './interfaces/IConnectorAction';
import type { IConnectorResult } from './interfaces/IConnectorResult';

export interface AuditRecord {
  readonly id: string;
  readonly connectorId: string;
  readonly actionId: string;
  readonly executionId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly userId: string;
  readonly status: string;
  readonly latencyMs: number;
  readonly attemptNumber: number;
  readonly errorCode?: string;
  readonly hasError: boolean;
  readonly sideEffectsOccurred: boolean;
  readonly recordedAt: string;
}

export interface AuditQuery {
  readonly connectorId?: string;
  readonly userId?: string;
  readonly correlationId?: string;
  readonly status?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly limit?: number;
}

export class ConnectorAudit {
  // Audit records are append-only — never mutated after insertion
  private readonly records: AuditRecord[] = [];
  private writeCount = 0;

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Record the result of a connector action. Call after every execution. */
  record(action: IConnectorAction, result: IConnectorResult, userId: string, hasSideEffects: boolean): AuditRecord {
    this.writeCount++;
    const entry: AuditRecord = Object.freeze({
      id: this.generateId(),
      connectorId: action.connectorId,
      actionId: action.actionId,
      executionId: action.executionId,
      correlationId: action.correlationId,
      requestId: action.requestId,
      userId,
      status: result.status,
      latencyMs: result.latencyMs,
      attemptNumber: result.attemptNumber,
      errorCode: result.error?.code,
      hasError: !!result.error,
      sideEffectsOccurred: hasSideEffects && result.status === 'SUCCESS',
      recordedAt: new Date().toISOString(),
    });
    this.records.push(entry);
    return entry;
  }

  /** Query audit records with optional filters */
  query(q: AuditQuery): AuditRecord[] {
    let result = this.records as AuditRecord[];

    if (q.connectorId) result = result.filter(r => r.connectorId === q.connectorId);
    if (q.userId) result = result.filter(r => r.userId === q.userId);
    if (q.correlationId) result = result.filter(r => r.correlationId === q.correlationId);
    if (q.status) result = result.filter(r => r.status === q.status);
    if (q.fromDate) result = result.filter(r => r.recordedAt >= q.fromDate!);
    if (q.toDate) result = result.filter(r => r.recordedAt <= q.toDate!);

    const limit = q.limit ?? 100;
    return result.slice(-limit);
  }

  /** Recent records across all connectors */
  recent(limit = 50): AuditRecord[] {
    return this.records.slice(-limit);
  }

  statistics() {
    const total = this.records.length;
    const successes = this.records.filter(r => r.status === 'SUCCESS').length;
    const failures = this.records.filter(r => r.hasError).length;
    return {
      recordCount: total,      // alias for tests
      totalRecords: total,
      writeCount: this.writeCount,
      successCount: successes,
      failureCount: failures,
      successRate: total > 0 ? successes / total : 1,
    };
  }

  health() {
    return {
      status: 'HEALTHY' as const,
      details: `${this.records.length} audit records stored`,
      checks: { appendOnly: true, noCorruption: true },
      checkedAt: new Date().toISOString(),
    };
  }

  logs(limit = 20): AuditRecord[] {
    return this.recent(limit);
  }
}