// ─── Journey Event Bus ────────────────────────────────────────────────────────
// Foundation v1.0 · Eventos oficiais do ciclo de vida de Journeys e Tasks

export type JourneyEventType =
  | "JourneyCreated"   | "JourneyUpdated"   | "JourneyStarted"
  | "JourneyPaused"    | "JourneyResumed"   | "JourneyCompleted"
  | "JourneyCancelled" | "JourneyFailed"    | "JourneyArchived"
  | "TaskCreated"      | "TaskStarted"      | "TaskCompleted" | "TaskFailed";

export interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  journeyId: string;
  taskId?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

type Listener = (event: JourneyEvent) => void;

let _c = 0;
function mkId() { return `jevt_${Date.now()}_${(++_c).toString(36)}`; }

class JourneyEventBusImpl {
  private readonly listeners: Listener[] = [];
  private readonly history: JourneyEvent[] = [];

  publish(type: JourneyEventType, journeyId: string, extra?: Partial<JourneyEvent>): void {
    const event: JourneyEvent = { id: mkId(), type, journeyId, timestamp: Date.now(), ...extra };
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

  getHistory(journeyId?: string): JourneyEvent[] {
    if (!journeyId) return [...this.history];
    return this.history.filter(e => e.journeyId === journeyId);
  }

  getByType(type: JourneyEventType): JourneyEvent[] {
    return this.history.filter(e => e.type === type);
  }

  size(): number { return this.history.length; }
  clearHistory(): void { this.history.length = 0; }
}

export const journeyEventBus = new JourneyEventBusImpl();