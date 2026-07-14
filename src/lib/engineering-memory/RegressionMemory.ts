/**
 * RegressionMemory.ts — Sprint 6.2.4
 */
import type { RegressionMemoryEntry } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class RegressionMemory {
  private readonly _entries: RegressionMemoryEntry[] = [];

  record(input: {
    testsRun: number; testsFailed: number; testsPassed: number;
    fixes: string[]; shieldScore: number; rcaSummary: string[];
    recovery: string; durationMs: number; kgEntityIds?: string[];
  }): RegressionMemoryEntry {
    const entry: RegressionMemoryEntry = {
      id: makeMemId("reg"), kind: "REGRESSION", status: "ACTIVE",
      tags: [`shield:${input.shieldScore}`, input.testsFailed > 0 ? "FAIL" : "PASS"],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 50, useCount: 0,
      confidence: input.testsFailed === 0 ? 0.9 : 0.5,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): RegressionMemoryEntry[] { return [...this._entries]; }
  averageShield(): number {
    if (!this._entries.length) return 0;
    return this._entries.reduce((s, e) => s + e.shieldScore, 0) / this._entries.length;
  }
}