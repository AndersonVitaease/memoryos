/**
 * GoogleHealth.ts — Sprint 6.4.1
 * Tracks Google Identity Provider health state.
 */

import type { GoogleHealthState } from "./GoogleIdentityTypes";

export interface GoogleHealthReport {
  state:        GoogleHealthState;
  sessionId:    string | null;
  lastCheck:    number;
  detail:       string;
  activeSessions: number;
  expiredSessions: number;
}

export class GoogleHealth {
  private _state:           GoogleHealthState = "UNKNOWN";
  private _lastCheck:       number = 0;
  private _detail:          string = "Not initialized";
  private _sessionId:       string | null = null;
  private _activeSessions   = 0;
  private _expiredSessions  = 0;

  update(
    state: GoogleHealthState,
    detail: string,
    sessionId: string | null = null,
  ): void {
    this._state     = state;
    this._lastCheck = Date.now();
    this._detail    = detail;
    this._sessionId = sessionId;
  }

  setSessionCounts(active: number, expired: number): void {
    this._activeSessions  = active;
    this._expiredSessions = expired;
  }

  report(): GoogleHealthReport {
    return {
      state:           this._state,
      sessionId:       this._sessionId,
      lastCheck:       this._lastCheck,
      detail:          this._detail,
      activeSessions:  this._activeSessions,
      expiredSessions: this._expiredSessions,
    };
  }

  isHealthy(): boolean {
    return this._state === "HEALTHY";
  }

  state(): GoogleHealthState { return this._state; }
}