/**
 * RuntimeStateSnapshot.ts — Sprint 6.3.1
 * Captures and stores system state before any restart operation.
 */

import type { RuntimeSnapshot, RuntimeState, ModuleState, WatchTrigger } from "./SHRTypes";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

let _seq = 0;
function makeId(): string { return `snap_${Date.now()}_${++_seq}`; }

export class RuntimeStateSnapshot {
  private _snapshots: RuntimeSnapshot[] = [];
  private readonly _maxSnapshots = 20;

  capture(
    trigger: WatchTrigger,
    runtimeState: RuntimeState,
    moduleStates: Record<string, ModuleState>,
    extras: {
      connectorCount?: number;
      sessionCount?: number;
      metricsSnapshot?: Record<string, number>;
      memorySnapshot?: { implementationCount: number; patternCount: number; bugCount: number };
    } = {}
  ): RuntimeSnapshot {
    const kgReady = KnowledgeGraphStore.isReady();
    const kgGraph = kgReady ? KnowledgeGraphStore.get("snapshot") : null;

    const snap: RuntimeSnapshot = {
      id: makeId(),
      capturedAt: Date.now(),
      trigger,
      kgState: {
        isReady: kgReady,
        entityCount: kgGraph?.entityCount ?? 0,
        relationshipCount: kgGraph?.relationshipCount ?? 0,
        moduleCount: kgGraph?.modules.length ?? 0,
        ageMs: KnowledgeGraphStore.ageMs(),
      },
      runtimeState,
      moduleStates: { ...moduleStates },
      connectorCount: extras.connectorCount ?? 0,
      sessionCount: extras.sessionCount ?? 0,
      metricsSnapshot: extras.metricsSnapshot ?? {},
      memorySnapshot: extras.memorySnapshot ?? { implementationCount: 0, patternCount: 0, bugCount: 0 },
    };

    this._snapshots.unshift(snap);
    if (this._snapshots.length > this._maxSnapshots) this._snapshots.splice(this._maxSnapshots);
    return snap;
  }

  latest(): RuntimeSnapshot | null { return this._snapshots[0] ?? null; }

  get(id: string): RuntimeSnapshot | null { return this._snapshots.find(s => s.id === id) ?? null; }

  all(): RuntimeSnapshot[] { return [...this._snapshots]; }

  count(): number { return this._snapshots.length; }
}