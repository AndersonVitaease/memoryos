let _seq = 0;

export interface CandidateAttemptAudit {
  readonly candidateId: string;
  readonly value: string;
  readonly strategy: string;
  readonly priority: number;
  readonly success: boolean;
  readonly reason: string;
  readonly durationMs: number;
}

export interface CandidateResolutionAuditRecord {
  readonly traceId: string;
  readonly featureEnabled: boolean;
  readonly usedFallback: boolean;
  readonly totalAttempts: number;
  readonly winnerCandidateId: string | null;
  readonly attempts: readonly CandidateAttemptAudit[];
  readonly durationMs: number;
  readonly exhausted: boolean;
}

export interface CandidateResolutionAuditEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly record: CandidateResolutionAuditRecord;
}

function makeId(): string {
  return `cand-res-${Date.now()}-${(++_seq).toString(36)}`;
}

class CandidateResolutionAuditStoreClass {
  private _events: CandidateResolutionAuditEvent[] = [];

  record(record: CandidateResolutionAuditRecord): CandidateResolutionAuditEvent {
    const event: CandidateResolutionAuditEvent = Object.freeze({
      id: makeId(),
      timestamp: new Date().toISOString(),
      record,
    });
    this._events.push(event);
    if (this._events.length > 500) {
      this._events.splice(0, this._events.length - 500);
    }
    return event;
  }

  clear(): void {
    this._events = [];
  }

  getAll(): readonly CandidateResolutionAuditEvent[] {
    return [...this._events];
  }

  export(): string {
    return JSON.stringify(this._events, null, 2);
  }

  getMetrics(): {
    readonly totalResolutions: number;
    readonly firstCandidateSuccess: number;
    readonly secondCandidateSuccess: number;
    readonly thirdCandidateSuccess: number;
    readonly averageCandidatesUsed: number;
    readonly successRate: number;
    readonly fallbackRate: number;
    readonly exhaustedCandidates: number;
  } {
    let successes = 0;
    let firstCandidateSuccess = 0;
    let secondCandidateSuccess = 0;
    let thirdCandidateSuccess = 0;
    let totalAttempts = 0;
    let fallbacks = 0;
    let exhaustedCandidates = 0;

    for (const event of this._events) {
      totalAttempts += event.record.totalAttempts;
      if (event.record.usedFallback) {
        fallbacks++;
      }
      if (event.record.exhausted) {
        exhaustedCandidates++;
      }

      const winIndex = event.record.attempts.findIndex((a) => a.success);
      if (winIndex >= 0) {
        successes++;
        if (winIndex === 0) firstCandidateSuccess++;
        if (winIndex === 1) secondCandidateSuccess++;
        if (winIndex === 2) thirdCandidateSuccess++;
      }
    }

    const totalResolutions = this._events.length;
    const averageCandidatesUsed = totalResolutions === 0 ? 0 : totalAttempts / totalResolutions;
    const successRate = totalResolutions === 0 ? 0 : successes / totalResolutions;
    const fallbackRate = totalResolutions === 0 ? 0 : fallbacks / totalResolutions;

    return Object.freeze({
      totalResolutions,
      firstCandidateSuccess,
      secondCandidateSuccess,
      thirdCandidateSuccess,
      averageCandidatesUsed,
      successRate,
      fallbackRate,
      exhaustedCandidates,
    });
  }
}

const _KEY = "__CANDIDATE_RESOLUTION_AUDIT_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CandidateResolutionAuditStoreClass();
}

export const candidateResolutionAuditStore: CandidateResolutionAuditStoreClass = (
  globalThis as unknown as Record<string, CandidateResolutionAuditStoreClass>
)[_KEY];
