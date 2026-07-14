/**
 * ConnectorSessionStore.ts — Sprint 6.3.4
 * In-memory store for connector session records.
 * SECURITY: Never stores tokens, secrets, passwords, or credentials.
 */

import type { ConnectorSessionRecord, ConnectorSessionStatus } from "./RuntimePersistenceTypes";

let _seq = 0;
function makeId(): string { return `css_${Date.now()}_${++_seq}`; }

export class ConnectorSessionStore {
  private _sessions: Map<string, ConnectorSessionRecord> = new Map();

  upsert(record: Omit<ConnectorSessionRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }): ConnectorSessionRecord {
    const existing = record.id ? this._sessions.get(record.id) : undefined;
    const entry: ConnectorSessionRecord = {
      id:           existing?.id ?? makeId(),
      connectorId:  record.connectorId,
      provider:     record.provider,
      displayName:  record.displayName,
      status:       record.status,
      statusReason: record.statusReason,
      capabilities: record.capabilities,
      health:       record.health,
      metadata:     record.metadata,
      expiresAt:    record.expiresAt,
      createdAt:    existing?.createdAt ?? Date.now(),
      updatedAt:    Date.now(),
    };
    this._sessions.set(entry.id, entry);
    return entry;
  }

  get(id: string): ConnectorSessionRecord | undefined {
    return this._sessions.get(id);
  }

  byConnector(connectorId: string): ConnectorSessionRecord | undefined {
    return [...this._sessions.values()].find(s => s.connectorId === connectorId);
  }

  byProvider(provider: string): ConnectorSessionRecord[] {
    return [...this._sessions.values()].filter(s => s.provider === provider);
  }

  all(): ConnectorSessionRecord[] {
    return [...this._sessions.values()];
  }

  updateStatus(id: string, status: ConnectorSessionStatus, reason: string): void {
    const s = this._sessions.get(id);
    if (!s) return;
    this._sessions.set(id, { ...s, status, statusReason: reason, updatedAt: Date.now() });
  }

  remove(id: string): void {
    this._sessions.delete(id);
  }

  count(): number {
    return this._sessions.size;
  }

  countByStatus(status: ConnectorSessionStatus): number {
    return [...this._sessions.values()].filter(s => s.status === status).length;
  }

  clear(): void {
    this._sessions.clear();
  }
}