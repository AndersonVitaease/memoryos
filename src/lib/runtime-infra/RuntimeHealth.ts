// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeHealth
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export type HealthStatus = "READY" | "DEGRADED" | "FAILED" | "RECOVERING" | "STOPPED";

export interface HealthReport {
  status: HealthStatus;
  reason: string;
  since: number;
  activeExecutions: number;
  totalExecutions: number;
}

export class RuntimeHealth {
  private _status: HealthStatus = "READY";
  private _reason = "Initialized";
  private _since: number;
  private _activeExecutions = 0;
  private _totalExecutions = 0;
  private _clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this._clock = clock;
    this._since = clock();
  }

  transition(status: HealthStatus, reason: string): void {
    if (this._status === status) return;
    this._status = status;
    this._reason = reason;
    this._since = this._clock();
  }

  incrementActive(): void { this._activeExecutions++; this._totalExecutions++; }
  decrementActive(): void { if (this._activeExecutions > 0) this._activeExecutions--; }

  evaluate(failures: number, timeouts: number): HealthStatus {
    const total = failures + timeouts;
    if (this._status === "STOPPED") return "STOPPED";
    if (total === 0) { this.transition("READY", "No errors"); return "READY"; }
    if (total < 3) { this.transition("DEGRADED", `${total} errors`); return "DEGRADED"; }
    if (total < 10) { this.transition("FAILED", `${total} errors`); return "FAILED"; }
    this.transition("FAILED", `Critical: ${total} errors`);
    return "FAILED";
  }

  stop(): void { this.transition("STOPPED", "Runtime stopped"); }
  recover(): void { this.transition("RECOVERING", "Recovery in progress"); }

  report(): HealthReport {
    return Object.freeze({
      status: this._status,
      reason: this._reason,
      since: this._since,
      activeExecutions: this._activeExecutions,
      totalExecutions: this._totalExecutions,
    });
  }

  status(): HealthStatus { return this._status; }
}