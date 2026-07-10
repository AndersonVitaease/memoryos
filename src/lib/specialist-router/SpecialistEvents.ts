// ─── Specialist Router Event Bus ───────────────────────────────────────────────
// Foundation v1.0 · 6 official routing lifecycle events

export type RoutingEventType =
  | "SpecialistDiscoveryStarted"
  | "SpecialistMatched"
  | "SpecialistRanked"
  | "SpecialistSelected"
  | "SpecialistRejected"
  | "RoutingCompleted";

export interface RoutingEvent {
  id:          string;
  type:        RoutingEventType;
  sessionId:   string;
  goalId?:     string;
  specialistId?: string;
  timestamp:   number;
  meta?:       Record<string, unknown>;
}

type Listener = (e: RoutingEvent) => void;
let _c = 0;
function mkId() { return `revt_${Date.now()}_${(++_c).toString(36)}`; }

class SpecialistEventBusImpl {
  private readonly listeners: Listener[] = [];
  private readonly history: RoutingEvent[] = [];

  publish(type: RoutingEventType, sessionId: string, extra?: Partial<RoutingEvent>): void {
    const event: RoutingEvent = { id: mkId(), type, sessionId, timestamp: Date.now(), ...extra };
    this.history.push(event);
    for (const fn of this.listeners) { try { fn(event); } catch { /* isolate */ } }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { const i = this.listeners.indexOf(fn); if (i !== -1) this.listeners.splice(i, 1); };
  }

  getHistory(sessionId?: string): RoutingEvent[] {
    if (!sessionId) return [...this.history];
    return this.history.filter(e => e.sessionId === sessionId);
  }

  getByType(type: RoutingEventType): RoutingEvent[] { return this.history.filter(e => e.type === type); }
  size(): number { return this.history.length; }
}

export const routingEventBus = new SpecialistEventBusImpl();