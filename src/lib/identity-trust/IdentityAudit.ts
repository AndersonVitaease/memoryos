/**
 * IdentityAudit.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Append-only audit trail for all identity and authentication decisions.
 * Integrates with EngineeringMemory for durable, queryable history.
 * All authentication events are automatically recorded — no bypasses.
 *
 * SRP: audit record creation and querying — nothing else.
 */

import type { IdentityEvent } from './ITPTypes';
import { WorkflowMemoryIntegration } from '../engineering-workflow/WorkflowMemoryIntegration';

export interface IdentityAuditRecord {
  id:            string;
  timestamp:     string;
  eventType:     string;
  providerId:    string;
  connectionId:  string;
  organizationId: string;
  actor:         string;
  outcome:       'success' | 'failure' | 'pending';
  details:       Record<string, unknown>;
}

const AUDIT_STORE_KEY = '__ITP_AUDIT_STORE__';

function getStore(): IdentityAuditRecord[] {
  if (!(globalThis as any)[AUDIT_STORE_KEY]) (globalThis as any)[AUDIT_STORE_KEY] = [];
  return (globalThis as any)[AUDIT_STORE_KEY];
}

let _seq = 0;

export class IdentityAudit {
  /**
   * Records an identity event to the append-only audit trail.
   * Also bridges to EngineeringMemory for unified observability.
   */
  static record(event: IdentityEvent): IdentityAuditRecord {
    const outcome: IdentityAuditRecord['outcome'] =
      event.status === 'SUCCESS' ? 'success' :
      event.status === 'FAILURE' ? 'failure' : 'pending';

    const record: IdentityAuditRecord = {
      id:            `iaudit-${Date.now()}-${++_seq}`,
      timestamp:     event.timestamp,
      eventType:     event.eventType,
      providerId:    event.providerId,
      connectionId:  event.connectionId,
      organizationId: event.organizationId,
      actor:         event.actor,
      outcome,
      details:       { ...event.payload, requestId: event.requestId, correlationId: event.correlationId },
    };

    getStore().push(record);

    // Bridge to EngineeringMemory — non-blocking, silent on failure.
    try {
      const mem = WorkflowMemoryIntegration.memory();
      mem.record(
        'validation_record',
        `[ITP] ${event.eventType} — provider: ${event.providerId}`,
        `${event.eventType} | actor: ${event.actor} | org: ${event.organizationId} | outcome: ${outcome}`,
        [event.providerId, event.organizationId, event.connectionId].filter(Boolean),
        { identityAuditId: record.id, ...event.payload }
      );
    } catch { /* memory bridge must never crash the auth flow */ }

    return record;
  }

  /** Queries audit records with optional filters. */
  static query(filter?: {
    eventType?:    string;
    providerId?:   string;
    connectionId?: string;
    organizationId?: string;
    outcome?:      IdentityAuditRecord['outcome'];
    since?:        string;
    limit?:        number;
  }): IdentityAuditRecord[] {
    let results = [...getStore()];

    if (filter?.eventType)      results = results.filter((r) => r.eventType === filter.eventType);
    if (filter?.providerId)     results = results.filter((r) => r.providerId === filter.providerId);
    if (filter?.connectionId)   results = results.filter((r) => r.connectionId === filter.connectionId);
    if (filter?.organizationId) results = results.filter((r) => r.organizationId === filter.organizationId);
    if (filter?.outcome)        results = results.filter((r) => r.outcome === filter.outcome);
    if (filter?.since)          results = results.filter((r) => r.timestamp >= filter.since!);

    return results
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, filter?.limit ?? 200);
  }

  static count(): number { return getStore().length; }

  static health(): { status: 'ok'; total: number; failures: number } {
    const all = getStore();
    return {
      status:   'ok',
      total:    all.length,
      failures: all.filter((r) => r.outcome === 'failure').length,
    };
  }
}