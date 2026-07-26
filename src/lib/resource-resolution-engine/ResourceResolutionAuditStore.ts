import type { ResourceResolutionAttempt, ResourceResolutionGlobalMetrics } from "./ResourceResolutionTypes";

let _seq = 0;

export interface ResourceResolutionAuditRecord {
  readonly traceId: string;
  readonly connector: string;
  readonly featureEnabled: boolean;
  readonly usedFallback: boolean;
  readonly totalAttempts: number;
  readonly winnerCandidateId: string | null;
  readonly winnerStrategy: string | null;
  readonly attempts: readonly ResourceResolutionAttempt[];
  readonly durationMs: number;
  readonly exhausted: boolean;
  readonly result: "success" | "failure";
  readonly error: string | null;
}

export interface ResourceResolutionAuditEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly record: ResourceResolutionAuditRecord;
}

function makeId(): string {
  return `res-res-${Date.now()}-${(++_seq).toString(36)}`;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

class ResourceResolutionAuditStoreClass {
  private _events: ResourceResolutionAuditEvent[] = [];

  record(record: ResourceResolutionAuditRecord): ResourceResolutionAuditEvent {
    const event: ResourceResolutionAuditEvent = Object.freeze({
      id: makeId(),
      timestamp: new Date().toISOString(),
      record,
    });
    this._events.push(event);
    if (this._events.length > 1000) {
      this._events.splice(0, this._events.length - 1000);
    }
    return event;
  }

  clear(): void {
    this._events = [];
  }

  getAll(): readonly ResourceResolutionAuditEvent[] {
    return [...this._events];
  }

  export(): string {
    return JSON.stringify(this._events, null, 2);
  }

  getMetrics(): ResourceResolutionGlobalMetrics {
    const total = this._events.length;
    if (total === 0) {
      return Object.freeze({
        totalResolutions: 0,
        successRate: 0,
        fallbackRate: 0,
        averageAttempts: 0,
        winnerStrategy: Object.freeze({}),
        resolutionTime: Object.freeze({ averageMs: 0, p95Ms: 0, maxMs: 0 }),
        connectorBreakdown: Object.freeze({}),
      });
    }

    let successes = 0;
    let fallbacks = 0;
    let attemptsSum = 0;
    const durations: number[] = [];
    const winnerStrategy: Record<string, number> = {};
    const connectorBreakdown: Record<string, {
      total: number;
      successes: number;
      fallbacks: number;
      attemptsSum: number;
      durationSum: number;
    }> = {};

    for (const event of this._events) {
      const record = event.record;
      if (record.result === "success") successes++;
      if (record.usedFallback) fallbacks++;
      attemptsSum += record.totalAttempts;
      durations.push(record.durationMs);

      if (record.winnerStrategy) {
        winnerStrategy[record.winnerStrategy] = (winnerStrategy[record.winnerStrategy] ?? 0) + 1;
      }

      if (!connectorBreakdown[record.connector]) {
        connectorBreakdown[record.connector] = {
          total: 0,
          successes: 0,
          fallbacks: 0,
          attemptsSum: 0,
          durationSum: 0,
        };
      }

      const row = connectorBreakdown[record.connector];
      row.total++;
      row.attemptsSum += record.totalAttempts;
      row.durationSum += record.durationMs;
      if (record.result === "success") row.successes++;
      if (record.usedFallback) row.fallbacks++;
    }

    const normalizedBreakdown: Record<string, {
      total: number;
      successes: number;
      fallbacks: number;
      averageAttempts: number;
      averageDurationMs: number;
    }> = {};

    for (const [connector, row] of Object.entries(connectorBreakdown)) {
      normalizedBreakdown[connector] = Object.freeze({
        total: row.total,
        successes: row.successes,
        fallbacks: row.fallbacks,
        averageAttempts: row.total === 0 ? 0 : row.attemptsSum / row.total,
        averageDurationMs: row.total === 0 ? 0 : row.durationSum / row.total,
      });
    }

    return Object.freeze({
      totalResolutions: total,
      successRate: successes / total,
      fallbackRate: fallbacks / total,
      averageAttempts: attemptsSum / total,
      winnerStrategy: Object.freeze({ ...winnerStrategy }),
      resolutionTime: Object.freeze({
        averageMs: durations.reduce((sum, item) => sum + item, 0) / total,
        p95Ms: percentile(durations, 95),
        maxMs: Math.max(...durations),
      }),
      connectorBreakdown: Object.freeze(normalizedBreakdown),
    });
  }
}

const _KEY = "__RESOURCE_RESOLUTION_AUDIT_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ResourceResolutionAuditStoreClass();
}

export const resourceResolutionAuditStore: ResourceResolutionAuditStoreClass = (
  globalThis as unknown as Record<string, ResourceResolutionAuditStoreClass>
)[_KEY];
