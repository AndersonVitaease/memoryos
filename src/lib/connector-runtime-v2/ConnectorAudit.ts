/**
 * ConnectorAudit.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Append-only audit trail for all connector executions.
 * Records: connector, connection, user, operation, result, duration.
 * Bridges to EngineeringMemory for unified observability.
 * SRP: audit record creation and querying — nothing else.
 */

import type { ConnectorAuditRecord } from './UCRTypes';
import { WorkflowMemoryIntegration } from '../engineering-workflow/WorkflowMemoryIntegration';

const AUDIT_KEY = '__UCR_AUDIT_STORE__';

function getStore(): ConnectorAuditRecord[] {
  if (!(globalThis as any)[AUDIT_KEY]) (globalThis as any)[AUDIT_KEY] = [];
  return (globalThis as any)[AUDIT_KEY];
}

let _seq = 0;

export class ConnectorAudit {
  static record(opts: Omit<ConnectorAuditRecord, 'id' | 'timestamp'>): ConnectorAuditRecord {
    const record: ConnectorAuditRecord = {
      id:        `caudit-${Date.now()}-${++_seq}`,
      timestamp: new Date().toISOString(),
      ...opts,
    };
    getStore().push(record);

    // Bridge to EngineeringMemory — non-blocking.
    try {
      const mem = WorkflowMemoryIntegration.memory();
      mem.record(
        'validation_record',
        `[UCR] ${record.operationId} on ${record.connectorId}`,
        `outcome: ${record.outcome} | org: ${record.organizationId} | duration: ${record.durationMs}ms`,
        [record.connectorId, record.connectionId].filter(Boolean),
        { auditId: record.id }
      );
    } catch { /* never crash execution */ }

    return record;
  }

  static query(filter?: {
    connectorId?:   string;
    connectionId?:  string;
    userId?:        string;
    organizationId?: string;
    operationId?:   string;
    outcome?:       ConnectorAuditRecord['outcome'];
    since?:         string;
    limit?:         number;
  }): ConnectorAuditRecord[] {
    let r = [...getStore()];
    if (filter?.connectorId)   r = r.filter((a) => a.connectorId   === filter.connectorId);
    if (filter?.connectionId)  r = r.filter((a) => a.connectionId  === filter.connectionId);
    if (filter?.userId)        r = r.filter((a) => a.userId        === filter.userId);
    if (filter?.organizationId)r = r.filter((a) => a.organizationId === filter.organizationId);
    if (filter?.operationId)   r = r.filter((a) => a.operationId   === filter.operationId);
    if (filter?.outcome)       r = r.filter((a) => a.outcome       === filter.outcome);
    if (filter?.since)         r = r.filter((a) => a.timestamp     >= filter.since!);
    return r.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, filter?.limit ?? 200);
  }

  static count(): number { return getStore().length; }

  static health(): { status: 'ok'; total: number; failures: number } {
    const all = getStore();
    return { status: 'ok', total: all.length, failures: all.filter((r) => r.outcome === 'failure').length };
  }
}