/**
 * PatternMemory.ts — Sprint 6.2.4
 * Auto-detects recurring patterns from other memory stores.
 */
import type { PatternMemoryEntry } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class PatternMemory {
  private readonly _entries: PatternMemoryEntry[] = [];

  record(input: {
    patternType: PatternMemoryEntry["patternType"];
    description: string; involvedComponents: string[];
    frequency: number; kgEntityIds?: string[];
  }): PatternMemoryEntry {
    // Upsert by description
    const existing = this._entries.find(e => e.description === input.description);
    if (existing) {
      existing.frequency++;
      existing.lastSeen = Date.now();
      return existing;
    }
    const entry: PatternMemoryEntry = {
      id: makeMemId("pat"), kind: "PATTERN", status: "ACTIVE",
      tags: [input.patternType, ...input.involvedComponents.slice(0, 2)],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), lastSeen: Date.now(),
      rank: 50, useCount: 0, confidence: 0.7,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  // Detect patterns from implementation history
  detectFromHistory(implementations: Array<{ objective: string; components: string[]; outcome: string }>) {
    const compFreq = new Map<string, number>();
    for (const impl of implementations) {
      impl.components.forEach(c => compFreq.set(c, (compFreq.get(c) ?? 0) + 1));
    }
    for (const [comp, freq] of compFreq) {
      if (freq >= 2) {
        this.record({ patternType: "HOTSPOT", description: `${comp} modified frequently`, involvedComponents: [comp], frequency: freq });
      }
    }
  }

  all(): PatternMemoryEntry[] { return [...this._entries]; }
  hotspots(): PatternMemoryEntry[] { return this._entries.filter(e => e.patternType === "HOTSPOT").sort((a, b) => b.frequency - a.frequency); }
}