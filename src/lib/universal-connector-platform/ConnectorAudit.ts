/**
 * ConnectorAudit.ts — Sprint 6.3.0
 * Permanent, append-only audit log for all connector events.
 */

import type { ConnectorAuditEntry } from "./UCPTypes";

let _seq = 0;
function makeAuditId(): string { return `audit_${Date.now()}_${++_seq}`; }

export class ConnectorAudit {
  private readonly _entries: ConnectorAuditEntry[] = [];

  record(
    connectorId: string,
    event: ConnectorAuditEntry["event"],
    detail: string
  ): ConnectorAuditEntry {
    const entry: ConnectorAuditEntry = {
      id: makeAuditId(),
      connectorId,
      event,
      detail,
      timestamp: Date.now(),
    };
    this._entries.push(entry); // append-only — never splice or delete
    return entry;
  }

  install(connectorId: string, detail: string)   { return this.record(connectorId, "INSTALL", detail); }
  update(connectorId: string, detail: string)    { return this.record(connectorId, "UPDATE", detail); }
  configure(connectorId: string, detail: string) { return this.record(connectorId, "CONFIGURE", detail); }
  error(connectorId: string, detail: string)     { return this.record(connectorId, "ERROR", detail); }
  lifecycleChange(connectorId: string, detail: string) { return this.record(connectorId, "LIFECYCLE_CHANGE", detail); }
  remove(connectorId: string, detail: string)    { return this.record(connectorId, "REMOVE", detail); }

  all(): ConnectorAuditEntry[] { return [...this._entries]; }

  forConnector(connectorId: string): ConnectorAuditEntry[] {
    return this._entries.filter(e => e.connectorId === connectorId);
  }

  count(): number { return this._entries.length; }
}