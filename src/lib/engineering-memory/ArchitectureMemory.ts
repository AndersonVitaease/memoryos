/**
 * ArchitectureMemory.ts — Sprint 6.2.4
 */
import type { ArchitectureMemoryEntry } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class ArchitectureMemory {
  private readonly _entries: ArchitectureMemoryEntry[] = [];

  record(input: {
    proposalId: string; proposalSummary: string; decision: string;
    migrationPlan: string; featureFlags: string[];
    contracts: string[]; breakingChanges: string[];
    kgEntityIds?: string[];
  }): ArchitectureMemoryEntry {
    const entry: ArchitectureMemoryEntry = {
      id: makeMemId("arch"), kind: "ARCHITECTURE", status: "ACTIVE",
      tags: [input.decision.slice(0, 20), ...input.featureFlags.slice(0, 2)],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 60, useCount: 0, confidence: 0.75,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): ArchitectureMemoryEntry[] { return [...this._entries]; }
}