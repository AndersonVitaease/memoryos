/**
 * ArchitectureDiffEngine.ts — Sprint 6.2.3
 * Diffs two architecture snapshots to identify structural changes.
 */

import type { ArchitectureSnapshot } from "./AATypes";

export interface SnapshotDiff {
  addedModules:    string[];
  removedModules:  string[];
  addedSingletons: string[];
  removedSingletons: string[];
  addedConnectors: string[];
  removedConnectors: string[];
  newCycles:       string[][];
  newDuplicates:   string[];
  kgEntityDelta:   number;
  summary:         string;
  hasStructuralChange: boolean;
}

function diff<T>(before: T[], after: T[]): { added: T[]; removed: T[] } {
  return {
    added:   after.filter(x => !before.includes(x)),
    removed: before.filter(x => !after.includes(x)),
  };
}

export class ArchitectureDiffEngine {
  compare(before: ArchitectureSnapshot, after: ArchitectureSnapshot): SnapshotDiff {
    const modules    = diff(before.modules,    after.modules);
    const singletons = diff(before.singletons, after.singletons);
    const connectors = diff(before.connectors, after.connectors);
    const newCycles  = after.cycles.filter(c => !before.cycles.some(bc => bc.join(",") === c.join(",")));
    const newDups    = after.duplicates.filter(d => !before.duplicates.includes(d));
    const kgDelta    = after.kgEntityCount - before.kgEntityCount;

    const hasStructuralChange =
      modules.added.length > 0 || modules.removed.length > 0 ||
      singletons.removed.length > 0 || connectors.removed.length > 0 ||
      newCycles.length > 0;

    const parts: string[] = [];
    if (modules.added.length)      parts.push(`+${modules.added.length} modules`);
    if (modules.removed.length)    parts.push(`-${modules.removed.length} modules`);
    if (singletons.removed.length) parts.push(`-${singletons.removed.length} singletons`);
    if (connectors.removed.length) parts.push(`-${connectors.removed.length} connectors`);
    if (newCycles.length)          parts.push(`+${newCycles.length} new cycles`);
    if (kgDelta !== 0)             parts.push(`KG entities: ${kgDelta > 0 ? "+" : ""}${kgDelta}`);
    const summary = parts.length > 0 ? parts.join(", ") : "No structural changes detected";

    return {
      addedModules:     modules.added,
      removedModules:   modules.removed,
      addedSingletons:  singletons.added,
      removedSingletons: singletons.removed,
      addedConnectors:  connectors.added,
      removedConnectors: connectors.removed,
      newCycles,
      newDuplicates:    newDups,
      kgEntityDelta:    kgDelta,
      summary,
      hasStructuralChange,
    };
  }
}