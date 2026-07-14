/**
 * RuntimeEventBus.ts — Sprint 6.3.1
 * Internal event bus for all Self-Healing Runtime events.
 */

import type { SHREvent, SHREventType } from "./SHRTypes";

type Listener = (event: SHREvent) => void;

let _seq = 0;
function makeId(): string { return `shr_evt_${Date.now()}_${++_seq}`; }

export class RuntimeEventBus {
  private _listeners: Map<SHREventType | "*", Listener[]> = new Map();
  private _history: SHREvent[] = [];
  private readonly _maxHistory = 200;

  emit(type: SHREventType, payload: Record<string, unknown> = {}): SHREvent {
    const event: SHREvent = { id: makeId(), type, timestamp: Date.now(), payload };
    this._history.unshift(event);
    if (this._history.length > this._maxHistory) this._history.splice(this._maxHistory);

    // notify type-specific listeners
    (this._listeners.get(type) ?? []).forEach(fn => { try { fn(event); } catch {} });
    // notify wildcard listeners
    (this._listeners.get("*") ?? []).forEach(fn => { try { fn(event); } catch {} });

    return event;
  }

  on(type: SHREventType | "*", listener: Listener): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type)!.push(listener);
    return () => {
      const arr = this._listeners.get(type) ?? [];
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  history(limit = 50): SHREvent[] { return this._history.slice(0, limit); }

  clear(): void { this._history = []; }

  listenerCount(): number {
    let n = 0;
    this._listeners.forEach(arr => { n += arr.length; });
    return n;
  }
}