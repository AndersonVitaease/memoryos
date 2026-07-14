/**
 * DecisionMemory.ts — Sprint 6.2.4
 */
import type { DecisionMemoryEntry } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class DecisionMemory {
  private readonly _entries: DecisionMemoryEntry[] = [];

  record(input: {
    objective: string; whyReused: string; whyCreated: string;
    whyRefactored: string; alternativesRejected: string[];
    finalDecision: string; kgEntityIds?: string[];
  }): DecisionMemoryEntry {
    const entry: DecisionMemoryEntry = {
      id: makeMemId("dec"), kind: "DECISION", status: "ACTIVE",
      tags: [input.finalDecision.slice(0, 20)],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 55, useCount: 0, confidence: 0.8,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): DecisionMemoryEntry[] { return [...this._entries]; }
  byObjective(kw: string): DecisionMemoryEntry[] {
    const lower = kw.toLowerCase();
    return this._entries.filter(e => e.objective.toLowerCase().includes(lower));
  }
}