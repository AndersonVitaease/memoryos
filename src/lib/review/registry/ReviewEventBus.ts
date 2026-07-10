// ─── Review Event Bus ─────────────────────────────────────────────────────────
// Foundation v1.0 · Publica eventos de cada etapa do pipeline de revisão

export type ReviewEventType =
  | "ReviewStarted"
  | "AnalyzerStarted"
  | "AnalyzerCompleted"
  | "AnalyzerFailed"
  | "ReviewCompleted"
  | "ReviewApproved"
  | "ReviewRejected";

export interface ReviewEvent {
  id: string;
  type: ReviewEventType;
  sprint: string;
  engineId?: string;
  engineName?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

type Listener = (event: ReviewEvent) => void;

let _evtCounter = 0;
function makeEvtId(): string {
  return `revt_${Date.now()}_${(++_evtCounter).toString(36)}`;
}

class ReviewEventBus {
  private readonly listeners: Listener[] = [];
  private readonly history: ReviewEvent[] = [];

  publish(type: ReviewEventType, sprint: string, extra?: Partial<ReviewEvent>): void {
    const event: ReviewEvent = {
      id: makeEvtId(),
      type,
      sprint,
      timestamp: Date.now(),
      ...extra,
    };
    this.history.push(event);
    for (const fn of this.listeners) {
      try { fn(event); } catch { /* isolate */ }
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  getHistory(sprint?: string): ReviewEvent[] {
    if (!sprint) return [...this.history];
    return this.history.filter(e => e.sprint === sprint);
  }

  clearHistory(): void {
    this.history.length = 0;
  }
}

export const reviewEventBus = new ReviewEventBus();