// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeQueueTypes
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export type QueueMode = "FIFO" | "LIFO" | "PRIORITY" | "WEIGHTED" | "FUTURE";

export interface IQueue<T> {
  enqueue(item: T, meta?: QueueMeta): void;
  dequeue(): T | undefined;
  peek(): T | undefined;
  size(): number;
  isEmpty(): boolean;
  drain(): T[];
  mode(): QueueMode;
}

export interface QueueMeta {
  priority?: number;   // higher = dequeued first (PRIORITY mode)
  weight?: number;     // WEIGHTED mode
  readyAt?: number;    // FUTURE mode: epoch ms when item becomes ready
}