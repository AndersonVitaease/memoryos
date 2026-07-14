/**
 * GoogleMetrics.ts — Sprint 6.4.1
 * Tracks Google Identity Provider performance metrics.
 */

import type { GoogleMetricSnapshot } from "./GoogleIdentityTypes";

export class GoogleMetrics {
  private _logins:    { durationMs: number; success: boolean }[] = [];
  private _refreshes: { durationMs: number; success: boolean }[] = [];
  private _restored   = 0;
  private _active     = 0;
  private _expired    = 0;

  recordLogin(durationMs: number, success: boolean): void {
    this._logins.push({ durationMs, success });
    if (success) this._active++;
  }

  recordRefresh(durationMs: number, success: boolean): void {
    this._refreshes.push({ durationMs, success });
    if (!success) {
      if (this._active > 0) this._active--;
      this._expired++;
    }
  }

  recordRestore(): void {
    this._restored++;
    this._active++;
  }

  recordExpiration(): void {
    if (this._active > 0) this._active--;
    this._expired++;
  }

  setActive(n: number): void { this._active = n; }

  snapshot(): GoogleMetricSnapshot {
    const avg = (arr: { durationMs: number }[]) =>
      arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b.durationMs, 0) / arr.length);
    return {
      totalLogins:         this._logins.length,
      successfulLogins:    this._logins.filter(l => l.success).length,
      failedLogins:        this._logins.filter(l => !l.success).length,
      totalRefreshes:      this._refreshes.length,
      successfulRefreshes: this._refreshes.filter(r => r.success).length,
      failedRefreshes:     this._refreshes.filter(r => !r.success).length,
      restoredSessions:    this._restored,
      avgLoginMs:          avg(this._logins),
      avgRefreshMs:        avg(this._refreshes),
      activeSessions:      this._active,
      expiredSessions:     this._expired,
    };
  }
}