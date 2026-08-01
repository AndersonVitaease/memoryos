/**
 * EventBusTypes.ts — Core SDK
 * Public contracts for Universal Event Bus interaction.
 * MCS-compliant — SDK consumers subscribe/publish via these interfaces only.
 */

export type CoreEventType =
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "session.created"
  | "session.closed"
  | "memory.updated"
  | "goal.detected"
  | "goal.completed"
  | "connector.invoked"
  | "connector.failed"
  | "knowledge.updated";

export interface CoreEvent {
  readonly type: CoreEventType | string;
  readonly payload: Record<string, unknown>;
  readonly executionId?: string;
  readonly sessionId?: string;
  readonly timestamp: number;
}

export type EventHandler = (event: CoreEvent) => void | Promise<void>;

export interface IEventPublisher {
  publish(event: Omit<CoreEvent, "timestamp">): void;
}

export interface IEventSubscriber {
  subscribe(eventType: string, handler: EventHandler): () => void;
}