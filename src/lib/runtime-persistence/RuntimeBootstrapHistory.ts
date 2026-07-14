/**
 * RuntimeBootstrapHistory.ts — Sprint 6.3.4
 * Immutable (append-only) history of bootstrap reports.
 */

import type { BootstrapReport } from "./RuntimePersistenceTypes";

export class RuntimeBootstrapHistory {
  private _reports: BootstrapReport[] = [];

  add(report: BootstrapReport): void {
    this._reports.unshift(report);
    if (this._reports.length > 50) this._reports.splice(50);
  }

  all(): BootstrapReport[] { return [...this._reports]; }
  last(): BootstrapReport | null { return this._reports[0] ?? null; }
  count(): number { return this._reports.length; }

  successRate(): number {
    if (!this._reports.length) return 0;
    const pass = this._reports.filter(r => r.success).length;
    return Math.round((pass / this._reports.length) * 100);
  }
}