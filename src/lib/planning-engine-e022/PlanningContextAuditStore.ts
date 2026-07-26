import type {
  PlanningContextAuditRecord,
  PlanningContextMetrics,
} from "./PlanningContextTypes";

let _seq = 0;

export interface PlanningContextAuditEvent {
  readonly id: string;
  readonly record: PlanningContextAuditRecord;
}

function makeId(): string {
  return `planning-context-audit-${Date.now()}-${(++_seq).toString(36)}`;
}

class PlanningContextAuditStoreClass {
  private _events: PlanningContextAuditEvent[] = [];

  record(record: PlanningContextAuditRecord): PlanningContextAuditEvent {
    const event: PlanningContextAuditEvent = Object.freeze({
      id: makeId(),
      record,
    });
    this._events.push(event);
    if (this._events.length > 500) {
      this._events.splice(0, this._events.length - 500);
    }
    return event;
  }

  getAll(): readonly PlanningContextAuditEvent[] {
    return [...this._events];
  }

  clear(): void {
    this._events = [];
  }

  export(): string {
    return JSON.stringify(this._events, null, 2);
  }

  getMetrics(): PlanningContextMetrics {
    let withCanonicalResourceRequest = 0;
    let divergences = 0;
    let validComparisons = 0;
    let crrReads = 0;
    let goalReads = 0;
    let fallbackCount = 0;
    let dualReadDivergences = 0;
    let coverageAcc = 0;

    for (const event of this._events) {
      if (event.record.comparison.hasCanonicalResourceRequest) {
        withCanonicalResourceRequest++;
      }
      if (event.record.comparison.divergences.length > 0) {
        divergences++;
      }
      if (event.record.comparison.valid) {
        validComparisons++;
      }

      const sources = event.record.dualRead.fieldSources;
      crrReads += Object.values(sources).filter((s) => s === "crr").length;
      goalReads += Object.values(sources).filter((s) => s === "goal").length;
      fallbackCount += event.record.dualRead.fallbackCount;
      dualReadDivergences += event.record.dualRead.divergences.length;
      coverageAcc += event.record.dualRead.crrCoverage;
    }

    const averageCrrCoverage = this._events.length === 0 ? 0 : coverageAcc / this._events.length;

    return Object.freeze({
      total: this._events.length,
      withCanonicalResourceRequest,
      divergences,
      validComparisons,
      crrReads,
      goalReads,
      fallbackCount,
      dualReadDivergences,
      averageCrrCoverage,
    });
  }
}

const _KEY = "__PLANNING_CONTEXT_AUDIT_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new PlanningContextAuditStoreClass();
}

export const planningContextAuditStore: PlanningContextAuditStoreClass = (
  globalThis as unknown as Record<string, PlanningContextAuditStoreClass>
)[_KEY];
