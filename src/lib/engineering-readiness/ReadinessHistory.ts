/**
 * ReadinessHistory.ts — Sprint 6.3.5
 * Append-only history of ERC reports.
 */

import type { ReadinessReportData } from "./ReadinessTypes";

export class ReadinessHistory {
  private _reports: ReadinessReportData[] = [];
  private readonly _maxSize = 20;

  add(report: ReadinessReportData): void {
    this._reports.unshift(report);
    if (this._reports.length > this._maxSize) {
      this._reports.splice(this._maxSize);
    }
  }

  all(): ReadinessReportData[] { return [...this._reports]; }
  latest(): ReadinessReportData | null { return this._reports[0] ?? null; }
  count(): number { return this._reports.length; }
}