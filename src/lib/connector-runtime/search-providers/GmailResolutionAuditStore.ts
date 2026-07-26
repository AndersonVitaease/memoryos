let _seq = 0;

export interface GmailResolutionAuditRecord {
  readonly provider: string;
  readonly connector: string;
  readonly winnerCandidate: string | null;
  readonly winnerStrategy: string | null;
  readonly totalAttempts: number;
  readonly fallback: boolean;
  readonly success: boolean;
  readonly durationMs: number;
}

export interface GmailResolutionAuditEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly record: GmailResolutionAuditRecord;
}

function makeId(): string {
  return `gmail-res-${Date.now()}-${(++_seq).toString(36)}`;
}

class GmailResolutionAuditStoreClass {
  private _events: GmailResolutionAuditEvent[] = [];

  record(record: GmailResolutionAuditRecord): GmailResolutionAuditEvent {
    const event: GmailResolutionAuditEvent = Object.freeze({
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

  getAll(): readonly GmailResolutionAuditEvent[] {
    return [...this._events];
  }
}

const _KEY = "__GMAIL_RESOLUTION_AUDIT_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GmailResolutionAuditStoreClass();
}

export const gmailResolutionAuditStore: GmailResolutionAuditStoreClass = (
  globalThis as unknown as Record<string, GmailResolutionAuditStoreClass>
)[_KEY];
