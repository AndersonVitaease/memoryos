/**
 * RuntimeWatcher.ts — Sprint 6.3.1
 * Detects system changes that require automatic module restart.
 * Watches: code changes, config changes, connectors, modules, KG updates.
 */

import type { WatchTrigger } from "./SHRTypes";
import { RuntimeEventBus } from "./RuntimeEventBus";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

export interface WatchEvent {
  id: string;
  trigger: WatchTrigger;
  affectedModule: string;
  detectedAt: number;
  detail: string;
  metadata: Record<string, unknown>;
}

type WatchHandler = (event: WatchEvent) => void;

let _seq = 0;
function makeId(): string { return `watch_${Date.now()}_${++_seq}`; }

export class RuntimeWatcher {
  private _bus: RuntimeEventBus;
  private _handlers: WatchHandler[] = [];
  private _history: WatchEvent[] = [];
  private _active = false;
  private _kgEntityCountBaseline = 0;
  private _pollTimer?: ReturnType<typeof setInterval>;
  private readonly _pollIntervalMs = 30_000; // 30 s

  constructor(bus: RuntimeEventBus) {
    this._bus = bus;
  }

  start(): void {
    if (this._active) return;
    this._active = true;
    this._kgEntityCountBaseline = KnowledgeGraphStore.isReady()
      ? (KnowledgeGraphStore.get("watcher") ?? { entityCount: 0 }).entityCount
      : 0;

    // Poll for KG changes
    this._pollTimer = setInterval(() => this._pollKG(), this._pollIntervalMs);
    this._bus.emit("WatchTriggerFired", { source: "watcher", action: "started" });
  }

  stop(): void {
    if (!this._active) return;
    this._active = false;
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  isActive(): boolean { return this._active; }

  /**
   * Manually fire a watch trigger (e.g. from deployment hooks, test harness).
   */
  fire(trigger: WatchTrigger, affectedModule: string, detail: string, metadata: Record<string, unknown> = {}): WatchEvent {
    const event: WatchEvent = {
      id: makeId(), trigger, affectedModule,
      detectedAt: Date.now(), detail, metadata,
    };
    this._record(event);
    return event;
  }

  onTrigger(handler: WatchHandler): () => void {
    this._handlers.push(handler);
    return () => {
      const i = this._handlers.indexOf(handler);
      if (i >= 0) this._handlers.splice(i, 1);
    };
  }

  history(limit = 50): WatchEvent[] { return this._history.slice(0, limit); }

  triggerCount(): number { return this._history.length; }

  private _pollKG(): void {
    if (!this._active) return;
    if (!KnowledgeGraphStore.isReady()) return;
    const current = (KnowledgeGraphStore.get("watcher") ?? { entityCount: 0 }).entityCount;
    if (current !== this._kgEntityCountBaseline) {
      this._kgEntityCountBaseline = current;
      this.fire("KG_CHANGE", "KnowledgeGraphStore",
        `KG entity count changed to ${current}`,
        { previousCount: this._kgEntityCountBaseline, newCount: current });
    }
  }

  private _record(event: WatchEvent): void {
    this._history.unshift(event);
    if (this._history.length > 200) this._history.splice(200);
    this._bus.emit("WatchTriggerFired", { watchEventId: event.id, trigger: event.trigger, module: event.affectedModule });
    this._handlers.forEach(h => { try { h(event); } catch {} });
  }
}