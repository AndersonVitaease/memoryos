/**
 * ConnectorStateSynchronizer.ts — Sprint 6.3.4
 * Synchronizes connector state between the session store and the dashboard.
 * Runs after restore to finalize RESTORING → CONNECTED or SESSION_EXPIRED.
 */

import type { ConnectorSessionRecord } from "./RuntimePersistenceTypes";
import { ConnectorSessionStore } from "./ConnectorSessionStore";
import { SessionSerializer } from "./SessionSerializer";

export interface SyncResult {
  synced:   number;
  errors:   number;
  durationMs: number;
}

export class ConnectorStateSynchronizer {
  private _serializer = new SessionSerializer();

  sync(store: ConnectorSessionStore): SyncResult {
    const t0 = Date.now();
    let synced = 0;
    let errors = 0;

    for (const session of store.all()) {
      try {
        if (session.status === "RESTORING") {
          // Verify health before marking CONNECTED
          if (session.health === "HEALTHY" || session.health === "DEGRADED") {
            store.updateStatus(session.id, "CONNECTED", "Session restored and synchronized");
          } else {
            store.updateStatus(session.id, "DISCONNECTED", "Health unknown after restore — manual reconnect required");
          }
          synced++;
        }
      } catch {
        errors++;
        try {
          store.updateStatus(session.id, "ERROR", "Synchronization failed");
        } catch { /* silent */ }
      }
    }

    // Persist updated state after sync
    this._serializer.serialize(store.all());
    return { synced, errors, durationMs: Date.now() - t0 };
  }

  /** Save current store state to localStorage */
  persist(store: ConnectorSessionStore): void {
    this._serializer.serialize(store.all());
  }
}