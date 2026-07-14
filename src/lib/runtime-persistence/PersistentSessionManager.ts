/**
 * PersistentSessionManager.ts — Sprint 6.3.4
 * Central manager: saves, restores, synchronizes, and validates all sessions.
 * NEVER executes authentication. NEVER stores credentials.
 */

import type { ConnectorSessionRecord, ConnectorSessionStatus, RestoreResult, SyncResult as _SyncResult } from "./RuntimePersistenceTypes";
import { ConnectorSessionStore } from "./ConnectorSessionStore";
import { SessionSerializer } from "./SessionSerializer";
import { SessionRestorer } from "./SessionRestorer";
import { ConnectorStateSynchronizer } from "./ConnectorStateSynchronizer";
import { AutoReconnectEngine } from "./AutoReconnectEngine";
import type { SyncResult } from "./ConnectorStateSynchronizer";

export class PersistentSessionManager {
  readonly store       = new ConnectorSessionStore();
  private _serializer  = new SessionSerializer();
  private _restorer    = new SessionRestorer();
  private _synchronizer = new ConnectorStateSynchronizer();
  readonly reconnect   = new AutoReconnectEngine();

  /** Restore all sessions from localStorage on startup */
  restore(): RestoreResult {
    return this._restorer.restore(this.store);
  }

  /** Synchronize RESTORING sessions → CONNECTED or DISCONNECTED */
  sync(): SyncResult {
    return this._synchronizer.sync(this.store);
  }

  /** Persist current session state to localStorage */
  save(): void {
    this._serializer.serialize(this.store.all());
  }

  /** Register a connector session (call on first connect) */
  register(params: {
    connectorId:  string;
    provider:     string;
    displayName:  string;
    capabilities: string[];
    metadata?:    Record<string, string | number | boolean>;
  }): ConnectorSessionRecord {
    const record = this.store.upsert({
      connectorId:  params.connectorId,
      provider:     params.provider,
      displayName:  params.displayName,
      status:       "CONNECTED",
      statusReason: "Connected manually",
      capabilities: params.capabilities,
      health:       "HEALTHY",
      metadata:     params.metadata ?? {},
      expiresAt:    null,
    });
    this.save();
    return record;
  }

  /** Update session status */
  setStatus(connectorId: string, status: ConnectorSessionStatus, reason: string): void {
    const session = this.store.byConnector(connectorId);
    if (!session) return;
    this.store.updateStatus(session.id, status, reason);
    this.save();
  }

  /** Disconnect a session */
  disconnect(connectorId: string, reason = "Manually disconnected"): void {
    this.setStatus(connectorId, "DISCONNECTED", reason);
  }

  /** Clear all sessions */
  clearAll(): void {
    this.store.clear();
    this._serializer.clear();
  }

  /** Get all sessions */
  all(): ConnectorSessionRecord[] {
    return this.store.all();
  }

  /** Get session by provider */
  byProvider(provider: string): ConnectorSessionRecord[] {
    return this.store.byProvider(provider);
  }

  serializedAgeMs(): number {
    return this._serializer.ageMs();
  }
}