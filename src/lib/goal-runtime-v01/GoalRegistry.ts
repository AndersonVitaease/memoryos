// Goal Runtime v0.1 — Goal Registry
// Foundation v1.0 · Engineering First · Sprint Goal Runtime v0.1
// Responsabilidade: registrar, localizar e impedir duplicidade de Goals

import type { Goal } from "./Goal";
import type { GoalMetadata } from "./GoalTypes";

export interface RegistryEntry {
  goalId: string;
  metadata: GoalMetadata;
  registeredAt: number;
}

export class GoalRegistry {
  private _goals: Map<string, Goal> = new Map();
  private _index: Map<string, RegistryEntry> = new Map();

  register(goal: Goal): { success: boolean; error?: string } {
    const meta = goal.metadata();
    if (this._goals.has(meta.goalId)) {
      return { success: false, error: `Goal already registered: ${meta.goalId}` };
    }
    this._goals.set(meta.goalId, goal);
    this._index.set(meta.goalId, Object.freeze({
      goalId: meta.goalId,
      metadata: meta,
      registeredAt: Date.now(),
    }));
    return { success: true };
  }

  find(goalId: string): Goal | null {
    return this._goals.get(goalId) ?? null;
  }

  has(goalId: string): boolean {
    return this._goals.has(goalId);
  }

  getEntry(goalId: string): RegistryEntry | null {
    return this._index.get(goalId) ?? null;
  }

  listAll(): RegistryEntry[] {
    return [...this._index.values()];
  }

  size(): number {
    return this._goals.size;
  }

  clear(): void {
    this._goals.clear();
    this._index.clear();
  }
}