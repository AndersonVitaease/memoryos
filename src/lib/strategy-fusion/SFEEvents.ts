// ─── Strategy Fusion Engine — Event Bus ────────────────────────────────────────
// Foundation v1.0 · 7 official lifecycle events

export type FusionEventType =
  | "StrategyRequested"
  | "StrategyReceived"
  | "ConflictDetected"
  | "ConflictResolved"
  | "StrategyMerged"
  | "UnifiedStrategyCreated"
  | "FusionCompleted";

export interface FusionEvent {
  id:         string;
  type:       FusionEventType;
  sessionId:  string;
  goalId?:    string;
  specialistId?: string;
  timestamp:  number;
  meta?:      Record<string, unknown>;
}

type Listener = (e: FusionEvent) => void;
let _c = 0;
function mkId() { return `fevt_${Date.now()}_${(++_c).toString(36)}`; }

class SFEEventBusImpl {
  private readonly listeners: Listener[] = [];
  private readonly history:   FusionEvent[] = [];

  publish(type: FusionEventType, sessionId: string, extra?: Partial<FusionEvent>): void {
    const event: FusionEvent = { id: mkId(), type, sessionId, timestamp: Date.now(), ...extra };
    this.history.push(event);
    for (const fn of this.listeners) { try { fn(event); } catch { /* isolate */ } }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { const i = this.listeners.indexOf(fn); if (i !== -1) this.listeners.splice(i, 1); };
  }

  getHistory(sessionId?: string): FusionEvent[] {
    if (!sessionId) return [...this.history];
    return this.history.filter(e => e.sessionId === sessionId);
  }

  getByType(type: FusionEventType): FusionEvent[] { return this.history.filter(e => e.type === type); }
  size(): number { return this.history.length; }
}

export const fusionEventBus = new SFEEventBusImpl();