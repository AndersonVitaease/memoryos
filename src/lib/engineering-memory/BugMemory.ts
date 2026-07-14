/**
 * BugMemory.ts — Sprint 6.2.4
 * Records every bug — history is never deleted.
 */
import type { BugMemoryEntry, RiskLevel } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class BugMemory {
  private readonly _entries: BugMemoryEntry[] = [];

  record(input: {
    description: string; rootCause: string; module: string;
    impact: RiskLevel; fix: string; relatedRegression: string;
    confidence: number; version: string; kgEntityIds?: string[];
  }): BugMemoryEntry {
    const entry: BugMemoryEntry = {
      id: makeMemId("bug"), kind: "BUG", status: "ACTIVE",
      tags: [input.module, input.impact, input.rootCause.slice(0, 20)],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 60, useCount: 0,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): BugMemoryEntry[] { return [...this._entries]; }
  byModule(module: string): BugMemoryEntry[] { return this._entries.filter(e => e.module === module); }
  similar(description: string): BugMemoryEntry[] {
    const kw = description.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    return this._entries.filter(e => kw.some(w => e.description.toLowerCase().includes(w) || e.rootCause.toLowerCase().includes(w)));
  }
  stats() {
    return {
      total: this._entries.length,
      byImpact: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, ...Object.fromEntries(
        ["LOW","MEDIUM","HIGH","CRITICAL"].map(l => [l, this._entries.filter(e => e.impact === l).length])
      )},
    };
  }
}