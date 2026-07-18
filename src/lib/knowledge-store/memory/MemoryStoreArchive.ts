// MemoryStoreArchive.ts — Sprint EF-39
// Manages archived records separately from active store.

import type { KnowledgeRecord } from "../KnowledgeStoreTypes";

export interface ArchiveEntry {
  readonly record:     KnowledgeRecord;
  readonly archivedAt: number;
  readonly reason?:    string;
}

export class MemoryStoreArchive {
  private readonly _archive = new Map<string, ArchiveEntry>();

  add(record: KnowledgeRecord, reason?: string): void {
    this._archive.set(record.id, Object.freeze({ record, archivedAt: Date.now(), reason }));
  }

  get(id: string): ArchiveEntry | undefined {
    return this._archive.get(id);
  }

  remove(id: string): ArchiveEntry | undefined {
    const entry = this._archive.get(id);
    this._archive.delete(id);
    return entry;
  }

  has(id: string): boolean {
    return this._archive.has(id);
  }

  listAll(): ArchiveEntry[] {
    return [...this._archive.values()];
  }

  delete(id: string): void {
    this._archive.delete(id);
  }

  size(): number { return this._archive.size; }

  stats() {
    return Object.freeze({ archivedCount: this._archive.size });
  }
}