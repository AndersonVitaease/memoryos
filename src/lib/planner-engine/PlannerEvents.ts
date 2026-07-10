// ─── Planner Event Bus ─────────────────────────────────────────────────────────
// Foundation v1.0 · Eventos oficiais do ciclo de vida de ExecutionPlans

export type PlanEventType =
  | "PlanCreated"
  | "PlanValidated"
  | "PlanRejected"
  | "PlanUpdated"
  | "PlanArchived"
  | "PlanConvertedToJourney";

export interface PlanEvent {
  id: string;
  type: PlanEventType;
  planId: string;
  goalId?: string;
  journeyId?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

type Listener = (e: PlanEvent) => void;
let _c = 0;
function mkId() { return `pevt_${Date.now()}_${(++_c).toString(36)}`; }

class PlannerEventBusImpl {
  private readonly listeners: Listener[] = [];
  private readonly history: PlanEvent[] = [];

  publish(type: PlanEventType, planId: string, extra?: Partial<PlanEvent>): void {
    const event: PlanEvent = { id: mkId(), type, planId, timestamp: Date.now(), ...extra };
    this.history.push(event);
    for (const fn of this.listeners) { try { fn(event); } catch { /* isolate */ } }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { const i = this.listeners.indexOf(fn); if (i !== -1) this.listeners.splice(i, 1); };
  }

  getHistory(planId?: string): PlanEvent[] {
    if (!planId) return [...this.history];
    return this.history.filter(e => e.planId === planId);
  }

  getByType(type: PlanEventType): PlanEvent[] { return this.history.filter(e => e.type === type); }
  size(): number { return this.history.length; }
  clearHistory(): void { this.history.length = 0; }
}

export const plannerEventBus = new PlannerEventBusImpl();