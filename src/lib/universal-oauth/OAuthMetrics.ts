/**
 * OAuthMetrics.ts — Sprint 6.4.0
 * Tracks OAuth platform performance metrics.
 */

import type { OAuthMetricSnapshot, OAuthProviderName } from "./OAuthTypes";

interface AuthRecord { provider: OAuthProviderName; durationMs: number; success: boolean; }
interface RefreshRecord { provider: OAuthProviderName; durationMs: number; success: boolean; }
interface RecoveryRecord { durationMs: number; success: boolean; }

export class OAuthMetrics {
  private _authRecords:     AuthRecord[]     = [];
  private _refreshRecords:  RefreshRecord[]  = [];
  private _recoveryRecords: RecoveryRecord[] = [];
  private _activeSessions   = 0;
  private _expiredSessions  = 0;

  recordAuth(provider: OAuthProviderName, durationMs: number, success: boolean): void {
    this._authRecords.push({ provider, durationMs, success });
    if (success) this._activeSessions++;
  }

  recordRefresh(provider: OAuthProviderName, durationMs: number, success: boolean): void {
    this._refreshRecords.push({ provider, durationMs, success });
  }

  recordRecovery(durationMs: number, success: boolean): void {
    this._recoveryRecords.push({ durationMs, success });
  }

  recordExpiration(): void {
    if (this._activeSessions > 0) this._activeSessions--;
    this._expiredSessions++;
  }

  setActiveSessions(n: number): void { this._activeSessions = n; }
  setExpiredSessions(n: number): void { this._expiredSessions = n; }

  snapshot(): OAuthMetricSnapshot {
    const avg = (arr: number[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    const providerBreakdown: Record<string, number> = {};
    for (const r of this._authRecords) {
      providerBreakdown[r.provider] = (providerBreakdown[r.provider] ?? 0) + 1;
    }

    return {
      totalSessions:        this._authRecords.length,
      activeSessions:       this._activeSessions,
      expiredSessions:      this._expiredSessions,
      totalRefreshAttempts: this._refreshRecords.length,
      successfulRefreshes:  this._refreshRecords.filter(r => r.success).length,
      failedRefreshes:      this._refreshRecords.filter(r => !r.success).length,
      avgAuthMs:            avg(this._authRecords.map(r => r.durationMs)),
      avgRefreshMs:         avg(this._refreshRecords.map(r => r.durationMs)),
      avgRecoveryMs:        avg(this._recoveryRecords.map(r => r.durationMs)),
      providerBreakdown,
    };
  }
}