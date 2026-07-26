import type { ResourceIntentCanonicalizationAuditRecord } from "./ResourceIntentCanonicalizationTypes";

let _seq = 0;

function makeEventId(): string {
  return `ricl-audit-${Date.now()}-${(++_seq).toString(36)}`;
}

export interface ResourceIntentCanonicalizationAuditEvent {
  readonly id: string;
  readonly record: ResourceIntentCanonicalizationAuditRecord;
}

class ResourceIntentCanonicalizationAuditStoreClass {
  private _events: ResourceIntentCanonicalizationAuditEvent[] = [];

  record(record: ResourceIntentCanonicalizationAuditRecord): ResourceIntentCanonicalizationAuditEvent {
    const event: ResourceIntentCanonicalizationAuditEvent = Object.freeze({
      id: makeEventId(),
      record,
    });
    this._events.push(event);
    if (this._events.length > 300) {
      this._events.splice(0, this._events.length - 300);
    }
    return event;
  }

  getAll(): readonly ResourceIntentCanonicalizationAuditEvent[] {
    return [...this._events];
  }

  clear(): void {
    this._events = [];
  }

  export(): string {
    return JSON.stringify(this._events, null, 2);
  }

  getMetrics(): {
    readonly total: number;
    readonly candidateGenerationEnabled: number;
    readonly totalCandidatesGenerated: number;
    readonly averageCandidatesPerRequest: number;
    readonly averageGenerationDurationMs: number;
  } {
    let candidateGenerationEnabled = 0;
    let totalCandidatesGenerated = 0;
    let generationDurationAcc = 0;

    for (const event of this._events) {
      if (event.record.candidateGeneration.enabled) {
        candidateGenerationEnabled++;
      }
      totalCandidatesGenerated += event.record.candidateGeneration.candidateCount;
      generationDurationAcc += event.record.candidateGeneration.generationDurationMs;
    }

    const averageCandidatesPerRequest = this._events.length === 0
      ? 0
      : totalCandidatesGenerated / this._events.length;
    const averageGenerationDurationMs = this._events.length === 0
      ? 0
      : generationDurationAcc / this._events.length;

    return Object.freeze({
      total: this._events.length,
      candidateGenerationEnabled,
      totalCandidatesGenerated,
      averageCandidatesPerRequest,
      averageGenerationDurationMs,
    });
  }
}

const _KEY = "__RICL_AUDIT_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ResourceIntentCanonicalizationAuditStoreClass();
}

export const resourceIntentCanonicalizationAuditStore: ResourceIntentCanonicalizationAuditStoreClass = (
  globalThis as unknown as Record<string, ResourceIntentCanonicalizationAuditStoreClass>
)[_KEY];
