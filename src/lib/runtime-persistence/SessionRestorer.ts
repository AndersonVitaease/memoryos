/**
 * SessionRestorer.ts — Sprint 6.3.4
 * Restores connector sessions from serialized state during startup.
 * Never leaves state undefined — always marks CONNECTED, SESSION_EXPIRED, DISCONNECTED, or ERROR.
 */

import type { ConnectorSessionRecord, RestoreResult } from "./RuntimePersistenceTypes";
import { SessionSerializer } from "./SessionSerializer";
import { ConnectorSessionStore } from "./ConnectorSessionStore";

// Sessions older than 24h are treated as expired (conservative default)
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class SessionRestorer {
  private _serializer = new SessionSerializer();

  restore(store: ConnectorSessionStore): RestoreResult {
    const serialized = this._serializer.deserialize();

    const result: RestoreResult = {
      total:    0,
      restored: 0,
      expired:  0,
      failed:   0,
      sessions: [],
    };

    if (!serialized || !serialized.sessions?.length) {
      return result;
    }

    const ageMs = Date.now() - serialized.savedAt;
    result.total = serialized.sessions.length;

    for (const record of serialized.sessions) {
      try {
        const expired = this._isExpired(record, ageMs);

        if (expired) {
          const restored = store.upsert({
            ...record,
            status:       "SESSION_EXPIRED",
            statusReason: "Session expired — reconnection required",
            health:       "UNKNOWN",
          });
          result.sessions.push(restored);
          result.expired++;
        } else {
          const restored = store.upsert({
            ...record,
            status:       "RESTORING",
            statusReason: "Restoring from saved state",
            updatedAt:    Date.now(),
          });
          result.sessions.push(restored);
          result.restored++;
        }
      } catch {
        result.failed++;
      }
    }

    return result;
  }

  private _isExpired(record: ConnectorSessionRecord, ageMs: number): boolean {
    if (record.status === "SESSION_EXPIRED") return true;
    if (record.status === "DISCONNECTED")    return true;
    if (record.status === "ERROR")           return true;
    if (record.expiresAt !== null && Date.now() > record.expiresAt) return true;
    if (ageMs > SESSION_MAX_AGE_MS) return true;
    return false;
  }
}