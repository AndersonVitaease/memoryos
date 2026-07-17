// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeQueue
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

import type { IQueue, QueueMeta, QueueMode } from "./RuntimeQueueTypes";

interface Slot<T> { item: T; meta: QueueMeta; }

// ── FIFOQueue ─────────────────────────────────────────────────────────────────
export class FIFOQueue<T> implements IQueue<T> {
  private _q: T[] = [];
  enqueue(item: T): void { this._q.push(item); }
  dequeue(): T | undefined { return this._q.shift(); }
  peek(): T | undefined { return this._q[0]; }
  size(): number { return this._q.length; }
  isEmpty(): boolean { return this._q.length === 0; }
  drain(): T[] { const out = [...this._q]; this._q = []; return out; }
  mode(): QueueMode { return "FIFO"; }
}

// ── LIFOQueue ─────────────────────────────────────────────────────────────────
export class LIFOQueue<T> implements IQueue<T> {
  private _q: T[] = [];
  enqueue(item: T): void { this._q.push(item); }
  dequeue(): T | undefined { return this._q.pop(); }
  peek(): T | undefined { return this._q[this._q.length - 1]; }
  size(): number { return this._q.length; }
  isEmpty(): boolean { return this._q.length === 0; }
  drain(): T[] { const out = [...this._q].reverse(); this._q = []; return out; }
  mode(): QueueMode { return "LIFO"; }
}

// ── PriorityQueue ─────────────────────────────────────────────────────────────
export class PriorityQueue<T> implements IQueue<T> {
  private _q: Slot<T>[] = [];
  enqueue(item: T, meta: QueueMeta = {}): void {
    this._q.push({ item, meta });
    this._q.sort((a, b) => (b.meta.priority ?? 0) - (a.meta.priority ?? 0));
  }
  dequeue(): T | undefined { return this._q.shift()?.item; }
  peek(): T | undefined { return this._q[0]?.item; }
  size(): number { return this._q.length; }
  isEmpty(): boolean { return this._q.length === 0; }
  drain(): T[] { const out = this._q.map(s => s.item); this._q = []; return out; }
  mode(): QueueMode { return "PRIORITY"; }
}

// ── WeightedQueue ─────────────────────────────────────────────────────────────
export class WeightedQueue<T> implements IQueue<T> {
  private _q: Slot<T>[] = [];
  enqueue(item: T, meta: QueueMeta = {}): void { this._q.push({ item, meta: { weight: 1, ...meta } }); }
  dequeue(): T | undefined {
    if (this._q.length === 0) return undefined;
    const totalWeight = this._q.reduce((s, x) => s + (x.meta.weight ?? 1), 0);
    let rnd = Math.random() * totalWeight;
    for (let i = 0; i < this._q.length; i++) {
      rnd -= (this._q[i].meta.weight ?? 1);
      if (rnd <= 0) { return this._q.splice(i, 1)[0].item; }
    }
    return this._q.splice(0, 1)[0].item;
  }
  peek(): T | undefined { return this._q[0]?.item; }
  size(): number { return this._q.length; }
  isEmpty(): boolean { return this._q.length === 0; }
  drain(): T[] { const out = this._q.map(s => s.item); this._q = []; return out; }
  mode(): QueueMode { return "WEIGHTED"; }
}

// ── FutureQueue ───────────────────────────────────────────────────────────────
export class FutureQueue<T> implements IQueue<T> {
  private _q: Slot<T>[] = [];
  private _clock: () => number;
  constructor(clock: () => number = () => Date.now()) { this._clock = clock; }
  enqueue(item: T, meta: QueueMeta = {}): void { this._q.push({ item, meta: { readyAt: 0, ...meta } }); }
  dequeue(): T | undefined {
    const now = this._clock();
    const idx = this._q.findIndex(s => (s.meta.readyAt ?? 0) <= now);
    if (idx < 0) return undefined;
    return this._q.splice(idx, 1)[0].item;
  }
  peek(): T | undefined {
    const now = this._clock();
    return this._q.find(s => (s.meta.readyAt ?? 0) <= now)?.item;
  }
  size(): number { return this._q.length; }
  isEmpty(): boolean { return this._q.length === 0; }
  drain(): T[] { const out = this._q.map(s => s.item); this._q = []; return out; }
  mode(): QueueMode { return "FUTURE"; }
}

// ── Factory ───────────────────────────────────────────────────────────────────
export function createQueue<T>(mode: QueueMode, clock?: () => number): IQueue<T> {
  switch (mode) {
    case "FIFO":     return new FIFOQueue<T>();
    case "LIFO":     return new LIFOQueue<T>();
    case "PRIORITY": return new PriorityQueue<T>();
    case "WEIGHTED": return new WeightedQueue<T>();
    case "FUTURE":   return new FutureQueue<T>(clock);
    default:         return new FIFOQueue<T>();
  }
}