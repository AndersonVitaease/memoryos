/**
 * RuntimeRecoveryHistory.ts — Sprint 6.3.1
 * Aggregated history of all recovery operations across the system lifetime.
 */

import type { RecoveryHistoryEntry } from "./SHRTypes";

export class RuntimeRecoveryHistory {
  private _entries: RecoveryHistoryEntry[] = [];

  add(entry: RecoveryHistoryEntry): void {
    this._entries.unshift(entry);
    if (this._entries.length > 500) this._entries.splice(500);
  }

  all(): RecoveryHistoryEntry[] { return [...this._entries]; }

  count(): number { return this._entries.length; }

  failures(): RecoveryHistoryEntry[] {
    return this._entries.filter(e => e.finalResult !== "RECOVERED");
  }

  byModule(moduleId: string): RecoveryHistoryEntry[] {
    return this._entries.filter(e => e.moduleId === moduleId);
  }

  successRate(): number {
    if (this._entries.length === 0) return 100;
    const ok = this._entries.filter(e => e.finalResult === "RECOVERED").length;
    return Math.round((ok / this._entries.length) * 100);
  }

  avgDurationMs(): number {
    if (this._entries.length === 0) return 0;
    return Math.round(this._entries.reduce((s, e) => s + e.totalDurationMs, 0) / this._entries.length);
  }

  since(timestamp: number): RecoveryHistoryEntry[] {
    return this._entries.filter(e => e.timestamp >= timestamp);
  }
}