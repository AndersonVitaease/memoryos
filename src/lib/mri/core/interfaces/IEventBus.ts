/**
 * MRI — MemoryOS Reference Implementation
 * IEventBus — Interface oficial do Event Bus (MCS Capítulo 6)
 */

export type EventPriority = "HIGH" | "NORMAL" | "LOW";

export interface UniversalEvent {
  eventId:      string;
  type:         string;
  sourceEngine: string;
  priority:     EventPriority;
  payload:      unknown;
  timestamp:    string;
  correlationId?: string;   // executionId para rastreabilidade
  retryCount?:  number;
}

export type EventHandler = (event: UniversalEvent) => Promise<void>;
export type UnsubscribeFn = () => void;

export interface IEventPublisher {
  publish(event: Omit<UniversalEvent, "eventId" | "timestamp">): Promise<void>;
  publishBatch(events: Array<Omit<UniversalEvent, "eventId" | "timestamp">>): Promise<void>;
}

export interface IEventSubscriber {
  subscribe(eventType: string, handler: EventHandler): UnsubscribeFn;
  subscribePattern(pattern: RegExp, handler: EventHandler): UnsubscribeFn;
}

export interface IEventBus extends IEventPublisher, IEventSubscriber {
  getStats(): { published: number; delivered: number; failed: number; dlqSize: number };
}