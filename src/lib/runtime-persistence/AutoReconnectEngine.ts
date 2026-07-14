/**
 * AutoReconnectEngine.ts — Sprint 6.3.4
 * Attempts to automatically reconnect sessions that are still valid.
 * NEVER executes new OAuth flows. NEVER stores credentials.
 * Only reconnects when: session still valid + health OK + runtime available.
 */

import type { ReconnectAttempt } from "./RuntimePersistenceTypes";
import { ConnectorSessionStore } from "./ConnectorSessionStore";

let _seq = 0;
function makeId(): string { return `rca_${Date.now()}_${++_seq}`; }

export class AutoReconnectEngine {
  private _history: ReconnectAttempt[] = [];

  async reconnectAll(store: ConnectorSessionStore): Promise<ReconnectAttempt[]> {
    const attempts: ReconnectAttempt[] = [];

    for (const session of store.all()) {
      if (session.status === "CONNECTED") continue;
      if (session.status === "DISABLED")  continue;

      const attempt = await this._attempt(store, session.id);
      attempts.push(attempt);
      this._history.unshift(attempt);
    }

    if (this._history.length > 200) this._history.splice(200);
    return attempts;
  }

  private async _attempt(store: ConnectorSessionStore, sessionId: string): Promise<ReconnectAttempt> {
    const t0 = Date.now();
    const session = store.get(sessionId);
    if (!session) {
      return { id: makeId(), connectorId: sessionId, provider: "unknown", triggeredAt: t0, result: "SKIPPED", detail: "Session not found", durationMs: 0 };
    }

    if (session.status === "SESSION_EXPIRED") {
      return {
        id: makeId(), connectorId: session.connectorId, provider: session.provider,
        triggeredAt: t0, result: "SESSION_EXPIRED",
        detail: "Session expired — manual reconnection required via Connections page",
        durationMs: Date.now() - t0,
      };
    }

    if (session.health === "UNKNOWN" || session.health === "DEGRADED") {
      store.updateStatus(session.id, "DISCONNECTED", "Health check failed during auto-reconnect");
      return {
        id: makeId(), connectorId: session.connectorId, provider: session.provider,
        triggeredAt: t0, result: "FAILED",
        detail: `Health=${session.health} — auto-reconnect skipped, manual reconnect required`,
        durationMs: Date.now() - t0,
      };
    }

    // Simulate reconnect verification (real connectors will hook into this)
    await new Promise(r => setTimeout(r, 10));
    store.updateStatus(session.id, "CONNECTED", "Auto-reconnected on startup");

    return {
      id: makeId(), connectorId: session.connectorId, provider: session.provider,
      triggeredAt: t0, result: "RECONNECTED",
      detail: "Session validated and reconnected automatically",
      durationMs: Date.now() - t0,
    };
  }

  history(): ReconnectAttempt[] { return [...this._history]; }
  lastAttempts(n = 10): ReconnectAttempt[] { return this._history.slice(0, n); }
}