// ─── Capability History Store ─────────────────────────────────────────────────
// Foundation v1.0 · Histórico de alterações por capability — base para auditoria futura

import type { CapabilityManifest } from "./CapabilityContract";

export type HistoryAction = "registered" | "updated" | "enabled" | "disabled" | "removed";

export interface CapabilityChangeRecord {
  id: string;
  capabilityId: string;
  action: HistoryAction;
  timestamp: number;
  snapshot: CapabilityManifest;
}

let _counter = 0;
function makeId() { return `chist_${Date.now()}_${(++_counter).toString(36)}`; }

class CapabilityHistoryStoreImpl {
  private readonly records: CapabilityChangeRecord[] = [];

  record(capabilityId: string, action: HistoryAction, snapshot: CapabilityManifest): void {
    this.records.push({ id: makeId(), capabilityId, action, timestamp: Date.now(), snapshot });
  }

  getById(capabilityId: string): CapabilityChangeRecord[] {
    return this.records.filter(r => r.capabilityId === capabilityId);
  }

  getAll(): CapabilityChangeRecord[] {
    return [...this.records].sort((a, b) => b.timestamp - a.timestamp);
  }

  getByAction(action: HistoryAction): CapabilityChangeRecord[] {
    return this.records.filter(r => r.action === action);
  }

  getLatestForCapability(capabilityId: string): CapabilityChangeRecord | null {
    const recs = this.records.filter(r => r.capabilityId === capabilityId);
    return recs.length ? recs[recs.length - 1] : null;
  }

  size(): number { return this.records.length; }
}

export const capabilityHistory = new CapabilityHistoryStoreImpl();