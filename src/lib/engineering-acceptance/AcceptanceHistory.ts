/**
 * AcceptanceHistory.ts — Sprint 6.3.2
 * Permanent, append-only run history — never deleted
 */

import type { AcceptanceRunResult, AcceptanceReport } from "./EAFTypes";

export class AcceptanceHistory {
  private _runs: AcceptanceRunResult[] = [];
  private _reports: AcceptanceReport[] = [];

  addRun(run: AcceptanceRunResult): void { this._runs.push(run); }
  addReport(report: AcceptanceReport): void { this._reports.push(report); }

  runsForSprint(sprintId: string): AcceptanceRunResult[] {
    return this._runs.filter(r => r.sprintId === sprintId);
  }

  latestRun(sprintId: string): AcceptanceRunResult | undefined {
    const runs = this.runsForSprint(sprintId);
    return runs[runs.length - 1];
  }

  allRuns(): AcceptanceRunResult[] { return [...this._runs]; }
  allReports(): AcceptanceReport[] { return [...this._reports]; }

  runCount(): number { return this._runs.length; }
  reportCount(): number { return this._reports.length; }

  passRate(): number {
    if (this._runs.length === 0) return 0;
    return Math.round((this._runs.filter(r => r.ready).length / this._runs.length) * 100);
  }

  avgScore(): number {
    if (this._runs.length === 0) return 0;
    return Math.round(this._runs.reduce((s, r) => s + r.score, 0) / this._runs.length);
  }
}