/**
 * RepairMemory.ts — Sprint 6.2.4
 */
import type { RepairMemoryEntry } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class RepairMemory {
  private readonly _entries: RepairMemoryEntry[] = [];

  record(input: {
    problem: string; strategy: string;
    autoFixed: boolean; success: boolean; durationMs: number;
    kgEntityIds?: string[];
  }): RepairMemoryEntry {
    const entry: RepairMemoryEntry = {
      id: makeMemId("rep"), kind: "REPAIR", status: "ACTIVE",
      tags: [input.autoFixed ? "AUTO_FIXED" : "MANUAL", input.success ? "SUCCESS" : "FAIL"],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 55, useCount: 0,
      confidence: input.success ? 0.85 : 0.3,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): RepairMemoryEntry[] { return [...this._entries]; }
  successfulStrategies(): string[] {
    return [...new Set(this._entries.filter(e => e.success).map(e => e.strategy))];
  }
}