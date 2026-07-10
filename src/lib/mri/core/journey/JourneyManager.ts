/**
 * MRI — MemoryOS Reference Implementation
 * Journey Manager (MRS Capítulo 2)
 *
 * Ciclo de vida completo de Jornadas.
 * Persistência entre sessões sem perda de contexto.
 */

export type JourneyStatus =
  | "draft"
  | "active"
  | "paused"
  | "blocked"
  | "completed"
  | "archived";

export interface Journey {
  journeyId:       string;
  userId:          string;
  identityContext: string;
  title:           string;
  goal:            string;
  status:          JourneyStatus;
  currentStep?:    string;
  context:         Record<string, unknown>;
  events:          JourneyEvent[];
  createdAt:       string;
  updatedAt:       string;
  completedAt?:    string;
}

export interface JourneyEvent {
  type:      string;
  details?:  unknown;
  timestamp: string;
}

export class JourneyManager {
  private journeys = new Map<string, Journey>();

  create(params: { userId: string; identityContext: string; title: string; goal: string }): Journey {
    const journeyId = `jrn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    const journey: Journey = {
      journeyId,
      userId:          params.userId,
      identityContext: params.identityContext,
      title:           params.title,
      goal:            params.goal,
      status:          "active",
      context:         {},
      events:          [{ type: "journey.created", timestamp: now }],
      createdAt:       now,
      updatedAt:       now,
    };
    this.journeys.set(journeyId, journey);
    return { ...journey };
  }

  get(journeyId: string): Journey | undefined {
    const j = this.journeys.get(journeyId);
    return j ? { ...j } : undefined;
  }

  listActive(userId: string): Journey[] {
    return [...this.journeys.values()]
      .filter(j => j.userId === userId && ["active", "paused", "blocked"].includes(j.status))
      .map(j => ({ ...j }));
  }

  pause(journeyId: string, context?: Record<string, unknown>): Journey {
    return this.transition(journeyId, "paused", "journey.paused", context);
  }

  resume(journeyId: string): Journey {
    return this.transition(journeyId, "active", "journey.resumed");
  }

  block(journeyId: string, reason: string): Journey {
    return this.transition(journeyId, "blocked", "journey.blocked", { reason });
  }

  complete(journeyId: string): Journey {
    const journey = this.transition(journeyId, "completed", "journey.completed");
    journey.completedAt = new Date().toISOString();
    this.journeys.set(journeyId, journey);
    return { ...journey };
  }

  archive(journeyId: string): Journey {
    return this.transition(journeyId, "archived", "journey.archived");
  }

  updateContext(journeyId: string, patch: Record<string, unknown>): void {
    const j = this.journeys.get(journeyId);
    if (!j) throw new Error(`Journey ${journeyId} not found`);
    j.context = { ...j.context, ...patch };
    j.updatedAt = new Date().toISOString();
  }

  private transition(
    journeyId: string,
    status: JourneyStatus,
    eventType: string,
    details?: unknown
  ): Journey {
    const journey = this.journeys.get(journeyId);
    if (!journey) throw new Error(`Journey ${journeyId} not found`);
    const now = new Date().toISOString();
    journey.status    = status;
    journey.updatedAt = now;
    journey.events.push({ type: eventType, details, timestamp: now });
    this.journeys.set(journeyId, journey);
    return { ...journey };
  }
}