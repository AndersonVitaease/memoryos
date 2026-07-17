// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeEventBus
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

import type { RuntimeEvent, RuntimeEventType } from "./RuntimeEvent";

export type EventHandler = (event: RuntimeEvent) => void;

export class RuntimeEventBus {
  private readonly _listeners: Map<RuntimeEventType | "*", EventHandler[]> = new Map();
  private readonly _history: RuntimeEvent[] = [];
  private readonly _maxHistory: number;

  constructor(maxHistory = 500) { this._maxHistory = maxHistory; }

  // ── publish ──────────────────────────────────────────────────────────────
  publish(event: RuntimeEvent): void {
    const frozen = Object.freeze(event);
    if (this._history.length >= this._maxHistory) this._history.shift();
    this._history.push(frozen);

    // wildcard listeners
    (this._listeners.get("*") ?? []).forEach(h => h(frozen));
    // typed listeners
    (this._listeners.get(event.type) ?? []).forEach(h => h(frozen));
  }

  // ── subscribe ─────────────────────────────────────────────────────────────
  subscribe(type: RuntimeEventType | "*", handler: EventHandler): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type)!.push(handler);
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe(type: RuntimeEventType | "*", handler: EventHandler): void {
    const list = this._listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  // ── query ─────────────────────────────────────────────────────────────────
  history(): Readonly<RuntimeEvent[]> { return Object.freeze([...this._history]); }
  ofType(type: RuntimeEventType): RuntimeEvent[] { return this._history.filter(e => e.type === type); }
  forExecution(id: string): RuntimeEvent[] { return this._history.filter(e => e.executionId === id); }
  clear(): void { this._history.length = 0; }
  count(): number { return this._history.length; }
}