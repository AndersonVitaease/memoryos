/**
 * MemoryIndexer.ts — Sprint 6.2.4
 * Builds keyword + component index across all memory entries for fast lookup.
 */
import type { AnyMemoryEntry } from "./MEMTypes";

export interface IndexEntry { entryId: string; kind: string; field: string }

export class MemoryIndexer {
  private readonly _keywordIndex = new Map<string, IndexEntry[]>();
  private readonly _componentIndex = new Map<string, IndexEntry[]>();

  index(entry: AnyMemoryEntry) {
    const words = this._extractWords(entry);
    for (const word of words) {
      const list = this._keywordIndex.get(word) ?? [];
      if (!list.find(i => i.entryId === entry.id)) {
        list.push({ entryId: entry.id, kind: entry.kind, field: "auto" });
        this._keywordIndex.set(word, list);
      }
    }
    const comps = this._extractComponents(entry);
    for (const comp of comps) {
      const list = this._componentIndex.get(comp) ?? [];
      if (!list.find(i => i.entryId === entry.id)) {
        list.push({ entryId: entry.id, kind: entry.kind, field: "component" });
        this._componentIndex.set(comp, list);
      }
    }
  }

  lookupKeyword(word: string): IndexEntry[] { return this._keywordIndex.get(word.toLowerCase()) ?? []; }
  lookupComponent(comp: string): IndexEntry[] { return this._componentIndex.get(comp) ?? []; }

  private _extractWords(e: AnyMemoryEntry): string[] {
    const text = JSON.stringify(e).toLowerCase();
    return text.match(/[a-z]{4,}/g)?.slice(0, 50) ?? [];
  }

  private _extractComponents(e: AnyMemoryEntry): string[] {
    const comps: string[] = [...(e.tags ?? [])];
    if ("components" in e) comps.push(...(e as any).components);
    if ("involvedComponents" in e) comps.push(...(e as any).involvedComponents);
    if ("connectorName" in e) comps.push((e as any).connectorName);
    if ("module" in e) comps.push((e as any).module);
    return comps.filter(Boolean);
  }

  stats() { return { keywords: this._keywordIndex.size, components: this._componentIndex.size }; }
}