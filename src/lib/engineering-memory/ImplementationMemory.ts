/**
 * ImplementationMemory.ts — Sprint 6.2.4
 * Records every engineering implementation automatically.
 */
import type { ImplementationMemoryEntry, OutcomeType } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class ImplementationMemory {
  private readonly _entries: ImplementationMemoryEntry[] = [];

  record(input: {
    objective: string; planId: string; components: string[];
    strategy: string; filesChanged: string[]; durationMs: number;
    regressionsPassed: boolean; approved: boolean;
    rollbackExecuted: boolean; outcome: OutcomeType;
    kgEntityIds?: string[];
  }): ImplementationMemoryEntry {
    const entry: ImplementationMemoryEntry = {
      id: makeMemId("impl"), kind: "IMPLEMENTATION", status: "ACTIVE",
      tags: [input.strategy, input.outcome, ...input.components.slice(0, 3)],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 50, useCount: 0, confidence: input.regressionsPassed ? 0.85 : 0.5,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): ImplementationMemoryEntry[] { return [...this._entries]; }
  latest(n = 10): ImplementationMemoryEntry[] { return this._entries.slice(-n).reverse(); }
  byObjective(keyword: string): ImplementationMemoryEntry[] {
    const kw = keyword.toLowerCase();
    return this._entries.filter(e => e.objective.toLowerCase().includes(kw));
  }
  stats() {
    const total = this._entries.length;
    const passed = this._entries.filter(e => e.outcome === "PASS").length;
    const rolled = this._entries.filter(e => e.rollbackExecuted).length;
    return { total, successRate: total ? Math.round((passed / total) * 100) : 0, rollbackCount: rolled };
  }
}