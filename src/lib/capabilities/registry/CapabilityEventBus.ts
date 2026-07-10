// ─── Capability Event Bus ─────────────────────────────────────────────────────
// Foundation v1.0 · Publica eventos do ciclo de vida de Capabilities

import type { CapabilityManifest } from "./CapabilityContract";

export type CapabilityEventType =
  | "CapabilityRegistered"
  | "CapabilityUpdated"
  | "CapabilityEnabled"
  | "CapabilityDisabled"
  | "CapabilityRemoved";

export interface CapabilityEvent {
  id: string;
  type: CapabilityEventType;
  capabilityId: string;
  manifest: CapabilityManifest;
  timestamp: number;
}

type Listener = (event: CapabilityEvent) => void;

let _counter = 0;
function makeId() { return `cevt_${Date.now()}_${(++_counter).toString(36)}`; }

export class CapabilityEventBusImpl {
  private readonly listeners: Listener[] = [];
  private readonly history: CapabilityEvent[] = [];

  publish(type: CapabilityEventType, capabilityId: string, manifest: CapabilityManifest): void {
    const event: CapabilityEvent = { id: makeId(), type, capabilityId, manifest, timestamp: Date.now() };
    this.history.push(event);
    for (const fn of this.listeners) {
      try { fn(event); } catch { /* isolate */ }
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  getHistory(capabilityId?: string): CapabilityEvent[] {
    if (!capabilityId) return [...this.history];
    return this.history.filter(e => e.capabilityId === capabilityId);
  }

  getByType(type: CapabilityEventType): CapabilityEvent[] {
    return this.history.filter(e => e.type === type);
  }

  clearHistory(): void { this.history.length = 0; }

  size(): number { return this.history.length; }
}

export const capabilityEventBus = new CapabilityEventBusImpl();