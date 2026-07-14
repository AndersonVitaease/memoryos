/**
 * OAuthHealth.ts — Sprint 6.4.0
 * Tracks health state per provider/session.
 */

import type { OAuthHealthSnapshot, OAuthHealthState, OAuthProviderName } from "./OAuthTypes";

export class OAuthHealth {
  private _snapshots: Map<string, OAuthHealthSnapshot> = new Map();

  mark(
    provider: OAuthProviderName,
    sessionId: string | null,
    state: OAuthHealthState,
    detail: string,
  ): OAuthHealthSnapshot {
    const key = sessionId ?? `provider:${provider}`;
    const snap: OAuthHealthSnapshot = {
      provider,
      sessionId,
      state,
      lastCheck: Date.now(),
      detail,
    };
    this._snapshots.set(key, snap);
    return snap;
  }

  get(provider: OAuthProviderName, sessionId?: string | null): OAuthHealthSnapshot {
    const key = sessionId ?? `provider:${provider}`;
    return this._snapshots.get(key) ?? {
      provider, sessionId: sessionId ?? null,
      state: "DISCONNECTED", lastCheck: 0, detail: "No health data",
    };
  }

  all(): OAuthHealthSnapshot[] {
    return [...this._snapshots.values()];
  }

  summary(): Record<OAuthHealthState, number> {
    const result: Record<OAuthHealthState, number> = {
      CONNECTED: 0, CONNECTING: 0, REFRESHING: 0,
      SESSION_EXPIRED: 0, DISCONNECTED: 0, ERROR: 0,
    };
    for (const snap of this._snapshots.values()) {
      result[snap.state]++;
    }
    return result;
  }

  connectedCount(): number {
    return [...this._snapshots.values()].filter(s => s.state === "CONNECTED").length;
  }
}