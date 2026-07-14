/**
 * RuntimeRecovery.ts — Sprint 6.3.1
 * Handles module failure recovery with up to 3 automatic retries.
 * After max attempts: marks DEGRADED, records RCA, notifies event bus.
 */

import type { RecoveryAttempt, RecoveryHistoryEntry } from "./SHRTypes";
import { RuntimeEventBus } from "./RuntimeEventBus";

let _seq = 0;
function makeId(): string { return `rec_${Date.now()}_${++_seq}`; }

export interface RecoveryProcedure {
  moduleId: string;
  recover: () => Promise<boolean>;
}

export class RuntimeRecovery {
  private readonly _maxAttempts = 3;
  private _bus: RuntimeEventBus;
  private _history: RecoveryHistoryEntry[] = [];
  private _activeAttempts: Map<string, RecoveryAttempt[]> = new Map();

  constructor(bus: RuntimeEventBus) { this._bus = bus; }

  async recover(procedure: RecoveryProcedure): Promise<RecoveryHistoryEntry> {
    const { moduleId, recover } = procedure;
    const t0 = Date.now();
    const attempts: RecoveryAttempt[] = [];

    this._bus.emit("RecoveryStarted", { moduleId, maxAttempts: this._maxAttempts });

    let success = false;
    let lastError = "";

    for (let attempt = 1; attempt <= this._maxAttempts; attempt++) {
      const rec: RecoveryAttempt = {
        id: makeId(), moduleId, attempt,
        maxAttempts: this._maxAttempts,
        startedAt: Date.now(), success: false,
      };

      try {
        success = await recover();
        rec.success = success;
        rec.completedAt = Date.now();
        attempts.push(rec);
        if (success) {
          this._bus.emit("ModuleRecovered", { moduleId, attempt });
          break;
        }
      } catch (e) {
        lastError = String(e);
        rec.success = false;
        rec.completedAt = Date.now();
        rec.errorDetail = lastError;
        attempts.push(rec);
      }

      if (attempt < this._maxAttempts) {
        // small backoff: 500ms * attempt
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }

    const finalResult = success ? "RECOVERED" : attempts.length >= this._maxAttempts ? "DEGRADED" : "FAILED";
    const rca = success
      ? ""
      : `Module ${moduleId} failed after ${this._maxAttempts} attempts. Last error: ${lastError || "unknown"}`;

    const entry: RecoveryHistoryEntry = {
      id: makeId(), timestamp: Date.now(), moduleId,
      attempts: attempts.length, finalResult,
      totalDurationMs: Date.now() - t0, rca,
    };

    this._history.unshift(entry);
    if (this._history.length > 100) this._history.splice(100);

    this._bus.emit("RecoveryFinished", { moduleId, result: finalResult, rca, attempts: attempts.length });
    return entry;
  }

  history(): RecoveryHistoryEntry[] { return [...this._history]; }

  byModule(moduleId: string): RecoveryHistoryEntry[] {
    return this._history.filter(e => e.moduleId === moduleId);
  }

  successRate(): number {
    if (this._history.length === 0) return 100;
    const ok = this._history.filter(e => e.finalResult === "RECOVERED").length;
    return Math.round((ok / this._history.length) * 100);
  }
}