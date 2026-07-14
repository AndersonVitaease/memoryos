/**
 * ExecutionHistory.ts — Sprint 6.3.3
 * Permanent, append-only history of all execution runs and reports
 */

import type { AELReport } from "./AELTypes";
import type { ExecutionContextData } from "./ExecutionContext";

export class ExecutionHistory {
  private _contexts: ExecutionContextData[] = [];
  private _reports:  AELReport[] = [];

  addContext(ctx: ExecutionContextData): void { this._contexts.push({ ...ctx }); }
  addReport(report: AELReport): void { this._reports.push(report); }

  allContexts(): ExecutionContextData[] { return [...this._contexts]; }
  allReports():  AELReport[]            { return [...this._reports]; }

  latestReport(): AELReport | undefined {
    return this._reports[this._reports.length - 1];
  }

  contextCount(): number { return this._contexts.length; }
  reportCount():  number { return this._reports.length; }

  successRate(): number {
    if (this._contexts.length === 0) return 0;
    const ready = this._contexts.filter(c => c.state === "READY").length;
    return Math.round((ready / this._contexts.length) * 100);
  }
}