// ─── PIE Event Bus ─────────────────────────────────────────────────────────────
// Foundation v1.0 · 6 official PIE lifecycle events

export type PIEEventType =
  | "PlanningStarted"
  | "AlternativePlanGenerated"
  | "PlanCompared"
  | "PlanOptimized"
  | "PlanSelected"
  | "PlanningCompleted";

export interface PIEEvent {
  id:        string;
  type:      PIEEventType;
  sessionId: string;
  goalId?:   string;
  planId?:   string;
  timestamp: number;
  meta?:     Record<string, unknown>;
}

type Listener = (e: PIEEvent) => void;
let _c = 0;
function mkId() { return `pievt_${Date.now()}_${(++_c).toString(36)}`; }

class PIEEventBusImpl {
  private readonly listeners: Listener[] = [];
  private readonly history: PIEEvent[] = [];

  publish(type: PIEEventType, sessionId: string, extra?: Partial<PIEEvent>): void {
    const event: PIEEvent = { id: mkId(), type, sessionId, timestamp: Date.now(), ...extra };
    this.history.push(event);
    for (const fn of this.listeners) { try { fn(event); } catch { /* isolate */ } }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { const i = this.listeners.indexOf(fn); if (i !== -1) this.listeners.splice(i, 1); };
  }

  getHistory(sessionId?: string): PIEEvent[] {
    if (!sessionId) return [...this.history];
    return this.history.filter(e => e.sessionId === sessionId);
  }

  getByType(type: PIEEventType): PIEEvent[] { return this.history.filter(e => e.type === type); }
  size(): number { return this.history.length; }
}

export const pieEventBus = new PIEEventBusImpl();