// ─── Goal Event Bus ────────────────────────────────────────────────────────────
// Foundation v1.0 · Eventos oficiais do ciclo de vida de Goals

export type GoalEventType =
  | "GoalCreated"
  | "GoalUpdated"
  | "GoalValidated"
  | "GoalRejected"
  | "GoalConvertedToJourney"
  | "GoalArchived";

export interface GoalEvent {
  id: string;
  type: GoalEventType;
  goalId: string;
  journeyId?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

type Listener = (e: GoalEvent) => void;
let _c = 0;
function mkId() { return `gevt_${Date.now()}_${(++_c).toString(36)}`; }

class GoalEventBusImpl {
  private readonly listeners: Listener[] = [];
  private readonly history: GoalEvent[] = [];

  publish(type: GoalEventType, goalId: string, extra?: Partial<GoalEvent>): void {
    const event: GoalEvent = { id: mkId(), type, goalId, timestamp: Date.now(), ...extra };
    this.history.push(event);
    for (const fn of this.listeners) { try { fn(event); } catch { /* isolate */ } }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { const i = this.listeners.indexOf(fn); if (i !== -1) this.listeners.splice(i, 1); };
  }

  getHistory(goalId?: string): GoalEvent[] {
    if (!goalId) return [...this.history];
    return this.history.filter(e => e.goalId === goalId);
  }

  getByType(type: GoalEventType): GoalEvent[] { return this.history.filter(e => e.type === type); }
  size(): number { return this.history.length; }
  clearHistory(): void { this.history.length = 0; }
}

export const goalEventBus = new GoalEventBusImpl();