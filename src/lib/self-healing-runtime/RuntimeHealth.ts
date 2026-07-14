/**
 * RuntimeHealth.ts — Sprint 6.3.1
 * Determines and tracks health state: READY | DEGRADED | FAILED | RECOVERING
 */

import type { HealthStatus, ModuleState } from "./SHRTypes";

export interface HealthReport {
  status: HealthStatus;
  score: number;              // 0–100
  totalModules: number;
  readyModules: number;
  degradedModules: number;
  failedModules: number;
  recoveringModules: number;
  details: { moduleId: string; state: ModuleState }[];
  evaluatedAt: number;
}

export class RuntimeHealth {
  private _moduleStates: Map<string, ModuleState> = new Map();
  private _lastReport: HealthReport | null = null;

  updateModule(moduleId: string, state: ModuleState): void {
    this._moduleStates.set(moduleId, state);
  }

  removeModule(moduleId: string): void { this._moduleStates.delete(moduleId); }

  evaluate(): HealthReport {
    const entries = Array.from(this._moduleStates.entries());
    const total       = entries.length;
    const ready       = entries.filter(([, s]) => s === "READY").length;
    const degraded    = entries.filter(([, s]) => s === "DEGRADED").length;
    const failed      = entries.filter(([, s]) => s === "FAILED").length;
    const recovering  = entries.filter(([, s]) => s === "RECOVERING" || s === "RESTARTING").length;

    const score = total === 0 ? 100 : Math.round((ready / total) * 100);

    let status: HealthStatus;
    if (failed > 0)         status = "FAILED";
    else if (recovering > 0)status = "RECOVERING";
    else if (degraded > 0)  status = "DEGRADED";
    else                    status = "READY";

    const report: HealthReport = {
      status, score, totalModules: total,
      readyModules: ready, degradedModules: degraded,
      failedModules: failed, recoveringModules: recovering,
      details: entries.map(([moduleId, state]) => ({ moduleId, state })),
      evaluatedAt: Date.now(),
    };
    this._lastReport = report;
    return report;
  }

  lastReport(): HealthReport | null { return this._lastReport; }

  isHealthy(): boolean {
    const r = this.evaluate();
    return r.status === "READY";
  }
}